// worldMap.ts — K.3 bridge for the World Activities tab. Calls into the
// sibling CampaignWorldMap module directly (the same module the World Map
// tab wrapper already reaches), keeping the activity / condition / cost
// logic where it lives. The travel-map SVG ports separately.

import type { CampaignStateSnapshot } from "../../store";
import type { CampaignActionName } from "../../actionNames";

// ── Travel map (worldMap tab) ──────────────────────────────────────
// The travel-map SVG geometry is delivered as typed primitive objects (not raw
// SVG strings): React renders each as a real <rect>/<path>/<circle>/… element in
// CampaignWorldMapTab.tsx, so there is no dangerouslySetInnerHTML and attributes
// diff on re-render. The engine (src/engine/campaign/campaign-world-map.ts)
// produces these via _markerShapes / _visualLayers / _visualRoads.
export type SvgPrim =
  | { readonly t: "rect"; readonly className?: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rx?: number }
  | { readonly t: "ellipse"; readonly className?: string; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number }
  | { readonly t: "line"; readonly className?: string; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
  | { readonly t: "polygon"; readonly className?: string; readonly points: string }
  | { readonly t: "polyline"; readonly className?: string; readonly points: string }
  | { readonly t: "text"; readonly className?: string; readonly x: number; readonly y: number; readonly textAnchor?: "start" | "middle" | "end" | "inherit"; readonly text: string }
  | { readonly t: "path"; readonly className?: string; readonly d: string }
  | { readonly t: "circle"; readonly className?: string; readonly cx: number; readonly cy: number; readonly r: number }
  | { readonly t: "image"; readonly className?: string; readonly href: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly preserveAspectRatio: string };

// A visual node = a marker group (scaled/faded shape primitives) plus two
// <foreignObject> HTML panels (the always-on label box and the hover preview).
export interface TravelMarker {
  readonly className: string;
  readonly transform?: string;
  readonly opacity?: number;
  readonly shapes: readonly SvgPrim[];
}

export interface TravelNodeLabel {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly transform?: string;
  readonly opacity?: number;
  readonly text: string;
}

export interface TravelNodePreview {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly name: string;
  readonly description: string;
  readonly activityText: string;
}

export interface TravelMapNodeVisual {
  readonly mapId: string;
  readonly nodeId: string;
  readonly classes: string;
  readonly marker: TravelMarker;
  readonly label: TravelNodeLabel;
  readonly preview: TravelNodePreview;
}

export interface TravelMapNodeClassic {
  readonly mapId: string;
  readonly nodeId: string;
  readonly classes: string;
  readonly circle: { readonly cx: number; readonly cy: number; readonly r: number };
  readonly label: { readonly x: number; readonly y: number; readonly text: string };
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
}

export interface TravelMapClassic extends TravelMapBase {
  readonly mode: "classic";
  readonly links: readonly SvgPrim[];
  readonly nodes: readonly TravelMapNodeClassic[];
}

export interface TravelMapVisual extends TravelMapBase {
  readonly mode: "visual";
  readonly backdrop: readonly SvgPrim[];
  readonly layers: readonly SvgPrim[];
  readonly roads: readonly SvgPrim[];
  readonly legend: ReadonlyArray<{ readonly kind: string; readonly label: string }>;
  readonly areaSwitcher: TravelAreaSwitcher | null;
  readonly nodes: readonly TravelMapNodeVisual[];
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
