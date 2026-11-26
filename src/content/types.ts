// Content models. They mirror docs/03-formato-preguntas.md exactly, plus the web-only labs
// described in docs/05-labs-web.md.

export interface CodeBlock {
  lang: string;
  content: string;
}

interface QuestionBase {
  id: string;
  prompt: string;
  code?: CodeBlock;
  explanation: string;
  tags: string[];
  difficulty: 1 | 2 | 3;
}

export interface Option {
  id: string;
  text: string;
  why?: string;
}

export interface MultipleChoiceQuestion extends QuestionBase {
  type: "multiple_choice";
  options: Option[];
  answer: string;
}

export interface TrueFalseQuestion extends QuestionBase {
  type: "true_false";
  answer: boolean;
}

export interface MatchQuestion extends QuestionBase {
  type: "match";
  pairs: { left: string; right: string }[];
}

export interface FillCommandQuestion extends QuestionBase {
  type: "fill_command";
  template: string;
  blanks: Record<string, string[]>;
}

export interface FindErrorQuestion extends QuestionBase {
  type: "find_error";
  code: CodeBlock;
  answer: number[];
  fix: string;
}

export interface OrderStepsQuestion extends QuestionBase {
  type: "order_steps";
  steps: { id: string; text: string }[];
  answer: string[];
  acceptAlso?: string[][];
}

export type Question =
  | MultipleChoiceQuestion
  | TrueFalseQuestion
  | MatchQuestion
  | FillCommandQuestion
  | FindErrorQuestion
  | OrderStepsQuestion;

export interface TestFile {
  level: string;
  unit: string;
  lesson: string;
  test: number;
  title: string;
  questions: Question[];
}

export interface LessonFile {
  level: string;
  unit: string;
  lesson: string;
  order: number;
  title: string;
  goal: string;
}

export interface CurriculumLesson {
  id: string;
  title: string;
  path: string;
}

export interface CurriculumExtra {
  id: string;
  title: string;
  sub: string;
  file: string;
}

export interface CurriculumUnit {
  id: string;
  title: string;
  path: string;
  goal: string;
  lessons: CurriculumLesson[];
  bridge?: CurriculumExtra;
}

export interface CurriculumPhase {
  id: string;
  title: string;
  units: CurriculumUnit[];
  boss?: CurriculumExtra;
}

export interface Curriculum {
  level: string;
  phases: CurriculumPhase[];
}

// ---------- Labs (web only) ----------

export type TerminalCheck =
  | { type: "image_exists"; image: string }
  | { type: "image_absent"; image: string }
  | {
      type: "container";
      name: string;
      state: "running" | "exited" | "absent";
      image?: string;
      port?: string;
      env?: string;
    }
  | { type: "command_ran"; pattern: string }
  | { type: "http_ok"; port: number };

export type EditorCheck =
  | { type: "yaml_valid" }
  | {
      type: "yaml_path";
      path: string;
      equals?: string | number | boolean;
      contains?: string;
      matches?: string;
      exists?: boolean;
    }
  | { type: "regex"; pattern: string; flags?: string }
  | { type: "not_regex"; pattern: string; flags?: string }
  | { type: "order"; first: string; then: string }
  /** Met once the learner runs the workflow for that event and gets the expected result. */
  | { type: "run"; event: string; expect: "success" | "not_triggered" | "job_skipped"; job?: string };

export interface LabObjective<C> {
  id: string;
  text: string;
  hint: string;
  check: C;
}

interface LabBase {
  level: string;
  unit: string;
  lesson: string;
  lab: number;
  title: string;
  intro: string;
  /** Short wrap-up shown when every objective is met. */
  outro: string;
}

export interface TerminalSetup {
  images?: string[];
  containers?: {
    name: string;
    image: string;
    state: "running" | "exited";
    ports?: string[];
    env?: string[];
  }[];
}

export interface TerminalLab extends LabBase {
  kind: "terminal";
  setup?: TerminalSetup;
  objectives: LabObjective<TerminalCheck>[];
}

export interface EditorLab extends LabBase {
  kind: "editor";
  file: { path: string; lang: "yaml" | "dockerfile"; starter: string };
  /** What the "ejecutar" button simulates. */
  run: "workflow";
  objectives: LabObjective<EditorCheck>[];
  solution: string;
}

export type Lab = TerminalLab | EditorLab;
