import { describe, expect, it } from "vitest";
import { checkEditor, valuesAt } from "../domain/labChecks";
import { finishTest, emptyProgress } from "../state/progress";
import { checkTerminal, createDocker, exec, type DockerState } from "./docker";
import { evaluate, evaluateCondition, interpolate } from "./expressions";
import { tokenize } from "./shell";
import { analyzeWorkflow, EVENTS, globToRegExp, simulateRun, triggers } from "./workflow";

const run = (s: DockerState, ...cmds: string[]) => {
  let lines: string[] = [];
  for (const c of cmds) {
    const r = exec(s, c);
    s = r.state;
    lines = r.lines.map((l) => l.text);
  }
  return { s, text: lines.join("\n") };
};

describe("shell", () => {
  it("tokenizes quotes", () => {
    expect(tokenize(`echo "hola mundo" 'a b' c`)).toEqual(["echo", "hola mundo", "a b", "c"]);
  });
});

describe("docker simulator", () => {
  it("pulls automatically on run and publishes ports", () => {
    const { s, text } = run(createDocker(), "docker run -d --name web -p 8080:80 nginx");
    expect(s.images).toContain("nginx:latest");
    expect(checkTerminal(s, { type: "container", name: "web", state: "running", image: "nginx", port: "8080:80" })).toBe(true);
    expect(text).toMatch(/^[0-9a-f]{12}/m);
  });

  it("serves curl through a published port and logs it", () => {
    const { s, text } = run(createDocker(), "docker run -d --name web -p 8080:80 nginx", "curl localhost:8080", "docker logs web");
    expect(s.httpHits).toContain(8080);
    expect(text).toContain('"GET / HTTP/1.1" 200');
    expect(run(createDocker(), "curl http://localhost:9999").text).toContain("Connection refused");
  });

  it("refuses reused names, taken ports and removing running containers", () => {
    let { s } = run(createDocker(), "docker run -d --name web -p 8080:80 nginx");
    expect(run(s, "docker run -d --name web nginx").text).toContain("is already in use");
    expect(run(s, "docker run -d --name web2 -p 8080:80 nginx").text).toContain("port is already allocated");
    expect(run(s, "docker rm web").text).toContain("container is running");
    expect(run(s, "docker rmi nginx").text).toContain("must force");
    ({ s } = run(s, "docker stop web", "docker rm web"));
    expect(checkTerminal(s, { type: "container", name: "web", state: "absent" })).toBe(true);
  });

  it("a container in the foreground stops when the prompt returns", () => {
    const { s, text } = run(createDocker(), "docker run --name web nginx");
    expect(text).toContain("-d");
    expect(s.containers[0].state).toBe("exited");
  });

  it("postgres exits without a password and runs with one", () => {
    let { s } = run(createDocker(), "docker run -d --name db postgres:16");
    expect(s.containers[0].state).toBe("exited");
    expect(run(s, "docker logs db").text).toContain("POSTGRES_PASSWORD");
    ({ s } = run(s, "docker rm db", "docker run -d --name db -e POSTGRES_PASSWORD=x postgres:16"));
    expect(s.containers[0].state).toBe("running");
  });

  it("rejects unknown images and tags", () => {
    expect(run(createDocker(), "docker pull nopeimage").text).toContain("repository does not exist");
    expect(run(createDocker(), "docker pull nginx:9.9").text).toContain("manifest unknown");
  });

  it("ps lists running containers and -a the stopped ones", () => {
    const { s } = run(createDocker(), "docker run -d --name a nginx", "docker run --name b hello-world");
    expect(run(s, "docker ps").text).not.toMatch(/\bb$/m);
    expect(run(s, "docker ps -a").text).toMatch(/Exited \(0\).*b$/m);
  });

  it("command_ran only counts commands after `since`", () => {
    const { s } = run(createDocker(), "docker logs x", "docker ps");
    expect(checkTerminal(s, { type: "command_ran", pattern: "^docker logs" }, 0)).toBe(true);
    expect(checkTerminal(s, { type: "command_ran", pattern: "^docker logs" }, 1)).toBe(false);
  });
});

