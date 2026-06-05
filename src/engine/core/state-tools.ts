// state-tools.ts — Tier 3 TS port of js/core/state-tools.js (engine cluster:
// core). Small immutable-update helper for places that need read-only snapshots
// without changing DataStore.get() or other mutable legacy APIs.
//
// This module exports a typed `StateTools` API (so future TS consumers can
// import it directly) AND installs `window.CJS.StateTools` as a side effect, so
// the existing `window.CJS.*` consumers and the vanilla engine keep working
// unchanged. Vite bundles it via the side-effect import in each main.tsx; the
// Node test harnesses load it through tools/test/engine-source.cjs (which
// transpiles + sandbox-wraps it), so the same install runs there too.

export interface StateToolsApi {
  clone<T>(value: T): T;
  produce<T>(base: T, recipe: (draft: T) => T | void): T;
  deepFreeze<T>(value: T, seen?: WeakSet<object>): T;
  freezeDev<T>(value: T): T;
  isDevFreezeEnabled(): boolean;
}

// Deep-clone a value (structuredClone when available, JSON fallback).
function clone<T>(value: T): T {
  if (value === undefined) return undefined as T;
  if (value === null || typeof value !== "object") return value;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      /* fall through to JSON clone */
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

// Immer-style producer: returns a new value derived from `base` without mutating
// the original. `recipe` receives a deep clone; its return value (or the mutated
// draft, if it returns undefined) becomes the new value.
function produce<T>(base: T, recipe: (draft: T) => T | void): T {
  if (typeof recipe !== "function") return clone(base);
  const draft = clone(base);
  const result = recipe(draft);
  return result === undefined ? draft : (result as T);
}

// Recursively Object.freeze a value. No-op for primitives or already-seen objects.
function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (!value || typeof value !== "object" || seen.has(value as object)) return value;
  seen.add(value as object);
  Object.freeze(value);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key], seen);
  }
  return value;
}

interface DevFreezeWindow {
  CJS?: Record<string, unknown>;
  CJS_DEV_FREEZE?: boolean;
  localStorage?: { getItem(key: string): string | null };
  location?: { search?: string };
}

function devWindow(): DevFreezeWindow {
  return window as unknown as DevFreezeWindow;
}

function isDevFreezeEnabled(): boolean {
  try {
    const w = devWindow();
    if (w.CJS_DEV_FREEZE === true) return true;
    if (w.localStorage?.getItem("CJS_DEV_FREEZE") === "1") return true;
    if (w.location?.search && /(?:\?|&)cjsFreezeState=1(?:&|$)/.test(w.location.search)) return true;
  } catch {
    /* ignore (no window / blocked storage) */
  }
  return false;
}

// Freeze only when the dev-freeze flag is on; pass-through otherwise.
function freezeDev<T>(value: T): T {
  return isDevFreezeEnabled() ? deepFreeze(value) : value;
}

export const StateTools: StateToolsApi = Object.freeze({
  clone,
  produce,
  deepFreeze,
  freezeDev,
  isDevFreezeEnabled
});

// Runtime compatibility install — keep window.CJS.StateTools identical to the
// legacy IIFE so every existing consumer (and the vanilla engine) is unchanged.
const w = devWindow();
w.CJS = w.CJS || {};
(w.CJS as Record<string, unknown>).StateTools = StateTools;
