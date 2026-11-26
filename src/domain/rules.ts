// Values and rules from the "Reglas del juego" table in CLAUDE.md, ported from the Android
// RulesEngine. Days are local calendar days counted as "epoch days".

export const GameRules = {
  XP_PER_CORRECT: 10,
  PERFECT_BONUS_XP: 20,
  PASS_PERCENT: 80,
  MAX_LIVES: 5,
  /** Lives are switched off, as in the Android app (docs/DECISIONS.md, 14). */
  LIVES_ENABLED: false,
  REVIEW_CORRECT_PER_LIFE: 3,
  MAX_REVIEW_QUESTIONS_IN_TEST_5: 3,
  SKIP_TEST_SIZE: 15,
  SKIP_TEST_SOURCE_TESTS: [3, 4, 5],
  /** Web only: XP for completing a lab the first time. */
  LAB_XP: 30,
} as const;

export interface PlayerState {
  xp: number;
  lives: number;
  /** Day the lives were last refilled. */
  livesDay: number;
  streak: number;
  /** Last day a test (or lab) was completed; null if never. */
  lastCompletedDay: number | null;
  reviewCorrectCounter: number;
  answered: number;
  correct: number;
  testsCompleted: number;
}

export const initialPlayer = (): PlayerState => ({
  xp: 0,
  lives: GameRules.MAX_LIVES,
  livesDay: 0,
  streak: 0,
  lastCompletedDay: null,
  reviewCorrectCounter: 0,
  answered: 0,
  correct: 0,
  testsCompleted: 0,
});

export interface TestOutcome {
  correct: number;
  total: number;
  percent: number;
  passed: boolean;
  perfect: boolean;
  xpEarned: number;
  bonusXp: number;
  streak: number;
  streakIncreasedToday: boolean;
}

/** Local calendar day of a date, as days since 1970-01-01. */
export function epochDay(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

export function refreshDaily(s: PlayerState, today: number): PlayerState {
  return s.livesDay < today ? { ...s, lives: GameRules.MAX_LIVES, livesDay: today } : s;
}

export function canStartTest(s: PlayerState, today: number, livesEnabled: boolean = GameRules.LIVES_ENABLED): boolean {
  return !livesEnabled || refreshDaily(s, today).lives > 0;
}

export function applyTestAnswer(
  state: PlayerState,
  correct: boolean,
  today: number,
  livesEnabled: boolean = GameRules.LIVES_ENABLED,
): PlayerState {
  const s = refreshDaily(state, today);
  if (correct) return { ...s, xp: s.xp + GameRules.XP_PER_CORRECT, answered: s.answered + 1, correct: s.correct + 1 };
  return { ...s, lives: livesEnabled ? Math.max(0, s.lives - 1) : s.lives, answered: s.answered + 1 };
}

/** Review: failing costs nothing; every 3 correct answers give +1 life (max 5). */
export function applyReviewAnswer(state: PlayerState, correct: boolean, today: number): PlayerState {
  const s = refreshDaily(state, today);
  if (!correct) return s;
  const counter = s.reviewCorrectCounter + 1;
  return counter >= GameRules.REVIEW_CORRECT_PER_LIFE
    ? { ...s, lives: Math.min(GameRules.MAX_LIVES, s.lives + 1), reviewCorrectCounter: 0 }
    : { ...s, reviewCorrectCounter: counter };
}

export const percent = (correct: number, total: number) => (total === 0 ? 0 : Math.floor((correct * 100) / total));

/** Passed with at least 80 %, compared exactly (11/13 passes, 10/13 does not). */
export const isPassed = (correct: number, total: number) => total > 0 && correct * 100 >= GameRules.PASS_PERCENT * total;

/** Streak: consecutive local days with at least one completed test. */
export function nextStreak(s: PlayerState, today: number): [number, boolean] {
  if (s.lastCompletedDay === today) return [s.streak, false];
  if (s.lastCompletedDay === today - 1) return [s.streak + 1, true];
  return [1, true];
}

export function displayedStreak(s: PlayerState, today: number): number {
  if (s.lastCompletedDay === null) return 0;
  return today - s.lastCompletedDay <= 1 ? s.streak : 0;
}

/** Closes a test whose answers were already applied: adds the perfect bonus and updates the streak. */
export function completeTest(state: PlayerState, correct: number, total: number, today: number): [PlayerState, TestOutcome] {
  const s = refreshDaily(state, today);
  const perfect = total > 0 && correct === total;
  const bonus = perfect ? GameRules.PERFECT_BONUS_XP : 0;
  const [streak, increased] = nextStreak(s, today);
  return [
    { ...s, xp: s.xp + bonus, streak, lastCompletedDay: today, testsCompleted: s.testsCompleted + 1 },
    {
      correct,
      total,
      percent: percent(correct, total),
      passed: isPassed(correct, total),
      perfect,
      xpEarned: correct * GameRules.XP_PER_CORRECT + bonus,
      bonusXp: bonus,
      streak,
      streakIncreasedToday: increased,
    },
  ];
}

/** Web only: a lab gives XP the first time and counts for the streak every time. */
export function completeLab(state: PlayerState, firstTime: boolean, today: number): [PlayerState, number] {
  const s = refreshDaily(state, today);
  const xp = firstTime ? GameRules.LAB_XP : 0;
  const [streak] = nextStreak(s, today);
  return [{ ...s, xp: s.xp + xp, streak, lastCompletedDay: today }, xp];
}

export const accuracy = (s: PlayerState) => percent(s.correct, s.answered);
