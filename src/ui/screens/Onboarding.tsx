import { useNavigate } from "react-router-dom";
import { store } from "../../state/store";
import { S } from "../strings";

export function Onboarding() {
  const navigate = useNavigate();
  const start = () => {
    store.update((p) => ({ ...p, onboarded: true, level: "junior" }));
    navigate("/mapa", { replace: true });
  };
  const locked = [
    { title: S.onboarding.mid, sub: S.onboarding.midSub },
    { title: S.onboarding.senior, sub: S.onboarding.seniorSub },
  ];
  return (
    <main className="page" style={{ maxWidth: 560, paddingTop: 48 }}>
      <div className="card hero-term" aria-hidden="true">
        <div>
          <span className="c">$</span> git push origin main
        </div>
        <div className="muted"># docker build → actions → ghcr → helm → oc</div>
        <div>
          <span className="c">✓</span> desplegado en producción
        </div>
      </div>
      <h1 className="screen-title">
        <span style={{ color: "var(--accent)" }}>$_</span> {S.appName}
      </h1>
      <p className="lead">{S.onboarding.lead}</p>
      <h2 className="section-label">{S.onboarding.title}</h2>
      <div className="levels" role="radiogroup" aria-label={S.onboarding.title}>
        <button className="card level-card" role="radio" aria-checked="true" onClick={start}>
          <span className="spread">
            <span className="card-title">{S.onboarding.junior}</span>
            <span className="tag accent">junior</span>
          </span>
          <span className="card-sub">{S.onboarding.juniorSub}</span>
        </button>
        {locked.map((l) => (
          <button key={l.title} className="card level-card" role="radio" aria-checked="false" disabled>
            <span className="spread">
              <span className="card-title">{l.title}</span>
              <span className="tag">{S.comingSoon}</span>
            </span>
            <span className="card-sub">{l.sub}</span>
            <span className="tag reward" style={{ alignSelf: "flex-start" }}>
              {S.onboarding.accessTest}
            </span>
          </button>
        ))}
      </div>
      <button className="btn primary block" onClick={start}>
        {S.onboarding.start}
      </button>
    </main>
  );
}
