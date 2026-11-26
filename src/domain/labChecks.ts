import { parse } from "yaml";
import type { EditorCheck } from "../content/types";
import type { RunResult } from "../sim/workflow";

// Objective checks for editor labs. Pure functions over the file text.

/**
 * Values at a dotted path. `*` matches any key or list item and `[n]` picks one item:
 * "jobs.*.steps[*].uses" → every `uses` of every step of every job.
 */
export function valuesAt(root: unknown, path: string): unknown[] {
  const parts = path
    .replace(/\[(\*|\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let current: unknown[] = [root];
  for (const part of parts) {
    const next: unknown[] = [];
    for (const v of current) {
      if (v === null || typeof v !== "object") continue;
      if (part === "*") next.push(...(Array.isArray(v) ? v : Object.values(v)));
      else if (Array.isArray(v)) {
        if (/^\d+$/.test(part) && Number(part) < v.length) next.push(v[Number(part)]);
      } else if (part in v) next.push((v as Record<string, unknown>)[part]);
    }
    current = next;
  }
  return current;
}

function containsValue(v: unknown, needle: string): boolean {
  if (Array.isArray(v)) return v.some((x) => String(x) === needle);
  if (v && typeof v === "object") return needle in v;
  return typeof v === "string" && v.includes(needle);
}

function safeParse(text: string): { ok: boolean; value: unknown } {
  try {
    return { ok: true, value: parse(text) };
  } catch {
    return { ok: false, value: undefined };
  }
}

export function checkEditor(text: string, check: EditorCheck): boolean {
  switch (check.type) {
    case "yaml_valid": {
      const r = safeParse(text);
      return r.ok && r.value !== null && typeof r.value === "object";
    }
    case "yaml_path": {
      const r = safeParse(text);
      if (!r.ok) return false;
      const vals = valuesAt(r.value, check.path).filter((v) => v !== undefined);
      if (check.exists === false) return vals.length === 0;
      if (!vals.length) return false;
      if (check.equals !== undefined) return vals.some((v) => String(v) === String(check.equals));
      if (check.contains !== undefined) return vals.some((v) => containsValue(v, check.contains!));
      if (check.matches !== undefined) {
        const re = new RegExp(check.matches);
        return vals.some((v) => typeof v !== "object" && re.test(String(v)));
      }
      return true;
    }
    case "regex":
      return new RegExp(check.pattern, check.flags ?? "m").test(text);
    case "not_regex":
      return !new RegExp(check.pattern, check.flags ?? "m").test(text);
    case "order": {
      const a = text.search(new RegExp(check.first, "m"));
      const b = text.search(new RegExp(check.then, "m"));
      return a >= 0 && b >= 0 && a < b;
    }
    case "run":
      return false; // needs a simulated run: see runMeets
  }
}

/** Whether a simulated run for `check.event` gives the expected result. */
export function runMeets(result: RunResult, check: Extract<EditorCheck, { type: "run" }>): boolean {
  switch (check.expect) {
    case "not_triggered":
      return !result.fires;
    case "success":
      return result.fires && result.jobs.length > 0 && result.jobs.every((j) => j.status === "success");
    case "job_skipped":
      return (
        result.fires &&
        result.jobs.some((j) => j.id === check.job && j.status === "skipped") &&
        result.jobs.every((j) => j.status !== "failure")
      );
  }
}
