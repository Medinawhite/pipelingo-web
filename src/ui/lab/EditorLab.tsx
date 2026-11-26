import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorLab as EditorLabT } from "../../content/types";
import { runAchievements } from "../../domain/labRunner";
import { analyzeWorkflow, EVENTS, simulateRun, type JobRun, type RunResult, type StepStatus } from "../../sim/workflow";
import { Check, Close } from "../icons";
import { CodeBlock } from "../quiz/highlight";
import { S } from "../strings";
import { CodeEditor, type CodeEditorHandle } from "./CodeEditor";

const TICK_MS = 260;
const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Timeline {
  result: RunResult;
  eventId: string;
  /** Tick at which each job starts. */
  start: Record<string, number>;
  end: number;
}

function timeline(result: RunResult, eventId: string): Timeline {
  const start: Record<string, number> = {};
  let t = 0;
  const maxLevel = Math.max(0, ...result.jobs.map((j) => j.level));
  for (let l = 0; l <= maxLevel; l++) {
    const jobs = result.jobs.filter((j) => j.level === l);
    if (!jobs.length) continue;
    jobs.forEach((j) => (start[j.key] = t));
    t += Math.max(1, ...jobs.map((j) => j.steps.length)) + 1;
  }
  return { result, eventId, start, end: t };
}

