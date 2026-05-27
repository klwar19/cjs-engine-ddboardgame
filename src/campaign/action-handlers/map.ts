// map.ts — Phase H.3 scenario-map interaction handlers.
//
// Ports the four map actions: walk to a connected node (opening any
// pending node-entry scene), step to a grid cell, switch the map layer,
// and GM-clear a node. Toast strings, the ScenarioRunner calls, the
// Number() cell coercion and the mutation sources mirror the deleted
// closures.

import { applyOp, cs, mod, toast } from "./context";

interface RunnerNode {
  exits?: Array<{ to?: string }>;
}
interface ScenarioRunnerModule {
  findCurrentNode?: () => RunnerNode | null | undefined;
  moveToNode?: (nodeId: string, link: unknown) => boolean;
  moveToCell?: (x: number, y: number) => boolean;
}
interface StoryScenesModule {
  openPendingNodeEntry?: () => void;
}

function runner(): ScenarioRunnerModule | undefined {
  return mod<ScenarioRunnerModule>("ScenarioRunner");
}

export function moveNode(nodeId: string): void {
  const r = runner();
  const current = r?.findCurrentNode?.();
  const link = (current?.exits || []).find((exit) => exit.to === nodeId) || null;
  const moved = r?.moveToNode?.(nodeId, link);
  if (!moved) toast("That node is not connected from here yet", "info");
  else mod<StoryScenesModule>("CampaignStoryScenes")?.openPendingNodeEntry?.();
}

export function moveCell(x: string | number | undefined, y: string | number | undefined): void {
  const moved = runner()?.moveToCell?.(Number(x), Number(y));
  if (!moved) toast("That cell is blocked or out of reach", "info");
}

export function setMapLayer(layer: string): void {
  if (!layer) return;
  cs().mutate((state) => {
    const run = state.activeScenarioRun as { mapLayer?: string } | undefined;
    if (run) run.mapLayer = layer;
  }, { source: "map_layer" });
}

interface MapCell {
  visited: Record<string, boolean>;
  revealed: Record<string, boolean>;
  locked: Record<string, boolean>;
  cleared: Record<string, boolean>;
  notes: Record<string, unknown>;
}

export function clearNode(nodeId: string): void {
  cs().mutate((state) => {
    const mapId = (state.activeScenarioRun as { mapId?: string } | undefined)?.mapId;
    if (!mapId) return;
    const mapState = state.mapState as Record<string, MapCell>;
    mapState[mapId] = mapState[mapId] || { visited: {}, revealed: {}, locked: {}, cleared: {}, notes: {} };
    mapState[mapId].cleared[nodeId] = true;
  }, { source: "map" });
  applyOp({ op: "log", text: `Node cleared: ${nodeId}.` }, "map");
}
