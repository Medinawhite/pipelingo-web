import type { TerminalCheck, TerminalSetup } from "../content/types";
import { out, table, tokenize, type OutLine } from "./shell";

// A small, deterministic Docker simulator. It keeps real state (images, containers, ports, logs)
// so a lab can check what the learner actually did, and answers with Docker-like messages,
// including the usual mistakes (name in use, port taken, removing a running container…).

type ContainerState = "running" | "exited" | "created";

export interface Container {
  id: string;
  name: string;
  image: string;
  command: string;
  state: ContainerState;
  exitCode: number;
  /** "8080:80" host:container. */
  ports: string[];
  env: string[];
  logs: string[];
  createdAt: number;
  changedAt: number;
}

export interface DockerState {
  images: string[];
  containers: Container[];
  history: string[];
  /** Host ports that answered a successful curl. */
  httpHits: number[];
  /** Simulated clock, in seconds; every command moves it forward. */
  clock: number;
  seq: number;
}

interface ImageSpec {
  tags: string[];
  size: string;
  command: string;
  /** Container port it listens on, if it is a server. */
  listens?: number;
  /** Logs and behaviour when it starts. */
  start(env: string[], args: string[]): { logs: string[]; exitCode: number | null };
}

const nginxLogs = [
  "/docker-entrypoint.sh: Configuration complete; ready for start up",
  "2026/11/26 10:00:00 [notice] 1#1: nginx/1.27.3",
  "2026/11/26 10:00:00 [notice] 1#1: start worker processes",
];

const CATALOG: Record<string, ImageSpec> = {
  nginx: {
    tags: ["latest", "1.27", "1.26", "alpine"],
    size: "192MB",
    command: '"/docker-entrypoint.…"',
    listens: 80,
    start: () => ({ logs: nginxLogs, exitCode: null }),
  },
  "hello-world": {
    tags: ["latest"],
    size: "13.3kB",
    command: '"/hello"',
    start: () => ({
      logs: [
        "",
        "Hello from Docker!",
        "This message shows that your installation appears to be working correctly.",
        "",
      ],
      exitCode: 0,
    }),
  },
  alpine: {
    tags: ["latest", "3.20"],
    size: "7.8MB",
    command: '"/bin/sh"',
    start: (_env, args) => runShellArgs(args),
  },
  node: {
    tags: ["20-alpine", "22-alpine", "latest"],
    size: "135MB",
    command: '"docker-entrypoint.s…"',
    start: (_env, args) => runShellArgs(args),
  },
  postgres: {
    tags: ["16", "17", "latest"],
    size: "438MB",
    command: '"docker-entrypoint.s…"',
    listens: 5432,
    start: (env) =>
      env.some((e) => /^POSTGRES_PASSWORD=.+/.test(e))
        ? {
            logs: [
              "PostgreSQL init process complete; ready for start up.",
              "LOG:  database system is ready to accept connections",
            ],
            exitCode: null,
          }
        : {
            logs: [
              "Error: Database is uninitialized and superuser password is not specified.",
              "       You must specify POSTGRES_PASSWORD to a non-empty value for the",
              '       superuser. For example, "-e POSTGRES_PASSWORD=password" on "docker run".',
            ],
            exitCode: 1,
          },
  },
  redis: {
    tags: ["7", "latest"],
    size: "117MB",
    command: '"docker-entrypoint.s…"',
    listens: 6379,
    start: () => ({ logs: ["1:M * Ready to accept connections tcp"], exitCode: null }),
  },
};

function runShellArgs(args: string[]): { logs: string[]; exitCode: number | null } {
  if (args[0] === "echo") return { logs: [args.slice(1).join(" ")], exitCode: 0 };
  if (args[0] === "sleep") return { logs: [], exitCode: null };
  if (args.length === 0) return { logs: [], exitCode: 0 };
  return { logs: [], exitCode: 0 };
}

/** "nginx" → "nginx:latest". */
export function normalizeImage(ref: string): string {
  const r = ref.replace(/^docker\.io\/(library\/)?/, "");
  const slash = r.lastIndexOf("/");
  return r.lastIndexOf(":") > slash ? r : `${r}:latest`;
}

