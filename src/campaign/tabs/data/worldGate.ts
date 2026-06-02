// worldGate.ts — Phase F bridge for the World Gate tab.
//
// Phase H.4 — `getWorldGateData` and its sub-helpers
// (`worldGateCardData`, `worldGateActionData`, `pressureStripChips`,
// `worldMenuDef`) ported inline. The `worldMenuDef` table is the single
// source of truth for per-world card text + default tab; the
// `travel-world-card` action handler in `action-handlers/travel.ts`
// imports it directly.

import { cssVarAssetUrl, label } from "../../util/cui-utils";
import { worldOptions } from "../../util/cui-options";
import { modeForTab } from "../../chrome-state";
import type { CampaignStateSnapshot } from "../../store";
import type { CampaignActionName } from "../../actionNames";

export interface WorldGatePressureChip {
  readonly id: string;
  readonly title: string;
  readonly value: number;
}

export interface WorldGateAction {
  readonly action: CampaignActionName;
  readonly label: string;
  readonly hint: string;
  readonly kind: string;
  readonly data: Readonly<Record<string, string>>;
}

export interface WorldGateCardEntry {
  readonly worldId: string;
  readonly title: string;
  readonly kicker: string;
  readonly summary: string;
  readonly features: readonly string[];
  readonly bannerImageUrl: string;
  readonly isCurrent: boolean;
  readonly status: string;
  readonly mapCount: number;
  readonly activitiesCount: number;
  readonly activityTypeLabels: readonly string[];
  readonly devNote: string;
  readonly primaryAction: WorldGateAction;
  readonly secondaryActions: readonly WorldGateAction[];
}

export interface WorldGateData {
  readonly currentWorldName: string;
  readonly pressures: readonly WorldGatePressureChip[];
  readonly cards: readonly WorldGateCardEntry[];
}

// ── World menu definitions ─────────────────────────────────────────
// Per-world card metadata + default tab / mode. Custom worlds fall
// back to the generic profile built from DataStore.
export interface WorldMenuDef {
  readonly title?: string;
  readonly kicker?: string;
  readonly summary?: string;
  readonly features?: readonly string[];
  readonly bannerImage?: string;
  readonly defaultMode?: string;
  readonly defaultTab?: string;
  readonly openLabel?: string;
  readonly openHint?: string;
  readonly enterLabel?: string;
  readonly enterHint?: string;
  readonly status?: string;
  readonly devNote?: string;
}

const WORLD_MENU_DEFS: Readonly<Record<string, WorldMenuDef>> = {
  earth: {
    title: "Earth",
    kicker: "Daily life / emotional anchor",
    summary:
      "Earth loads ordinary-life story scenes, the Zhonghai visual city map, hospital support item pumping, diary/recap memories, and social scenes.",
    features: ["Story", "VN city map", "Hospital", "Diaries"],
    bannerImage: "images/story-mode/earth/earth-theme.webp",
    defaultMode: "activities",
    defaultTab: "worldMap",
    openLabel: "Open Earth Map",
    enterLabel: "Enter Earth",
    devNote:
      "Future buttons can add Riverside, Research Block, and Old Town without changing the renderer."
  },
  haven: {
    title: "Haven",
    kicker: "Main fantasy campaign",
    summary:
      "Haven keeps the existing story, quests, Pocket Haven, and scenario/node-map flow. This does not use the new Earth/Zombie visual map style.",
    features: ["Main story", "Quests", "Pocket Haven", "Scenario maps"],
    defaultMode: "story",
    defaultTab: "storyHome",
    openLabel: "Open Haven Story",
    enterLabel: "Return to Haven"
  },
  zombie: {
    title: "Zombie World",
    kicker: "Scavenge / build pressure loop",
    summary:
      "Zombie world loads the Last Light visual ruined-city map, scavenging tasks, safehouse building, medical salvage, and future survival pressure events.",
    features: ["Story", "Ruined city map", "Scavenge", "Build"],
    bannerImage: "images/story-mode/zombie/zombie-bin-burnice-horizontal.webp",
    defaultMode: "activities",
    defaultTab: "worldMap",
    openLabel: "Open Zombie Map",
    enterLabel: "Enter Zombie World",
    devNote: "Future areas are already stubbed: Harbor Quarantine, Farm Belt, and Military Shelter."
  },
  bazaar: {
    title: "Bazaar",
    kicker: "Arena / auction testbed",
    summary:
      "Bazaar loads optional activity systems first: arena matches, auction lots, prize boards, and future economy experiments.",
    features: ["Arena", "Auction House", "Prize Board", "Rewards"],
    bannerImage: "images/story-mode/bazaar/bazaar-theme.webp",
    defaultMode: "activities",
    defaultTab: "worldMap",
    openLabel: "Open Bazaar",
    enterLabel: "Enter Bazaar",
    devNote: "Use Lantern Arena and Glass Gavel House as the first test locations."
  }
};

// ── Module surfaces ─────────────────────────────────────────────────
interface DataStoreSurface {
  readonly get?: (type: string, id: string) => { readonly displayName?: string } | null | undefined;
  readonly getAllAsArray?: (type: string) => readonly Record<string, unknown>[];
}

interface CampaignStateSurface {
  readonly getContent?: () => CampaignContent;
}

interface CampaignContent {
  readonly worlds?: Record<string, WorldRecord>;
}

interface WorldRecord {
  readonly displayName?: string;
  readonly tone?: string;
  readonly storyModeTheme?: { readonly bannerImage?: string; readonly backdrop?: string };
}

interface WorldGateCjs {
  readonly DataStore?: DataStoreSurface;
  readonly CampaignState?: CampaignStateSurface;
}

