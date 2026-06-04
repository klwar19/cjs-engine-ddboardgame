// farm.ts — Phase H.3 farm / Pocket Haven action handlers.
//
// farm-tick is a CampaignOps call; the rest delegate to the FarmingMode
// module (movement, tile interaction, the harvest QTE) or to PocketHaven
// (plot harvest, fishing) exactly as the deleted switch cases did. The
// x/y/dir/tool values are passed through unchanged — FarmingMode reads
// the same loosely-typed dataset values the bubbling delegate fed it.

import { applyOp, mod } from "./context";
import { ensureMinigameEngine } from "../lazy-minigames";

type Coord = string | number | undefined;

interface FarmingModeModule {
  move?: (dir: Coord) => void;
  interact?: () => void;
  faceOrUseTile?: (x: Coord, y: Coord) => void;
  selectTool?: (tool: Coord) => void;
  tileAction?: (action: Coord, x: Coord, y: Coord) => void;
  closeTileMenu?: () => void;
  openQte?: () => void;
  hitQte?: () => void;
  closeQte?: () => void;
}

interface PocketHavenModule {
  harvestPlot?: (plotId: Coord) => void;
  openFishing?: () => void;
}

function farming(): FarmingModeModule | undefined {
  return mod<FarmingModeModule>("FarmingMode");
}

function haven(): PocketHavenModule | undefined {
  return mod<PocketHavenModule>("PocketHaven");
}

export function farmTick(): void {
  applyOp({ op: "farm_tick", amount: 1 });
}

export function farmMove(dir: Coord): void {
  farming()?.move?.(dir);
}

export function farmInteract(): void {
  farming()?.interact?.();
}

export function farmFaceOrUseTile(x: Coord, y: Coord): void {
  farming()?.faceOrUseTile?.(x, y);
}

export function farmSelectTool(tool: Coord): void {
  farming()?.selectTool?.(tool);
}

export function farmTileAction(action: Coord, x: Coord, y: Coord): void {
  farming()?.tileAction?.(action, x, y);
}

export function farmCloseTileMenu(): void {
  farming()?.closeTileMenu?.();
}

export function farmOpenQte(): void {
  // The QTE engine is deferred off the campaign boot path (Tier 1 perf); ensure
  // it is loaded before the harvest QTE opens. (hit/close run mid-QTE, after
  // this has loaded it, so they need no gate.)
  void ensureMinigameEngine().then(() => farming()?.openQte?.());
}

export function farmHitQte(): void {
  farming()?.hitQte?.();
}

export function farmCloseQte(): void {
  farming()?.closeQte?.();
}

export function harvestPlot(plotId: Coord): void {
  haven()?.harvestPlot?.(plotId);
}

export function openFishing(): void {
  // Fishing runs the deferred minigame/QTE engine; ensure it is loaded first.
  void ensureMinigameEngine().then(() => haven()?.openFishing?.());
}
