import { LineCounter, parseDocument, isMap, isSeq, type Node as YamlNode, type Document } from "yaml";
import { evaluateCondition, interpolate, type Contexts, type Value } from "./expressions";
import { out, type OutLine } from "./shell";

// A GitHub Actions simulator for the editor labs: it checks the workflow like GitHub would
// (with line numbers), decides whether an event fires it and "runs" it job by job, step by step.

export interface Diagnostic {
  message: string;
  /** 1-based line, when it can be located. */
  line?: number;
  severity: "error" | "warning";
}

export interface SimEvent {
  id: string;
  label: string;
  name: "push" | "pull_request" | "workflow_dispatch" | "schedule";
  /** refs/heads/… or refs/tags/… (for pull_request, the base branch). */
  ref: string;
  /** Files changed, for paths filters. */
  paths: string[];
}

export const EVENTS: SimEvent[] = [
  { id: "push-main", label: "push a main", name: "push", ref: "refs/heads/main", paths: ["src/app.js"] },
  { id: "push-feature", label: "push a feature/login", name: "push", ref: "refs/heads/feature/login", paths: ["src/login.js"] },
  { id: "pr-main", label: "pull request hacia main", name: "pull_request", ref: "refs/heads/main", paths: ["src/login.js"] },
  { id: "tag", label: "push del tag v1.2.0", name: "push", ref: "refs/tags/v1.2.0", paths: [] },
  { id: "docs", label: "push a main (solo README.md)", name: "push", ref: "refs/heads/main", paths: ["README.md"] },
  { id: "dispatch", label: "ejecución manual", name: "workflow_dispatch", ref: "refs/heads/main", paths: [] },
];

const KNOWN_EVENTS = new Set([
  "push",
  "pull_request",
  "pull_request_target",
  "workflow_dispatch",
  "workflow_call",
  "workflow_run",
  "schedule",
  "release",
  "merge_group",
  "issues",
  "issue_comment",
  "create",
  "delete",
]);
const TOP_KEYS = new Set(["name", "run-name", "on", "permissions", "env", "defaults", "concurrency", "jobs"]);
const JOB_KEYS = new Set([
  "name",
  "runs-on",
  "needs",
  "if",
  "steps",
  "env",
  "permissions",
  "strategy",
  "outputs",
  "environment",
  "concurrency",
  "timeout-minutes",
  "continue-on-error",
  "container",
  "services",
  "defaults",
  "uses",
  "with",
  "secrets",
]);
const STEP_KEYS = new Set(["name", "id", "uses", "run", "with", "env", "if", "shell", "working-directory", "continue-on-error", "timeout-minutes"]);
const RUNNERS = /^(ubuntu-(latest|24\.04|22\.04)|windows-(latest|2022|2025)|macos-(latest|14|15)|self-hosted)$/;
const KNOWN_ACTIONS: Record<string, string[] | null> = {
  "actions/checkout": ["ref", "fetch-depth", "token", "repository", "path", "submodules"],
  "actions/setup-node": ["node-version", "node-version-file", "cache", "registry-url"],
  "actions/setup-python": ["python-version", "cache"],
  "actions/setup-java": ["java-version", "distribution", "cache"],
  "actions/cache": ["path", "key", "restore-keys"],
  "actions/upload-artifact": ["name", "path", "retention-days", "if-no-files-found"],
  "actions/download-artifact": ["name", "path"],
  "docker/login-action": ["registry", "username", "password"],
  "docker/build-push-action": ["context", "file", "push", "tags", "labels", "platforms"],
  "docker/setup-buildx-action": null,
  "docker/metadata-action": null,
};
const PERMISSION_SCOPES = new Set([
  "contents",
  "packages",
  "pull-requests",
  "issues",
  "actions",
  "checks",
  "deployments",
  "id-token",
  "statuses",
  "security-events",
  "pages",
  "attestations",
]);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export interface Analysis {
  workflow?: Obj;
  diagnostics: Diagnostic[];
}

