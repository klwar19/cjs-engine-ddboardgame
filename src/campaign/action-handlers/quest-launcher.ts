// quest-launcher.ts — Phase H.3 quest scenario / battle launchers.
//
// startQuestScenario opens (or generates) a scenario for an active
// quest. If the quest already has a linkedScenario matching the
// requested mapForm, the linked scenario is started directly; otherwise
// a fresh scenario is generated through the runtime's
// `generate-scenario` action. Either way the run is annotated with the
// quest's task descriptor (label + objective + node/cell + location).
//
// questScenario / questBattle are the `quest-scenario` /
// `quest-battle` action handlers — both gate on the active-run state
// (redirect to maps if the run already belongs to the quest, refuse if
// a different run is active) and delegate to startQuestScenario for
// the actual launch. questBattle additionally queues a battle through
// the runtime's `run-roll-battle` after the scenario is open.
//
// Internal callers still in JS (`_startQuestChainScenario`,
// `_startQuestRunFromOffer`, `_openQuestModal`'s "starting run" branch)
// reach these through `window.CJS.CampaignQuestLauncher` until they
// port themselves. The TS code path is the single source of truth.

import { applyOp, cs, mod, ops, rerender, setActiveModeRaw, setActiveTabRaw, toast } from "./context";
import { utils } from "./modals";
import { goto } from "./nav";
import { activeQuestById, activeRunQuestId, questMapForm, questMapType, questNextObjective } from "./quest";

interface RunnerModule {
  startScenario?: (scenarioId: string) => unknown;
  findNode?: (map: MapLike | null | undefined, nodeId: string) => MapNode | null | undefined;
  findCell?: (map: MapLike | null | undefined, x: number, y: number) => MapCell | null | undefined;
}

interface ActionsRuntime {
  run?: (name: string, data?: Record<string, unknown>) => unknown;
}

interface MapNode {
  id?: string;
  title?: string;
  [key: string]: unknown;
}

interface MapCell {
  id?: string;
  x?: number;
  y?: number;
  title?: string;
  [key: string]: unknown;
}

interface MapLike {
  id?: string;
  cells?: MapCell[];
  nodes?: MapNode[];
  [key: string]: unknown;
}

interface QuestObjective {
  id?: string;
  label?: string;
  current?: number | string;
  required?: number | string;
  kind?: string;
  [key: string]: unknown;
}

// Quest + overrides shape — mirrors the launcher closure's options. The
// JS callers pass camelCase strings/numbers/bools plus an optional
// `quest` object (to avoid a second lookup) and `forceGenerated` flag
// (to skip the linked-scenario early-return).
export interface LauncherQuest {
  id?: string;
  title?: string;
  status?: string;
  tags?: string[];
  contextTags?: string[];
  objectives?: QuestObjective[];
  mapForm?: string;
  mapType?: string;
  mapSetting?: string;
  mapSize?: string;
  travelMode?: string;
  quickNarrative?: boolean;
  chainTemplateId?: string;
  linkedScenario?: string;
  scenarioId?: string;
  scenario?: string;
  linkedMapNodes?: string[];
  linkedMapCells?: Array<string | number[] | { id?: string; x?: number; y?: number }>;
  [key: string]: unknown;
}

export interface LauncherOverrides {
  quest?: LauncherQuest;
  mapForm?: string;
  mapType?: string;
  size?: string;
  source?: string;
  questId?: string;
  questChainId?: string;
  forceGenerated?: boolean;
  [key: string]: unknown;
}

interface ScenarioLike {
  id?: string;
  name?: string;
  mapId?: string;
  mapForm?: string;
  travelMode?: string;
  source?: { questChainId?: string; questId?: string; [key: string]: unknown };
  quickNarrative?: boolean;
  successConditions?: Array<{ type?: string; nodeId?: string; x?: number; y?: number }>;
  [key: string]: unknown;
}

interface GeneratorResult {
  error?: string;
  scenario?: ScenarioLike;
  [key: string]: unknown;
}

function runner(): RunnerModule | undefined {
  return mod<RunnerModule>("ScenarioRunner");
}

