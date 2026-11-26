import { useSyncExternalStore } from "react";
import { epochDay } from "../domain/rules";
import { emptyProgress, parseStored, type Progress } from "./progress";

const KEY = "pipelingo.progress.v1";

let current: Progress = parseStored(typeof localStorage === "undefined" ? null : localStorage.getItem(KEY));
const listeners = new Set<() => void>();

export const store = {
  get: () => current,
  set(next: Progress) {
    current = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Private mode or full storage: progress lives only for this visit.
    }
    listeners.forEach((l) => l());
  },
  update(fn: (p: Progress) => Progress) {
    store.set(fn(current));
  },
  reset() {
    store.set({ ...emptyProgress(), onboarded: current.onboarded });
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

// Another tab changed the progress.
if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      current = parseStored(e.newValue);
      listeners.forEach((l) => l());
    }
  });

export function useProgress(): Progress {
  return useSyncExternalStore(store.subscribe, store.get);
}

export const today = () => epochDay(new Date());
