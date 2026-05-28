// chrome-state.ts — Phase H.4 canonical owner of Campaign chrome state.
//
// Mode (story / quest / event / activities / world), the active Tab
// inside that mode, and the active side Panel (if any) used to be three
// closure-private `let` bindings in `js/campaign/campaign-ui.js`. This
// module owns them in TypeScript and exposes:
//   • plain getters / setters for vanilla JS callers (via
//     `window.CJS.CampaignChrome`),
//   • a `subscribe(listener)` API for both JS and TS consumers, and
//   • a React hook (`useChromeState`) for components.
//
// The legacy `CampaignUI.setActiveMode` / `setActiveTab` / `setActivePanel`
// (and their `Raw` variants) on `js/campaign/campaign-ui.js` are now thin
// delegates that write through here and call `render()` to keep the
// vanilla render orchestration (state-tick + drawer flash + farm bind)
// intact. The constants and world-UI profile lookups also moved here so
// there is exactly one source of truth.
//
// Future H.4 commits port the `get*Data` chrome builder (which still
// reads from `window.CJS.CampaignUI`) and the panel-defs lookup; once
// those land, campaign-ui.js will no longer reference chrome state at
// all and the JS bridge can be retired alongside the rest of H.4.

import { useEffect, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────
export type ChromeMode = string;
export type ChromeTab = string;
export type ChromePanel = string | null;

export interface ChromeStateSnapshot {
  readonly mode: ChromeMode;
  readonly tab: ChromeTab;
  readonly panel: ChromePanel;
}

export type ChromeListener = (snapshot: ChromeStateSnapshot) => void;

// `[id, label]` for tab buttons, `[id, label, icon]` for mode buttons.
export type ModeTuple = readonly [string, string, string];
export type TabTuple = readonly [string, string];

// ── Constants (single source of truth) ───────────────────────────────
// These were defined in campaign-ui.js's IIFE (APP_MODES, APP_MODE_TABS,
// APP_UTILITY_TABS, APP_TAB_TO_MODE). The vanilla file now reads them
// from this module via the `window.CJS.CampaignChrome` bridge so there
// is no chance of drift between the two languages.

export const APP_MODES: readonly ModeTuple[] = [
  ["world", "World", "WD"],
  ["story", "Story", "ST"],
  ["quest", "Quest", "QT"],
  ["event", "Event", "EV"],
  ["activities", "Activities", "AC"]
];

export const APP_MODE_TABS: Readonly<Record<string, readonly TabTuple[]>> = {
  world: [["worldGate", "World Gate"]],
  story: [
    ["storyHome", "Story"],
    ["storySummary", "Story Log"]
  ],
  quest: [
    ["questHome", "Quest"],
    ["quests", "Tracker"]
  ],
  event: [
    ["eventCharacter", "Character"],
    ["eventSpecial", "Special"],
    ["eventSide", "Side Stories"],
    ["eventLog", "Event Log"]
  ],
  activities: [
    ["worldMap", "World Map"],
    ["worldActivities", "World Activities"],
    ["sideForge", "Hub"],
    ["oracleForge", "Oracle / Manual"],
    ["farm", "Farm"],
    ["craft", "Forge"],
    ["cook", "Cook"],
    ["shops", "Shops & Rest"],
    ["inventory", "Inventory"],
    ["minigameTest", "Mini-Game Test"]
  ]
};

export const APP_UTILITY_TABS: readonly TabTuple[] = [
  ["maps", "Current Run"],
  ["roster", "Party"],
  ["relationships", "Relationships"],
  ["logs", "Logs"],
  ["settings", "Settings"]
];

const APP_TAB_TO_MODE: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  for (const [mode, tabs] of Object.entries(APP_MODE_TABS)) {
    for (const [id] of tabs) out[id] = mode;
  }
  return out;
})();

export function modeForTab(tab: string): string {
  return APP_TAB_TO_MODE[tab] || "story";
}

