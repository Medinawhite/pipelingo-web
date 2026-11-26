import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Question } from "../../content/types";
import { grade, type UserAnswer } from "../../domain/grading";
import { byDifficulty, prepare, reviewForTest5, skipTest, type PreparedQuestion } from "../../domain/quizBuilder";
import { GameRules, canStartTest, type TestOutcome } from "../../domain/rules";
import { finishTest, reviewAnswer, type AnsweredQuestion, type TestSource } from "../../state/progress";
import { store, today, useProgress } from "../../state/store";
import { Check, Close, Heart } from "../icons";
import { content, journey, LEVEL } from "../journey";
import { S } from "../strings";
import { CodeBlock } from "./highlight";
import { BoolInput, ChoiceInput, FillInput, LETTERS, LinesInput, MatchInput, OrderInput, emptyDraft, isReady, type Draft } from "./Inputs";

type Mode = { kind: "lesson"; unitId: string; lessonId: string; test: number } | { kind: "skip"; unitId: string } | { kind: "review"; tag?: string };

interface Built {
  title: string;
  questions: PreparedQuestion[];
  /** Lesson index of each question, for misses. */
  lessonOf: Map<string, number>;
}

function lessonIndexOf(questionId: string): number {
  const [unit, lesson] = questionId.split(".");
  return journey.lessonIndex(unit, lesson);
}

function build(mode: Mode): Built | null {
  const p = store.get();
  const lessonOf = new Map<string, number>();
  const add = (qs: Question[], review = false) =>
    qs.map((q) => {
      lessonOf.set(q.id, lessonIndexOf(q.id));
      return prepare(q, Math.random, review);
    });
  if (mode.kind === "lesson") {
    const t = content.tests(LEVEL, mode.unitId, mode.lessonId).find((x) => x.test === mode.test);
    if (!t) return null;
    const qs = add(byDifficulty(t.questions));
    if (mode.test === 5) {
      const pending = Object.entries(p.misses).map(([questionId, m]) => ({ questionId, ...m }));
      const ids = reviewForTest5(journey.lessonIndex(mode.unitId, mode.lessonId), pending);
      qs.push(...add(ids.map((id) => content.question(id)).filter((q): q is Question => !!q), true));
    }
    return { title: `${t.test}. ${t.title}`, questions: qs, lessonOf };
  }
  if (mode.kind === "skip") {
    const unit = journey.unit(mode.unitId);
    if (!unit) return null;
    const pool = unit.lessons.flatMap((l) =>
      content.tests(LEVEL, unit.id, l.id).filter((t) => (GameRules.SKIP_TEST_SOURCE_TESTS as readonly number[]).includes(t.test)).flatMap((t) => t.questions),
    );
    if (!pool.length) return null;
    return { title: `${S.quiz.skipTitle} · ${unit.title}`, questions: add(skipTest(pool, Math.random)), lessonOf };
  }
  const ids = Object.keys(p.misses);
  const qs = ids.map((id) => content.question(id)).filter((q): q is Question => !!q && (!mode.tag || q.tags.includes(mode.tag)));
  if (!qs.length) return null;
  return { title: S.review.title, questions: add(qs, true), lessonOf };
}

function toAnswer(d: Draft): UserAnswer {
  switch (d.kind) {
    case "choice":
      return { kind: "choice", optionId: d.optionId ?? "" };
    case "bool":
      return { kind: "bool", value: d.value ?? false };
    default:
      return d;
  }
}

export function LessonQuiz() {
  const { unit = "", lesson = "", test = "" } = useParams();
  return <Quiz key={`${unit}/${lesson}/${test}`} mode={{ kind: "lesson", unitId: unit, lessonId: lesson, test: Number(test) }} />;
}

export function SkipQuiz() {
  const { unit = "" } = useParams();
  return <Quiz key={unit} mode={{ kind: "skip", unitId: unit }} />;
}

export function ReviewQuiz() {
  const [params] = useSearchParams();
  const tag = params.get("tag") ?? undefined;
  return <Quiz key={tag ?? "all"} mode={{ kind: "review", tag }} />;
}