const repoOf = (ref: string) => ref.slice(0, ref.lastIndexOf(":"));
const tagOf = (ref: string) => ref.slice(ref.lastIndexOf(":") + 1);
const shortImage = (ref: string) => (tagOf(ref) === "latest" ? repoOf(ref) : ref);

function hexId(seed: number, salt: string): string {
  let h = 2166136261 ^ seed;
  for (const ch of salt) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let s = "";
  for (let i = 0; i < 3; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    s += (h >>> 0).toString(16).padStart(8, "0");
  }
  return s.slice(0, 12);
}

const ADJ = ["eager", "brave", "quirky", "sleepy", "jolly", "zen", "focused", "nifty"];
const NOUN = ["turing", "hopper", "lovelace", "torvalds", "ritchie", "hamilton", "knuth", "wozniak"];

export function createDocker(setup?: TerminalSetup): DockerState {
  const s: DockerState = { images: [], containers: [], history: [], httpHits: [], clock: 0, seq: 0 };
  for (const img of setup?.images ?? []) s.images.push(normalizeImage(img));
  for (const c of setup?.containers ?? []) {
    const image = normalizeImage(c.image);
    if (!s.images.includes(image)) s.images.push(image);
    const spec = CATALOG[repoOf(image)];
    const started = spec?.start(c.env ?? [], []) ?? { logs: [], exitCode: 0 };
    s.seq++;
    s.containers.push({
      id: hexId(s.seq, c.name),
      name: c.name,
      image,
      command: spec?.command ?? '"sh"',
      state: c.state,
      exitCode: c.state === "exited" ? (started.exitCode ?? 0) : 0,
      ports: c.ports ?? [],
      env: c.env ?? [],
      logs: started.logs,
      createdAt: -3600,
      changedAt: -3500,
    });
  }
  return s;
}

function ago(seconds: number): string {
  if (seconds < 1) return "Less than a second";
  if (seconds < 60) return `${seconds} seconds`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return m === 1 ? "About a minute" : `${m} minutes`;
  const h = Math.floor(m / 60);
  return h === 1 ? "About an hour" : `${h} hours`;
}

const err = (text: string) => out(text, "err");

export interface ExecResult {
  state: DockerState;
  lines: OutLine[];
  /** The UI clears the screen. */
  clear?: boolean;
}

/** Runs one command line. Pure: returns a new state. */
export function exec(prev: DockerState, line: string): ExecResult {
  const s: DockerState = structuredClone(prev);
  const trimmed = line.trim();
  if (!trimmed) return { state: prev, lines: [] };
  s.history.push(trimmed);
  s.clock += 5;
  const words = tokenize(trimmed);
  const [cmd, ...args] = words;
  const lines: OutLine[] = [];
  switch (cmd) {
    case "clear":
      return { state: s, lines, clear: true };
    case "help":
      lines.push(
        out("Comandos del simulador:"),
        out("  docker pull | images | run | ps [-a] | logs | stop | start | restart | rm | rmi"),
        out("  curl http://localhost:PUERTO   prueba un puerto publicado"),
        out("  ls  pwd  echo  whoami  history  clear"),
        out("# ↑/↓ recorre el historial · Tab autocompleta", "muted"),
      );
      break;
    case "pwd":
      lines.push(out("/home/dev/hello-devops"));
      break;
    case "whoami":
      lines.push(out("dev"));
      break;
    case "ls":
      lines.push(out("Dockerfile  package.json  server.js"));
      break;
    case "echo":
      lines.push(out(args.join(" ")));
      break;
    case "history":
      s.history.forEach((h, i) => lines.push(out(`${String(i + 1).padStart(5)}  ${h}`)));
      break;
    case "curl":
      curl(s, args, lines);
      break;
    case "sudo":
      lines.push(err("sudo: en este simulador ya tienes permisos para usar docker"));
      break;
    case "docker":
      docker(s, args, lines);
      break;
    default:
      lines.push(err(`bash: ${cmd}: command not found`));
  }
  return { state: s, lines };
}

function find(s: DockerState, ref: string): Container | undefined {
  return s.containers.find((c) => c.name === ref) ?? s.containers.find((c) => ref.length >= 3 && c.id.startsWith(ref));
}