// ── World UI profile ────────────────────────────────────────────────
// Per-world override that hides modes, tabs, or panels and adjusts
// labels. Previously in `_worldUiProfile` in campaign-ui.js. The shape
// matches what `_normalizeActiveWorldUi` and the chrome data builder
// read — keep the keys in sync if the world tables grow.
export interface WorldUiProfile {
  readonly hiddenModes?: readonly string[];
  readonly hiddenTabs?: readonly string[];
  readonly hiddenPanels?: readonly string[];
  readonly defaultMode?: string;
  readonly defaultTab?: string;
  readonly modeLabels?: Readonly<Record<string, ModeTuple>>;
  readonly tabLabels?: Readonly<Record<string, string>>;
  readonly panelLabels?: Readonly<Record<string, { icon: string; label: string; title: string }>>;
  readonly modeDefaults?: Readonly<Record<string, string>>;
}

const WORLD_PROFILES: Readonly<Record<string, WorldUiProfile>> = {
  earth: {
    hiddenModes: ["quest"],
    hiddenPanels: ["quests"],
    hiddenTabs: ["sideForge", "oracleForge", "farm", "craft", "cook", "shops", "minigameTest"],
    defaultMode: "activities",
    defaultTab: "worldMap"
  },
  bazaar: {
    hiddenModes: ["quest"],
    hiddenPanels: ["quests"],
    hiddenTabs: ["sideForge", "oracleForge", "farm", "craft", "cook", "shops", "minigameTest"],
    defaultMode: "activities",
    defaultTab: "worldMap"
  },
  zombie: {
    hiddenTabs: ["sideForge", "oracleForge", "farm", "craft", "cook", "shops", "minigameTest"],
    modeLabels: {
      quest: ["quest", "Scavenge", "SC"]
    },
    tabLabels: {
      questHome: "Scavenge Board",
      quests: "Run Log"
    },
    panelLabels: {
      quests: { icon: "SC", label: "Scavenge", title: "Scavenge Log" }
    }
  },
  haven: {
    // Haven has no travel map, so the global worldMap-first default for
    // the activities mode shows a dead "No travel map for this world
    // yet" panel. Land on the Hub Pulse instead — it's the Living Hub
    // dashboard, which matches Pocket Haven's role.
    modeDefaults: { activities: "sideForge" }
  }
};

export function worldUiProfile(worldId: string | null | undefined): WorldUiProfile {
  return WORLD_PROFILES[worldId || "haven"] || {};
}

// Visible app modes for a world, applying the profile's modeLabels
// override and dropping any in `hiddenModes`.
export function appModesForWorld(worldId: string | null | undefined): readonly ModeTuple[] {
  const profile = worldUiProfile(worldId);
  const hidden = new Set(profile.hiddenModes || []);
  return APP_MODES
    .filter(([id]) => !hidden.has(id))
    .map((entry) => profile.modeLabels?.[entry[0]] || entry);
}

// Visible tabs for a mode, applying the profile's tabLabels override
// and dropping any in `hiddenTabs`.
export function tabsForMode(mode: string, worldId?: string | null): readonly TabTuple[] {
  const profile = worldUiProfile(worldId);
  const hiddenTabs = new Set(profile.hiddenTabs || []);
  return (APP_MODE_TABS[mode] || [])
    .filter(([id]) => !hiddenTabs.has(id))
    .map(([id, label]) => [id, profile.tabLabels?.[id] || label] as const);
}

// Default tab for a mode in a world: honours the per-world override
// `modeDefaults` first, falling back to the first visible tab.
export function defaultTabForMode(mode: string, worldId?: string | null): string | null {
  const profile = worldUiProfile(worldId);
  const tabs = tabsForMode(mode, worldId);
  const preferred = profile.modeDefaults?.[mode];
  if (preferred && tabs.some(([id]) => id === preferred)) return preferred;
  return tabs[0]?.[0] || null;
}

// ── Internal state + subscribe machinery ─────────────────────────────
const INITIAL: ChromeStateSnapshot = {
  mode: "story",
  tab: "storyHome",
  panel: null
};

