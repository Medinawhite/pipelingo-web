import { describe, expect, it } from "vitest";
import type {
  FillCommandQuestion,
  FindErrorQuestion,
  MatchQuestion,
  MultipleChoiceQuestion,
  OrderStepsQuestion,
  TrueFalseQuestion,
} from "../content/types";
import { grade, normalizeBlank } from "./grading";

const base = { id: "u.l.p1.q01", prompt: "?", explanation: "", tags: ["t"], difficulty: 1 as const };

const mc: MultipleChoiceQuestion = {
  ...base,
  type: "multiple_choice",
  options: [
    { id: "a", text: "A" },
    { id: "b", text: "B", why: "no" },
    { id: "c", text: "C" },
  ],
  answer: "a",
};
const tf: TrueFalseQuestion = { ...base, type: "true_false", answer: false };
const match: MatchQuestion = {
  ...base,
  type: "match",
  pairs: [
    { left: "FROM", right: "Imagen base" },
    { left: "RUN", right: "Build" },
    { left: "CMD", right: "Arranque" },
  ],
};
const fill: FillCommandQuestion = {
  ...base,
  type: "fill_command",
  template: "docker {{b1}} -t app:1.0 {{b2}}",
  blanks: { b1: ["build"], b2: [".", "./"] },
};
const find: FindErrorQuestion = { ...base, type: "find_error", code: { lang: "x", content: "a\nb\nc" }, answer: [2], fix: "b2" };
const order: OrderStepsQuestion = {
  ...base,
  type: "order_steps",
  steps: [
    { id: "s1", text: "1" },
    { id: "s2", text: "2" },
    { id: "s3", text: "3" },
    { id: "s4", text: "4" },
  ],
  answer: ["s1", "s2", "s3", "s4"],
  acceptAlso: [["s2", "s1", "s3", "s4"]],
};

describe("multiple_choice", () => {
  it("is correct only with the answer option", () => {
    expect(grade(mc, { kind: "choice", optionId: "a" })).toBe(true);
    expect(grade(mc, { kind: "choice", optionId: "b" })).toBe(false);
  });
  it("rejects an answer of another kind", () => {
    expect(grade(mc, { kind: "bool", value: true })).toBe(false);
  });
});

describe("true_false", () => {
  it("compares the boolean", () => {
    expect(grade(tf, { kind: "bool", value: false })).toBe(true);
    expect(grade(tf, { kind: "bool", value: true })).toBe(false);
  });
});

describe("match", () => {
  const right = { FROM: "Imagen base", RUN: "Build", CMD: "Arranque" };
  it("needs every pair right", () => {
    expect(grade(match, { kind: "matches", pairs: right })).toBe(true);
    expect(grade(match, { kind: "matches", pairs: { ...right, RUN: "Arranque", CMD: "Build" } })).toBe(false);
  });
  it("fails when a pair is missing", () => {
    expect(grade(match, { kind: "matches", pairs: { FROM: "Imagen base", RUN: "Build" } })).toBe(false);
  });
});

describe("fill_command", () => {
  it("accepts any listed answer", () => {
    expect(grade(fill, { kind: "blanks", values: { b1: "build", b2: "./" } })).toBe(true);
  });
  it("trims and collapses whitespace", () => {
    expect(normalizeBlank("  a   b ")).toBe("a b");
    expect(grade(fill, { kind: "blanks", values: { b1: "  build ", b2: " . " } })).toBe(true);
  });
  it("is case sensitive", () => {
    expect(grade(fill, { kind: "blanks", values: { b1: "Build", b2: "." } })).toBe(false);
  });
  it("fails with a blank missing", () => {
    expect(grade(fill, { kind: "blanks", values: { b1: "build" } })).toBe(false);
  });
});

describe("find_error", () => {
  it("needs exactly the answer lines", () => {
    expect(grade(find, { kind: "lines", lines: [2] })).toBe(true);
    expect(grade(find, { kind: "lines", lines: [2, 3] })).toBe(false);
    expect(grade(find, { kind: "lines", lines: [1] })).toBe(false);
    expect(grade(find, { kind: "lines", lines: [] })).toBe(false);
  });
});

describe("order_steps", () => {
  it("accepts answer and acceptAlso", () => {
    expect(grade(order, { kind: "order", stepIds: ["s1", "s2", "s3", "s4"] })).toBe(true);
    expect(grade(order, { kind: "order", stepIds: ["s2", "s1", "s3", "s4"] })).toBe(true);
    expect(grade(order, { kind: "order", stepIds: ["s4", "s3", "s2", "s1"] })).toBe(false);
  });
});