function docker(s: DockerState, args: string[], lines: OutLine[]) {
  let [sub, ...rest] = args;
  // `docker container ls`, `docker image ls` and friends.
  if (sub === "container" || sub === "image") {
    const map: Record<string, string> = { ls: sub === "image" ? "images" : "ps", list: "ps", rm: sub === "image" ? "rmi" : "rm" };
    const [inner, ...more] = rest;
    sub = map[inner] ?? inner;
    rest = more;
  }
  switch (sub) {
    case undefined:
    case "--help":
      lines.push(out("Usage:  docker [OPTIONS] COMMAND"), out("Prueba: docker run, docker ps, docker images…", "muted"));
      return;
    case "--version":
    case "version":
      lines.push(out("Docker version 28.0.0, build simulador"));
      return;
    case "pull":
      return pull(s, rest, lines);
    case "images":
      return images(s, lines);
    case "run":
      return run(s, rest, lines);
    case "ps":
      return ps(s, rest, lines);
    case "logs":
      return logs(s, rest, lines);
    case "stop":
    case "start":
    case "restart":
      return lifecycle(s, sub, rest, lines);
    case "rm":
      return rm(s, rest, lines);
    case "rmi":
      return rmi(s, rest, lines);
    case "exec":
      lines.push(err("El simulador no admite docker exec; prueba docker logs para ver qué pasa dentro."));
      return;
    case "build":
      lines.push(err("El simulador de este lab no construye imágenes: usa imágenes del registro."));
      return;
    default:
      lines.push(err(`docker: '${sub}' is not a docker command.`), out("See 'docker --help'", "muted"));
  }
}

function pullImage(s: DockerState, ref: string, lines: OutLine[]): boolean {
  const image = normalizeImage(ref);
  const spec = CATALOG[repoOf(image)];
  if (!spec) {
    lines.push(
      err(`Error response from daemon: pull access denied for ${repoOf(image)}, repository does not exist or may require 'docker login'`),
    );
    return false;
  }
  if (!spec.tags.includes(tagOf(image))) {
    lines.push(err(`Error response from daemon: manifest for ${image} not found: manifest unknown`));
    return false;
  }
  lines.push(out(`${tagOf(image)}: Pulling from library/${repoOf(image)}`));
  if (s.images.includes(image)) {
    lines.push(out(`Status: Image is up to date for ${image}`));
  } else {
    lines.push(out("a2318d6c47ec: Pull complete"), out("5d0f6f8c1d3e: Pull complete"));
    lines.push(out(`Digest: sha256:${hexId(s.seq + 7, image)}${hexId(9, image)}…`, "muted"));
    lines.push(out(`Status: Downloaded newer image for ${image}`));
    s.images.push(image);
  }
  lines.push(out(`docker.io/library/${image}`));
  return true;
}

function pull(s: DockerState, args: string[], lines: OutLine[]) {
  const ref = args.find((a) => !a.startsWith("-"));
  if (!ref) {
    lines.push(err('"docker pull" requires exactly 1 argument.'));
    return;
  }
  pullImage(s, ref, lines);
}

function images(s: DockerState, lines: OutLine[]) {
  const rows = [["REPOSITORY", "TAG", "IMAGE ID", "CREATED", "SIZE"]];
  for (const img of s.images) {
    rows.push([repoOf(img), tagOf(img), hexId(1, img), "2 weeks ago", CATALOG[repoOf(img)]?.size ?? "—"]);
  }
  table(rows).forEach((r) => lines.push(out(r)));
}

function hostPortTaken(s: DockerState, host: string, exceptName?: string): Container | undefined {
  return s.containers.find((c) => c.state === "running" && c.name !== exceptName && c.ports.some((p) => p.split(":")[0] === host));
}

