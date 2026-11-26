import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import type { TerminalLab as TerminalLabT } from "../../content/types";
import { advanceTerminal, type MetObjective } from "../../domain/labRunner";
import { COMPLETIONS, createDocker, exec, type DockerState } from "../../sim/docker";
import { out, type OutLine } from "../../sim/shell";
import { S } from "../strings";

type Entry = { kind: "cmd"; text: string } | ({ kind: "out" } & OutLine);

export interface TerminalHandle {
  /** Writes a command in the prompt, without running it. */
  type(cmd: string): void;
  reset(): void;
}

const PS1 = "~/hello-devops$";
// On phones, focusing the prompt would jump past the objectives.
const focusOnOpen = () => typeof matchMedia !== "undefined" && matchMedia("(min-width: 900px)").matches;

export const TerminalLab = forwardRef<TerminalHandle, { lab: TerminalLabT; onMet: (met: MetObjective[]) => void }>(function TerminalLab(
  { lab, onMet },
  ref,
) {
  const welcome = (): Entry[] => [
    { kind: "out", ...out(`# ${S.lab.terminalHelp}`, "muted") },
  ];
  const [state, setState] = useState<DockerState>(() => createDocker(lab.setup));
  const [entries, setEntries] = useState<Entry[]>(welcome);
  const [input, setInput] = useState("");
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const metRef = useRef<MetObjective[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    type(cmd) {
      setInput(cmd);
      inputRef.current?.focus();
    },
    reset() {
      setState(createDocker(lab.setup));
      setEntries(welcome());
      setInput("");
      metRef.current = [];
      onMet([]);
      inputRef.current?.focus();
    },
  }));

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [entries]);

  const run = () => {
    const cmd = input;
    setInput("");
    setHistIdx(null);
    const r = exec(state, cmd);
    setState(r.state);
    if (r.clear) setEntries([]);
    else setEntries((e) => [...e, { kind: "cmd", text: cmd }, ...r.lines.map((l) => ({ kind: "out" as const, ...l }))]);
    const met = advanceTerminal(lab, r.state, metRef.current);
    if (met.length !== metRef.current.length) {
      metRef.current = met;
      onMet(met);
    }
  };

  const complete = () => {
    const words = input.split(" ");
    const last = words[words.length - 1];
    const pool = [...COMPLETIONS, ...state.containers.map((c) => c.name), ...state.images];
    const hits = [...new Set(pool.filter((w) => w.startsWith(last) && w !== last))];
    if (hits.length === 1) {
      words[words.length - 1] = hits[0] + (hits[0].endsWith(":") ? "" : " ");
      setInput(words.join(" "));
    } else if (hits.length > 1 && last) {
      setEntries((e) => [...e, { kind: "cmd", text: input }, { kind: "out", ...out(hits.join("  "), "muted") }]);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const hist = state.history;
    if (e.key === "Enter") {
      e.preventDefault();
      run();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!hist.length) return;
      const i = histIdx === null ? hist.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(i);
      setInput(hist[i]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx === null) return;
      const i = histIdx + 1;
      if (i >= hist.length) {
        setHistIdx(null);
        setInput("");
      } else {
        setHistIdx(i);
        setInput(hist[i]);
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      complete();
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setEntries([]);
    } else if (e.key === "c" && e.ctrlKey && !window.getSelection()?.toString()) {
      e.preventDefault();
      setEntries((x) => [...x, { kind: "cmd", text: input + "^C" }]);
      setInput("");
    }
  };

  return (
    <div className="term live-term">
      <div className="term-head">
        <span className="dot" style={{ background: "var(--error)" }} aria-hidden="true" />
        <span className="dot" style={{ background: "var(--reward)" }} aria-hidden="true" />
        <span className="dot" style={{ background: "var(--accent)" }} aria-hidden="true" />
        <span className="title">bash · docker (simulado)</span>
      </div>
      <div className="term-body" ref={bodyRef} onClick={() => !window.getSelection()?.toString() && inputRef.current?.focus()}>
        <div role="log" aria-live="polite" aria-label="Salida de la terminal">
          {entries.map((e, i) =>
            e.kind === "cmd" ? (
              <div key={i} className="line cmd">
                <span className="ps1">{PS1}</span> {e.text}
              </div>
            ) : (
              <div key={i} className={`line ${e.tone ?? ""}`}>
                {e.text}
              </div>
            ),
          )}
        </div>
        <div className="prompt-line">
          <label htmlFor="term-input" className="ps1">
            {PS1}
          </label>
          <input
            id="term-input"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            aria-label={S.lab.inputLabel}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={focusOnOpen()}
          />
        </div>
      </div>
      <div className="quick-cmds" aria-label="Atajos">
        {["docker ps -a", "docker images", "help", "clear"].map((c) => (
          <button
            key={c}
            onClick={() => {
              setInput(c);
              inputRef.current?.focus();
            }}
          >
            {c}
          </button>
        ))}
        <button onClick={() => inputRef.current?.focus()} aria-label="Tabulador: autocompletar" onMouseDown={(e) => { e.preventDefault(); complete(); }}>
          Tab
        </button>
      </div>
    </div>
  );
});
