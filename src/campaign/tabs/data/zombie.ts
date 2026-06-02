// zombie.ts — Phase G.17 typed shapes for the zombie-world scavenge
// variants of Quest Home and the Quests tracker panel.
//
// Phase H.4 — the data builders (`getZombieScavengeHomeData`,
// `getZombieScavengeTrackerData`) move inline here, alongside the
// shared `worldActivitiesFor` / `worldActivityPreviewData` helpers the
// zombie panels need. Both builders read DataStore + CampaignState via
// the typed accessors from `src/campaign/action-handlers/context.ts`.

import { cssVarAssetUrl } from "../../util/cui-utils";
import { isQuestResolved, type QuestLike } from "../../util/state-helpers";
import { getQuestRowData, type QuestRowData, type QuestRowInput } from "./questRow";
import { worldThemeHomeBackdrop } from "./worldThemeAssets";

export interface WorldActivityPreview {
  readonly id: string;
  readonly kicker: string;
  readonly title: string;
  readonly summary: string;
  readonly rewardText: string;
}

export interface ZombiePressure {
  readonly id: string;
  readonly title: string;
  readonly value: number;
}

export interface ZombieScavengeHomeData {
  readonly scavengeCount: number;
  readonly buildCount: number;
  readonly pressureCount: number;
  readonly hasRun: boolean;
  readonly heroBackdropUrl: string | null;
  readonly scavenge: readonly WorldActivityPreview[];
  readonly build: readonly WorldActivityPreview[];
  readonly pressures: readonly ZombiePressure[];
}

export interface ZombieScavengeTrackerData {
  readonly activeCount: number;
  readonly finishedCount: number;
  readonly activities: readonly WorldActivityPreview[];
  readonly activeQuestRows: readonly QuestRowData[];
  readonly finishedQuestRows: readonly QuestRowData[];
}

// ── Module surfaces ─────────────────────────────────────────────────
interface DataStoreSurface {
  readonly getAllAsArray?: (type: string) => readonly WorldActivityPack[];
}

interface CampaignStateSurface {
  readonly getCurrentWorld?: () => CurrentWorld | null | undefined;
}

interface ZombieCjs {
  readonly DataStore?: DataStoreSurface;
  readonly CampaignState?: CampaignStateSurface;
}

function cjs(): ZombieCjs {
  return (window as unknown as { CJS?: ZombieCjs }).CJS ?? {};
}

interface CurrentWorld {
  readonly id?: string;
  readonly storyModeTheme?: {
    readonly id?: string;
    readonly homeBackdrop?: string;
    readonly bannerImage?: string;
    readonly backdrop?: string;
  };
}

interface WorldActivityPack {
  readonly world?: string;
  readonly activities?: readonly WorldActivity[];
}

export interface WorldActivity {
  readonly id?: string;
  readonly name?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly rewardText?: string;
  readonly type?: string;
  readonly [key: string]: unknown;
}

interface CrossWorldPressure {
  readonly id?: string;
  readonly title?: string;
  readonly value?: number;
}

interface ZombieStateShape {
  readonly activeScenarioRun?: unknown;
  readonly crossWorld?: { readonly pressures?: Record<string, CrossWorldPressure> };
  readonly quests?: Record<string, QuestRowInput & QuestLike & { readonly chainTemplateId?: string }>;
}

// `_worldActivitiesFor` — collects every authored world-activity pack
// for the given world id, flattening to the activity rows underneath.
export function worldActivitiesFor(worldId: string): readonly WorldActivity[] {
  const ds = cjs().DataStore;
  if (!ds?.getAllAsArray) return [];
  return ds
    .getAllAsArray("worldActivityPacks")
    .filter((pack) => pack.world === worldId)
    .flatMap((pack) => pack.activities || []);
}

// `_worldActivityPreviewData` — pure shape transform for the per-card
// preview blocks (scavenge / build) in the zombie tabs.
export function worldActivityPreviewData(
  activity: WorldActivity = {},
  kicker: string = "Activity"
): WorldActivityPreview {
  return {
    id: String(activity.id || activity.name || activity.title || ""),
    kicker: String(kicker),
    title: String(activity.title || activity.name || activity.id || ""),
    summary: String(activity.summary || activity.description || ""),
    rewardText: String(activity.rewardText || "No reward text yet.")
  };
}

// `_zombieScavengeHomeData` — Quest Home zombie variant data.
export function getZombieScavengeHomeData(state: ZombieStateShape): ZombieScavengeHomeData {
  const activities = worldActivitiesFor("zombie").filter((activity) => activity.type !== "journal");
  const scavenge = activities.filter((activity) => activity.type === "scavenge");
  const build = activities.filter((activity) => activity.type === "build");
  const pressures = Object.values(state.crossWorld?.pressures || {})
    .filter((pressure) => String(pressure.id || "").startsWith("zombie_"));
  const world = cjs().CampaignState?.getCurrentWorld?.() || {};
  const theme = world.storyModeTheme || {};
  const backdrop = worldThemeHomeBackdrop(world.id || theme.id || "", theme);
  return {
    scavengeCount: scavenge.length,
    buildCount: build.length,
    pressureCount: pressures.length,
    hasRun: !!state.activeScenarioRun,
    heroBackdropUrl: backdrop ? cssVarAssetUrl(backdrop) : null,
    scavenge: scavenge.map((activity) => worldActivityPreviewData(activity, "Scavenge route")),
    build: build.map((activity) => worldActivityPreviewData(activity, "Build project")),
    pressures: pressures.map((pressure) => ({
      id: String(pressure.id || ""),
      title: String(pressure.title || pressure.id || ""),
      value: Number(pressure.value || 0)
    }))
  };
}

// `_zombieScavengeTrackerData` — Quests panel zombie variant data.
export function getZombieScavengeTrackerData(state: ZombieStateShape): ZombieScavengeTrackerData {
  const quests = Object.values(state.quests || {});
  const active = quests.filter((q) => !q.chainTemplateId && !isQuestResolved(q));
  const finished = quests.filter((q) => !q.chainTemplateId && isQuestResolved(q));
  const activities = worldActivitiesFor("zombie").filter((activity) => activity.type !== "journal");
  return {
    activeCount: active.length,
    finishedCount: finished.length,
    activities: activities.map((activity) =>
      worldActivityPreviewData(activity, activity.type === "build" ? "Build project" : "Scavenge route")
    ),
    activeQuestRows: active.map((quest) => getQuestRowData(quest)),
    finishedQuestRows: finished.map((quest) => getQuestRowData(quest, { resolved: true }))
  };
}
