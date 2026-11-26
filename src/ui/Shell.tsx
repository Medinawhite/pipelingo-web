import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import type { MapProgress } from "../domain/progression";
import { displayedStreak, GameRules } from "../domain/rules";
import { useProgress, today } from "../state/store";
import { Bolt, Flame, Heart, MapIcon, ReviewIcon, User } from "./icons";
import { journey, TECH } from "./journey";
import { S } from "./strings";

export function Stats() {
  const p = useProgress();
  const streak = displayedStreak(p.player, today());
  return (
    <div className="stats">
      <span className="stat" aria-label={S.stats.streak(streak)}>
        <Flame />
        <span aria-hidden="true">{streak}</span>
      </span>
      <span className="stat" aria-label={S.stats.xp(p.player.xp)}>
        <Bolt />
        <span aria-hidden="true">{p.player.xp}</span>
      </span>
      {GameRules.LIVES_ENABLED && (
        <span className="stat lives" aria-label={S.stats.lives(p.player.lives)}>
          <Heart />
          <span aria-hidden="true">{p.player.lives}</span>
        </span>
      )}
    </div>
  );
}

export function PipelineLine({ map }: { map: MapProgress }) {
  const parts = journey.units.map((u, i) => {
    const st = map.units[i].status;
    const cls = st === "done" ? "done" : st === "current" ? "current" : "";
    return { id: u.id, word: TECH[u.id] ?? u.id, cls };
  });
  return (
    <div className="pipeline" aria-label={`Flujo: ${parts.map((p) => p.word).join(", ")}`}>
      <span className="prompt">$</span>{" "}
      {parts.map((p, i) => (
        <span key={p.id}>
          <span className={p.cls} aria-current={p.cls === "current" ? "step" : undefined}>
            {p.word}
          </span>
          {i < parts.length - 1 && " → "}
        </span>
      ))}
    </div>
  );
}

export function Shell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/mapa" className="brand">
            <span className="brand-mark">$_</span> {S.home} <span className="level-chip">junior</span>
          </Link>
          <nav className="mainnav" aria-label={S.nav.main}>
            <NavLink to="/mapa">
              <MapIcon size={20} /> {S.nav.map}
            </NavLink>
            <NavLink to="/repaso">
              <ReviewIcon size={20} /> {S.nav.review}
            </NavLink>
            <NavLink to="/perfil">
              <User size={20} /> {S.nav.profile}
            </NavLink>
          </nav>
          <Stats />
        </div>
      </header>
      <main className={`page${wide ? " wide" : ""}`}>{children}</main>
    </div>
  );
}