function run(s: DockerState, args: string[], lines: OutLine[]) {
  let detach = false;
  let name: string | undefined;
  let remove = false;
  let interactive = false;
  const ports: string[] = [];
  const env: string[] = [];
  let i = 0;
  const value = (flag: string): string | undefined => {
    const a = args[i];
    if (a.startsWith(flag + "=")) return a.slice(flag.length + 1);
    i++;
    return args[i];
  };
  for (; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("-")) break;
    if (a === "-d" || a === "--detach") detach = true;
    else if (a === "--rm") remove = true;
    else if (a === "-it" || a === "-ti" || a === "-i" || a === "-t") interactive = true;
    else if (a === "-dit" || a === "-itd") {
      detach = true;
      interactive = true;
    } else if (a === "--name" || a.startsWith("--name=")) name = value("--name");
    else if (a === "-p" || a === "--publish" || a.startsWith("--publish=")) {
      const v = value(a === "-p" ? "-p" : "--publish");
      if (v) ports.push(v);
    } else if (a === "-e" || a === "--env" || a.startsWith("--env=")) {
      const v = value(a === "-e" ? "-e" : "--env");
      if (v) env.push(v);
    } else {
      lines.push(err(`unknown flag: ${a}`), out("See 'docker run --help'.", "muted"));
      return;
    }
  }
  const ref = args[i];
  const cmdArgs = args.slice(i + 1);
  if (!ref) {
    lines.push(err('"docker run" requires at least 1 argument.'));
    return;
  }
  for (const p of ports) {
    if (!/^\d+:\d+$/.test(p)) {
      lines.push(err(`docker: invalid publish spec "${p}": usa PUERTO_HOST:PUERTO_CONTENEDOR, p. ej. 8080:80.`));
      return;
    }
  }
  if (name && s.containers.some((c) => c.name === name)) {
    const other = s.containers.find((c) => c.name === name)!;
    lines.push(
      err(
        `docker: Error response from daemon: Conflict. The container name "/${name}" is already in use by container "${other.id}". You have to remove (or rename) that container to be able to reuse that name.`,
      ),
    );
    return;
  }
  const image = normalizeImage(ref);
  if (!s.images.includes(image)) {
    lines.push(out(`Unable to find image '${image}' locally`));
    if (!pullImage(s, ref, lines)) return;
  }
  const spec = CATALOG[repoOf(image)];
  s.seq++;
  const id = hexId(s.seq, image + (name ?? ""));
  const c: Container = {
    id,
    name: name ?? `${ADJ[s.seq % ADJ.length]}_${NOUN[(s.seq * 3) % NOUN.length]}`,
    image,
    command: cmdArgs.length ? `"${cmdArgs.join(" ").slice(0, 18)}…"` : spec.command,
    state: "created",
    exitCode: 0,
    ports,
    env,
    logs: [],
    createdAt: s.clock,
    changedAt: s.clock,
  };
  s.containers.push(c);
  for (const p of ports) {
    const host = p.split(":")[0];
    if (hostPortTaken(s, host, c.name)) {
      lines.push(
        err(
          `docker: Error response from daemon: driver failed programming external connectivity on endpoint ${c.name}: Bind for 0.0.0.0:${host} failed: port is already allocated.`,
        ),
      );
      return; // Docker leaves the container created but not started.
    }
  }
  const started = spec.start(env, cmdArgs);
  c.logs = [...started.logs];
  if (started.exitCode === null) c.state = "running";
  else {
    c.state = "exited";
    c.exitCode = started.exitCode;
  }
  if (interactive && !detach) lines.push(out("# el simulador no abre sesiones interactivas: -it se ignora", "muted"));
  if (detach) {
    lines.push(out(c.id + hexId(s.seq, "full") + hexId(s.seq, "more").slice(0, 4)));
  } else {
    started.logs.forEach((l) => lines.push(out(l)));
    if (c.state === "running") {
      lines.push(out("^C", "muted"));
      lines.push(out("# en primer plano, el contenedor se para al volver al prompt. Usa -d para dejarlo corriendo.", "warn"));
      c.state = "exited";
      c.exitCode = 0;
    }
  }
  if (remove && c.state === "exited") s.containers = s.containers.filter((x) => x !== c);
}

