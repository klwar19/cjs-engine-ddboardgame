// state-tools.js
// Small immutable-update helper for places that need read-only snapshots without
// changing DataStore.get() or other mutable legacy APIs.

window.CJS = window.CJS || {};

window.CJS.StateTools = (() => {
  'use strict';

  /**
   * Deep-clone a value (structuredClone when available, JSON fallback).
   * @template T
   * @param {T} value
   * @returns {T}
   */
  function clone(value) {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== 'object') return value;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (error) {}
    }
    return JSON.parse(JSON.stringify(value));
  }

  /**
   * Immer-style producer: returns a new value derived from `base` without
   * mutating the original. `recipe` receives a deep clone; its return value
   * (or the mutated draft, if it returns undefined) becomes the new value.
   * @template T
   * @param {T} base
   * @param {(draft: T) => T | void} recipe
   * @returns {T}
   */
  function produce(base, recipe) {
    if (typeof recipe !== 'function') return clone(base);
    const draft = clone(base);
    const result = recipe(draft);
    return result === undefined ? draft : result;
  }

  /**
   * Recursively Object.freeze a value. No-op for primitives or already-seen objects.
   * @template T
   * @param {T} value
   * @param {WeakSet<object>} [seen]
   * @returns {T}
   */
  function deepFreeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze(value[key], seen);
    }
    return value;
  }

  /** @returns {boolean} */
  function isDevFreezeEnabled() {
    try {
      if (window.CJS_DEV_FREEZE === true) return true;
      if (window.localStorage?.getItem('CJS_DEV_FREEZE') === '1') return true;
      if (window.location?.search && /(?:\?|&)cjsFreezeState=1(?:&|$)/.test(window.location.search)) return true;
    } catch (error) {}
    return false;
  }

  /**
   * Freeze only when the dev-freeze flag is on; pass-through otherwise.
   * @template T
   * @param {T} value
   * @returns {T}
   */
  function freezeDev(value) {
    return isDevFreezeEnabled() ? deepFreeze(value) : value;
  }

  return Object.freeze({
    clone,
    produce,
    deepFreeze,
    freezeDev,
    isDevFreezeEnabled
  });
})();
