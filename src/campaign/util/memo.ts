import { memo } from "react";
import type { ComponentType } from "react";
import { deepEqual } from "./equality";

// memoDeep — wrap a pure presentational component so it re-renders only when
// its props change by VALUE.
//
// Phase I.1. Plain `React.memo` compares props with `Object.is` per key, which
// never helps here: the campaign state is deep-cloned on every mutation, so a
// parent that builds prop objects from a `get*Data(state)` slice hands its
// children fresh references every render even when the underlying values are
// identical. A deep value comparison is what actually lets these components
// bail out.
//
// Use it for components whose props are SMALL, plain, derived data (the chrome
// strips' typed slices, per-row list-item data). Do NOT use it for components
// that take the whole `state` and derive internally — deep-comparing the full
// state tree every render is pure cost (something always changed) and would
// risk recursing a large structure. Those isolate via `useCampaignSelector`
// instead.
export function memoDeep<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  const Memoized = memo(Component, (prev, next) => deepEqual(prev, next));
  Memoized.displayName = `memoDeep(${Component.displayName || Component.name || "Component"})`;
  return Memoized as unknown as ComponentType<P>;
}
