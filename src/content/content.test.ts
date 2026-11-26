import { describe, expect, it } from "vitest";
import { advanceTerminal, editorStatus, runAchievements, runWorkflow } from "../domain/labRunner";
import { createDocker, exec } from "../sim/docker";
import { analyzeWorkflow, EVENTS } from "../sim/workflow";
import { bundledContent } from "./repository";
import type { EditorLab, Lab, TerminalLab } from "./types";

// Integrity of the real content in content/: every lab can be solved with its own hints
// (terminal) or solution (editor), and the starting point is not already solved.

const curriculum = bundledContent.curriculum("junior");
const lessons = curriculum.phases.flatMap((p) => p.units.flatMap((u) => u.lessons.map((l) => ({ unit: u.id, lesson: l.id }))));
const labs: Lab[] = lessons.flatMap((l) => bundledContent.labs("junior", l.unit, l.lesson));

describe("bundled content", () => {
  it("loads the curriculum and the pilot lesson", () => {
    expect(curriculum.phases.length).toBeGreaterThan(0);
    expect(bundledContent.tests("junior", "docker", "imagen-vs-contenedor")).toHaveLength(5);
    expect(bundledContent.tests("junior", "github", "repos-y-commits")).toHaveLength(0);
  });

  it("has labs", () => {
    expect(labs.length).toBeGreaterThanOrEqual(7);
  });

  it("labs match their lesson and number", () => {
    for (const l of lessons)
      bundledContent.labs("junior", l.unit, l.lesson).forEach((lab, i) => {
        expect(lab.unit).toBe(l.unit);
        expect(lab.lesson).toBe(l.lesson);
        expect(lab.lab).toBe(i + 1);
        expect(new Set(lab.objectives.map((o) => o.id)).size).toBe(lab.objectives.length);
      });
  });
});

describe.each(labs.filter((l): l is TerminalLab => l.kind === "terminal").map((l) => [l.title, l] as const))(
  "terminal lab %s",
  (_, lab) => {
    it("is solved by typing its hints in order", () => {
      let state = createDocker(lab.setup);
      let met = advanceTerminal(lab, state, []);
      expect(met).toHaveLength(0);
      for (const o of lab.objectives) {
        state = exec(state, o.hint).state;
        met = advanceTerminal(lab, state, met);
        expect(met.map((m) => m.id)).toContain(o.id);
      }
    });
  },
);

describe.each(labs.filter((l): l is EditorLab => l.kind === "editor").map((l) => [l.title, l] as const))("editor lab %s", (_, lab) => {
  it("the solution has no errors and meets every objective", () => {
    expect(analyzeWorkflow(lab.solution).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const achieved = new Set<string>();
    for (const o of lab.objectives) {
      if (o.check.type !== "run") continue;
      expect(EVENTS.map((e) => e.id)).toContain(o.check.event);
      const result = runWorkflow(lab.solution, o.check.event);
      expect(result, o.id).toBeDefined();
      runAchievements(lab, o.check.event, result!).forEach((id) => achieved.add(id));
    }
    const status = editorStatus(lab, lab.solution, achieved);
    lab.objectives.forEach((o, i) => expect(status[i], `${o.id}: ${o.text}`).toBe(true));
  });

  it("the starter is not solved", () => {
    const achieved = new Set<string>();
    for (const o of lab.objectives) {
      if (o.check.type !== "run") continue;
      const result = runWorkflow(lab.file.starter, o.check.event);
      if (result) runAchievements(lab, o.check.event, result).forEach((id) => achieved.add(id));
    }
    expect(editorStatus(lab, lab.file.starter, achieved).every(Boolean)).toBe(false);
  });
});
