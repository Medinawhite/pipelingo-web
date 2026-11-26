import type { Question } from "../content/types";
import { GameRules } from "./rules";

export interface PendingMiss {
  questionId: string;
  /** Position of its lesson in the curriculum (0-based, across all units). */
  lessonIndex: number;
  lastMissedAt: number;
}

/** A question ready to show, with options, right column or steps already shuffled. */
export interface PreparedQuestion {
  question: Question;
  optionOrder: string[];
  rightColumn: string[];
  stepOrder: string[];
  isReview: boolean;
}

export type Random = () => number;

export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const key = (xs: readonly unknown[]) => JSON.stringify(xs);

/** Shuffles so the result is not already a solution (identity order by default), when possible. */
export function shuffleAvoiding<T>(items: readonly T[], random: Random, avoid: readonly (readonly T[])[] = [items]): T[] {
  if (items.length < 2) return [...items];
  const banned = new Set(avoid.map(key));
  for (let i = 0; i < 20; i++) {
    const s = shuffle(items, random);
    if (!banned.has(key(s))) return s;
  }
  return shuffle(items, random);
}

/** Up to 3 pending misses from earlier lessons go at the end of test 5, oldest first. */
export function reviewForTest5(currentLessonIndex: number, pending: PendingMiss[]): string[] {
  return pending
    .filter((m) => m.lessonIndex < currentLessonIndex)
    .sort((a, b) => a.lastMissedAt - b.lastMissedAt)
    .slice(0, GameRules.MAX_REVIEW_QUESTIONS_IN_TEST_5)
    .map((m) => m.questionId);
}

/** Unit-skip test: 15 random questions from tests 3–5 of the unit's lessons. */
export const skipTest = (pool: Question[], random: Random) => shuffle(pool, random).slice(0, GameRules.SKIP_TEST_SIZE);

/** Questions sorted by difficulty, keeping file order on ties (docs/DECISIONS.md, 17). */
export const byDifficulty = (qs: Question[]) =>
  qs.map((q, i) => [q, i] as const).sort((a, b) => a[0].difficulty - b[0].difficulty || a[1] - b[1]).map(([q]) => q);

export function prepare(question: Question, random: Random, isReview = false): PreparedQuestion {
  const base: PreparedQuestion = { question, optionOrder: [], rightColumn: [], stepOrder: [], isReview };
  switch (question.type) {
    case "multiple_choice":
      return { ...base, optionOrder: shuffle(question.options.map((o) => o.id), random) };
    case "match":
      return { ...base, rightColumn: shuffleAvoiding(question.pairs.map((p) => p.right), random) };
    case "order_steps":
      return {
        ...base,
        stepOrder: shuffleAvoiding(
          question.steps.map((s) => s.id),
          random,
          [question.answer, ...(question.acceptAlso ?? [])],
        ),
      };
    default:
      return base;
  }
}