describe("expressions", () => {
  const ctx = { github: { ref: "refs/heads/main", sha: "abc", event_name: "push" }, matrix: { node: 20 } };
  it("evaluates comparisons, logic and functions", () => {
    expect(evaluate("github.ref == 'refs/heads/main'", ctx)).toBe(true);
    expect(evaluate("github.ref != 'refs/heads/main' || startsWith(github.ref, 'refs/heads/')", ctx)).toBe(true);
    expect(evaluate("!(github.event_name == 'push') && true", ctx)).toBe(false);
    expect(evaluate("contains(fromList, 'x')", { fromList: ["x"] })).toBe(true);
    expect(evaluate("format('{0}-{1}', 'a', 1)", ctx)).toBe("a-1");
    expect(evaluate("'MAIN' == 'main'", ctx)).toBe(true);
  });
  it("interpolates and reports unknown contexts", () => {
    expect(interpolate("node ${{ matrix.node }} @ ${{ github.sha }}", ctx).text).toBe("node 20 @ abc");
    expect(interpolate("${{ secret.X }}", ctx).error).toContain("secret");
    expect(() => evaluate('github.ref == "x"', ctx)).toThrow(/simples/);
  });
  it("adds an implicit success() to conditions", () => {
    expect(evaluateCondition("github.event_name == 'push'", ctx, { failed: true })).toBe(false);
    expect(evaluateCondition("${{ always() }}", ctx, { failed: true })).toBe(true);
    expect(evaluateCondition(undefined, ctx, { failed: false })).toBe(true);
  });
});

describe("workflow analysis", () => {
  const lines = (src: string) => analyzeWorkflow(src).diagnostics.map((d) => [d.line, d.severity, d.message] as const);

  it("locates a misspelled runs-on", () => {
    const d = lines("name: CI\non: push\njobs:\n  build:\n    run-on: ubuntu-latest\n    steps:\n      - run: echo hola\n");
    expect(d).toContainEqual([5, "error", expect.stringContaining("runs-on")]);
  });

  it("reports missing on, missing versions, run with an action and unknown needs", () => {
    const src = "jobs:\n  a:\n    runs-on: ubuntu-latest\n    needs: zzz\n    steps:\n      - uses: actions/setup-node\n      - run: actions/checkout@v4\n";
    const msgs = lines(src).map((d) => d[2]).join("\n");
    expect(msgs).toContain("Falta «on»");
    expect(msgs).toContain("Falta la versión");
    expect(msgs).toContain("se usa con uses");
    expect(msgs).toContain("zzz");
  });

  it("warns about unknown inputs, runners and secrets in clear", () => {
    const src =
      "on: push\njobs:\n  a:\n    runs-on: ubuntu-lastest\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node: 20\n      - run: ./deploy.sh\n        env:\n          API_KEY: sk-live-12345\n";
    const d = lines(src);
    expect(d).toContainEqual([4, "warning", expect.stringContaining("ubuntu-lastest")]);
    expect(d).toContainEqual([8, "warning", expect.stringContaining("node-version")]);
    expect(d).toContainEqual([11, "warning", expect.stringContaining("secret")]);
  });

  it("reports YAML syntax errors with a line", () => {
    const d = analyzeWorkflow("on: push\njobs:\n  a:\n    runs-on: x\n   steps: y\n").diagnostics;
    expect(d[0].severity).toBe("error");
    expect(d[0].line).toBeGreaterThan(0);
  });

  it("detects needs cycles", () => {
    const src = "on: push\njobs:\n  a:\n    needs: b\n    runs-on: ubuntu-latest\n    steps: [{run: x}]\n  b:\n    needs: a\n    runs-on: ubuntu-latest\n    steps: [{run: x}]\n";
    expect(lines(src).map((d) => d[2]).join()).toContain("ciclo");
  });
});

describe("triggers", () => {
  const ev = (id: string) => EVENTS.find((e) => e.id === id)!;
  it("matches globs", () => {
    expect(globToRegExp("feature/*").test("feature/login")).toBe(true);
    expect(globToRegExp("feature/*").test("feature/a/b")).toBe(false);
    expect(globToRegExp("**.md").test("docs/a.md")).toBe(true);
  });
  it("applies branch, tag and paths filters", () => {
    const on = { push: { branches: ["main"], tags: ["v*"], "paths-ignore": ["**.md"] }, pull_request: { branches: ["main"] } };
    expect(triggers(on, ev("push-main")).fires).toBe(true);
    expect(triggers(on, ev("push-feature")).fires).toBe(false);
    expect(triggers(on, ev("pr-main")).fires).toBe(true);
    expect(triggers(on, ev("tag")).fires).toBe(true); // paths are not evaluated for tags
    expect(triggers(on, ev("docs")).fires).toBe(false);
    expect(triggers({ push: { branches: ["main"] } }, ev("tag")).fires).toBe(false);
    expect(triggers({ push: { tags: ["v*"] } }, ev("push-main")).fires).toBe(false);
    expect(triggers("push", ev("tag")).fires).toBe(true);
    expect(triggers(["pull_request"], ev("push-main")).fires).toBe(false);
  });
});

