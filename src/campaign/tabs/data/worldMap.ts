// worldMap.ts — K.3 bridge for the World Activities tab. Calls into the
// sibling CampaignWorldMap module directly (the same module the World Map
// tab wrapper already reaches), keeping the activity / condition / cost
// logic where it lives. The travel-map SVG ports separately.

import type { CampaignStateSnapshot } from "../../store";
import type { CampaignActionName } from "../../actionNames";

// ── Travel map (worldMap tab) ──────────────────────────────────────
export interface TravelMapNode {
  readonly mapId: string;
  readonly nodeId: string;
  readonly classes: string;
  readonly innerSvg: string;
}

export interface TravelNodeButton {
  readonly action: CampaignActionName;
  readonly mapId: string;
  readonly nodeId: string;
  readonly entryId: string;
  readonly label: string;
  readonly primary: boolean;
  readonly disabled: boolean;
  readonly title: string;
}

export interface TravelLocationDetail {
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly isCurrent: boolean;
  readonly hasActivities: boolean;
  readonly activityPreviewNames: readonly string[];
  readonly mapId: string;
  readonly nodeId: string;
  readonly people: readonly TravelNodeButton[];
  readonly actions: readonly TravelNodeButton[];
}

export interface TravelAreaButton {
  readonly label: string;
  readonly sublabel: string;
  readonly active: boolean;
  readonly dev: boolean;
  readonly switchMapId: string | null;
  readonly title: string;
}

export interface TravelAreaSwitcher {
  readonly buttons: readonly TravelAreaButton[];
  readonly devNotes: ReadonlyArray<{ readonly label: string; readonly text: string }>;
}

interface TravelMapBase {
  readonly hasMap: true;
  readonly themeClass: string;
  readonly backdropVar: string;
  readonly title: string;
  readonly worldName: string;
  readonly currentLocationName: string;
  readonly progress: { readonly zone: string; readonly visited: number };
  readonly canvas: { readonly width: number; readonly height: number };
  readonly detail: TravelLocationDetail | null;
  readonly nodes: readonly TravelMapNode[];
}

export interface TravelMapClassic extends TravelMapBase {
  readonly mode: "classic";
  readonly linksHtml: string;
}

export interface TravelMapVisual extends TravelMapBase {
  readonly mode: "visual";
  readonly backdropImageHtml: string;
  readonly layersHtml: string;
  readonly roadsHtml: string;
  readonly legend: ReadonlyArray<{ readonly kind: string; readonly label: string }>;
  readonly areaSwitcher: TravelAreaSwitcher | null;
}

export type TravelMapData = TravelMapClassic | TravelMapVisual | { readonly hasMap: false };

export interface WorldPressure {
  readonly id: string;
  readonly title: string;
  readonly value: number;
}

export interface WorldActivityCard {
  readonly id: string;
  readonly title: string;
  readonly typePill: string;
  readonly summary: string;
  readonly rewardText: string;
  readonly costText: string;
  readonly ready: boolean;
  readonly buttonLabel: string;
  readonly disabledTitle: string;
}

export interface WorldActivityGroup {
  readonly type: string;
  readonly label: string;
  readonly activities: readonly WorldActivityCard[];
}

export interface WorldJournalEntry {
  readonly title: string;
  readonly sub: string;
  readonly text: string;
}

export interface WorldActivitiesData {
  readonly worldName: string;
  readonly locationName: string;
  readonly pressures: readonly WorldPressure[];
  readonly groups: readonly WorldActivityGroup[];
  readonly journal: readonly WorldJournalEntry[];
}

interface WorldMapModule {
  readonly getTravelMapData: (state?: CampaignStateSnapshot) => TravelMapData | null;
  readonly getActivitiesData: (state?: CampaignStateSnapshot) => WorldActivitiesData | null;
}

interface Cjs {
  readonly CampaignWorldMap?: WorldMapModule;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getTravelMapData(state: CampaignStateSnapshot): TravelMapData | null {
  return cjs().CampaignWorldMap?.getTravelMapData?.(state) ?? null;
}

export function getWorldActivitiesData(state: CampaignStateSnapshot): WorldActivitiesData | null {
  return cjs().CampaignWorldMap?.getActivitiesData?.(state) ?? null;
}