function ps(s: DockerState, args: string[], lines: OutLine[]) {
  const all = args.includes("-a") || args.includes("--all");
  const quiet = args.includes("-q") || args.includes("--quiet") || args.includes("-aq") || args.includes("-qa");
  const showAll = all || args.includes("-aq") || args.includes("-qa");
  const list = s.containers.filter((c) => showAll || c.state === "running");
  if (quiet) {
    list.forEach((c) => lines.push(out(c.id)));
    return;
  }
  const rows = [["CONTAINER ID", "IMAGE", "COMMAND", "CREATED", "STATUS", "PORTS", "NAMES"]];
  for (const c of list) {
    const status =
      c.state === "running"
        ? `Up ${ago(s.clock - c.changedAt)}`
        : c.state === "created"
          ? "Created"
          : `Exited (${c.exitCode}) ${ago(s.clock - c.changedAt)} ago`;
    const ports = c.state === "running" ? c.ports.map((p) => `0.0.0.0:${p.split(":")[0]}->${p.split(":")[1]}/tcp`).join(", ") : "";
    rows.push([c.id, shortImage(c.image), c.command, `${ago(s.clock - c.createdAt)} ago`, status, ports, c.name]);
  }
  table(rows).forEach((r) => lines.push(out(r)));
}

function logs(s: DockerState, args: string[], lines: OutLine[]) {
  const ref = args.find((a) => !a.startsWith("-"));
  if (!ref) {
    lines.push(err('"docker logs" requires exactly 1 argument.'));
    return;
  }
  const c = find(s, ref);
  if (!c) {
    lines.push(err(`Error response from daemon: No such container: ${ref}`));
    return;
  }
  if (args.includes("-f") || args.includes("--follow")) lines.push(out("# -f seguiría la salida en directo; el simulador muestra lo que hay", "muted"));
  c.logs.forEach((l) => lines.push(out(l)));
}

function lifecycle(s: DockerState, verb: "stop" | "start" | "restart", args: string[], lines: OutLine[]) {
  const refs = args.filter((a) => !a.startsWith("-"));
  if (!refs.length) {
    lines.push(err(`"docker ${verb}" requires at least 1 argument.`));
    return;
  }
  for (const ref of refs) {
    const c = find(s, ref);
    if (!c) {
      lines.push(err(`Error response from daemon: No such container: ${ref}`));
      continue;
    }
    if (verb === "stop") {
      if (c.state === "running") {
        c.state = "exited";
        c.exitCode = 0;
        c.changedAt = s.clock;
      }
      lines.push(out(ref));
      continue;
    }
    // start / restart
    for (const p of c.ports) {
      const owner = hostPortTaken(s, p.split(":")[0], c.name);
      if (owner) {
        lines.push(err(`Error response from daemon: Bind for 0.0.0.0:${p.split(":")[0]} failed: port is already allocated`));
        lines.push(err(`Error: failed to start containers: ${ref}`));
        return;
      }
    }
    const started = CATALOG[repoOf(c.image)]?.start(c.env, []) ?? { logs: [], exitCode: 0 };
    c.logs.push(...started.logs);
    c.changedAt = s.clock;
    if (started.exitCode === null) c.state = "running";
    else {
      c.state = "exited";
      c.exitCode = started.exitCode;
    }
    lines.push(out(ref));
  }
}

function rm(s: DockerState, args: string[], lines: OutLine[]) {
  const force = args.includes("-f") || args.includes("--force");
  const refs = args.filter((a) => !a.startsWith("-"));
  if (!refs.length) {
    lines.push(err('"docker rm" requires at least 1 argument.'));
    return;
  }
  for (const ref of refs) {
    const c = find(s, ref);
    if (!c) {
      lines.push(err(`Error response from daemon: No such container: ${ref}`));
      continue;
    }
    if (c.state === "running" && !force) {
      lines.push(
        err(
          `Error response from daemon: cannot remove container "/${c.name}": container is running: stop the container before removing or force remove`,
        ),
      );
      continue;
    }
    s.containers = s.containers.filter((x) => x !== c);
    lines.push(out(ref));
  }
}