/** Parses and checks a workflow; every problem carries its line when possible. */
export function analyzeWorkflow(src: string): Analysis {
  const lc = new LineCounter();
  const doc = parseDocument(src, { lineCounter: lc, uniqueKeys: true, prettyErrors: false });
  const diagnostics: Diagnostic[] = [];
  // One message per line: the YAML parser often reports a single mistake several times.
  const seen = new Set<number>();
  for (const e of doc.errors) {
    const line = lc.linePos(e.pos[0]).line;
    if (seen.has(line)) continue;
    seen.add(line);
    diagnostics.push({ message: yamlError(e.message), line, severity: "error" });
  }
  if (doc.errors.length) return { diagnostics };

  const lineOf = (path: (string | number)[], key = false): number | undefined => {
    const node = key ? keyNode(doc, path) : (doc.getIn(path, true) as YamlNode | undefined);
    const off = node?.range?.[0];
    return off === undefined ? undefined : lc.linePos(off).line;
  };
  const err = (message: string, path: (string | number)[], key = true) =>
    diagnostics.push({ message, line: lineOf(path, key), severity: "error" });
  const warn = (message: string, path: (string | number)[], key = true) =>
    diagnostics.push({ message, line: lineOf(path, key), severity: "warning" });

  const wf = doc.toJS() as unknown;
  if (!isObj(wf)) {
    diagnostics.push({ message: "Un workflow es un mapa de claves: name, on, jobs…", line: 1, severity: "error" });
    return { diagnostics };
  }

  for (const k of Object.keys(wf)) if (!TOP_KEYS.has(k)) warn(`Clave desconocida «${k}» en la raíz del workflow.${suggest(k, TOP_KEYS)}`, [k]);

  if (!("on" in wf)) diagnostics.push({ message: "Falta «on»: sin trigger, el workflow nunca se lanza.", line: 1, severity: "error" });
  else {
    const on = wf.on;
    const events = typeof on === "string" ? [on] : Array.isArray(on) ? on.map(String) : isObj(on) ? Object.keys(on) : [];
    if (!events.length) err("«on» necesita al menos un evento, p. ej. push.", ["on"]);
    for (const e of events)
      if (!KNOWN_EVENTS.has(e))
        warn(`«${e}» no es un evento de GitHub.${suggest(e, KNOWN_EVENTS)}`, typeof on === "string" ? ["on"] : isObj(on) ? ["on", e] : ["on"], isObj(on));
  }

  if (isObj(wf.permissions)) {
    for (const [scope, level] of Object.entries(wf.permissions)) {
      if (!PERMISSION_SCOPES.has(scope)) warn(`«${scope}» no es un permiso del GITHUB_TOKEN.${suggest(scope, PERMISSION_SCOPES)}`, ["permissions", scope]);
      else if (!["read", "write", "none"].includes(String(level)))
        err(`El permiso ${scope} debe ser read, write o none.`, ["permissions", scope], false);
    }
  }

  checkHardcodedSecrets(src, diagnostics);

  if (!("jobs" in wf)) {
    diagnostics.push({ message: "Falta «jobs»: un workflow necesita al menos un job.", line: 1, severity: "error" });
    return { workflow: wf, diagnostics };
  }
  if (!isObj(wf.jobs) || !Object.keys(wf.jobs).length) {
    err("«jobs» debe ser un mapa con al menos un job.", ["jobs"]);
    return { workflow: wf, diagnostics };
  }
  const jobIds = Object.keys(wf.jobs);
  for (const id of jobIds) {
    const job = wf.jobs[id];
    if (!isObj(job)) {
      err(`El job «${id}» debe ser un mapa con runs-on y steps.`, ["jobs", id]);
      continue;
    }
    for (const k of Object.keys(job)) if (!JOB_KEYS.has(k)) err(`Clave desconocida «${k}» en el job ${id}.${suggest(k, JOB_KEYS)}`, ["jobs", id, k]);
    if (job.uses) continue; // reusable workflow
    if (!("runs-on" in job)) err(`Al job «${id}» le falta runs-on: no sabe en qué runner ejecutarse.`, ["jobs", id]);
    else if (typeof job["runs-on"] === "string" && !job["runs-on"].includes("${{") && !RUNNERS.test(job["runs-on"]))
      warn(`No hay runners con la etiqueta «${job["runs-on"]}»: el job se quedaría esperando. ¿ubuntu-latest?`, ["jobs", id, "runs-on"], false);
    const needs = job.needs === undefined ? [] : Array.isArray(job.needs) ? job.needs.map(String) : [String(job.needs)];
    for (const n of needs) if (!jobIds.includes(n)) err(`El job ${id} necesita «${n}», que no existe.`, ["jobs", id, "needs"], false);
    if (!("steps" in job)) err(`El job «${id}» no tiene steps.`, ["jobs", id]);
    else if (!Array.isArray(job.steps) || !job.steps.length) err(`steps de ${id} debe ser una lista: cada step empieza por «-».`, ["jobs", id, "steps"]);
    else
      job.steps.forEach((step, i) => {
        const path = ["jobs", id, "steps", i];
        if (!isObj(step)) {
          err("Cada step es un mapa con uses o run.", path, false);
          return;
        }
        for (const k of Object.keys(step)) if (!STEP_KEYS.has(k)) err(`Clave desconocida «${k}» en un step.${suggest(k, STEP_KEYS)}`, [...path, k]);
        if (step.uses && step.run) err("Un step usa una action (uses) o ejecuta comandos (run), no las dos cosas.", [...path, "run"]);
        else if (!step.uses && !step.run) err("Un step necesita uses o run.", path, false);
        if (typeof step.uses === "string") {
          const [name, version] = step.uses.split("@");
          if (!step.uses.startsWith("./") && !step.uses.startsWith("docker://")) {
            if (!version) err(`Falta la versión de la action: ${name}@v4, por ejemplo.`, [...path, "uses"], false);
            if (name.startsWith("actions/") && !(name in KNOWN_ACTIONS))
              err(`La action «${name}» no existe.${suggest(name, new Set(Object.keys(KNOWN_ACTIONS)))}`, [...path, "uses"], false);
            const inputs = KNOWN_ACTIONS[name];
            if (inputs && isObj(step.with))
              for (const k of Object.keys(step.with))
                if (!inputs.includes(k)) warn(`${name} no tiene el input «${k}».${suggest(k, new Set(inputs))}`, [...path, "with", k]);
          }
        }
        if (typeof step.run === "string" && /^actions\/[a-z-]+@/.test(step.run.trim()))
          err("Eso es una action: se usa con uses, no con run.", [...path, "run"], false);
      });
  }
  const cycle = findCycle(wf.jobs as Record<string, Obj>);
  if (cycle) err(`Los jobs forman un ciclo con needs: ${cycle.join(" → ")}.`, ["jobs", cycle[0], "needs"], false);
  return { workflow: wf, diagnostics };
}