function cjs(): WorldGateCjs {
  return (window as unknown as { CJS?: WorldGateCjs }).CJS ?? {};
}

interface CampaignStateForWorldGate {
  readonly currentWorld?: string;
  readonly crossWorld?: { readonly pressures?: Record<string, { id?: string; title?: string; value?: number }> };
}

export function worldMenuDef(worldId: string): WorldMenuDef {
  const explicit = WORLD_MENU_DEFS[worldId];
  if (explicit) return explicit;
  return {
    title: cjs().DataStore?.get?.("worlds", worldId)?.displayName || worldId,
    kicker: "World content",
    summary:
      "Custom world content. Add a travel map, activity pack, or story sequence to expand this card.",
    features: ["Custom"],
    defaultMode: "story",
    defaultTab: "storyHome"
  };
}

interface WorldGateActionInput {
  readonly action: CampaignActionName;
  readonly label?: string;
  readonly hint?: string;
  readonly kind?: string;
  readonly data?: Record<string, string | number>;
}

function worldGateActionData(opts: WorldGateActionInput): WorldGateAction {
  return {
    action: opts.action,
    label: String(opts.label || ""),
    hint: String(opts.hint || ""),
    kind: String(opts.kind || ""),
    data: Object.freeze(
      Object.fromEntries(Object.entries(opts.data || {}).map(([k, v]) => [k, String(v)]))
    )
  };
}

function pressureStripChips(state: CampaignStateForWorldGate): readonly WorldGatePressureChip[] {
  const pressures = Object.values(state.crossWorld?.pressures || {});
  return pressures.slice(0, 3).map((p) => ({
    id: String(p.id || ""),
    title: String(p.title || p.id || ""),
    value: Number(p.value || 0)
  }));
}

interface WorldActivityPack {
  readonly world?: string;
  readonly activities?: readonly { readonly type?: string }[];
}

interface TravelMap {
  readonly world?: string;
}

function worldGateCardData(
  worldId: string,
  world: WorldRecord,
  state: CampaignStateForWorldGate
): WorldGateCardEntry {
  const def = worldMenuDef(worldId);
  const isCurrent = worldId === state.currentWorld;
  const bannerImage =
    def.bannerImage || world.storyModeTheme?.bannerImage || world.storyModeTheme?.backdrop || "";
  const bannerImageUrl = bannerImage ? String(cssVarAssetUrl(bannerImage) || bannerImage) : "";
  const ds = cjs().DataStore;
  const maps = (ds?.getAllAsArray?.("travelMaps") || []) as readonly TravelMap[];
  const mapCount = maps.filter((map) => map.world === worldId).length;
  const activityPacks = ((ds?.getAllAsArray?.("worldActivityPacks") || []) as readonly WorldActivityPack[])
    .filter((pack) => pack.world === worldId);
  const activities = activityPacks.flatMap((pack) => pack.activities || []);
  const activityTypes = Array.from(new Set(activities.map((activity) => activity.type || "activity"))).slice(0, 4);
  const status = isCurrent ? "Loaded" : def.status || "Available";
  const targetTab = def.defaultTab || (mapCount ? "worldMap" : "storyHome");
  const primary: WorldGateAction = isCurrent
    ? worldGateActionData({
        action: "open-world-content",
        label: def.openLabel || "Open Content",
        hint: def.openHint || "Open this world content",
        kind: "primary",
        data: { tab: targetTab, mode: def.defaultMode || modeForTab(targetTab) }
      })
    : worldGateActionData({
        action: "travel-world-card",
        label: def.enterLabel || `Enter ${world.displayName || worldId}`,
        hint: def.enterHint || "Switch world and load its content menu",
        kind: "primary",
        data: { worldId, targetTab }
      });
  const secondary: WorldGateAction[] = [];
  if (isCurrent) {
    if (mapCount) {
      secondary.push(
        worldGateActionData({
          action: "open-world-content",
          label: "Map Movement",
          hint: "Open this world travel map",
          data: { tab: "worldMap", mode: "activities" }
        })
      );
    }
    if (activities.length) {
      secondary.push(
        worldGateActionData({
          action: "open-world-content",
          label: "Activities",
          hint: "Open this world activities",
          data: { tab: "worldActivities", mode: "activities" }
        })
      );
    }
    if (worldId === "bazaar") {
      secondary.push(
        worldGateActionData({
          action: "open-world-content",
          label: "Arena / Auction",
          hint: "Open Bazaar activities",
          data: { tab: "worldActivities", mode: "activities" }
        })
      );
    }
  }
  return {
    worldId: String(worldId),
    title: String(def.title || world.displayName || worldId),
    kicker: String(def.kicker || world.tone || worldId),
    summary: String(def.summary || "World content placeholder."),
    features: Array.isArray(def.features) ? def.features.map(String) : [],
    bannerImageUrl,
    isCurrent,
    status: String(status),
    mapCount,
    activitiesCount: activities.length,
    activityTypeLabels: activityTypes.map((t) => label(t)),
    devNote: String(def.devNote || ""),
    primaryAction: primary,
    secondaryActions: secondary
  };
}

export function getWorldGateData(state: CampaignStateSnapshot): WorldGateData | null {
  if (!state) return null;
  const typed = state as CampaignStateForWorldGate;
  const worlds = cjs().CampaignState?.getContent?.()?.worlds || {};
  const options = worldOptions();
  const current = typed.currentWorld || "haven";
  return {
    currentWorldName: worlds[current]?.displayName || current,
    pressures: pressureStripChips(typed),
    cards: options.map((option) => {
      const worldId = String(option.value);
      return worldGateCardData(worldId, worlds[worldId] || {}, typed);
    })
  };
}
