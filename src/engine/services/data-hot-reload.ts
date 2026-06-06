// data-hot-reload.js
// Tier 3 TS port -> src/engine/services/data-hot-reload.ts (exports DataHotReload + installs window.CJS.DataHotReload). Body verbatim.
// Bridges DataStore mutations to active UI surfaces so devs can edit content
// (via the editor, an import, or the debug console) and see updates without
// reloading the page. The DataStore already broadcasts changes via subscribe;
// this module debounces and re-renders the right UIs.
//
// Targets (when present):
//   CJS.CombatUI.refresh()   — combat surfaces re-pull their data
//   CJS.CampaignUI.render()  — campaign view re-renders
//   CJS.DataBrowser.refresh()— editor browsers re-render
//   CJS.GMControls.refresh()
//
// Debouncing: bursts of changes during a manifest import or large paste are
// collapsed into a single re-render. Default 120 ms; configurable via init.
//
// Used by: src/entry-* (any page where DataStore + UI are loaded).

window.CJS = window.CJS || {};

export const DataHotReload = (() => {
  'use strict';

  let _unsub = null;
  let _timer = 0;
  let _delayMs = 120;
  let _pendingChanges = [];
  let _enabled = false;

  function init(options: any = {}) {
    if (_enabled) return;
    _delayMs = Number(options.delayMs || 120);
    const DS = window.CJS.DataStore;
    if (!DS?.subscribe) return;
    _unsub = DS.subscribe(_onChange);
    _enabled = true;
  }

  function _onChange(change) {
    _pendingChanges.push(change);
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(() => {
      const batch = _pendingChanges;
      _pendingChanges = [];
      _timer = 0;
      _broadcast(batch);
    }, _delayMs);
  }

  function _broadcast(batch) {
    if (!batch.length) return;
    // Each UI knows its own conditions for skipping a no-op refresh.
    try { window.CJS.CombatUI?.refresh?.(); } catch (e) { console.warn('HotReload combatUI failed', e); }
    try { window.CJS.CampaignUI?.render?.(); } catch (e) { console.warn('HotReload campaignUI failed', e); }
    try { window.CJS.DataBrowser?.refresh?.(); } catch (e) {}
    try { window.CJS.GMControls?.refresh?.(); } catch (e) {}

    // Notify listeners (debug console, perf hooks, etc.) about the batch.
    for (const l of [..._listeners]) {
      try { l(batch); } catch (e) {}
    }

    if (window.CJS.CONST?.DEBUG_HOT_RELOAD) {
      console.info(`[HotReload] applied ${batch.length} change(s)`);
    }
  }

  function dispose() {
    if (_unsub) { _unsub(); _unsub = null; }
    if (_timer) { clearTimeout(_timer); _timer = 0; }
    _enabled = false;
  }

  const _listeners = new Set<any>();

  function onBatch(fn) {
    if (typeof fn !== 'function') return () => {};
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  }

  return Object.freeze({ init, dispose, onBatch });
})();

window.CJS.DataHotReload = DataHotReload;

// Auto-init when the page loads. Pages can call CJS.DataHotReload.dispose()
// during teardown if they need to.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.CJS.DataHotReload.init());
  } else {
    window.CJS.DataHotReload.init();
  }
}

// Runtime compatibility install — identical to the legacy IIFE.
