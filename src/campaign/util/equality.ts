// equality.ts — value-equality helpers for memoization + selector caching.
//
// Phase I foundation. The campaign engine deep-clones its entire state tree
// on every mutation (js/core/state-tools.js: `produce` → `clone` via
// structuredClone / JSON), so NO part of the state keeps a stable object
// identity across a change — even slices that didn't actually change come
// back as brand-new objects. Reference equality (`Object.is`) is therefore
// useless for deciding whether a derived slice is unchanged.
//
// These helpers compare by VALUE so `useCampaignSelector` (store.ts) and
// `memoDeep` (util/memo.ts) can keep a previous reference — and let a
// consumer bail out of re-rendering — when the data it actually reads is the
// same, even though its enclosing object is a fresh clone.
//
// Precondition: inputs are plain, acyclic, render-ready data (strings,
// numbers, booleans, null, arrays, plain objects) — the shape every
// `get*Data` bridge and chrome data builder returns. Functions, Maps, Sets,
// Dates, and cyclic graphs are out of scope (none appear in that data); a
// cyclic input would recurse without bound, so never feed raw engine state
// straight into `deepEqual` — feed the selected/derived slice.

/**
 * Shallow value equality: equal refs, or two objects with the same own keys
 * whose values are each `Object.is`. One level deep — nested objects/arrays
 * are compared by reference. Cheap; use it when the selected slice is flat
 * (primitive fields, or arrays/objects the producer keeps reference-stable).
 *
 * Generic over the two operands so it slots into `useCampaignSelector`'s
 * `isEqual: (a: T, b: T) => boolean` and `React.memo`'s comparator without an
 * explicit type argument at the call site; internally it treats them as the
 * `unknown` plain data the precondition guarantees.
 */
export function shallowEqual<T>(a: T, b: T): boolean {
  const x = a as unknown;
  const y = b as unknown;
  if (Object.is(x, y)) return true;
  if (
    typeof x !== "object" ||
    x === null ||
    typeof y !== "object" ||
    y === null
  ) {
    return false;
  }
  const ao = x as Record<string, unknown>;
  const bo = y as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!Object.is(ao[k], bo[k])) return false;
  }
  return true;
}

/**
 * Deep value equality for plain data. Recurses through arrays and plain
 * objects; primitives (and NaN / ±0) go through `Object.is`. Arrays only
 * equal arrays (an array is never equal to a non-array object). This is the
 * right tool for the deep-cloned `get*Data` / chrome slices, where the only
 * way to know a slice is unchanged is to compare its contents.
 *
 * Generic over the two operands for ergonomic inference (see `shallowEqual`).
 */
export function deepEqual<T>(a: T, b: T): boolean {
  return deepEqualUnknown(a as unknown, b as unknown);
}

function deepEqualUnknown(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  ) {
    // Object.is already settled primitives, NaN and ±0; anything reaching
    // here is two different references and at least one is a non-object.
    return false;
  }
  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr !== bIsArr) return false;
  if (aIsArr) {
    const aa = a as unknown[];
    const ba = b as unknown[];
    if (aa.length !== ba.length) return false;
    for (let i = 0; i < aa.length; i += 1) {
      if (!deepEqualUnknown(aa[i], ba[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!deepEqualUnknown(ao[k], bo[k])) return false;
  }
  return true;
}
