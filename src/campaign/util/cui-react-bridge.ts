// cui-react-bridge.ts — Phase H.4 TypeScript port of the React tab bridge.
//
// Registers a placeholder `<div>` mount point in
// `window.CJS.CampaignUIInternal.Tabs` for every tab that has migrated
// to React. Vanilla campaign-ui's `_renderMain(state)` (the React-shell
// fallback path) looks up the active tab here; if the React mount is
// registered, the body renders as the placeholder div and React owns
// what shows up inside it.
//
// Migration order: when a tab moves to React, add its id to the list
// below and the corresponding `_renderXxx` helper in campaign-ui.js can
// be deleted. Today every tab is React-owned, so this file is also the
// single source of truth for the registry's tab list.

import { register, has } from "./cui-tabs-registry";

// Stable mount-point markup. The id must match the one queried by the
// matching React component (see `CampaignShell.tsx`'s
// `REACT_TAB_COMPONENTS`).
function mount(tabId: string): string {
  return `<div class="campaign-react-tab-mount" data-react-tab="${tabId}" id="campaign-react-tab-${tabId}"></div>`;
}

// Master list of React-owned tab ids. The same list lives in
// `CampaignShell.tsx::REACT_TAB_COMPONENTS`; the shell-bridge test
// asserts both stay in sync. When a tab is added or removed, update
// both files in the same commit.
const REACT_TABS: readonly string[] = [
  "settings",
  "logs",
  // Roster is fully React-owned. The small PartyTab compatibility
  // namespace now only exposes picker/member-math helpers for older
  // bridge-style callers.
  "roster",
  // World Map + World Activities follow the same override pattern.
  // CampaignWorldMap produces both panels' inner HTML; the React
  // wrapper owns the mount point so a future JSX port can swap the
  // SVG / activity-card body in place.
  "worldMap",
  "worldActivities",
  // Hub-family tabs: cui-hub-tab.js registers each of these with a
  // vanilla string renderer; the React bridge takes over the
  // placeholder so the hub-family migration can happen tab-by-tab
  // from JSX side.
  "sideForge",
  "questChains",
  "oracleForge",
  "battleSets",
  "mapSeeds",
  // External-module tabs: vanilla campaign-ui shell used to switch-case
  // these into CampaignInventory / CampaignEconomy / PocketHaven /
  // RelationshipsTab. The matching React wrappers in
  // `src/campaign/tabs/CampaignExternalTabs.tsx` call into those same
  // modules, so the data-campaign-action wiring inside is unchanged.
  "inventory",
  "shops",
  "craft",
  "cook",
  "farm",
  "relationships",
  // Closure-private vanilla renderers that became React-owned in
  // Phase F. The placeholder mounts the matching component in
  // CampaignShell.tsx's REACT_TAB_COMPONENTS map.
  "worldGate",
  "storyHome",
  "storySummary",
  "storyDirector",
  "questHome",
  "quests",
  "eventHome",
  "eventCharacter",
  "eventSpecial",
  "eventSide",
  "eventLog",
  "scenarios",
  "maps",
  "minigameTest",
  "overview"
];

// Defensive guard — the registry must already be installed by
// `cui-tabs-registry.ts` (imported into main.tsx above this module).
if (typeof register !== "function") {
  console.warn("cui-react-bridge: Tabs registry missing — tabs not registered");
} else {
  for (const id of REACT_TABS) {
    register(id, { render: () => mount(id) });
  }
}

// Re-export the list so tests / the shell can cross-check registrations
// without grepping comments. Don't export `register` again — consumers
// should import that from `./cui-tabs-registry`.
export { REACT_TABS };
// Mark `has` as used so the import isn't tree-shaken if a callsite wants
// to query before registering during dev. (No runtime cost.)
void has;
