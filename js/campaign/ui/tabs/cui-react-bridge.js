// cui-react-bridge.js — Tab registry bridge for tabs that have migrated
// to React (Phase D). Each registered tab renders a stable mount-point
// div whose id the React shell then portals its tab component into.
//
// Vanilla campaign-ui still owns the outer shell HTML; React only owns
// the contents of the per-tab placeholder. After every vanilla render
// the shell dispatches a `campaign:rendered` event on the campaign-root,
// which the React side listens to so it can re-portal into the freshly
// created placeholder.
//
// Migration order: this file lists every tab that has moved to React.
// When a tab is added here, its vanilla `_renderXxx` helper in
// `campaign-ui.js` can be deleted (the registry entry wins in
// `_renderMain`).
//
// Reads: CampaignUIInternal.Tabs
// Used by: campaign-ui.js (via the Tabs registry lookup)

window.CJS = window.CJS || {};
window.CJS.CampaignUIInternal = window.CJS.CampaignUIInternal || {};

(function registerReactBridgeTabs() {
  'use strict';

  const Tabs = window.CJS.CampaignUIInternal?.Tabs;
  if (!Tabs || typeof Tabs.register !== 'function') {
    // Tabs registry hasn't loaded yet — the script-tag order in
    // campaign.html guarantees this loads after cui-tabs-registry.js, but
    // we stay defensive in case a stripped-down test loads us alone.
    console.warn('cui-react-bridge: CampaignUIInternal.Tabs missing — tabs not registered');
    return;
  }

  // Helper: stable mount-point markup. The id must match the one queried
  // from the matching React component.
  function mount(tabId) {
    return `<div class="campaign-react-tab-mount" data-react-tab="${tabId}" id="campaign-react-tab-${tabId}"></div>`;
  }

  Tabs.register('settings', {
    render: () => mount('settings')
  });

  Tabs.register('logs', {
    render: () => mount('logs')
  });

  // `roster` is also registered by `cui-party-tab.js` at module-load
  // time; this entry overwrites that registration (Map.set semantics)
  // so the React-side bridge wins. The PartyTab module remains loaded
  // — CampaignRosterTab.tsx calls into it to render each member's body
  // until the full per-card JSX port lands in a follow-up.
  Tabs.register('roster', {
    render: () => mount('roster')
  });

  // World Map + World Activities follow the same override pattern. The
  // CampaignWorldMap module produces both panels' inner HTML; the React
  // wrapper just owns the mount point so a future JSX port can swap
  // the SVG / activity-card body in place.
  Tabs.register('worldMap', {
    render: () => mount('worldMap')
  });

  Tabs.register('worldActivities', {
    render: () => mount('worldActivities')
  });
})();
