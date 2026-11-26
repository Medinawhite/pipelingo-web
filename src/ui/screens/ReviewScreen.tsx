import { Link } from "react-router-dom";
import { GameRules } from "../../domain/rules";
import { useProgress } from "../../state/store";
import { content } from "../journey";
import { Shell } from "../Shell";
import { S } from "../strings";

export function ReviewScreen() {
  const p = useProgress();
  const questions = Object.keys(p.misses)
    .map((id) => content.question(id))
    .filter((q) => !!q);
  const byTag = new Map<string, string[]>();
  for (const q of questions) for (const t of q!.tags) byTag.set(t, [...(byTag.get(t) ?? []), q!.prompt]);
  const groups = [...byTag.entries()].sort((a, b) => b[1].length - a[1].length);
  return (
    <Shell>
      <h1 className="screen-title">{S.review.title}</h1>
      <p className="lead">{S.review.lead}</p>
      {GameRules.LIVES_ENABLED && (
        <p className="section-label">
          +1 vida cada {GameRules.REVIEW_CORRECT_PER_LIFE} aciertos · {p.player.reviewCorrectCounter}/{GameRules.REVIEW_CORRECT_PER_LIFE}
        </p>
      )}
      {!questions.length ? (
        <p className="card empty">{S.review.empty}</p>
      ) : (
        <>
          <Link className="btn primary block" to="/repaso/jugar">
            {S.review.start} <span className="tag" style={{ color: "inherit", borderColor: "currentColor" }}>{questions.length}</span>
          </Link>
          <div className="test-list">
            {groups.map(([tag, prompts]) => (
              <section key={tag} className="card">
                <div className="spread">
                  <h2 className="card-title" style={{ fontSize: 15 }}>
                    # {tag}
                  </h2>
                  <Link className="btn small" to={`/repaso/jugar?tag=${encodeURIComponent(tag)}`}>
                    {S.review.startTag(prompts.length)}
                  </Link>
                </div>
                <ul className="card-sub" style={{ margin: 0, paddingLeft: 18 }}>
                  {prompts.slice(0, 3).map((pr, i) => (
                    <li key={i}>{pr}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}