function keyNode(doc: Document, path: (string | number)[]): YamlNode | undefined {
  const parent = path.length > 1 ? doc.getIn(path.slice(0, -1), true) : doc.contents;
  const last = path[path.length - 1];
  if (isMap(parent)) {
    const pair = parent.items.find((it) => (it.key as { value?: unknown })?.value === last);
    return (pair?.key as YamlNode) ?? (parent as YamlNode);
  }
  if (isSeq(parent) && typeof last === "number") return parent.items[last] as YamlNode;
  return parent as YamlNode | undefined;
}

function yamlError(msg: string): string {
  if (/tab/i.test(msg)) return "YAML no admite tabuladores para indentar: usa espacios.";
  if (/Map keys must be unique/i.test(msg)) return "Hay una clave repetida en el mismo nivel.";
  if (/Implicit map keys need to be followed by map values|Nested mappings are not allowed|Implicit keys need to be on a single line/i.test(msg))
    return "Indentación o «:» fuera de sitio: revisa los espacios de esta línea. Si es texto con «: », ponlo entre comillas.";
  if (/All mapping items must start at the same column|bad indentation/i.test(msg))
    return "Indentación incoherente: las claves del mismo nivel deben empezar en la misma columna.";
  return `YAML no válido: ${msg.split("\n")[0]}`;
}