function actionsRuntime(): ActionsRuntime | undefined {
  return mod<ActionsRuntime>("CampaignActionsRuntime");
}

// Mirrors `_linkedScenarioMatches`. Returns true (and lets the linked
// scenario start) when no scenario is linked, no specific form was
// requested, or the linked scenario's form agrees with the request.
export function linkedScenarioMatches(quest: LauncherQuest, requestedMapForm: string): boolean {
  const scenarioId = quest?.linkedScenario || quest?.scenarioId || quest?.scenario;
  if (!scenarioId) return true;
  if (!requestedMapForm) return true;
  const scenario = cs().getScenarioById(scenarioId) as ScenarioLike | null | undefined;
  if (!scenario) return true;
  const scenarioForm = String(scenario.mapForm || scenario.travelMode || "").toLowerCase();
  if (!scenarioForm) return true;
  return scenarioForm === requestedMapForm;
}

// Mirrors `_questCellFromRef`. Resolves a linked-cell ref ([x,y] | {id} |
// {x,y} | "<cell_id>") to the actual map cell when possible.
function questCellFromRef(map: MapLike | null | undefined, ref: unknown): MapCell | null {
  if (!map || ref == null) return null;
  if (Array.isArray(ref)) {
    return runner()?.findCell?.(map, Number(ref[0]), Number(ref[1])) || { x: Number(ref[0]), y: Number(ref[1]) };
  }
  if (typeof ref === "object") {
    const refObj = ref as { id?: string; x?: number; y?: number };
    if (refObj.id) return (map.cells || []).find((cell) => cell.id === refObj.id) || null;
    if (refObj.x != null && refObj.y != null) {
      return runner()?.findCell?.(map, refObj.x, refObj.y) || (refObj as MapCell);
    }
  }
  if (typeof ref === "string") return (map.cells || []).find((cell) => cell.id === ref) || null;
  return null;
}

interface TaskDescriptor {
  label: string;
  objectiveId: string | null;
  location: string;
  nodeId?: string;
  cell?: { x: number; y: number };
}

// Mirrors `_questTaskDescriptor`. Returns a label + objective + location
// the run is annotated with so the maps tab + log can show "Quest task:
// <label> at <location>". Linked nodes win over linked cells; if the
// quest has neither, fall back to the scenario's first successCondition.
function questTaskDescriptor(quest: LauncherQuest, scenario: ScenarioLike | null): TaskDescriptor {
  const objectives = quest.objectives || [];
  const objective = questNextObjective(quest);
  const objectiveIndex = Math.max(0, objectives.findIndex((entry) => entry.id === objective?.id));
  const map = (scenario?.mapId && cs().getScenarioMapById(scenario.mapId)) || cs().getActiveMap() || null;
  const label = utils()?.label ?? ((v: unknown) => String(v ?? ""));
  const r = runner();

  const fallbackLabel = objective?.label || quest.title || "Quest task";
  const fallbackObjective = objective?.id || null;

  const linkedNodes = Array.isArray(quest.linkedMapNodes) ? quest.linkedMapNodes : null;
  const nodeId = linkedNodes
    ? linkedNodes[objectiveIndex] || linkedNodes[linkedNodes.length - 1]
    : null;
  if (nodeId) {
    const node = r?.findNode?.(map as MapLike | null | undefined, nodeId);
    return {
      label: fallbackLabel,
      objectiveId: fallbackObjective,
      nodeId,
      location: node?.title || label(nodeId)
    };
  }

  const linkedCells = Array.isArray(quest.linkedMapCells) ? quest.linkedMapCells : [];
  const cellRef = linkedCells[objectiveIndex] || linkedCells[linkedCells.length - 1] || null;
  const cell = questCellFromRef(map as MapLike | null | undefined, cellRef);
  if (cell) {
    return {
      label: fallbackLabel,
      objectiveId: fallbackObjective,
      cell: { x: Number(cell.x), y: Number(cell.y) },
      location: cell.title || `${cell.x},${cell.y}`
    };
  }

  const success = (scenario?.successConditions || [])[0];
  if (success?.type === "reach_node" && success.nodeId) {
    const node = r?.findNode?.(map as MapLike | null | undefined, success.nodeId);
    return {
      label: fallbackLabel,
      objectiveId: fallbackObjective,
      nodeId: success.nodeId,
      location: node?.title || label(success.nodeId)
    };
  }
  if (success?.type === "reach_cell" && success.x != null && success.y != null) {
    const found = r?.findCell?.(map as MapLike | null | undefined, success.x, success.y);
    return {
      label: fallbackLabel,
      objectiveId: fallbackObjective,
      cell: { x: Number(success.x), y: Number(success.y) },
      location: found?.title || `${success.x},${success.y}`
    };
  }
  return {
    label: fallbackLabel,
    objectiveId: fallbackObjective,
    location: ""
  };
}

