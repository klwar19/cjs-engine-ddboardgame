// cui-world-map-tab.js — World Map / World Activities tab adapters.
//
// The actual map / activities rendering lives in
// `js/campaign/campaign-world-map.js` (CJS.CampaignWorldMap). The two
// tabs `worldMap` and `worldActivities` are already thin pass-throughs
// in the shell. Moving them through the tab registry just makes the
// boundary explicit and keeps `_renderMain` from carrying tab-specific
// branches that the registry should own.
//
// We keep a defensive "module not loaded" message so a partial deploy
// can't blow up the page — matches the prior shell behaviour.

window.CJS = window.CJS || {};
window.CJS.CampaignUIInternal = window.CJS.CampaignUIInternal || {};

window.CJS.CampaignUIInternal.WorldMapTab = (function () {
  'use strict';

  function _WM() { return window.CJS.CampaignWorldMap; }

  function renderTravelMap(state) {
    return _WM()?.renderTravelMap?.(state)
      || '<div class="campaign-panel">World map UI not loaded.</div>';
  }

  function renderActivities(state) {
    return _WM()?.renderActivities?.(state)
      || '<div class="campaign-panel">World activities UI not loaded.</div>';
  }

  function _registerTabs() {
    const Tabs = window.CJS.CampaignUIInternal.Tabs;
    if (!Tabs) return;
    Tabs.register('worldMap', {
      render: (state) => renderTravelMap(state)
    });
    Tabs.register('worldActivities', {
      render: (state) => renderActivities(state)
    });
  }
  _registerTabs();

  return Object.freeze({
    renderTravelMap,
    renderActivities
  });
})();