function Quiz({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const progress = useProgress();
  const [built] = useState(() => build(mode));
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(() => (built ? emptyDraft(built.questions[0]) : null));
  const [checked, setChecked] = useState<boolean | null>(null);
  const [answers, setAnswers] = useState<AnsweredQuestion[]>([]);
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);
  const [reviewDone, setReviewDone] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const exitTo = mode.kind === "lesson" ? `/leccion/${mode.unitId}/${mode.lessonId}` : mode.kind === "review" ? "/repaso" : "/mapa";
  // Starting is checked once, on entry; lives reaching 0 mid-test do not stop it (DECISIONS 4).
  const [allowed] = useState(() => mode.kind === "review" || canStartTest(store.get().player, today()));

  if (!built || !draft || !allowed) return <Navigate to={exitTo} replace />;
  if (outcome) return <Result mode={mode} outcome={outcome} answers={answers} exitTo={exitTo} />;
  if (reviewDone) return <ReviewDone answers={answers} />;

  const prepared = built.questions[index];
  const q = prepared.question;
  const total = built.questions.length;
  const last = index === total - 1;

  const check = () => {
    const ok = grade(q, toAnswer(draft));
    setChecked(ok);
    setAnswers((a) => [...a, { questionId: q.id, correct: ok, lessonIndex: built.lessonOf.get(q.id) ?? -1 }]);
    if (mode.kind === "review") store.update((p) => reviewAnswer(p, q.id, ok, today()));
  };

  const next = () => {
    if (!last) {
      setIndex(index + 1);
      setDraft(emptyDraft(built.questions[index + 1]));
      setChecked(null);
      return;
    }
    if (mode.kind === "review") {
      setReviewDone(true);
      return;
    }
    const source: TestSource = mode.kind === "lesson" ? { kind: "lesson", unitId: mode.unitId, lessonId: mode.lessonId, test: mode.test } : { kind: "skip", unitId: mode.unitId };
    const [p, o] = finishTest(store.get(), source, answers, today(), Date.now());
    store.set(p);
    setOutcome(o);
  };

  const leave = () => {
    if (mode.kind !== "review" && answers.length > 0) setConfirmLeave(true);
    else navigate(exitTo);
  };

  const done = index + (checked !== null ? 1 : 0);
  return (
    <div className="quiz">
      <div className="quiz-bar">
        <button className="icon-btn" onClick={leave} aria-label={S.quiz.close}>
          <Close size={22} />
        </button>
        <div className="bar" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label={S.quiz.progress(index + 1, total)}>
          <span style={{ width: `${(done / total) * 100}%` }} />
        </div>
        {GameRules.LIVES_ENABLED && mode.kind !== "review" && (
          <span className="stat lives" aria-label={S.stats.lives(progress.player.lives)}>
            <Heart /> {progress.player.lives}
          </span>
        )}
      </div>
      <div className="quiz-body">
        <div className="spread">
          <span className="section-label">{built.title}</span>
          <span className="section-label">
            {index + 1}/{total}
          </span>
        </div>
        {prepared.isReview && mode.kind !== "review" && <span className="tag reward review-chip">{S.quiz.review}</span>}
        <h1 className="prompt">{q.prompt}</h1>
        {q.code && q.type !== "find_error" && <CodeBlock content={q.code.content} lang={q.code.lang} />}
        <QuestionInput prepared={prepared} draft={draft} onChange={setDraft} revealed={checked !== null} />
      </div>
      {checked === null ? (
        <div className="quiz-footer">
          <button className="btn primary block" disabled={!isReady(prepared, draft)} onClick={check}>
            {S.quiz.check}
          </button>
        </div>
      ) : (
        <Feedback prepared={prepared} draft={draft} correct={checked} last={last} review={mode.kind === "review"} onNext={next} />
      )}
      {confirmLeave && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="leave-title">
          <div className="card dialog">
            <h2 id="leave-title" className="card-title">
              {S.quiz.leaveTitle}
            </h2>
            <p className="card-sub">{S.quiz.leaveBody}</p>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn small" autoFocus onClick={() => setConfirmLeave(false)}>
                {S.quiz.stay}
              </button>
              <button className="btn small danger" onClick={() => navigate(exitTo)}>
                {S.quiz.leave}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionInput(props: { prepared: PreparedQuestion; draft: Draft; onChange: (d: Draft) => void; revealed: boolean }) {
  const { draft } = props;
  switch (draft.kind) {
    case "choice":
      return <ChoiceInput {...props} draft={draft} />;
    case "bool":
      return <BoolInput {...props} draft={draft} />;
    case "matches":
      return <MatchInput {...props} draft={draft} />;
    case "blanks":
      return <FillInput {...props} draft={draft} />;
    case "lines":
      return <LinesInput {...props} draft={draft} />;
    case "order":
      return <OrderInput {...props} draft={draft} />;
  }
}

/** The block `# así queda bien` for types where colours are not enough (DECISIONS 16). */
function fixText(p: PreparedQuestion): string | null {
  const q = p.question;
  switch (q.type) {
    case "find_error":
      return q.fix;
    case "fill_command":
      return q.template.replace(/\{\{(\w+)\}\}/g, (_, b: string) => q.blanks[b][0]);
    case "match":
      return q.pairs.map((x) => `${x.left} → ${x.right}`).join("\n");
    case "order_steps":
      return q.answer.map((id, i) => `${i + 1}. ${q.steps.find((s) => s.id === id)!.text}`).join("\n");
    default:
      return null;
  }
}

function Feedback({
  prepared,
  draft,
  correct,
  last,
  review,
  onNext,
}: {
  prepared: PreparedQuestion;
  draft: Draft;
  correct: boolean;
  last: boolean;
  review: boolean;
  onNext: () => void;
}) {
  const q = prepared.question;
  let title: string = correct ? S.quiz.correct : S.quiz.wrong;
  let why: string | undefined;
  if (!correct && q.type === "multiple_choice") {
    title = S.quiz.wrongWas(LETTERS[prepared.optionOrder.indexOf(q.answer)]);
    if (draft.kind === "choice") why = q.options.find((o) => o.id === draft.optionId)?.why;
  }
  if (!correct && q.type === "true_false") title = S.quiz.wrongWasBool(q.answer);
  const fix = correct ? null : fixText(prepared);
  return (
    <div className={`sheet ${correct ? "" : "fail"}`} role="status" aria-live="polite">
      <h2 className="sheet-title">
        {correct ? <Check size={18} /> : <Close size={18} />} {title}
        {!review && correct && <span className="xp">{S.quiz.xp}</span>}
        {!review && !correct && GameRules.LIVES_ENABLED && <span className="xp" style={{ color: "var(--error)" }}>{S.quiz.life}</span>}
      </h2>
      {why && <p>{why}</p>}
      <p>{q.explanation}</p>
      {fix && (
        <div className="fix">
          <span className="tok-com">{S.quiz.fixed}</span>
          {fix}
        </div>
      )}
      <button className={`btn block ${correct ? "primary" : "danger"}`} onClick={onNext} autoFocus>
        {last ? S.quiz.finish : S.quiz.next}
      </button>
    </div>
  );
}

function Result({ mode, outcome, answers, exitTo }: { mode: Mode; outcome: TestOutcome; answers: AnsweredQuestion[]; exitTo: string }) {
  const navigate = useNavigate();
  const misses = answers.filter((a) => !a.correct).length;
  const skip = mode.kind === "skip";
  const title = outcome.passed ? (skip ? S.result.skipPassed : S.result.passed) : S.result.failed;
  const again = mode.kind === "lesson" ? `/prueba/${mode.unitId}/${mode.lessonId}/${mode.test}` : mode.kind === "skip" ? `/saltar/${mode.unitId}` : "/repaso";
  const summary = useMemo(() => `${outcome.correct}/${outcome.total}`, [outcome]);
  return (
    <main className="page" style={{ maxWidth: 560 }}>
      <div className={`result-hero ${outcome.passed ? "pass" : "fail"}`}>
        <span className="section-label">{outcome.passed ? "exit 0" : "exit 1"}</span>
        <span className="big" aria-label={`${outcome.correct} de ${outcome.total}`}>
          {summary}
        </span>
        <h1 className="card-title">{title}</h1>
      </div>
      <div className="grid-stats">
        <div className="stat-tile accent">
          <div className="v">{outcome.percent} %</div>
          <div className="k">{S.result.correct}</div>
        </div>
        <div className="stat-tile reward">
          <div className="v">+{outcome.xpEarned}</div>
          <div className="k">{S.result.xp}</div>
        </div>
        <div className="stat-tile reward">
          <div className="v">{outcome.streak}</div>
          <div className="k">{S.result.streak}</div>
        </div>
      </div>
      {outcome.bonusXp > 0 && <p className="lead">{S.result.bonus(outcome.bonusXp)}</p>}
      {misses > 0 && (
        <Link to="/repaso" className="card" style={{ textDecoration: "none", color: "var(--text)" }}>
          {S.result.toReview(misses)} →
        </Link>
      )}
      <div className="row" style={{ flexWrap: "wrap" }}>
        {!outcome.passed && (
          <button className="btn primary" style={{ flex: 1 }} onClick={() => navigate(again, { replace: true })}>
            {S.result.retry}
          </button>
        )}
        <button className={`btn ${outcome.passed ? "primary" : ""}`} style={{ flex: 1 }} onClick={() => navigate(exitTo)}>
          {skip ? S.result.toMap : S.result.backToLesson}
        </button>
      </div>
    </main>
  );
}

function ReviewDone({ answers }: { answers: AnsweredQuestion[] }) {
  const ok = answers.filter((a) => a.correct).length;
  return (
    <main className="page" style={{ maxWidth: 560 }}>
      <div className="result-hero pass">
        <span className="big">
          {ok}/{answers.length}
        </span>
        <h1 className="card-title">{S.review.done}</h1>
      </div>
      <Link className="btn primary block" to="/repaso">
        {S.back}
      </Link>
    </main>
  );
}
