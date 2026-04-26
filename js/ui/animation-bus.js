// animation-bus.js
// Tiny pub/sub used by combat code to announce visual events
// (move, damage, ko, skill cast, turn start). Combat-ui subscribes.
//
// Combat code calls AnimationBus.emit(name, payload). It must never
// depend on a subscriber being attached — emit is fire-and-forget,
// and a thrown subscriber error never propagates.
//
// Reads: nothing
// Used by: combat-ui.js (subscribe), action-handler.js, damage-calc.js,
//          combat-manager.js (emit)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.AnimationBus = (() => {
  'use strict';

  const _subs = Object.create(null);  // { eventName: [fn, ...] }

  function on(eventName, fn) {
    if (!eventName || typeof fn !== 'function') return () => {};
    (_subs[eventName] = _subs[eventName] || []).push(fn);
    return () => off(eventName, fn);
  }

  function off(eventName, fn) {
    const list = _subs[eventName];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  function emit(eventName, payload) {
    const list = _subs[eventName];
    if (!list || !list.length) return;
    // Iterate over a copy so subscribers can unsubscribe during dispatch.
    for (const fn of list.slice()) {
      try { fn(payload); }
      catch (e) { console.error('AnimationBus subscriber error (' + eventName + '):', e); }
    }
  }

  function clearAll() {
    for (const k of Object.keys(_subs)) delete _subs[k];
  }

  return Object.freeze({ on, off, emit, clearAll });
})();
