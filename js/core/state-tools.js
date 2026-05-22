// state-tools.js
// Small immutable-update helper for places that need read-only snapshots without
// changing DataStore.get() or other mutable legacy APIs.

window.CJS = window.CJS || {};

window.CJS.StateTools = (() => {
  'use strict';

  function clone(value) {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== 'object') return value;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (error) {}
    }
    return JSON.parse(JSON.stringify(value));
  }

  function produce(base, recipe) {
    if (typeof recipe !== 'function') return clone(base);
    const draft = clone(base);
    const result = recipe(draft);
    return result === undefined ? draft : result;
  }

  function deepFreeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze(value[key], seen);
    }
    return value;
  }

  function isDevFreezeEnabled() {
    try {
      if (window.CJS_DEV_FREEZE === true) return true;
      if (window.localStorage?.getItem('CJS_DEV_FREEZE') === '1') return true;
      if (window.location?.search && /(?:\?|&)cjsFreezeState=1(?:&|$)/.test(window.location.search)) return true;
    } catch (error) {}
    return false;
  }

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
