import { useEffect, useRef, type Ref } from "react";
import { Link } from "react-router-dom";
import type { CurriculumUnit } from "../../content/types";
import { nextLesson, type UnitProgress } from "../../domain/progression";
import { Check, Crown, Lock, Skip } from "../icons";
import { content, journey, LEVEL, TECH, useMap } from "../journey";
import { PipelineLine, Shell } from "../Shell";
import { S } from "../strings";

let scrolledOnce = false;

export function MapScreen() {
  const map = useMap();
  const currentRef = useRef<HTMLDivElement>(null);

  // Opens scrolled to the current unit once (docs/DECISIONS.md, 22).
  useEffect(() => {
    if (!scrolledOnce && currentRef.current) {
      scrolledOnce = true;
      currentRef.current.scrollIntoView({ block: "start" });
    }
  }, []);

  return (
    <Shell>
      <PipelineLine map={map} />
      <h1 className="screen-title">{S.map.title}</h1>
      <div className="map">
        {journey.phases.map((phase) => (
          <div key={phase.id} style={{ display: "contents" }}>
            <h2 className="map-phase">{phase.title}</h2>
            {phase.units.map((unit) => {
              const up = map.units[journey.units.indexOf(unit)];
              return (
                <div key={unit.id} style={{ display: "contents" }}>
                  <UnitNode unit={unit} up={up} itemRef={up.status === "current" ? currentRef : undefined} />
                  {unit.bridge && (
                    <div className="map-item">
                      <div className="diamond-wrap" aria-hidden="true">
                        <span className="diamond" />
                      </div>
                      <div className="bridge">
                        <div className="spread">
                          <span className="mono">
                            {S.map.bridge} · {unit.bridge.title.toLowerCase()}
                          </span>
                          <span className="tag">{S.comingSoon}</span>
                        </div>
                        <div className="card-sub">{unit.bridge.sub}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {phase.boss && (
              <div className="map-item">
                <div className="node boss" aria-hidden="true">
                  <Crown size={20} />
                </div>
                <div className="card boss">
                  <div className="spread">
                    <span className="card-title" style={{ color: "var(--reward)", fontSize: 14 }}>
                      {phase.boss.title}
                    </span>
                    <span className="tag">{S.comingSoon}</span>
                  </div>
                  <p className="card-sub">{phase.boss.sub}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Shell>
  );
}

function UnitNode({ unit, up, itemRef }: { unit: CurriculumUnit; up: UnitProgress; itemRef?: Ref<HTMLDivElement> }) {
  const playable = up.status === "current" || up.status === "done";
  const pct = up.totalTests ? Math.round((up.passedTests / up.totalTests) * 100) : 0;
  const next = nextLesson(up);
  const labCount = unit.lessons.reduce((n, l) => n + content.labs(LEVEL, unit.id, l.id).length, 0);
  const statusLabel = { done: "hecha", current: "actual", available: "disponible", locked: "bloqueada", coming_soon: S.comingSoon }[up.status];
  return (
    <div className="map-item" ref={itemRef} style={{ scrollMarginTop: 80 }}>
      <div className={`node ${up.status === "coming_soon" ? "locked" : up.status}`} role="img" aria-label={`${unit.title}: ${statusLabel}`}>
        {up.status === "done" && <Check size={20} />}
        {(up.status === "locked" || up.status === "coming_soon") && <Lock size={18} />}
      </div>
      <section className={`card${up.status === "current" ? " current" : ""}`} aria-label={unit.title}>
        <div className="spread">
          <h3 className="card-title" style={{ color: playable ? "var(--text)" : "var(--muted)" }}>
            {unit.title}
          </h3>
          <span className="row" style={{ gap: 6 }}>
            {labCount > 0 && <span className="tag accent">{S.map.labs(labCount)}</span>}
            {up.status === "coming_soon" && <span className="tag">{S.comingSoon}</span>}
          </span>
        </div>
        <p className="card-sub">{unit.goal}</p>
        <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${TECH[unit.id]}: ${pct} %`}>
          <span style={{ width: `${pct}%` }} />
        </div>
        {playable && (
          <ul className="lesson-list">
            {unit.lessons.map((l, i) => {
              const lp = up.lessons[i];
              const open = lp.status === "available" || lp.status === "done";
              const body = (
                <>
                  <span className="test-num" style={{ width: 24, height: 24, fontSize: 11, borderWidth: 1 }} aria-hidden="true">
                    {lp.status === "done" ? <Check size={12} /> : lp.status === "available" ? i + 1 : <Lock size={12} />}
                  </span>
                  <span>{l.title}</span>
                  {lp.status === "coming_soon" && <span className="tag">{S.comingSoon}</span>}
                  {open && lp.passedTests > 0 && lp.status !== "done" && <span className="tag accent">{lp.passedTests}/5</span>}
                </>
              );
              return (
                <li key={l.id}>
                  {open ? (
                    <Link className="lesson-link" to={`/leccion/${unit.id}/${l.id}`}>
                      {body}
                    </Link>
                  ) : (
                    <span className={`lesson-link ${lp.status === "coming_soon" ? "soon" : "locked"}`}>{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {up.status === "current" && next && (
          <Link className="btn primary small block" to={`/leccion/${unit.id}/${next.lessonId}`}>
            {S.continue}
          </Link>
        )}
        {up.skipTestAvailable && up.status !== "coming_soon" && (
          <Link className="btn ghost small" to={`/saltar/${unit.id}`} aria-label={S.map.skipTestLabel(unit.title)}>
            <Skip /> {S.map.skipTest}
          </Link>
        )}
      </section>
    </div>
  );
}
