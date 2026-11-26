import {
  applyReviewAnswer,
  applyTestAnswer,
  completeLab,
  completeTest,
  initialPlayer,
  type PlayerState,
  type TestOutcome,
} from "../domain/rules";
import { testKey } from "../domain/progression";

// The learner's saved progress and the pure functions that change it. The store (store.ts)
// keeps it in localStorage, the web counterpart of Room + DataStore in the Android app.

export interface TestResult {
  best: number;
  total: number;
  passed: boolean;
}

export interface Miss {
  lessonIndex: number;
  lastMissedAt: number;
}

export interface Progress {
  version: 1;
  onboarded: boolean;
  level: "junior";
  player: PlayerState;
  results: Record<string, TestResult>;
  misses: Record<string, Miss>;
  skippedUnits: string[];
  /** Completed labs by key "unit/lesson/lab-n", with the time of the first completion. */
  labs: Record<string, number>;
}

export const emptyProgress = (): Progress => ({
  version: 1,
  onboarded: false,
  level: "junior",
  player: initialPlayer(),
  results: {},
  misses: {},
  skippedUnits: [],
  labs: {},
});

export interface AnsweredQuestion {
  questionId: string;
  correct: boolean;
  /** Lesson the question belongs to, for review inside later tests 5. */
  lessonIndex: number;
}

/** Where a finished test came from. */
export type TestSource = { kind: "lesson"; unitId: string; lessonId: string; test: number } | { kind: "skip"; unitId: string };

function applyAnswers(p: Progress, answers: AnsweredQuestion[], today: number, now: number): Progress {
  let player = p.player;
  const misses = { ...p.misses };
  for (const a of answers) {
    player = applyTestAnswer(player, a.correct, today);
    // A miss stays pending until the question is answered right (docs/DECISIONS.md, 9).
    if (a.correct) delete misses[a.questionId];
    else misses[a.questionId] = { lessonIndex: a.lessonIndex, lastMissedAt: now };
  }
  return { ...p, player, misses };
}

/** Saves a whole test at once when it ends (docs/DECISIONS.md, 15). */
export function finishTest(
  p: Progress,
  source: TestSource,
  answers: AnsweredQuestion[],
  today: number,
  now: number,
): [Progress, TestOutcome] {
  const after = applyAnswers(p, answers, today, now);
  const correct = answers.filter((a) => a.correct).length;
  const [player, outcome] = completeTest(after.player, correct, answers.length, today);
  const next: Progress = { ...after, player };
  if (source.kind === "lesson") {
    const key = testKey(source.unitId, source.lessonId, source.test);
    const prev = next.results[key];
    next.results = {
      ...next.results,
      [key]: {
        best: Math.max(prev?.best ?? 0, correct),
        total: answers.length,
        passed: (prev?.passed ?? false) || outcome.passed,
      },
    };
  } else if (outcome.passed && !next.skippedUnits.includes(source.unitId)) {
    next.skippedUnits = [...next.skippedUnits, source.unitId];
  }
  return [next, outcome];
}

/** Review saves every answer right away; it never costs lives. */
export function reviewAnswer(p: Progress, questionId: string, correct: boolean, today: number): Progress {
  const misses = { ...p.misses };
  if (correct) delete misses[questionId];
  return { ...p, player: applyReviewAnswer(p.player, correct, today), misses };
}

export function finishLab(p: Progress, labKey: string, today: number, now: number): [Progress, number] {
  const first = !(labKey in p.labs);
  const [player, xp] = completeLab(p.player, first, today);
  return [{ ...p, player, labs: first ? { ...p.labs, [labKey]: now } : p.labs }, xp];
}

export const labKey = (unitId: string, lessonId: string, lab: number) => `${unitId}/${lessonId}/lab-${lab}`;

export const passedSet = (p: Progress) =>
  new Set(Object.entries(p.results).filter(([, r]) => r.passed).map(([k]) => k));

/** Migrates or rejects stored data. */
export function parseStored(raw: string | null): Progress {
  if (!raw) return emptyProgress();
  try {
    const v = JSON.parse(raw) as Partial<Progress>;
    if (v.version !== 1) return emptyProgress();
    const base = emptyProgress();
    return { ...base, ...v, player: { ...base.player, ...v.player } } as Progress;
  } catch {
    return emptyProgress();
  }
}