interface ActiveRunWritable {
  questId?: string;
  questTitle?: string;
  quickNarrative?: boolean;
  questChainId?: string | null;
  questObjectiveId?: string | null;
  questTask?: TaskDescriptor;
  [key: string]: unknown;
}

// Mirrors `_annotateQuestRun`. After a scenario is opened, write the
// quest's binding (id / title / objective / task / quickNarrative
// resolution) into the active run, then log the task line.
export function annotateQuestRun(quest: LauncherQuest, scenario: ScenarioLike | null | undefined): void {
  if (!quest?.id) return;
  if (!(cs().getState() as { activeScenarioRun?: unknown } | null)?.activeScenarioRun) return;
  const task = questTaskDescriptor(quest, scenario || null);
  cs().mutate((state) => {
    const run = (state as { activeScenarioRun?: ActiveRunWritable }).activeScenarioRun;
    if (!run) return;
    run.questId = quest.id;
    run.questTitle = quest.title || quest.id;
    // Carry the quest's narrative style into the run. Scenario-level
    // quickNarrative wins when it's been set; otherwise the quest's
    // value controls. Defaults to fullscreen VN if neither is set (so
    // authored story scenarios keep their original feel).
    if (scenario?.quickNarrative === true || quest.quickNarrative === true) {
      run.quickNarrative = scenario?.quickNarrative !== false && quest.quickNarrative !== false;
    } else if (scenario?.quickNarrative === false || quest.quickNarrative === false) {
      run.quickNarrative = false;
    }
    run.questChainId = quest.chainTemplateId || scenario?.source?.questChainId || run.questChainId || null;
    run.questObjectiveId = task.objectiveId || null;
    run.questTask = task;
  }, { source: "quest_run" });
  const location = task.location ? ` at ${task.location}` : "";
  applyOp({ op: "log", text: `Quest task: ${task.label || quest.title || quest.id}${location}.` }, "quest_run");
}

interface StartResult {
  scenario?: ScenarioLike;
  existing?: boolean;
  error?: string;
}

// Mirrors `_startExistingQuestScenario`. Starts the quest's authored
// linked scenario and annotates it. Returns null if the quest has no
// linked scenario (the launcher falls through to generation).
export function startExistingQuestScenario(quest: LauncherQuest): StartResult | null {
  const scenarioId = quest?.linkedScenario || quest?.scenarioId || quest?.scenario;
  if (!scenarioId) return null;
  const scenario = cs().getScenarioById(scenarioId) as ScenarioLike | null | undefined;
  if (!scenario) return null;
  try {
    runner()?.startScenario?.(scenarioId);
  } catch (err) {
    const message = (err as Error)?.message || scenarioId;
    toast(`Scenario could not start: ${message}`, "info");
    return { error: "start_failed" };
  }
  annotateQuestRun(quest, scenario);
  setActiveModeRaw("quest");
  setActiveTabRaw("maps");
  rerender();
  toast(`Started ${scenario.name || scenario.id}`, "success");
  return { scenario, existing: true };
}