export function EditorLab({
  lab,
  storageKey,
  onRunAchieved,
  text,
  setText,
}: {
  lab: EditorLabT;
  storageKey: string;
  onRunAchieved: (ids: string[]) => void;
  text: string;
  setText: (t: string) => void;
}) {
  const [eventId, setEventId] = useState(() => {
    const first = lab.objectives.find((o) => o.check.type === "run")?.check;
    return first && first.type === "run" ? first.event : "push-main";
  });
  const [tl, setTl] = useState<Timeline | null>(null);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const editor = useRef<CodeEditorHandle | null>(null);
  const analysis = useMemo(() => analyzeWorkflow(text), [text]);
  const errors = analysis.diagnostics.filter((d) => d.severity === "error");

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, text);
    } catch {
      /* storage unavailable */
    }
  }, [text, storageKey]);

  // Animation: one tick per step; jobs of the same column run side by side.
  useEffect(() => {
    if (!tl || tick >= tl.end) return;
    const id = setTimeout(() => setTick((x) => x + 1), TICK_MS);
    return () => clearTimeout(id);
  }, [tl, tick]);

  useEffect(() => {
    if (tl && tick >= tl.end) onRunAchieved(runAchievements(lab, tl.eventId, tl.result));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tl, tick]);

  const run = () => {
    if (!analysis.workflow || errors.length) return;
    const ev = EVENTS.find((e) => e.id === eventId)!;
    const result = simulateRun(analysis.workflow, ev);
    const t = timeline(result, eventId);
    setTl(t);
    setTick(reducedMotion() ? t.end : 0);
    const failed = result.jobs.find((j) => j.status === "failure");
    setSelected((failed ?? result.jobs[0])?.key ?? null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="term">
        <div className="term-head">
          <span className="dot" style={{ background: "var(--error)" }} aria-hidden="true" />
          <span className="dot" style={{ background: "var(--reward)" }} aria-hidden="true" />
          <span className="dot" style={{ background: "var(--accent)" }} aria-hidden="true" />
          <span className="title">{lab.file.path}</span>
          <span className="actions">
            <button className="btn ghost small" style={{ minHeight: 32, fontSize: 12 }} onClick={() => setText(lab.file.starter)}>
              {S.lab.resetFile}
            </button>
          </span>
        </div>
        <CodeEditor value={text} onChange={setText} diagnostics={analysis.diagnostics} label={S.lab.editorLabel(lab.file.path)} handleRef={editor} />
      </div>

      <section aria-label={S.lab.diagnostics}>
        <h2 className="section-label" style={{ marginBottom: 8 }}>
          {S.lab.diagnostics}
        </h2>
        {analysis.diagnostics.length === 0 ? (
          <p className="diag-ok">{S.lab.noProblems}</p>
        ) : (
          <ul className="diag-list" aria-live="polite">
            {analysis.diagnostics.map((d, i) => (
              <li key={i}>
                <button
                  className={`diag ${d.severity}`}
                  style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
                  onClick={() => d.line && editor.current?.goToLine(d.line)}
                >
                  <span className="ln">{d.line ? `L${d.line}` : "—"}</span>
                  <span>{d.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="run-bar">
        <label className="sr-only" htmlFor="event">
          {S.lab.event}
        </label>
        <select id="event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          {EVENTS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
        <button className="btn primary small" onClick={run} disabled={errors.length > 0} title={errors.length ? S.lab.fixFirst : undefined}>
          {S.lab.run}
        </button>
      </div>
      {errors.length > 0 && <p className="section-label" style={{ marginTop: -6 }}>{S.lab.fixFirst}</p>}

      {tl && <RunView tl={tl} tick={tick} selected={selected} onSelect={setSelected} />}

      <div>
        <button className="link-btn" onClick={() => setShowSolution((s) => !s)} aria-expanded={showSolution}>
          {showSolution ? S.lab.hideSolution : S.lab.solution}
        </button>
        {showSolution && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <CodeBlock content={lab.solution.trimEnd()} lang="yaml" />
            <button className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => setText(lab.solution)}>
              usar la solución
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: StepStatus | "running" | "queued" }) {
  const label = { success: "correcto", failure: "fallido", skipped: "saltado", running: "en curso", queued: "en cola" }[status];
  return (
    <span className={`status-icon ${status}`} role="img" aria-label={label}>
      {status === "success" && <Check size={11} />}
      {status === "failure" && <Close size={11} />}
    </span>
  );
}

function jobView(j: JobRun, tl: Timeline, tick: number): { status: StepStatus | "running" | "queued"; steps: number } {
  const progress = tick - tl.start[j.key];
  if (progress < 0) return { status: "queued", steps: 0 };
  if (j.status === "skipped") return { status: "skipped", steps: 0 };
  if (progress < j.steps.length) return { status: "running", steps: progress + 1 };
  return { status: j.status, steps: j.steps.length };
}

function RunView({ tl, tick, selected, onSelect }: { tl: Timeline; tick: number; selected: string | null; onSelect: (k: string) => void }) {
  const { result } = tl;
  const finished = tick >= tl.end;
  const levels = [...new Set(result.jobs.map((j) => j.level))].sort((a, b) => a - b);
  const sel = result.jobs.find((j) => j.key === selected);
  const selView = sel ? jobView(sel, tl, tick) : null;
  return (
    <section className="run" aria-label="Ejecución simulada">
      <div className={`run-trigger ${result.fires ? "" : "no"}`} role="status">
        {result.fires ? S.lab.triggered : S.lab.notTriggered} · {result.reason}
      </div>
      {result.fires && (
        <>
          <h2 className="section-label">
            {S.lab.jobs} {finished ? "" : "· ejecutando…"}
          </h2>
          <div className="graph">
            {levels.map((l) => (
              <div className="graph-col" key={l}>
                {result.jobs
                  .filter((j) => j.level === l)
                  .map((j) => {
                    const v = jobView(j, tl, tick);
                    return (
                      <button key={j.key} className="job" aria-pressed={selected === j.key} onClick={() => onSelect(j.key)}>
                        <StatusIcon status={v.status} />
                        <span>{j.name}</span>
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
          {sel && selView && (
            <div className="joblog" aria-live="polite">
              {sel.status === "skipped" ? (
                <p className="line muted" style={{ padding: 12, margin: 0 }}>
                  {S.lab.skippedReason}: {sel.reason}
                </p>
              ) : (
                sel.steps.slice(0, selView.steps).map((s, i) => {
                  const running = selView.status === "running" && i === selView.steps - 1;
                  return (
                    <details key={i} open={s.status === "failure" || running}>
                      <summary>
                        <StatusIcon status={running ? "running" : s.status} />
                        <span>{s.name}</span>
                      </summary>
                      <div className="log">
                        {s.log.map((l, k) => (
                          <div key={k} className={`line ${l.tone ?? ""}`}>
                            {l.text}
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
