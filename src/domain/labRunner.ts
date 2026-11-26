import type { EditorLab, TerminalLab } from "../content/types";
import { checkTerminal, type DockerState } from "../sim/docker";
import { analyzeWorkflow, EVENTS, simulateRun, type RunResult } from "../sim/workflow";
import { checkEditor, runMeets } from "./labChecks";

/** A met terminal objective and the history length at that moment. */
export interface MetObjective {
  id: string;
  at: number;
}

/**
 * Terminal labs go in order: only the next objective is checked, and a met objective stays
 * met. Several can be met by one command (`docker run` also pulls the image).
 */
export function advanceTerminal(lab: TerminalLab, state: DockerState, met: MetObjective[]): MetObjective[] {
  const next = [...met];
  while (next.length < lab.objectives.length) {
    const o = lab.objectives[next.length];
    const since = next.length ? next[next.length - 1].at : 0;
    if (!checkTerminal(state, o.check, since)) break;
    next.push({ id: o.id, at: state.history.length });
  }
  return next;
}

/** Runs the workflow text for an event; undefined when it has errors and cannot run. */
export function runWorkflow(text: string, eventId: string): RunResult | undefined {
  const a = analyzeWorkflow(text);
  const ev = EVENTS.find((e) => e.id === eventId);
  if (!a.workflow || !ev || a.diagnostics.some((d) => d.severity === "error")) return undefined;
  return simulateRun(a.workflow, ev);
}

/**
 * Editor objectives: text checks are live; run checks are met once a run for their event gave the
 * expected result (`achievedRuns` holds those objective ids).
 */
export function editorStatus(lab: EditorLab, text: string, achievedRuns: ReadonlySet<string>): boolean[] {
  return lab.objectives.map((o) => (o.check.type === "run" ? achievedRuns.has(o.id) : checkEditor(text, o.check)));
}

/** Objective ids a run satisfies. */
export function runAchievements(lab: EditorLab, eventId: string, result: RunResult): string[] {
  return lab.objectives
    .filter((o) => o.check.type === "run" && o.check.event === eventId && runMeets(result, o.check))
    .map((o) => o.id);
}
