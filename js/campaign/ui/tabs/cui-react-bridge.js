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

  // Hub-family tabs: cui-hub-tab.js registers each of these with a
  // vanilla string renderer; the React bridge takes over the placeholder
  // so the hub-family migration can happen tab-by-tab from JSX side.
  Tabs.register('sideForge', {
    render: () => mount('sideForge')
  });
  Tabs.register('questChains', {
    render: () => mount('questChains')
  });
  Tabs.register('oracleForge', {
    render: () => mount('oracleForge')
  });
  Tabs.register('battleSets', {
    render: () => mount('battleSets')
  });
  Tabs.register('mapSeeds', {
    render: () => mount('mapSeeds')
  });

  // External-module tabs: vanilla campaign-ui shell used to switch-case
  // these into CampaignInventory / CampaignEconomy / PocketHaven /
  // RelationshipsTab. The matching React wrappers in
  // `src/campaign/tabs/CampaignExternalTabs.tsx` call into those same
  // modules, so the data-campaign-action wiring inside is unchanged.
  Tabs.register('inventory', {
    render: () => mount('inventory')
  });
  Tabs.register('shops', {
    render: () => mount('shops')
  });
  Tabs.register('craft', {
    render: () => mount('craft')
  });
  Tabs.register('cook', {
    render: () => mount('cook')
  });
  Tabs.register('farm', {
    render: () => mount('farm')
  });
  Tabs.register('relationships', {
    render: () => mount('relationships')
  });

  // Closure-private vanilla renderers: these tabs are still implemented
  // as `_render*` closures inside campaign-ui.js. `CampaignUI.renderTabBody`
  // exposes them for the React wrappers in
  // `src/campaign/tabs/CampaignVanillaTabs.tsx`. A future commit can
  // promote each renderer out of the campaign-ui closure into its own
  // TypeScript port without touching the bridge.
  const VANILLA_BRIDGE_TABS = [
    'worldGate', 'storyHome', 'storySummary', 'storyDirector',
    'questHome', 'quests',
    'eventHome', 'eventCharacter', 'eventSpecial', 'eventSide', 'eventLog',
    'scenarios', 'maps', 'minigameTest', 'overview'
  ];
  for (const id of VANILLA_BRIDGE_TABS) {
    Tabs.register(id, { render: () => mount(id) });
  }
})();