// Mirrors `_startQuestScenario`. The launcher's contract: given a
// questId (and optional overrides — quest object cache, mapForm /
// mapType / size, forceGenerated to skip the linked-scenario path),
// start the right scenario and annotate the run.
export function startQuestScenario(
  questId: string,
  overrides: LauncherOverrides = {}
): GeneratorResult | StartResult | null {
  const quest = overrides.quest || activeQuestById(questId);
  if (!quest) return null;
  const requestedMapForm = String(overrides.mapForm || questMapForm(quest) || "").toLowerCase();
  if (!overrides.forceGenerated && linkedScenarioMatches(quest, requestedMapForm)) {
    const existing = startExistingQuestScenario(quest);
    if (existing) return existing;
  }
  // Route through the generator action — same payload contract as the
  // React form dispatch. The runtime returns the handler's `{ scenario,
  // map, ... }` result (or `{ error }`).
  const result = actionsRuntime()?.run?.("generate-scenario", {
    source: "active_quest",
    questId,
    mapForm: requestedMapForm || questMapForm(quest),
    mapType: questMapType(quest),
    size: quest.mapSize || "small",
    ...overrides
  }) as GeneratorResult | null;
  if (result && !result.error && result.scenario) {
    annotateQuestRun(quest, result.scenario);
    rerender();
  }
  return result;
}

// Mirrors `_questScenario` (action: `quest-scenario`). Refuses if a
// different run is already active, redirects to maps if the run is for
// this quest, otherwise launches the quest's scenario.
export function questScenario(questId: string): GeneratorResult | StartResult | null | void {
  const quest = activeQuestById(questId);
  if (!quest) {
    toast("Quest is not active", "info");
    return;
  }
  const state = cs().getState() as { activeScenarioRun?: ActiveRunWritable } | null;
  const activeRun = state?.activeScenarioRun;
  const activeScenario = cs().getActiveScenario() as ScenarioLike | null | undefined;
  if (activeRun) {
    if (activeRunQuestId(activeRun, activeScenario) === questId) {
      goto(null, "maps");
      return;
    }
    toast("End the active scenario before starting a quest map", "info");
    return;
  }
  return startQuestScenario(questId);
}

// Mirrors `_questBattle` (action: `quest-battle`). If no run is active,
// quick-spins up a tiny scenario for the quest first, then queues a
// random battle through `run-roll-battle`.
export function questBattle(questId: string): void {
  const quest = activeQuestById(questId);
  if (!quest) {
    toast("Quest is not active", "info");
    return;
  }
  if (!(cs().getState() as { activeScenarioRun?: unknown } | null)?.activeScenarioRun) {
    const result = startQuestScenario(questId, { size: "tiny" });
    if (!result || (result as GeneratorResult).error) return;
  }
  actionsRuntime()?.run?.("run-roll-battle");
  ops().apply(
    { op: "log", text: `Quest battle queued: ${quest.title || quest.id}.` },
    { source: "quest_battle" }
  );
  setActiveModeRaw("quest");
  setActiveTabRaw("maps");
  rerender();
}

// Install on window.CJS so still-in-JS callers (`_startQuestChainScenario`,
// `_startQuestRunFromOffer`, `_openQuestModal`'s "starting run" branch)
// share the single TS code path. When those callers port themselves,
// the exposure becomes redundant but harmless.
interface LauncherRuntime {
  startQuestScenario: typeof startQuestScenario;
  annotateQuestRun: typeof annotateQuestRun;
  linkedScenarioMatches: typeof linkedScenarioMatches;
  startExistingQuestScenario: typeof startExistingQuestScenario;
  questScenario: typeof questScenario;
  questBattle: typeof questBattle;
}
interface LauncherCjs {
  CampaignQuestLauncher?: LauncherRuntime;
  [key: string]: unknown;
}
const launcherCjs = window as unknown as { CJS?: LauncherCjs };
launcherCjs.CJS = launcherCjs.CJS || ({} as LauncherCjs);
launcherCjs.CJS.CampaignQuestLauncher = {
  startQuestScenario,
  annotateQuestRun,
  linkedScenarioMatches,
  startExistingQuestScenario,
  questScenario,
  questBattle
};
