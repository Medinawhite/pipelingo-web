import { useState } from "react";
import { pathToNextLevelPercent } from "../../domain/progression";
import { accuracy, displayedStreak } from "../../domain/rules";
import { store, today, useProgress } from "../../state/store";
import { content, journey, LEVEL, TECH, useMap } from "../journey";
import { Shell } from "../Shell";
import { S } from "../strings";

export function ProfileScreen() {
  const p = useProgress();
  const map = useMap();
  const [confirm, setConfirm] = useState(false);
  const toMid = pathToNextLevelPercent(map);
  const totalLabs = journey.units.reduce((n, u) => n + u.lessons.reduce((m, l) => m + content.labs(LEVEL, u.id, l.id).length, 0), 0);
  return (
    <Shell>
      <div className="row" style={{ gap: 14 }}>
        <div className="node done" style={{ width: 64, height: 64, borderRadius: 32, font: "600 20px var(--mono)" }} aria-hidden="true">
          $_
        </div>
        <div>
          <h1 className="screen-title">{S.profile.you}</h1>
          <span className="level-chip">junior</span>
        </div>
      </div>
      <section className="card">
        <div className="spread">
          <h2 className="card-title" style={{ fontSize: 15 }}>
            {S.profile.pathToMid}
          </h2>
          <span className="mono" style={{ color: "var(--reward)" }}>
            {toMid} %
          </span>
        </div>
        <div className="bar reward" role="progressbar" aria-valuenow={toMid} aria-valuemin={0} aria-valuemax={100} aria-label={S.profile.pathToMid}>
          <span style={{ width: `${toMid}%` }} />
        </div>
      </section>
      <div className="grid-stats">
        <div className="stat-tile reward">
          <div className="v">{p.player.xp}</div>
          <div className="k">{S.profile.xp}</div>
        </div>
        <div className="stat-tile reward">
          <div className="v">{displayedStreak(p.player, today())}</div>
          <div className="k">{S.profile.streak}</div>
        </div>
        <div className="stat-tile accent">
          <div className="v">
            {map.passedTests}/{map.totalTests}
          </div>
          <div className="k">{S.profile.tests}</div>
        </div>
        <div className="stat-tile">
          <div className="v">{accuracy(p.player)} %</div>
          <div className="k">{S.profile.accuracy}</div>
        </div>
        <div className="stat-tile accent">
          <div className="v">
            {Object.keys(p.labs).length}/{totalLabs}
          </div>
          <div className="k">{S.profile.labs}</div>
        </div>
      </div>
      <h2 className="section-label">{S.profile.byTech}</h2>
      <div className="test-list">
        {journey.units.map((u, i) => {
          const up = map.units[i];
          const pct = up.totalTests ? Math.round((up.passedTests / up.totalTests) * 100) : 0;
          return (
            <div key={u.id} className="card" style={{ gap: 6 }}>
              <div className="spread">
                <span className="mono">{TECH[u.id]}</span>
                <span className="section-label">{pct} %</span>
              </div>
              <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${u.title}: ${pct} %`}>
                <span style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {!confirm ? (
        <button className="btn ghost small" onClick={() => setConfirm(true)}>
          {S.profile.reset}
        </button>
      ) : (
        <div className="card" style={{ borderColor: "var(--error-soft)", background: "var(--error-surface)" }} role="alert">
          <p style={{ margin: 0, color: "var(--error-text)" }}>{S.profile.resetConfirm}</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn small" onClick={() => setConfirm(false)}>
              {S.quiz.stay}
            </button>
            <button
              className="btn small danger"
              onClick={() => {
                store.reset();
                setConfirm(false);
              }}
            >
              {S.profile.reset}
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}
