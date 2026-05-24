// cui-tabs-registry.js — Tiny tab registry for Campaign UI.
//
// Tabs register themselves at module-load time. The campaign-ui shell's
// `_renderMain(state)` looks up the active tab in this registry; if a
// module has claimed it, the shell delegates rendering to that module.
// Tabs not in the registry stay on the shell's switch-case fallback so
// the migration can land tab-by-tab without breaking unmigrated screens.
//
// Each tab module receives a `helpers` object built fresh by the shell
// every render. That object exposes the closure-bound helpers the tab
// needs (member math, equipment loadout, persona pills, etc.) so tab
// modules never have to reach into campaign-ui.js's private state.

window.CJS = window.CJS || {};
window.CJS.CampaignUIInternal = window.CJS.CampaignUIInternal || {};

window.CJS.CampaignUIInternal.Tabs = (function () {
  'use strict';

  const _registry = new Map();

  function register(id, def) {
    if (!id || typeof id !== 'string') {
      throw new Error('CampaignUIInternal.Tabs.register: id required');
    }
    if (!def || typeof def.render !== 'function') {
      throw new Error(`CampaignUIInternal.Tabs.register(${id}): def.render required`);
    }
    _registry.set(id, Object.freeze({
      id,
      render: def.render,
      actions: def.actions || null
    }));
  }

  function has(id) {
    return _registry.has(id);
  }

  function get(id) {
    return _registry.get(id) || null;
  }

  function render(id, state, helpers) {
    const def = _registry.get(id);
    if (!def) return null;
    return def.render(state, helpers);
  }

  // Diagnostic — useful from devtools to see what tabs landed.
  function ids() {
    return Array.from(_registry.keys());
  }

  return Object.freeze({
    register,
    has,
    get,
    render,
    ids
  });
})();
