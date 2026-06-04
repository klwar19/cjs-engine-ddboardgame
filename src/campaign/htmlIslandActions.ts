import { dispatchCampaignAction, type CampaignActionName } from "./actions";

export interface HtmlIslandDispatchResult {
  readonly handled: boolean;
  readonly action?: CampaignActionName;
  readonly closesPanel?: boolean;
}

const DRAWER_CLOSE_ACTIONS = new Set<CampaignActionName>([
  "open-roster-tab",
  "open-scenarios-tab",
  "open-maps-tab",
  "open-quests-tab",
  "open-shops-tab",
  "open-sideforge-tab",
  "open-story-home",
  "open-quest-home",
  "open-event-home",
  "open-farm-tab",
  "open-event-stories-tab",
  "open-event-battles-tab",
  "open-event-log"
]);

function run(
  action: CampaignActionName,
  data: Record<string, string | number | undefined> = {}
): HtmlIslandDispatchResult {
  dispatchCampaignAction(action, data);
  return { handled: true, action, closesPanel: DRAWER_CLOSE_ACTIONS.has(action) };
}

function closest(target: HTMLElement | null, selector: string): HTMLElement | null {
  return (target?.closest(selector) as HTMLElement | null) ?? null;
}

export function dispatchHtmlIslandAction(target: HTMLElement | null): HtmlIslandDispatchResult {
  if (!target) return { handled: false };

  if (closest(target, "[data-farm-tick]")) return run("farm-tick");
  if (closest(target, "[data-farm-qte-open]")) return run("farm-qte-open");
  if (closest(target, "[data-farm-qte-hit]")) return run("farm-qte-hit");
  if (closest(target, "[data-farm-qte-close]")) return run("farm-qte-close");
  if (closest(target, "[data-farm-interact]")) return run("farm-interact");
  if (closest(target, "[data-pass-phase]")) return run("pass-phase");

  const farmMove = closest(target, "[data-farm-move]");
  if (farmMove) return run("farm-move", { dir: farmMove.dataset.farmMove });

  const farmTile = closest(target, "[data-farm-tile]");
  if (farmTile) return run("farm-tile", { x: farmTile.dataset.x, y: farmTile.dataset.y });

  const farmTool = closest(target, "[data-farm-select-tool]");
  if (farmTool) return run("farm-select-tool", { tool: farmTool.dataset.farmSelectTool });

  if (closest(target, "[data-farm-tile-menu-close]")) return run("farm-tile-menu-close");

  const farmTileAction = closest(target, "[data-farm-tile-action]");
  if (farmTileAction) {
    return run("farm-tile-action", {
      tileAction: farmTileAction.dataset.farmTileAction,
      x: farmTileAction.dataset.x,
      y: farmTileAction.dataset.y
    });
  }

  const harvestPlot = closest(target, "[data-harvest-plot]");
  if (harvestPlot) return run("harvest-plot", { plotId: harvestPlot.dataset.harvestPlot });

  const plantSeed = closest(target, "[data-plant-seed-plot]");
  if (plantSeed) return run("plant-seed", { plotId: plantSeed.dataset.plantSeedPlot });

  return { handled: false };
}
