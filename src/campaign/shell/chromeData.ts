// chromeData.ts — Phase H.4 typed chrome data builder.
//
// Replaces the closure-private `getChromeData` + the five
// `_chrome*Data` helpers in campaign-ui.js. Reads the active mode/tab/
// panel from the TS chrome-state slice, world events from the
// CampaignWorldEvents module, and panel definitions from the local
// PANEL_DEFS table (the world profile's `hiddenPanels` + `panelLabels`
// overrides come through `worldUiProfile`).

import { logKind, logMeta, type LogLine } from "../util/cui-log";
import {
  APP_UTILITY_TABS,
  getActiveMode,
  getActiveTab,
  getActivePanel,
  tabsForMode,
  appModesForWorld,
  worldUiProfile
} from "../chrome-state";
import type { CampaignStateSnapshot } from "../store";
import type {
  ChromeData,
  HeaderData,
  ModeBarData,
  RecentLogData,
  CommandRailData,
  CurrencyAmounts,
  ScenarioHudData,
  WorldEventChip,
  RailPanel
} from "./types";

// ── Panel definitions (the drawer/rail catalog) ────────────────────
interface PanelDef {
  readonly icon: string;
  readonly label: string;
  readonly title: string;
}

const PANEL_DEFS: Readonly<Record<string, PanelDef>> = {
  party: { icon: "👥", label: "Party", title: "Party" },
  inventory: { icon: "📦", label: "Items", title: "Inventory" },
  quests: { icon: "📜", label: "Quests", title: "Quest Log" },
  log: { icon: "🪶", label: "Log", title: "Campaign Log" },
  notes: { icon: "📝", label: "Notes", title: "Pinned Notes" }
};

const RAIL_ORDER: readonly string[] = ["party", "inventory", "quests", "log", "notes"];

export function panelDefsForState(state: CampaignStateSnapshot): Readonly<Record<string, PanelDef>> {
  const world = (state as { currentWorld?: string } | null | undefined)?.currentWorld;
  const profile = worldUiProfile(world);
  const hidden = new Set(profile.hiddenPanels || []);
  const out: Record<string, PanelDef> = {};
  for (const [id, def] of Object.entries(PANEL_DEFS)) {
    if (hidden.has(id)) continue;
    out[id] = { ...def, ...(profile.panelLabels?.[id] || {}) };
  }
  return out;
}

export function panelOrder(): readonly string[] {
  return RAIL_ORDER.slice();
}

// ── Module surfaces ─────────────────────────────────────────────────
interface CampaignRecord {
  readonly name?: string;
}

interface WorldRecord {
  readonly displayName?: string;
}

interface CampaignStateSurface {
  readonly getCurrentCampaign?: () => CampaignRecord | null | undefined;
  readonly getCurrentWorld?: () => WorldRecord | null | undefined;
}

interface WorldEventRecord {
  readonly id?: string;
  readonly name?: string;
  readonly icon?: string;
  readonly summary?: string;
  readonly category?: string;
  readonly remainingPhases?: number;
}

interface CampaignWorldEventsSurface {
  readonly getActive?: () => readonly WorldEventRecord[];
}

interface ChromeCjs {
  readonly CampaignState?: CampaignStateSurface;
  readonly CampaignWorldEvents?: CampaignWorldEventsSurface;
}

function cjs(): ChromeCjs {
  return (window as unknown as { CJS?: ChromeCjs }).CJS ?? {};
}

// ── State shape ─────────────────────────────────────────────────────
interface ChromeStateInput {
  readonly currentWorld?: string;
  readonly phase?: { number?: number; type?: string; name?: string };
  readonly storyMode?: { currentChapterLabel?: string };
  readonly currentChapter?: number | string;
  readonly currencies?: Readonly<Record<string, number>>;
  readonly activeScenarioRun?: ActiveRunInput | null;
  readonly log?: readonly LogLine[];
  readonly party?: Record<string, unknown>;
  readonly inventory?: Readonly<Record<string, Record<string, number>>>;
  readonly quests?: Record<string, { status?: string }>;
  readonly pinnedNotes?: readonly unknown[];
}

interface ActiveRunInput {
  readonly scenarioId?: string;
  readonly danger?: number;
  readonly dangerMax?: number;
  readonly usedCampRests?: number;
  readonly randomBattlesUsed?: number;
  readonly limits?: { campRests?: number; randomBattles?: number; events?: number };
}

// ── Currency amounts ───────────────────────────────────────────────
function currencyAmounts(state: ChromeStateInput): CurrencyAmounts {
  const currencies = state.currencies || {};
  const worldGold = `${state.currentWorld || "haven"}_gold`;
  let goldId: string | undefined;
  if (currencies[worldGold] != null) {
    goldId = worldGold;
  } else {
    goldId = Object.keys(currencies).find(
      (id) => String(id).toLowerCase().endsWith("_gold") || String(id).toLowerCase() === "gold"
    );
  }
  return {
    gold: goldId ? Number(currencies[goldId] || 0) : 0,
    jp: Number(currencies.jp ?? currencies.jester_points ?? 0)
  };
}

