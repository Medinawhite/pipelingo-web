import { Link, Navigate, useParams } from "react-router-dom";
import { testKey } from "../../domain/progression";
import { canStartTest } from "../../domain/rules";
import { labKey } from "../../state/progress";
import { today, useProgress } from "../../state/store";
import { Check, CodeIcon, Lock, TerminalIcon } from "../icons";
import { content, journey, LEVEL, useMap } from "../journey";
import { Shell } from "../Shell";
import { S } from "../strings";

export function LessonScreen() {
  const { unit: unitId = "", lesson: lessonId = "" } = useParams();
  const p = useProgress();
  const map = useMap();
  const unit = journey.unit(unitId);
  const lessonIdx = unit?.lessons.findIndex((l) => l.id === lessonId) ?? -1;
  const info = content.lesson(LEVEL, unitId, lessonId);
  const tests = content.tests(LEVEL, unitId, lessonId);
  const lp = map.units.find((u) => u.unitId === unitId)?.lessons[lessonIdx];
  if (!unit || !info || !lp || !tests.length) return <Navigate to="/mapa" replace />;
  const open = lp.status === "available" || lp.status === "done";
  const labs = content.labs(LEVEL, unitId, lessonId);
  const canStart = canStartTest(p.player, today());

  return (
    <Shell>
      <Link to="/mapa" className="section-label" style={{ textDecoration: "none" }}>
        ← {unit.title}
      </Link>
      <div>
        <p className="section-label">
          lección {lessonIdx + 1} · {unit.title.toLowerCase()}
        </p>
        <h1 className="screen-title">{info.title}</h1>
      </div>
      <p className="lead">{info.goal}</p>
      {!canStart && <p className="card" style={{ borderColor: "var(--error-soft)", background: "var(--error-surface)" }}>{S.lesson.noLives}</p>}

      <h2 className="section-label">{S.lesson.tests}</h2>
      <div className="test-list">
        {tests.map((t, i) => {
          const st = open ? lp.tests[i] : "locked";
          const r = p.results[testKey(unitId, lessonId, t.test)];
          const label = `${t.test}. ${t.title}`;
          const meta = r ? S.lesson.best(r.best, r.total) : st === "locked" ? S.lesson.locked : S.lesson.notPlayed;
          const body = (
            <>
              <span className="test-num" aria-hidden="true">
                {st === "done" ? <Check size={16} /> : st === "locked" ? <Lock size={14} /> : t.test}
              </span>
              <span className="grow">
                <span className="card-title" style={{ fontSize: 15, display: "block" }}>
                  {label}
                </span>
                <span className="card-sub">
                  {t.questions.length} preguntas · {meta}
                </span>
              </span>
              {st === "available" && <span className="tag accent">jugar</span>}
            </>
          );
          return st !== "locked" && canStart ? (
            <Link key={t.test} className={`test-row ${st}`} to={`/prueba/${unitId}/${lessonId}/${t.test}`}>
              {body}
            </Link>
          ) : (
            <div key={t.test} className={`test-row ${st}`} aria-disabled="true">
              {body}
            </div>
          );
        })}
      </div>

      {labs.length > 0 && (
        <>
          <h2 className="section-label">{S.lesson.labs}</h2>
          <p className="lead" style={{ marginTop: -10, fontSize: 14 }}>
            {S.lesson.labsLead}
          </p>
          <div className="test-list">
            {labs.map((lab) => {
              const done = labKey(unitId, lessonId, lab.lab) in p.labs;
              const body = (
                <>
                  <span className="test-num" aria-hidden="true" style={done ? { borderColor: "var(--accent)", background: "var(--accent-surface)", color: "var(--accent)" } : undefined}>
                    {done ? <Check size={16} /> : lab.kind === "terminal" ? <TerminalIcon /> : <CodeIcon />}
                  </span>
                  <span className="grow">
                    <span className="card-title" style={{ fontSize: 15, display: "block" }}>
                      {lab.title}
                    </span>
                    <span className="card-sub">
                      {lab.kind === "terminal" ? S.lesson.terminalKind : `${S.lesson.editorKind} · ${lab.file.path}`} · {lab.objectives.length} objetivos
                    </span>
                  </span>
                  <span className={done ? "tag accent" : "lab-badge"}>{done ? S.lesson.labDone : S.lesson.lab}</span>
                </>
              );
              return open ? (
                <Link key={lab.lab} className="test-row lab-card" to={`/lab/${unitId}/${lessonId}/${lab.lab}`}>
                  {body}
                </Link>
              ) : (
                <div key={lab.lab} className="test-row locked" aria-disabled="true">
                  {body}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Shell>
  );
}
