import { percent } from "./rules";

// Unlock rules, ported from the Android Progression object (docs/DECISIONS.md 1–3, 13).

export interface UnitOutline {
  id: string;
  lessons: { id: string; hasContent: boolean }[];
}

export type Status = "done" | "current" | "available" | "locked" | "coming_soon";

export interface LessonProgress {
  unitId: string;
  lessonId: string;
  status: Status;
  /** Status of tests 1..5; empty for lessons without content. */
  tests: Status[];
  passedTests: number;
}

export interface UnitProgress {
  unitId: string;
  status: Status;
  lessons: LessonProgress[];
  lessonsDone: number;
  passedTests: number;
  totalTests: number;
  skipTestAvailable: boolean;
}

export interface MapProgress {
  units: UnitProgress[];
  totalTests: number;
  passedTests: number;
}

export const testKey = (unitId: string, lessonId: string, test: number) => `${unitId}/${lessonId}/${test}`;

export function computeProgress(
  units: UnitOutline[],
  passed: ReadonlySet<string>,
  skippedUnits: ReadonlySet<string>,
  testsPerLesson = 5,
): MapProgress {
  let chainOpen = true;
  let currentAssigned = false;
  const result = units.map((unit): UnitProgress => {
    const skipped = skippedUnits.has(unit.id);
    const lessons = unit.lessons.map((lesson): LessonProgress => {
      if (!lesson.hasContent) return { unitId: unit.id, lessonId: lesson.id, status: "coming_soon", tests: [], passedTests: 0 };
      if (skipped)
        return {
          unitId: unit.id,
          lessonId: lesson.id,
          status: "done",
          tests: Array(testsPerLesson).fill("done"),
          passedTests: testsPerLesson,
        };
      const done = Array.from({ length: testsPerLesson }, (_, i) => passed.has(testKey(unit.id, lesson.id, i + 1)));
      const passedCount = done.filter(Boolean).length;
      const allDone = passedCount === testsPerLesson;
      const unlocked = chainOpen;
      let previousDone = true;
      const tests = done.map((isDone): Status => {
        const st: Status = isDone ? "done" : unlocked && previousDone ? "available" : "locked";
        previousDone = previousDone && isDone;
        return st;
      });
      if (!allDone) chainOpen = false;
      return {
        unitId: unit.id,
        lessonId: lesson.id,
        status: allDone ? "done" : unlocked ? "available" : "locked",
        tests,
        passedTests: passedCount,
      };
    });
    const hasContent = unit.lessons.some((l) => l.hasContent);
    const playable = lessons.filter((l) => l.status !== "coming_soon");
    const allLessonsDone = playable.length > 0 && playable.every((l) => l.status === "done");
    let status: Status;
    if (skipped || allLessonsDone) status = "done";
    else if (!hasContent) status = "coming_soon";
    else if (!currentAssigned && lessons.some((l) => l.status === "available" || l.status === "done")) {
      currentAssigned = true;
      status = "current";
    } else status = "locked";
    return {
      unitId: unit.id,
      status,
      lessons,
      lessonsDone: lessons.filter((l) => l.status === "done").length,
      passedTests: lessons.reduce((n, l) => n + l.passedTests, 0),
      totalTests: unit.lessons.length * testsPerLesson,
      skipTestAvailable: hasContent && status !== "done",
    };
  });
  return {
    units: result,
    totalTests: result.reduce((n, u) => n + u.totalTests, 0),
    passedTests: result.reduce((n, u) => n + u.passedTests, 0),
  };
}

/** "Camino a Mid": share of all the curriculum's tests that are passed. */
export const pathToNextLevelPercent = (p: MapProgress) => percent(p.passedTests, p.totalTests);

/** Lesson the "continuar" button opens: the first available one, else the last done. */
export function nextLesson(unit: UnitProgress): LessonProgress | undefined {
  return unit.lessons.find((l) => l.status === "available") ?? [...unit.lessons].reverse().find((l) => l.status === "done");
}