describe("workflow run", () => {
  const sim = (src: string, event = "push-main") => simulateRun(analyzeWorkflow(src).workflow!, EVENTS.find((e) => e.id === event)!);

  it("fails npm without checkout and passes with it", () => {
    const without = sim("on: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n");
    expect(without.jobs[0].status).toBe("failure");
    const withIt = sim("on: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test\n");
    expect(withIt.jobs[0].status).toBe("success");
  });

  it("orders jobs by needs, skips dependants of failures and expands matrices", () => {
    const r = sim(
      "on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n        node: [20, 22]\n    steps:\n      - run: exit 1\n  build:\n    needs: test\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n",
    );
    expect(r.jobs.map((j) => [j.name, j.level, j.status])).toEqual([
      ["test (20)", 0, "failure"],
      ["test (22)", 0, "failure"],
      ["build", 1, "skipped"],
    ]);
  });

  it("passes outputs between steps and masks secrets", () => {
    const r = sim(
      'on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - id: d\n        run: echo "rama=${{ github.ref_name }}" >> $GITHUB_OUTPUT\n      - run: echo "Rama ${{ steps.d.outputs.rama }} ${{ secrets.DEPLOY_TOKEN }}"\n',
    );
    const log = r.jobs[0].steps.flatMap((s) => s.log.map((l) => l.text));
    expect(log).toContain("Rama main ***");
  });

  it("needs packages: write to push to GHCR, and contents: read to check out", () => {
    const wf = (perms: string) =>
      `on: push\n${perms}jobs:\n  p:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: docker/login-action@v3\n        with:\n          registry: ghcr.io\n          username: x\n          password: \${{ secrets.GITHUB_TOKEN }}\n      - run: docker push ghcr.io/dev/app:1\n`;
    expect(sim(wf("")).jobs[0].status).toBe("failure");
    expect(sim(wf("permissions:\n  packages: write\n")).jobs[0].steps[1].status).toBe("failure");
    expect(sim(wf("permissions:\n  contents: read\n  packages: write\n")).jobs[0].status).toBe("success");
  });

  it("artifacts carry files between jobs", () => {
    const base =
      "on: push\njobs:\n  b:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm run build\n      - uses: actions/upload-artifact@v4\n        with:\n          name: dist\n          path: dist\n  d:\n    needs: b\n    runs-on: ubuntu-latest\n    steps:\n";
    expect(sim(base + "      - run: cat dist/app.js\n").jobs[1].status).toBe("failure");
    expect(
      sim(base + "      - uses: actions/download-artifact@v4\n        with:\n          name: dist\n      - run: cat dist/app.js\n").jobs[1].status,
    ).toBe("success");
  });
});

describe("editor checks", () => {
  it("reads wildcard paths", () => {
    const doc = { jobs: { a: { steps: [{ uses: "x@v1" }, { run: "y" }] }, b: { steps: [{ uses: "z@v2" }] } } };
    expect(valuesAt(doc, "jobs.*.steps[*].uses")).toEqual(["x@v1", "z@v2"]);
    expect(valuesAt(doc, "jobs.a.steps[1].run")).toEqual(["y"]);
  });
  it("checks yaml paths, regex and order", () => {
    const text = "on:\n  push:\n    branches: [main]\njobs:\n  t:\n    needs: [a, b]\n";
    expect(checkEditor(text, { type: "yaml_path", path: "on.push.branches", contains: "main" })).toBe(true);
    expect(checkEditor(text, { type: "yaml_path", path: "jobs.t.needs", contains: "b" })).toBe(true);
    expect(checkEditor("on: push", { type: "yaml_path", path: "on", contains: "push" })).toBe(true);
    expect(checkEditor(text, { type: "yaml_path", path: "jobs.t.if", exists: false })).toBe(true);
    expect(checkEditor(text, { type: "order", first: "on:", then: "jobs:" })).toBe(true);
    expect(checkEditor("a: [", { type: "yaml_valid" })).toBe(false);
  });
});

describe("progress", () => {
  it("saves the best result, keeps passed and tracks misses", () => {
    const answers = (n: number, total: number) =>
      Array.from({ length: total }, (_, i) => ({ questionId: `q${i}`, correct: i < n, lessonIndex: 0 }));
    let [p, o] = finishTest(emptyProgress(), { kind: "lesson", unitId: "u", lessonId: "l", test: 1 }, answers(12, 12), 1, 1);
    expect(o.passed).toBe(true);
    [p, o] = finishTest(p, { kind: "lesson", unitId: "u", lessonId: "l", test: 1 }, answers(2, 12), 1, 2);
    expect(p.results["u/l/1"]).toEqual({ best: 12, total: 12, passed: true });
    expect(Object.keys(p.misses)).toHaveLength(10);
    expect(p.player.xp).toBe(120 + 20 + 20);
  });
  it("a passed skip test marks the unit", () => {
    const answers = Array.from({ length: 15 }, (_, i) => ({ questionId: `q${i}`, correct: i < 12, lessonIndex: 0 }));
    const [p] = finishTest(emptyProgress(), { kind: "skip", unitId: "docker" }, answers, 1, 1);
    expect(p.skippedUnits).toEqual(["docker"]);
  });
});
