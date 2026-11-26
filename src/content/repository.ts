import type { Curriculum, Lab, LessonFile, Question, TestFile } from "./types";

/**
 * Where the learning content comes from. Today it is bundled at build time from content/ at the
 * repo root (the single source of truth); a remote implementation can come later (Fase 2).
 */
export interface ContentRepository {
  curriculum(level: string): Curriculum;
  lesson(level: string, unitId: string, lessonId: string): LessonFile | undefined;
  /** Tests 1..5 of a lesson, or an empty list when the lesson has no complete content. */
  tests(level: string, unitId: string, lessonId: string): TestFile[];
  labs(level: string, unitId: string, lessonId: string): Lab[];
  /** Every question, by id. */
  question(id: string): Question | undefined;
}

type Files = Record<string, unknown>;

/** Builds a repository from a map of `level/unit-path/lesson-path/file.json` → parsed JSON. */
export function createContentRepository(files: Files): ContentRepository {
  const byPath = new Map<string, unknown>();
  for (const [key, value] of Object.entries(files)) {
    const i = key.lastIndexOf("content/");
    byPath.set(i >= 0 ? key.slice(i + "content/".length) : key, value);
  }

  const questionIndex = new Map<string, Question>();
  for (const value of byPath.values()) {
    const t = value as Partial<TestFile>;
    if (Array.isArray(t.questions)) for (const q of t.questions) questionIndex.set(q.id, q);
  }

  const curricula = new Map<string, Curriculum>();
  const curriculum = (level: string): Curriculum => {
    const c = byPath.get(`${level}/curriculum.json`) as Curriculum | undefined;
    if (!c) throw new Error(`No curriculum for level ${level}`);
    curricula.set(level, c);
    return c;
  };

  const lessonDir = (level: string, unitId: string, lessonId: string): string | undefined => {
    const c = curricula.get(level) ?? curriculum(level);
    for (const phase of c.phases)
      for (const unit of phase.units)
        if (unit.id === unitId) {
          const lesson = unit.lessons.find((l) => l.id === lessonId);
          return lesson ? `${level}/${unit.path}/${lesson.path}` : undefined;
        }
    return undefined;
  };

  return {
    curriculum,
    lesson(level, unitId, lessonId) {
      const dir = lessonDir(level, unitId, lessonId);
      return dir ? (byPath.get(`${dir}/lesson.json`) as LessonFile | undefined) : undefined;
    },
    tests(level, unitId, lessonId) {
      const dir = lessonDir(level, unitId, lessonId);
      if (!dir || !byPath.has(`${dir}/lesson.json`)) return [];
      const tests: TestFile[] = [];
      for (let n = 1; n <= 5; n++) {
        const t = byPath.get(`${dir}/prueba-${n}.json`) as TestFile | undefined;
        if (!t) return []; // a lesson counts as having content only with all five tests
        tests.push(t);
      }
      return tests;
    },
    labs(level, unitId, lessonId) {
      const dir = lessonDir(level, unitId, lessonId);
      if (!dir) return [];
      const labs: Lab[] = [];
      for (let n = 1; byPath.has(`${dir}/lab-${n}.json`); n++) labs.push(byPath.get(`${dir}/lab-${n}.json`) as Lab);
      return labs;
    },
    question: (id) => questionIndex.get(id),
  };
}

/** The content bundled from content/ at build time. */
export const bundledContent: ContentRepository = createContentRepository(
  import.meta.glob("../../content/**/*.json", { eager: true, import: "default" }),
);