function checkHardcodedSecrets(src: string, d: Diagnostic[]) {
  src.split("\n").forEach((l, i) => {
    if (/\b(sk-live-[\w-]+|ghp_[A-Za-z0-9]{6,}|AKIA[A-Z0-9]{8,})/.test(l) || /(password|token|api_key|apikey)\s*:\s*['"]?[A-Za-z0-9_\-]{6,}['"]?\s*$/i.test(l) && !l.includes("${{"))
      d.push({ message: "Parece una credencial en claro. Guárdala en un secret y léela con ${{ secrets.NOMBRE }}.", line: i + 1, severity: "warning" });
  });
}

function findCycle(jobs: Record<string, Obj>): string[] | null {
  const needsOf = (id: string): string[] => {
    const n = jobs[id]?.needs;
    return n === undefined ? [] : Array.isArray(n) ? n.map(String) : [String(n)];
  };
  const state = new Map<string, number>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === 1) return [...stack.slice(stack.indexOf(id)), id];
    if (state.get(id) === 2 || !(id in jobs)) return null;
    state.set(id, 1);
    stack.push(id);
    for (const n of needsOf(id)) {
      const c = visit(n);
      if (c) return c;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const id of Object.keys(jobs)) {
    const c = visit(id);
    if (c) return c;
  }
  return null;
}

/** Edit-distance hint: «¿querías runs-on?». */
function suggest(word: string, options: Set<string>): string {
  const prefixed = [...options].find((o) => word.length >= 3 && o.startsWith(word));
  if (prefixed) return ` ¿Querías «${prefixed}»?`;
  let best = "";
  let bestD = 3;
  for (const o of options) {
    const d = distance(word, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best ? ` ¿Querías «${best}»?` : "";
}

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// ---------- Triggers ----------

/** GitHub filter glob: * stops at "/", ** crosses it. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
    } else if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

const list = (v: unknown): string[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : [String(v)]);
const matchesAny = (value: string, globs: string[]) => globs.some((g) => globToRegExp(g).test(value));

/** Applies include/ignore lists, with "!" negations evaluated in order. */
function filterPass(value: string, include: string[] | null, ignore: string[] | null): boolean {
  if (include) {
    let ok = false;
    for (const g of include) {
      if (g.startsWith("!")) {
        if (globToRegExp(g.slice(1)).test(value)) ok = false;
      } else if (globToRegExp(g).test(value)) ok = true;
    }
    return ok;
  }
  if (ignore) return !matchesAny(value, ignore);
  return true;
}

export function triggers(on: unknown, ev: SimEvent): { fires: boolean; reason: string } {
  const events = typeof on === "string" ? { [on]: null } : Array.isArray(on) ? Object.fromEntries(on.map((e) => [String(e), null])) : isObj(on) ? on : {};
  if (!(ev.name in events)) return { fires: false, reason: `on no incluye ${ev.name}.` };
  const cfg = events[ev.name];
  if (!isObj(cfg)) return { fires: true, reason: `on: ${ev.name} sin filtros: se lanza siempre.` };
  if (ev.name === "schedule" || ev.name === "workflow_dispatch") return { fires: true, reason: `on: ${ev.name}.` };

  const isTag = ev.ref.startsWith("refs/tags/");
  const name = ev.ref.replace(/^refs\/(heads|tags)\//, "");
  const branches = cfg.branches !== undefined ? list(cfg.branches) : null;
  const branchesIgnore = cfg["branches-ignore"] !== undefined ? list(cfg["branches-ignore"]) : null;
  const tags = cfg.tags !== undefined ? list(cfg.tags) : null;
  const tagsIgnore = cfg["tags-ignore"] !== undefined ? list(cfg["tags-ignore"]) : null;
  const hasBranchFilter = branches !== null || branchesIgnore !== null;
  const hasTagFilter = tags !== null || tagsIgnore !== null;

  if (ev.name === "push") {
    if (isTag) {
      if (!hasTagFilter && hasBranchFilter) return { fires: false, reason: "Solo hay filtro de ramas: los tags no lo lanzan." };
      if (!filterPass(name, tags, tagsIgnore)) return { fires: false, reason: `El tag ${name} no pasa el filtro de tags.` };
    } else {
      if (!hasBranchFilter && hasTagFilter) return { fires: false, reason: "Solo hay filtro de tags: los push a ramas no lo lanzan." };
      if (!filterPass(name, branches, branchesIgnore)) return { fires: false, reason: `La rama ${name} no pasa el filtro de ramas.` };
    }
  } else if (!filterPass(name, branches, branchesIgnore)) {
    return { fires: false, reason: `El PR va hacia ${name}, que no pasa el filtro de ramas.` };
  }

  const paths = cfg.paths !== undefined ? list(cfg.paths) : null;
  const pathsIgnore = cfg["paths-ignore"] !== undefined ? list(cfg["paths-ignore"]) : null;
  // Path filters are not evaluated for pushes of tags.
  if ((paths || pathsIgnore) && !(ev.name === "push" && isTag)) {
    const changed = ev.paths;
    const ok = paths ? changed.some((p) => filterPass(p, paths, null)) : changed.some((p) => !matchesAny(p, pathsIgnore!));
    if (!ok) return { fires: false, reason: changed.length ? `Ningún archivo cambiado (${changed.join(", ")}) pasa el filtro de paths.` : "Sin archivos cambiados que pasen el filtro de paths." };
  }
  return { fires: true, reason: `${ev.label}: pasa los filtros de on.${ev.name}.` };
}

// ---------- Run ----------

export type StepStatus = "success" | "failure" | "skipped";

export interface StepRun {
  name: string;
  status: StepStatus;
  log: OutLine[];
}

export interface JobRun {
  key: string;
  id: string;
  name: string;
  needs: string[];
  /** Column in the graph: 0 for jobs without needs. */
  level: number;
  status: StepStatus;
  reason?: string;
  steps: StepRun[];
}

export interface RunResult {
  fires: boolean;
  reason: string;
  jobs: JobRun[];
}

/** Secrets the simulated repository has. */
export const SIM_SECRETS: Record<string, string> = {
  GITHUB_TOKEN: "ghs_simulado00000000000000000",
  DEPLOY_TOKEN: "dpl_simulado_1234",
  API_KEY: "key_simulada_5678",
};

const SHA = "3f9c2ab7d41e5c08b6a1f2e9d7c3b5a4e6f80912";
const REPO_FILES = ["Dockerfile", "package.json", "package-lock.json", "src/", "README.md"];

function needsList(job: Obj): string[] {
  return list(job.needs);
}

function levels(jobs: Record<string, Obj>): Record<string, number> {
  const memo: Record<string, number> = {};
  const lvl = (id: string, seen: Set<string>): number => {
    if (id in memo) return memo[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    const ns = needsList(jobs[id] ?? {}).filter((n) => n in jobs);
    return (memo[id] = ns.length ? Math.max(...ns.map((n) => lvl(n, seen))) + 1 : 0);
  };
  for (const id of Object.keys(jobs)) lvl(id, new Set());
  return memo;
}

function expandMatrix(job: Obj): Record<string, Value>[] {
  const strategy = job.strategy;
  if (!isObj(strategy) || !isObj(strategy.matrix)) return [{}];
  const m = strategy.matrix;
  let combos: Record<string, Value>[] = [{}];
  for (const [k, v] of Object.entries(m)) {
    if (k === "include" || k === "exclude" || !Array.isArray(v)) continue;
    combos = combos.flatMap((c) => (v as Value[]).map((x) => ({ ...c, [k]: x })));
  }
  if (Array.isArray(m.include)) combos.push(...(m.include as Record<string, Value>[]).filter(isObj));
  return combos.length ? combos : [{}];
}

function tokenPermissions(wf: Obj, job: Obj): Record<string, string> {
  const p = job.permissions ?? wf.permissions;
  // Restricted default for new repositories: read access to contents and packages.
  if (p === undefined) return { contents: "read", packages: "read" };
  if (p === "write-all") return Object.fromEntries([...PERMISSION_SCOPES].map((s) => [s, "write"]));
  if (p === "read-all") return Object.fromEntries([...PERMISSION_SCOPES].map((s) => [s, "read"]));
  if (isObj(p)) return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)]));
  return {};
}

export function simulateRun(wf: Obj, ev: SimEvent): RunResult {
  const t = triggers(wf.on, ev);
  if (!t.fires) return { ...t, jobs: [] };
  const jobs = (isObj(wf.jobs) ? wf.jobs : {}) as Record<string, Obj>;
  const lv = levels(jobs);
  const isTag = ev.ref.startsWith("refs/tags/");
  const refName = ev.ref.replace(/^refs\/(heads|tags)\//, "");
  const github: Value = {
    event_name: ev.name,
    ref: ev.name === "pull_request" ? "refs/pull/7/merge" : ev.ref,
    ref_name: ev.name === "pull_request" ? "7/merge" : refName,
    ref_type: isTag ? "tag" : "branch",
    base_ref: ev.name === "pull_request" ? refName : "",
    head_ref: ev.name === "pull_request" ? "feature/login" : "",
    sha: SHA,
    actor: "octocat",
    repository: "dev/hello-devops",
    repository_owner: "dev",
    run_number: 42,
    run_id: 1234567890,
    workflow: String(wf.name ?? ".github/workflows/ci.yml"),
    event: {},
  };
  const results: Record<string, { result: StepStatus; outputs: Record<string, string> }> = {};
  const artifacts: Record<string, string[]> = {};
  const runs: JobRun[] = [];
  const order = Object.keys(jobs).sort((a, b) => lv[a] - lv[b]);

  for (const id of order) {
    const job = jobs[id];
    if (!isObj(job)) continue;
    const needs = needsList(job);
    const needsCtx: Record<string, Value> = {};
    for (const n of needs) needsCtx[n] = { result: results[n]?.result ?? "skipped", outputs: results[n]?.outputs ?? {} };
    const needsFailed = needs.some((n) => results[n]?.result !== "success");
    for (const matrix of expandMatrix(job)) {
      const label = Object.values(matrix).map(String).join(", ");
      const name = `${String(job.name ?? id)}${label ? ` (${label})` : ""}`;
      const run: JobRun = { key: `${id}:${label}`, id, name, needs, level: lv[id] ?? 0, status: "success", steps: [] };
      runs.push(run);
      const baseCtx: Contexts = {
        github,
        env: { ...(isObj(wf.env) ? (wf.env as Record<string, Value>) : {}), ...(isObj(job.env) ? (job.env as Record<string, Value>) : {}) },
        secrets: SIM_SECRETS,
        vars: {},
        runner: { os: "Linux", arch: "X64", temp: "/home/runner/work/_temp" },
        matrix,
        needs: needsCtx,
        inputs: {},
        steps: {},
        job: { status: "success" },
        strategy: {},
      };
      let ok: boolean;
      try {
        ok = evaluateCondition(job.if, baseCtx, { failed: needsFailed });
      } catch (e) {
        run.status = "failure";
        run.reason = `if del job: ${(e as Error).message}`;
        continue;
      }
      if (!ok) {
        run.status = "skipped";
        run.reason = job.if !== undefined ? `if: ${String(job.if)} → false` : "Un job del que depende no terminó bien.";
        continue;
      }
      const res = runJob(wf, job, baseCtx, artifacts);
      run.steps = res.steps;
      run.status = res.failed ? "failure" : "success";
      const outputs: Record<string, string> = {};
      if (isObj(job.outputs))
        for (const [k, v] of Object.entries(job.outputs)) outputs[k] = interpolate(String(v), { ...baseCtx, steps: res.stepsCtx }).text;
      const prev = results[id];
      results[id] = {
        result: prev?.result === "failure" || run.status === "failure" ? "failure" : "success",
        outputs: { ...(prev?.outputs ?? {}), ...outputs },
      };
    }
    if (!results[id]) results[id] = { result: "skipped", outputs: {} };
  }
  return { ...t, jobs: runs };
}

interface JobEnv {
  files: Map<string, string>;
  checkedOut: boolean;
  loggedIn: boolean;
  env: Record<string, string>;
}

function runJob(wf: Obj, job: Obj, ctx: Contexts, artifacts: Record<string, string[]>) {
  const steps: StepRun[] = [];
  const stepsCtx: Record<string, Value> = {};
  const perms = tokenPermissions(wf, job);
  const je: JobEnv = { files: new Map(), checkedOut: false, loggedIn: false, env: {} };
  let failed = false;
  const secretValues = Object.values(SIM_SECRETS);
  const mask = (l: OutLine): OutLine => ({ ...l, text: secretValues.reduce((t, s) => t.split(s).join("***"), l.text) });

  steps.push({ name: "Set up job", status: "success", log: [out(`Runner: ${String(job["runs-on"] ?? "ubuntu-latest")}`), out(`GITHUB_TOKEN permissions: ${Object.entries(perms).map(([k, v]) => `${k}: ${v}`).join(", ") || "ninguno"}`, "muted")] });

  const list = Array.isArray(job.steps) ? job.steps : [];
  list.forEach((raw) => {
    if (!isObj(raw)) return;
    const step = raw;
    const sctx: Contexts = {
      ...ctx,
      env: { ...(ctx.env as Record<string, Value>), ...je.env, ...(isObj(step.env) ? (step.env as Record<string, Value>) : {}) },
      steps: stepsCtx,
      job: { status: failed ? "failure" : "success" },
    };
    const title = String(step.name ?? (step.uses ? `Run ${step.uses}` : `Run ${String(step.run ?? "").split("\n")[0]}`));
    const rec: StepRun = { name: interpolate(title, sctx).text, status: "success", log: [] };
    steps.push(rec);
    let run: boolean;
    try {
      run = evaluateCondition(step.if, sctx, { failed });
    } catch (e) {
      rec.status = "failure";
      rec.log.push(out(`Error en if: ${(e as Error).message}`, "err"));
      failed = true;
      return;
    }
    if (!run) {
      rec.status = "skipped";
      if (step.if !== undefined) rec.log.push(out(`if: ${String(step.if)} → false`, "muted"));
      return;
    }
    // Inputs and env are interpolated first; an expression error fails the step, as in GitHub.
    const withIn: Record<string, string> = {};
    let exprError: string | undefined;
    if (isObj(step.with))
      for (const [k, v] of Object.entries(step.with)) {
        const r = interpolate(String(v), sctx);
        withIn[k] = r.text;
        exprError ??= r.error;
      }
    const stepEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(sctx.env as Record<string, Value>)) {
      const r = interpolate(String(v), sctx);
      stepEnv[k] = r.text;
      exprError ??= r.error;
    }
    const outputs: Record<string, string> = {};
    let ok = true;
    if (exprError) {
      rec.log.push(out(`Error: ${exprError}`, "err"));
      ok = false;
    } else if (typeof step.uses === "string") {
      ok = runAction(step.uses, withIn, je, perms, artifacts, rec.log);
    } else if (typeof step.run === "string") {
      const r = interpolate(step.run, sctx);
      if (r.error) {
        rec.log.push(out(`Error: ${r.error}`, "err"));
        ok = false;
      } else ok = runScript(r.text, { ...stepEnv }, je, perms, outputs, rec.log);
    }
    rec.log = rec.log.map(mask);
    if (step.id) stepsCtx[String(step.id)] = { outputs, outcome: ok ? "success" : "failure", conclusion: ok ? "success" : "failure" };
    if (!ok) {
      rec.status = "failure";
      if (!step["continue-on-error"]) failed = true;
    }
  });
  steps.push({ name: "Complete job", status: failed ? "failure" : "success", log: [out(failed ? "El job termina con error." : "Job completado.", failed ? "err" : "ok")] });
  return { steps, failed, stepsCtx };
}

function runAction(
  uses: string,
  withIn: Record<string, string>,
  je: JobEnv,
  perms: Record<string, string>,
  artifacts: Record<string, string[]>,
  log: OutLine[],
): boolean {
  const [name, version] = uses.split("@");
  if (!version && !uses.startsWith("./")) {
    log.push(out(`Error: Unable to resolve action ${uses}: falta la versión (@v4).`, "err"));
    return false;
  }
  if (name.startsWith("actions/") && !(name in KNOWN_ACTIONS)) {
    log.push(out(`Error: Unable to resolve action \`${uses}\`, repository not found`, "err"));
    return false;
  }
  switch (name) {
    case "actions/checkout":
      if (!perms.contents || perms.contents === "none") {
        log.push(
          out("remote: Repository not found.", "err"),
          out("# el GITHUB_TOKEN no puede leer el repo: falta permissions: contents: read", "muted"),
        );
        return false;
      }
      je.checkedOut = true;
      log.push(out("Syncing repository: dev/hello-devops"), out(`Checking out ${SHA.slice(0, 7)}`), out(`Archivos: ${REPO_FILES.join("  ")}`, "muted"));
      return true;
    case "actions/setup-node": {
      const v = withIn["node-version"];
      if (!v) log.push(out("Sin node-version: se usa el Node del runner. Fíjalo para builds reproducibles.", "warn"));
      else log.push(out(`Attempting to download ${v}...`), out(`Node.js ${v}.x configurado`, "ok"));
      if (withIn.cache) log.push(out(withIn.cache === "npm" ? "Cache npm: restaurada desde ~/.npm" : `Cache ${withIn.cache}`, "muted"));
      return true;
    }
    case "actions/setup-python":
    case "actions/setup-java":
      log.push(out(`${name.split("-")[1]} ${withIn["python-version"] ?? withIn["java-version"] ?? ""} configurado`, "ok"));
      return true;
    case "actions/cache":
      log.push(out(`Cache not found for input keys: ${withIn.key ?? "(sin key)"}`, "muted"), out("Se guardará al terminar el job."));
      return true;
    case "actions/upload-artifact": {
      const path = withIn.path ?? "";
      const files = [...je.files.keys()].filter((f) => f === path || f.startsWith(path.replace(/\/$/, "") + "/"));
      if (!files.length) {
        log.push(out(`Warning: No files were found with the provided path: ${path}. No artifacts will be uploaded.`, "warn"));
        return true;
      }
      artifacts[withIn.name ?? "artifact"] = files;
      log.push(out(`Artifact ${withIn.name ?? "artifact"} subido (${files.length} archivo${files.length > 1 ? "s" : ""})`, "ok"));
      return true;
    }
    case "actions/download-artifact": {
      const a = artifacts[withIn.name ?? "artifact"];
      if (!a) {
        log.push(out(`Error: Unable to download artifact(s): Artifact not found for name: ${withIn.name}`, "err"));
        return false;
      }
      a.forEach((f) => je.files.set(f, "(artifact)"));
      log.push(out(`Artifact ${withIn.name} descargado: ${a.join(", ")}`, "ok"));
      return true;
    }
    case "docker/login-action":
      if (!withIn.password) {
        log.push(out("Error: Password required", "err"), out("# ¿el secret existe? Un secret que no existe se evalúa como cadena vacía", "muted"));
        return false;
      }
      je.loggedIn = true;
      log.push(out(`Logging into ${withIn.registry ?? "docker.io"}...`), out("Login Succeeded!", "ok"));
      return true;
    case "docker/build-push-action":
      log.push(out(`#1 building with context ${withIn.context ?? "."}`), out("#8 exporting to image"));
      if (withIn.push === "true") return push(withIn.tags ?? "", je, perms, log);
      return true;
    default:
      log.push(out(`Download action repository '${uses}'`), out("Action completada", "muted"));
      return true;
  }
}

function push(tag: string, je: JobEnv, perms: Record<string, string>, log: OutLine[]): boolean {
  if (!je.loggedIn) {
    log.push(out(`denied: requested access to the resource is denied (${tag}): falta docker login`, "err"));
    return false;
  }
  if (tag.startsWith("ghcr.io") && perms.packages !== "write") {
    log.push(out("denied: installation not allowed to Write organization package", "err"), out("# el GITHUB_TOKEN necesita permissions: packages: write", "muted"));
    return false;
  }
  log.push(out(`pushing ${tag}`), out("digest: sha256:9b2c…  size: 1573", "ok"));
  return true;
}

function expandVars(text: string, env: Record<string, string>): string {
  return text.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (m, v: string) => (v in env ? env[v] : m.startsWith("${") ? "" : ""));
}

function runScript(
  script: string,
  stepEnv: Record<string, string>,
  je: JobEnv,
  perms: Record<string, string>,
  outputs: Record<string, string>,
  log: OutLine[],
): boolean {
  const env: Record<string, string> = {
    GITHUB_SHA: SHA,
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: "dev/hello-devops",
    GITHUB_OUTPUT: "/home/runner/_out",
    GITHUB_ENV: "/home/runner/_env",
    GITHUB_STEP_SUMMARY: "/home/runner/_summary",
    HOME: "/home/runner",
    ...stepEnv,
  };
  const commands = script
    .split("\n")
    .flatMap((l) => l.split("&&"))
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  for (const c of commands) log.push(out(`$ ${c}`, "muted"));
  for (const raw of commands) {
    const c = expandVars(raw, env);
    const redirect = c.match(/^(.*?)\s*(>>?)\s*(\S+)$/);
    const body = redirect ? redirect[1] : c;
    const words = body.split(/\s+/);
    const cmd = words[0];
    let output: string | null = null;
    if (cmd === "echo") {
      output = body.slice(4).trim().replace(/^(["'])(.*)\1$/, "$2");
    } else if (cmd === "cat") {
      const f = words[1];
      if (!je.files.has(f) && !(je.checkedOut && REPO_FILES.includes(f))) {
        log.push(out(`cat: ${f}: No such file or directory`, "err"));
        if (!je.checkedOut) log.push(out("# cada job empieza en un runner limpio: los archivos de otro job no están aquí", "muted"));
        return false;
      }
      output = je.files.get(f) ?? `(contenido de ${f})`;
    } else if (cmd === "ls") {
      output = [...(je.checkedOut ? REPO_FILES : []), ...je.files.keys()].join("  ");
    } else if (cmd === "exit") {
      const code = Number(words[1] ?? 0);
      if (code !== 0) {
        log.push(out(`Error: Process completed with exit code ${code}.`, "err"));
        return false;
      }
      return true;
    } else if (cmd === "npm" || cmd === "make" || cmd.startsWith("./") || cmd === "node") {
      if (!je.checkedOut) {
        log.push(
          out(cmd === "npm" ? "npm error enoent Could not read package.json" : `${cmd}: No such file or directory`, "err"),
          out("# falta actions/checkout: el código del repo no está en el runner", "muted"),
          out("Error: Process completed with exit code 254.", "err"),
        );
        return false;
      }
      const sub = words[1];
      if (cmd === "npm" && (sub === "ci" || sub === "install" || sub === "i")) output = "added 142 packages in 3s";
      else if (cmd === "npm" && (sub === "test" || sub === "t")) output = "Tests: 12 passed, 12 total";
      else if (cmd === "npm" && sub === "run" && words[2] === "build") {
        je.files.set("dist/app.js", "(build)");
        output = "build terminado → dist/app.js";
      } else if (cmd === "npm" && sub === "run" && words[2] === "lint") output = "0 problemas";
      else output = "ok";
    } else if (cmd === "docker") {
      const sub = words[1];
      if (sub === "build") {
        if (!je.checkedOut) {
          log.push(out("ERROR: failed to read dockerfile: open Dockerfile: no such file or directory", "err"));
          return false;
        }
        output = "#8 naming to " + (words[words.indexOf("-t") + 1] ?? "image") + " done";
      } else if (sub === "push") {
        if (!push(words[2] ?? "", je, perms, log)) return false;
        continue;
      } else if (sub === "login") {
        je.loggedIn = true;
        output = "Login Succeeded";
      } else output = "ok";
    } else {
      output = "";
    }
    if (redirect) {
      const target = redirect[3];
      const content = output ?? "";
      if (target === env.GITHUB_OUTPUT) {
        const m = content.match(/^([\w-]+)=(.*)$/);
        if (m) outputs[m[1]] = m[2];
      } else if (target === env.GITHUB_ENV) {
        const m = content.match(/^([\w-]+)=(.*)$/);
        if (m) je.env[m[1]] = m[2];
      } else if (target !== env.GITHUB_STEP_SUMMARY) {
        const prev = redirect[2] === ">>" ? (je.files.get(target) ?? "") + "\n" : "";
        je.files.set(target, prev + content);
      }
    } else if (output) output.split("\n").forEach((l) => log.push(out(l)));
  }
  return true;
}