// ── Chrome sub-builders ────────────────────────────────────────────
function chromeHeaderData(state: ChromeStateInput): HeaderData {
  const c = cjs();
  const campaign = c.CampaignState?.getCurrentCampaign?.() || {};
  const world = c.CampaignState?.getCurrentWorld?.() || {};
  const phase = state.phase || { number: 1, type: "unknown", name: "" };
  const events = c.CampaignWorldEvents?.getActive?.() || [];
  const worldEvents: WorldEventChip[] = events.map((ev) => ({
    id: String(ev.id || ""),
    name: ev.name || ev.id || "",
    icon: ev.icon || "✨",
    summary: ev.summary || "",
    category: ev.category || "boon",
    remainingPhases: Number(ev.remainingPhases ?? 0)
  }));
  return {
    campaignName: campaign.name || "Campaign",
    worldName: world.displayName || state.currentWorld || "",
    chapter: state.storyMode?.currentChapterLabel || state.currentChapter || 1,
    phaseNumber: phase.number || 1,
    phaseLabel: phase.name || phase.type || "",
    worldEvents,
    currencies: currencyAmounts(state)
  };
}

function chromeScenarioHudData(state: ChromeStateInput): ScenarioHudData | null {
  const run = state.activeScenarioRun;
  if (!run) return null;
  const c = cjs();
  // Scenario record (for the name + generated flag) comes from the
  // typed CampaignState bridge — we duck-type rather than importing
  // the full CampaignState surface here.
  const stateModule = c.CampaignState as
    | (CampaignStateSurface & { getScenarioById?: (id: string) => { name?: string; generated?: boolean } | null | undefined })
    | undefined;
  const scenario = run.scenarioId ? stateModule?.getScenarioById?.(run.scenarioId) : null;
  return {
    scenarioName: scenario?.name || run.scenarioId || "",
    danger: run.danger ?? 0,
    dangerMax: run.dangerMax ?? 0,
    campsUsed: run.usedCampRests ?? 0,
    campsMax: run.limits?.campRests ?? 0,
    battlesUsed: run.randomBattlesUsed ?? 0,
    battlesMax: run.limits?.randomBattles ?? 0,
    generated: !!scenario?.generated
  };
}

function chromeModeBarData(state: ChromeStateInput, isUtility: boolean): ModeBarData {
  const modes = appModesForWorld(state.currentWorld).map(([id, label, icon]) => ({ id, label, icon }));
  const utilityTabs = APP_UTILITY_TABS.map(([id, label]) => ({ id, label }));
  return {
    modes,
    activeMode: isUtility ? null : getActiveMode(),
    utilityTabs,
    activeTab: getActiveTab(),
    scenarioHud: chromeScenarioHudData(state)
  };
}

function chromeRecentLogData(state: ChromeStateInput): RecentLogData {
  const lines = state.log || [];
  const entries = lines.slice(0, 3).map((line) => ({
    kind: logKind(line),
    text: line.text || "",
    meta: logMeta(line, true)
  }));
  return {
    entries,
    hasLog: lines.length > 0
  };
}

function chromeCommandRailData(state: ChromeStateInput): CommandRailData {
  const panelDefs = panelDefsForState(state as CampaignStateSnapshot);
  const activeQuests = Object.values(state.quests || {}).filter((q) => q.status === "active").length;
  const logCount = (state.log || []).length;
  const notesCount = (state.pinnedNotes || []).length;
  const inventoryCount = (["items", "materials", "food", "questItems"] as const).reduce(
    (sum, bucket) => sum + Object.values(state.inventory?.[bucket] || {}).filter((q) => q > 0).length,
    0
  );
  const partyCount = Object.keys(state.party || {}).length;
  const counts: Readonly<Record<string, number>> = {
    party: partyCount,
    inventory: inventoryCount,
    quests: activeQuests,
    log: logCount,
    notes: notesCount
  };
  const panels: RailPanel[] = RAIL_ORDER.filter((id) => panelDefs[id]).map((id) => {
    const def = panelDefs[id]!;
    return {
      id,
      icon: def.icon,
      label: def.label,
      title: def.title,
      count: counts[id] || 0
    };
  });
  return {
    panels,
    activePanel: getActivePanel(),
    currency: currencyAmounts(state)
  };
}

// ── Public entry ───────────────────────────────────────────────────
export function getChromeData(state: CampaignStateSnapshot): ChromeData | null {
  if (!state) return null;
  const typed = state as ChromeStateInput;
  const activeMode = getActiveMode();
  const activeTab = getActiveTab();
  const activePanel = getActivePanel();
  const isUtility = APP_UTILITY_TABS.some(([id]) => id === activeTab);
  const subTabsRaw = isUtility ? APP_UTILITY_TABS : tabsForMode(activeMode, typed.currentWorld);
  return {
    activeMode,
    activeTab,
    activePanel,
    isUtility,
    header: chromeHeaderData(typed),
    modeBar: chromeModeBarData(typed, isUtility),
    subTabs: subTabsRaw.map(([id, label]) => ({ id, label })),
    recentLog: chromeRecentLogData(typed),
    commandRail: chromeCommandRailData(typed)
  };
}
