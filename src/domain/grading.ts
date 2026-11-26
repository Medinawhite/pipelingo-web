import type {
  FillCommandQuestion,
  FindErrorQuestion,
  MatchQuestion,
  MultipleChoiceQuestion,
  OrderStepsQuestion,
  Question,
  TrueFalseQuestion,
} from "../content/types";

/** What the learner submitted. One variant per question type. */
export type UserAnswer =
  | { kind: "choice"; optionId: string }
  | { kind: "bool"; value: boolean }
  /** left text → right text chosen by the learner. */
  | { kind: "matches"; pairs: Record<string, string> }
  /** blank name → typed text. */
  | { kind: "blanks"; values: Record<string, string> }
  /** Tapped line numbers, counted from 1. */
  | { kind: "lines"; lines: number[] }
  | { kind: "order"; stepIds: string[] };

// Graders from CLAUDE.md "Corrección por tipo". Pure functions, same rules as the Android app.

export const gradeMultipleChoice = (q: MultipleChoiceQuestion, optionId: string) => optionId === q.answer;

export const gradeTrueFalse = (q: TrueFalseQuestion, value: boolean) => value === q.answer;

/** Correct if every pair matches and nothing extra was paired. */
export const gradeMatch = (q: MatchQuestion, pairs: Record<string, string>) =>
  Object.keys(pairs).length === q.pairs.length && q.pairs.every((p) => pairs[p.left] === p.right);

/** Trims and collapses inner whitespace. Case is kept, as in a terminal. */
export const normalizeBlank = (text: string) => text.trim().replace(/\s+/g, " ");

export const gradeFillCommand = (q: FillCommandQuestion, values: Record<string, string>) =>
  Object.entries(q.blanks).every(([name, accepted]) => {
    const typed = values[name];
    if (typed === undefined) return false;
    const n = normalizeBlank(typed);
    return accepted.some((a) => normalizeBlank(a) === n);
  });

/** Correct if the tapped lines are exactly `answer` (1-based). */
export const gradeFindError = (q: FindErrorQuestion, lines: number[]) => {
  const tapped = new Set(lines);
  const expected = new Set(q.answer);
  return tapped.size === expected.size && [...expected].every((l) => tapped.has(l));
};

const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Correct if the order equals `answer` or any of `acceptAlso`. */
export const gradeOrderSteps = (q: OrderStepsQuestion, order: string[]) =>
  sameOrder(order, q.answer) || (q.acceptAlso ?? []).some((o) => sameOrder(order, o));

export function grade(q: Question, a: UserAnswer): boolean {
  switch (q.type) {
    case "multiple_choice":
      return a.kind === "choice" && gradeMultipleChoice(q, a.optionId);
    case "true_false":
      return a.kind === "bool" && gradeTrueFalse(q, a.value);
    case "match":
      return a.kind === "matches" && gradeMatch(q, a.pairs);
    case "fill_command":
      return a.kind === "blanks" && gradeFillCommand(q, a.values);
    case "find_error":
      return a.kind === "lines" && gradeFindError(q, a.lines);
    case "order_steps":
      return a.kind === "order" && gradeOrderSteps(q, a.stepIds);
  }
}
