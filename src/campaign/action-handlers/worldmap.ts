// worldmap.ts — Phase H.3 world-map delegation handler.
//
// The travel-map / world-activity actions (world-map-travel,
// world-map-switch-map, world-map-interaction, world-map-node-action,
// world-activity-use) all forwarded the full dataset to
// CampaignWorldMap.handleAction. That module owns the travel/activity
// state; this just hands the payload across unchanged.

import { mod } from "./context";

type WorldMapPayload = Record<string, string | number | undefined>;

interface WorldMapModule {
  handleAction?: (data: WorldMapPayload) => void;
}

export function worldMapAction(data: WorldMapPayload): void {
  mod<WorldMapModule>("CampaignWorldMap")?.handleAction?.(data);
}