function rmi(s: DockerState, args: string[], lines: OutLine[]) {
  const force = args.includes("-f") || args.includes("--force");
  const refs = args.filter((a) => !a.startsWith("-"));
  if (!refs.length) {
    lines.push(err('"docker rmi" requires at least 1 argument.'));
    return;
  }
  for (const ref of refs) {
    const image = normalizeImage(ref);
    if (!s.images.includes(image)) {
      lines.push(err(`Error response from daemon: No such image: ${image}`));
      continue;
    }
    const user = s.containers.find((c) => c.image === image);
    if (user && !force) {
      lines.push(
        err(
          `Error response from daemon: conflict: unable to remove repository reference "${ref}" (must force) - container ${user.id} is using its referenced image ${hexId(1, image)}`,
        ),
      );
      continue;
    }
    s.images = s.images.filter((x) => x !== image);
    lines.push(out(`Untagged: ${image}`), out(`Deleted: sha256:${hexId(1, image)}${hexId(2, image)}…`));
  }
}

function curl(s: DockerState, args: string[], lines: OutLine[]) {
  const url = args.find((a) => !a.startsWith("-"));
  const head = args.includes("-I") || args.includes("--head");
  const m = url?.match(/^(?:https?:\/\/)?(localhost|127\.0\.0\.1)(?::(\d+))?(\/.*)?$/);
  if (!url || !m) {
    lines.push(err(url ? `curl: (6) Could not resolve host: ${url} (el simulador solo llega a localhost)` : "curl: try 'curl --help'"));
    return;
  }
  const port = Number(m[2] ?? 80);
  const c = s.containers.find((x) => x.state === "running" && x.ports.some((p) => Number(p.split(":")[0]) === port));
  if (!c) {
    lines.push(err(`curl: (7) Failed to connect to localhost port ${port}: Connection refused`));
    return;
  }
  const mapping = c.ports.find((p) => Number(p.split(":")[0]) === port)!;
  const target = Number(mapping.split(":")[1]);
  const spec = CATALOG[repoOf(c.image)];
  if (spec?.listens !== target || target !== 80) {
    lines.push(err("curl: (52) Empty reply from server"));
    lines.push(out(`# el puerto ${port} llega al ${target} del contenedor, pero ahí no hay un servidor HTTP`, "muted"));
    return;
  }
  s.httpHits.push(port);
  c.logs.push(`172.17.0.1 - - [26/Nov/2026:10:00:${String(s.clock % 60).padStart(2, "0")} +0000] "${head ? "HEAD" : "GET"} ${m[3] ?? "/"} HTTP/1.1" 200 615 "-" "curl/8.5.0"`);
  if (head) {
    lines.push(out("HTTP/1.1 200 OK", "ok"), out("Server: nginx/1.27.3"), out("Content-Type: text/html"));
    return;
  }
  lines.push(
    out("<!DOCTYPE html>"),
    out("<html><head><title>Welcome to nginx!</title></head>"),
    out("<body><h1>Welcome to nginx!</h1> …</body></html>"),
  );
}

/**
 * Lab objective checks over the simulator state. `since` is the history length when the
 * previous objective was met, so a command typed earlier does not count for a later step.
 */
export function checkTerminal(s: DockerState, check: TerminalCheck, since = 0): boolean {
  switch (check.type) {
    case "image_exists":
      return s.images.includes(normalizeImage(check.image));
    case "image_absent":
      return !s.images.includes(normalizeImage(check.image));
    case "command_ran": {
      const re = new RegExp(check.pattern);
      return s.history.slice(since).some((h) => re.test(h));
    }
    case "http_ok":
      return s.httpHits.includes(check.port);
    case "container": {
      const c = s.containers.find((x) => x.name === check.name);
      if (check.state === "absent") return !c;
      if (!c || c.state !== check.state) return false;
      if (check.image && c.image !== normalizeImage(check.image)) return false;
      if (check.port && !c.ports.includes(check.port)) return false;
      if (check.env && !c.env.some((e) => new RegExp(check.env!).test(e))) return false;
      return true;
    }
  }
}

/** Words Tab can complete. */
export const COMPLETIONS = [
  "docker",
  "pull",
  "images",
  "run",
  "ps",
  "logs",
  "stop",
  "start",
  "restart",
  "rm",
  "rmi",
  "curl",
  "--name",
  "--rm",
  "--detach",
  "http://localhost:",
  "nginx",
  "postgres",
  "hello-world",
  "alpine",
  "redis",
];
