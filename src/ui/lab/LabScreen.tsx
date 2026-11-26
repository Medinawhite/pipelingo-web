import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import type { EditorLab as EditorLabT, Lab, TerminalLab as TerminalLabT } from "../../content/types";
import { editorStatus, type MetObjective } from "../../domain/labRunner";
import { finishLab, labKey } from "../../state/progress";
import { store, today, useProgress } from "../../state/store";
import { Check } from "../icons";
import { content, LEVEL, useMap } from "../journey";
import { Shell } from "../Shell";
import { S } from "../strings";
import { EditorLab } from "./EditorLab";
import { TerminalLab, type TerminalHandle } from "./TerminalLab";

export function LabScreen() {
  const { unit = "", lesson = "", lab = "" } = useParams();
  const map = useMap();
  const l = content.labs(LEVEL, unit, lesson).find((x) => x.lab === Number(lab));
  const lp = map.units.find((u) => u.unitId === unit)?.lessons.find((x) => x.lessonId === lesson);
  if (!l || !lp || !(lp.status === "available" || lp.status === "done")) return <Navigate to="/mapa" replace />;
  return <LabView key={`${unit}/${lesson}/${lab}`} lab={l} />;
}

function LabView({ lab }: { lab: Lab }) {
  const key = labKey(lab.unit, lab.lesson, lab.lab);
  const p = useProgress();
  const [earned, setEarned] = useState<number | null>(null);
  const alreadyDone = key in p.labs;

  const complete = () => {
    if (earned !== null) return;
    const [next, xp] = finishLab(store.get(), key, today(), Date.now());
    store.set(next);
    setEarned(xp);
  };

  return (
    <Shell wide>
      <Link to={`/leccion/${lab.unit}/${lab.lesson}`} className="section-label" style={{ textDecoration: "none" }}>
        ← {S.lab.backToLesson}
      </Link>
      {lab.kind === "terminal" ? (
        <TerminalLabView lab={lab} onComplete={complete} earned={earned} alreadyDone={alreadyDone} />
      ) : (
        <EditorLabView lab={lab} onComplete={complete} earned={earned} alreadyDone={alreadyDone} storageKey={`pipelingo.lab.${key}`} />
      )}
    </Shell>
  );
}

interface ViewProps {
  onComplete: () => void;
  earned: number | null;
  alreadyDone: boolean;
}

function Header({ lab, alreadyDone }: { lab: Lab; alreadyDone: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="row">
        <span className="lab-badge">{lab.kind === "terminal" ? "lab · terminal" : "lab · editor"}</span>
        {alreadyDone && <span className="tag accent">{S.lesson.labDone}</span>}
      </div>
      <h1 className="screen-title" style={{ fontSize: 22 }}>
        {lab.title}
      </h1>
      <p className="lead" style={{ fontSize: 14 }}>
        {lab.intro}
      </p>
    </div>
  );
}

function Objectives({
  lab,
  met,
  sequential,
  onUseHint,
}: {
  lab: Lab;
  met: boolean[];
  sequential: boolean;
  onUseHint?: (hint: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const nextIdx = met.findIndex((m) => !m);
  const count = met.filter(Boolean).length;
  return (
    <section aria-label="Objetivos">
      <div className="spread" style={{ marginBottom: 8 }}>
        <h2 className="section-label">{S.lab.objectives}</h2>
        <span className="section-label" aria-live="polite">
          {count}/{lab.objectives.length}
        </span>
      </div>
      <div className="bar" style={{ marginBottom: 10 }} aria-hidden="true">
        <span style={{ width: `${(count / lab.objectives.length) * 100}%` }} />
      </div>
      <ol className="objectives">
        {lab.objectives.map((o, i) => {
          const cls = met[i] ? "met" : i === nextIdx ? "next" : sequential ? "pending" : "";
          return (
            <li key={o.id} className={`objective ${cls}`}>
              <span className="check" aria-label={met[i] ? "conseguido" : "pendiente"} role="img">
                {met[i] && <Check size={12} />}
              </span>
              <div className="body">
                <span>{o.text}</span>
                {!met[i] && (
                  <>
                    <button className="link-btn" aria-expanded={!!open[o.id]} onClick={() => setOpen((x) => ({ ...x, [o.id]: !x[o.id] }))}>
                      {open[o.id] ? S.lab.hideHint : S.lab.showHint}
                    </button>
                    {open[o.id] && (
                      <div className="hint">
                        {o.hint}
                        {onUseHint && (
                          <div>
                            <button className="link-btn" onClick={() => onUseHint(o.hint)}>
                              ↳ {S.lab.useHint}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function DoneBanner({ lab, earned }: { lab: Lab; earned: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="done-banner" role="status" tabIndex={-1} ref={ref}>
      <h2>
        exit 0 · {S.lab.done} <span style={{ color: "var(--reward)", fontSize: 14, marginLeft: 8 }}>{earned !== null && S.lab.xp(earned)}</span>
      </h2>
      <p style={{ margin: 0 }}>{lab.outro}</p>
      <Link className="btn primary small" to={`/leccion/${lab.unit}/${lab.lesson}`}>
        {S.continue}
      </Link>
    </div>
  );
}

function TerminalLabView({ lab, onComplete, earned, alreadyDone }: ViewProps & { lab: TerminalLabT }) {
  const [met, setMet] = useState<MetObjective[]>([]);
  const term = useRef<TerminalHandle>(null);
  const status = lab.objectives.map((o) => met.some((m) => m.id === o.id));
  const done = status.every(Boolean);
  useEffect(() => {
    if (done) onComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  return (
    <div className="lab">
      <aside className="lab-side">
        <Header lab={lab} alreadyDone={alreadyDone} />
        <Objectives lab={lab} met={status} sequential onUseHint={(h) => term.current?.type(h)} />
        <button className="btn ghost small" onClick={() => term.current?.reset()}>
          {S.lab.restart}
        </button>
      </aside>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {done && <DoneBanner lab={lab} earned={earned} />}
        <TerminalLab ref={term} lab={lab} onMet={setMet} />
      </div>
    </div>
  );
}

function EditorLabView({ lab, onComplete, earned, alreadyDone, storageKey }: ViewProps & { lab: EditorLabT; storageKey: string }) {
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(storageKey) ?? lab.file.starter;
    } catch {
      return lab.file.starter;
    }
  });
  const [achieved, setAchieved] = useState<Set<string>>(new Set());
  const status = useMemo(() => editorStatus(lab, text, achieved), [lab, text, achieved]);
  const done = status.every(Boolean);
  useEffect(() => {
    if (done) onComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  return (
    <div className="lab">
      <aside className="lab-side">
        <Header lab={lab} alreadyDone={alreadyDone} />
        <Objectives lab={lab} met={status} sequential={false} />
      </aside>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {done && <DoneBanner lab={lab} earned={earned} />}
        <EditorLab
          lab={lab}
          storageKey={storageKey}
          text={text}
          setText={setText}
          onRunAchieved={(ids) => ids.length && setAchieved((s) => new Set([...s, ...ids]))}
        />
      </div>
    </div>
  );
}