let _state: ChromeStateSnapshot = INITIAL;
const _listeners = new Set<ChromeListener>();

function _emit(): void {
  for (const fn of _listeners) {
    try {
      fn(_state);
    } catch (err) {
      console.error("CampaignChrome listener threw:", err);
    }
  }
}

export function subscribe(listener: ChromeListener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

// ── Reads ────────────────────────────────────────────────────────────
export function getSnapshot(): ChromeStateSnapshot {
  return _state;
}
export function getActiveMode(): ChromeMode {
  return _state.mode;
}
export function getActiveTab(): ChromeTab {
  return _state.tab;
}
export function getActivePanel(): ChromePanel {
  return _state.panel;
}

// ── Writers ──────────────────────────────────────────────────────────
// setActiveMode: assign mode and (unless keepTab) derive a default tab
// for that mode using the world's profile. Mirrors campaign-ui.js's
// public `setActiveMode`. Does NOT call render() — callers do that (the
// vanilla wrapper, the React shell's bridge, or a future TS chrome
// re-renderer).
export function setActiveMode(
  mode: string,
  opts: { keepTab?: boolean; worldId?: string | null } = {}
): void {
  if (!mode) return;
  let nextTab = _state.tab;
  if (!opts.keepTab) {
    const next = defaultTabForMode(mode, opts.worldId);
    if (next) nextTab = next;
  }
  if (_state.mode === mode && _state.tab === nextTab) return;
  _state = { ..._state, mode, tab: nextTab };
  _emit();
}

// setActiveTab: assign tab and (unless keepMode) derive the owning mode
// from APP_TAB_TO_MODE so the mode bar follows the tab. Mirrors the
// public `setActiveTab` in campaign-ui.js.
export function setActiveTab(tab: string, opts: { keepMode?: boolean } = {}): void {
  if (!tab) return;
  const owningMode = APP_TAB_TO_MODE[tab];
  const nextMode = owningMode && !opts.keepMode ? owningMode : _state.mode;
  if (_state.mode === nextMode && _state.tab === tab) return;
  _state = { ..._state, mode: nextMode, tab };
  _emit();
}

// setActiveModeRaw / setActiveTabRaw: assign one dimension with no
// derivation and no event emission for the legacy `_goto` flow. The TS
// `nav.ts` action handlers (Phase H.3) call these followed by an
// explicit `render()` — same shape as the old closure-private `_goto`.
// We still emit so the React-only path picks up the change in case the
// caller forgets to render; vanilla render() is idempotent.
export function setActiveModeRaw(mode: string | null | undefined): void {
  if (!mode) return;
  if (_state.mode === mode) return;
  _state = { ..._state, mode };
  _emit();
}

export function setActiveTabRaw(tab: string | null | undefined): void {
  if (!tab) return;
  if (_state.tab === tab) return;
  _state = { ..._state, tab };
  _emit();
}

// setActivePanel: null clears; same id toggles closed; new id opens.
// Mirrors the public `setActivePanel` in campaign-ui.js (the React-bridge
// entry — `_openPanel` keeps its own DOM-side toggle for the vanilla
// drawer, but ends up calling setActivePanelRaw below for the state
// transition).
export function setActivePanel(panelId: string | null): void {
  let next: string | null;
  if (panelId == null) {
    next = null;
  } else {
    next = _state.panel === panelId ? null : panelId;
  }
  if (_state.panel === next) return;
  _state = { ..._state, panel: next };
  _emit();
}

// setActivePanelRaw: assign panel state without toggle semantics. The
// vanilla `_openPanel` already filters self-clicks; it just needs a
// state writer that doesn't second-guess it.
export function setActivePanelRaw(panelId: string | null): void {
  if (_state.panel === panelId) return;
  _state = { ..._state, panel: panelId };
  _emit();
}

// clearActivePanel: explicit clear (used when the world profile hides
// the active panel, or `_closePanel` exits the drawer).
export function clearActivePanel(): void {
  if (_state.panel == null) return;
  _state = { ..._state, panel: null };
  _emit();
}

// normalizeForWorld: re-snap mode/tab/panel to the allowed set for the
// current world. Called by campaign-ui.js's render() pre-pass (same
// place `_normalizeActiveWorldUi` ran). Mutates state at most once.
export function normalizeForWorld(worldId: string | null | undefined): void {
  const profile = worldUiProfile(worldId);
  const hiddenModes = new Set(profile.hiddenModes || []);
  const hiddenTabs = new Set(profile.hiddenTabs || []);
  const hiddenPanels = new Set(profile.hiddenPanels || []);
  const owner = APP_TAB_TO_MODE[_state.tab];
  let { mode, tab, panel } = _state;
  let dirty = false;
  if (hiddenModes.has(mode) || hiddenModes.has(owner) || hiddenTabs.has(tab)) {
    mode = profile.defaultMode || "activities";
    tab = profile.defaultTab || tabsForMode(mode, worldId)[0]?.[0] || "worldGate";
    dirty = true;
  }
  if (panel && hiddenPanels.has(panel)) {
    panel = null;
    dirty = true;
  }
  if (dirty) {
    _state = { mode, tab, panel };
    _emit();
  }
}

// ── React hook ────────────────────────────────────────────────────────
// Re-renders on every chrome-state change. Use in components that need
// any of mode/tab/panel directly; chrome data consumers should keep
// reading the full `ChromeData` snapshot via `getChromeData(state)`.
export function useChromeState(): ChromeStateSnapshot {
  const [snapshot, setSnapshot] = useState<ChromeStateSnapshot>(_state);
  useEffect(() => subscribe(setSnapshot), []);
  return snapshot;
}

// ── Window install (legacy JS bridge) ────────────────────────────────
// `js/campaign/campaign-ui.js` reads + writes chrome state through this
// surface during the H.4 transition. Once the file is deleted, this
// install can go away too (the React shell already imports the typed
// functions above directly).
export interface CampaignChromeBridge {
  readonly getSnapshot: typeof getSnapshot;
  readonly getActiveMode: typeof getActiveMode;
  readonly getActiveTab: typeof getActiveTab;
  readonly getActivePanel: typeof getActivePanel;
  readonly setActiveMode: typeof setActiveMode;
  readonly setActiveTab: typeof setActiveTab;
  readonly setActivePanel: typeof setActivePanel;
  readonly setActivePanelRaw: typeof setActivePanelRaw;
  readonly setActiveModeRaw: typeof setActiveModeRaw;
  readonly setActiveTabRaw: typeof setActiveTabRaw;
  readonly clearActivePanel: typeof clearActivePanel;
  readonly normalizeForWorld: typeof normalizeForWorld;
  readonly subscribe: typeof subscribe;
  readonly modeForTab: typeof modeForTab;
  readonly tabsForMode: typeof tabsForMode;
  readonly defaultTabForMode: typeof defaultTabForMode;
  readonly worldUiProfile: typeof worldUiProfile;
  readonly appModesForWorld: typeof appModesForWorld;
  readonly APP_MODES: typeof APP_MODES;
  readonly APP_MODE_TABS: typeof APP_MODE_TABS;
  readonly APP_UTILITY_TABS: typeof APP_UTILITY_TABS;
}

const BRIDGE: CampaignChromeBridge = Object.freeze({
  getSnapshot,
  getActiveMode,
  getActiveTab,
  getActivePanel,
  setActiveMode,
  setActiveTab,
  setActivePanel,
  setActivePanelRaw,
  setActiveModeRaw,
  setActiveTabRaw,
  clearActivePanel,
  normalizeForWorld,
  subscribe,
  modeForTab,
  tabsForMode,
  defaultTabForMode,
  worldUiProfile,
  appModesForWorld,
  APP_MODES,
  APP_MODE_TABS,
  APP_UTILITY_TABS
});

interface WindowCjs {
  CJS?: Record<string, unknown>;
}
const w = window as unknown as WindowCjs;
w.CJS = w.CJS || {};
(w.CJS as Record<string, unknown>).CampaignChrome = BRIDGE;
