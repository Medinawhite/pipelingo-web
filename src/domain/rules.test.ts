import { describe, expect, it } from "vitest";
import { computeProgress, nextLesson, pathToNextLevelPercent, testKey, type UnitOutline } from "./progression";
import { prepare, reviewForTest5, shuffleAvoiding } from "./quizBuilder";
import {
  applyReviewAnswer,
  applyTestAnswer,
  canStartTest,
  completeLab,
  completeTest,
  displayedStreak,
  epochDay,
  initialPlayer,
  isPassed,
} from "./rules";

const D = 20_000;

describe("rules", () => {
  it("gives 10 XP per correct answer", () => {
    const s = applyTestAnswer(initialPlayer(), true, D);
    expect(s.xp).toBe(10);
    expect(s.correct).toBe(1);
  });

  it("takes a life per miss only when lives are on, never below 0", () => {
    let s = { ...initialPlayer(), livesDay: D };
    expect(applyTestAnswer(s, false, D, false).lives).toBe(5);
    for (let i = 0; i < 7; i++) s = applyTestAnswer(s, false, D, true);
    expect(s.lives).toBe(0);
    expect(canStartTest(s, D, true)).toBe(false);
    expect(canStartTest(s, D, false)).toBe(true);
  });

  it("refills lives the next day", () => {
    const s = { ...initialPlayer(), lives: 0, livesDay: D };
    expect(canStartTest(s, D + 1, true)).toBe(true);
  });

  it("passes at 80 % exactly, without rounding", () => {
    expect(isPassed(11, 13)).toBe(true);
    expect(isPassed(10, 13)).toBe(false);
    expect(isPassed(12, 15)).toBe(true);
    expect(isPassed(0, 0)).toBe(false);
  });

  it("adds the perfect bonus and starts the streak", () => {
    const [s, o] = completeTest(initialPlayer(), 12, 12, D);
    expect(o.perfect).toBe(true);
    expect(o.xpEarned).toBe(140);
    expect(s.xp).toBe(20); // answers were applied before
    expect(s.streak).toBe(1);
  });

  it("counts consecutive days for the streak and loses it after a gap", () => {
    let [s] = completeTest(initialPlayer(), 1, 2, D);
    [s] = completeTest(s, 1, 2, D);
    expect(s.streak).toBe(1);
    [s] = completeTest(s, 1, 2, D + 1);
    expect(s.streak).toBe(2);
    expect(displayedStreak(s, D + 2)).toBe(2);
    expect(displayedStreak(s, D + 3)).toBe(0);
    [s] = completeTest(s, 1, 2, D + 5);
    expect(s.streak).toBe(1);
  });

  it("gives a life for every 3 correct review answers, up to 5", () => {
    let s = { ...initialPlayer(), lives: 4, livesDay: D };
    s = applyReviewAnswer(s, true, D);
    s = applyReviewAnswer(s, false, D);
    s = applyReviewAnswer(s, true, D);
    expect(s.lives).toBe(4);
    s = applyReviewAnswer(s, true, D);
    expect(s.lives).toBe(5);
    expect(s.reviewCorrectCounter).toBe(0);
    for (let i = 0; i < 3; i++) s = applyReviewAnswer(s, true, D);
    expect(s.lives).toBe(5);
  });

  it("gives lab XP only the first time", () => {
    const [s, xp] = completeLab(initialPlayer(), true, D);
    expect(xp).toBe(30);
    const [s2, xp2] = completeLab(s, false, D);
    expect(xp2).toBe(0);
    expect(s2.xp).toBe(30);
    expect(s2.streak).toBe(1);
  });

  it("uses local calendar days", () => {
    expect(epochDay(new Date(1970, 0, 2, 23, 59))).toBe(1);
  });
});

describe("progression", () => {
  const units: UnitOutline[] = [
    { id: "github", lessons: [{ id: "g1", hasContent: false }] },
    {
      id: "docker",
      lessons: [
        { id: "d1", hasContent: true },
        { id: "d2", hasContent: false },
      ],
    },
    { id: "actions", lessons: [{ id: "a1", hasContent: true }, { id: "a2", hasContent: true }] },
  ];
  const all = (u: string, l: string) => [1, 2, 3, 4, 5].map((n) => testKey(u, l, n));

  it("starts at the first lesson with content", () => {
    const p = computeProgress(units, new Set(), new Set());
    expect(p.units.map((u) => u.status)).toEqual(["coming_soon", "current", "locked"]);
    expect(p.units[1].lessons[0].tests).toEqual(["available", "locked", "locked", "locked", "locked"]);
  });

  it("unlocks tests in order and the next unit when a unit is done", () => {
    const p = computeProgress(units, new Set(all("docker", "d1")), new Set());
    expect(p.units[1].status).toBe("done");
    expect(p.units[2].status).toBe("current");
    expect(p.units[2].lessons.map((l) => l.status)).toEqual(["available", "locked"]);
    expect(nextLesson(p.units[2])?.lessonId).toBe("a1");
  });

  it("a passed skip test marks the whole unit done", () => {
    const p = computeProgress(units, new Set(), new Set(["docker"]));
    expect(p.units[1].status).toBe("done");
    expect(p.units[1].skipTestAvailable).toBe(false);
    expect(p.units[2].status).toBe("current");
  });

  it("computes the path to Mid over every test in the curriculum", () => {
    const p = computeProgress(units, new Set(all("docker", "d1")), new Set());
    expect(pathToNextLevelPercent(p)).toBe(20); // 5 of 25
  });
});

describe("quiz builder", () => {
  it("adds up to 3 older misses from earlier lessons, oldest first", () => {
    const pending = [
      { questionId: "q4", lessonIndex: 0, lastMissedAt: 4 },
      { questionId: "q1", lessonIndex: 0, lastMissedAt: 1 },
      { questionId: "q3", lessonIndex: 1, lastMissedAt: 3 },
      { questionId: "q2", lessonIndex: 1, lastMissedAt: 2 },
      { questionId: "same", lessonIndex: 2, lastMissedAt: 0 },
    ];
    expect(reviewForTest5(2, pending)).toEqual(["q1", "q2", "q3"]);
  });

  it("never starts an order already solved", () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 50; i++) expect(shuffleAvoiding([1, 2], random)).toEqual([2, 1]);
    const q = {
      id: "x.y.p5.q01",
      type: "order_steps" as const,
      prompt: "",
      explanation: "",
      tags: ["t"],
      difficulty: 1 as const,
      steps: ["a", "b", "c", "d"].map((id) => ({ id, text: id })),
      answer: ["a", "b", "c", "d"],
      acceptAlso: [["b", "a", "c", "d"]],
    };
    for (let i = 0; i < 50; i++) {
      const order = prepare(q, random).stepOrder.join("");
      expect(["abcd", "bacd"]).not.toContain(order);
    }
  });
});
