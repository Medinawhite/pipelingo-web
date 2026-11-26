import { useMemo } from "react";
import { bundledContent, type ContentRepository } from "../content/repository";
import type { CurriculumPhase, CurriculumUnit } from "../content/types";
import { computeProgress, unitsBefore, type MapProgress, type UnitOutline } from "../domain/progression";
import { passedSet } from "../state/progress";
import { useProgress } from "../state/store";

export const content: ContentRepository = bundledContent;
export const LEVEL = "junior";

/** Unit id → word in the `$ git → docker → …` line. */
export const TECH: Record<string, string> = {
  github: "git",
  docker: "docker",
  actions: "actions",
  ghcr: "ghcr",
  helm: "helm",
  openshift: "oc",
};

export interface Journey {
  phases: CurriculumPhase[];
  units: CurriculumUnit[];
  outlines: UnitOutline[];
  /** Position of a lesson across the whole curriculum. */
  lessonIndex(unitId: string, lessonId: string): number;
  unit(unitId: string): CurriculumUnit | undefined;
}

function buildJourney(): Journey {
  const c = content.curriculum(LEVEL);
  const units = c.phases.flatMap((p) => p.units);
  const outlines = units.map((u) => ({
    id: u.id,
    lessons: u.lessons.map((l) => ({ id: l.id, hasContent: content.tests(LEVEL, u.id, l.id).length === 5 })),
  }));
  const index = new Map<string, number>();
  units.forEach((u) => u.lessons.forEach((l) => index.set(`${u.id}/${l.id}`, index.size)));
  return {
    phases: c.phases,
    units,
    outlines,
    lessonIndex: (u, l) => index.get(`${u}/${l}`) ?? -1,
    unit: (id) => units.find((u) => u.id === id),
  };
}

export const journey = buildJourney();

/**
 * Where the journey starts (VITE_START_UNIT, see .env). Earlier units count as passed; nothing is
 * written to the saved progress, so removing the setting restores the full path.
 */
export const START_UNIT: string | undefined = import.meta.env.VITE_START_UNIT || undefined;
const startSkipped = unitsBefore(journey.outlines, START_UNIT);

export function useMap(): MapProgress {
  const p = useProgress();
  return useMemo(
    () => computeProgress(journey.outlines, passedSet(p), new Set([...startSkipped, ...p.skippedUnits])),
    [p],
  );
}
