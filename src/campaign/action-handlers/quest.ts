// quest.ts — Phase H.3 quest pure-ops handlers.
//
// quest-progress / quest-hub-event / quest-harvest / quest-check /
// quest-hand-in / quest-answer all apply CampaignOps with the same
// objective-progress payloads + logs as the deleted closures. The small
// shared quest helpers (`isQuestResolved`, `questObjectiveDone`,
// `questNextObjective`, `questObjectiveByKinds`, `activeQuestById`,
// `questHarvestLoot`) are duplicated here in TS — the JS versions stay
// because the render/data builders (`_renderSoloNotice`, `_questScenarioPill`,
// the Story / Quest / Overview / EventLog data bridges) still call them.
// When H.4 ports those data builders they import from this module and the
// JS copies go away. Op names, payload keys, modal copy, the runtime
// reroute (roll-hub-pulse) and sources mirror the deleted closures.
//
// quest-scenario / quest-battle / quest-minigame stay in the switch —
// they call the still-JS scenario / battle-rerouted / mini-game session
// launchers.

import { applyOp, cs, mod, ops, toast } from "./context";
import { modals, utils, widgets, type PickerOption } from "./modals";

// ── Quest type ───────────────────────────────────────────────────
interface Objective {
  id?: string;
  label?: string;
  current?: number | string;
  required?: number | string;
  kind?: string;
  minigame?: unknown;
  miniGame?: unknown;
  minigameId?: unknown;
  [key: string]: unknown;
}

interface Quest {
  id?: string;
  title?: string;
  status?: string;
  tags?: string[];
  contextTags?: string[];
  objectives?: Objective[];
  [key: string]: unknown;
}

// ── Small helpers (TS copies; JS originals stay for render/data) ──
export function isQuestResolved(quest: Quest = {}): boolean {
  return ["complete", "completed", "failed"].includes(String(quest.status || "active"));
}

// Quest fields the launcher reads (mapForm / mapType / linked map nodes
// + cells) plus the optional fields _questMapForm / _questMapType
// text-search over. The launcher uses the same fields as the rendering
// data builders (still in JS) — this stays a Quest extension here so
// the launcher only depends on quest.ts.
interface QuestWithMap extends Quest {
  mapForm?: string;
  travelMode?: string;
  movement?: string;
  mapMode?: string;
  summary?: string;
  mapType?: string;
  mapSetting?: string;
  setting?: string;
  location?: string;
}

// Mirrors `_questMapForm` in campaign-ui.js — explicit field wins, else
// a text-search over title + summary + tags + contextTags decides
// grid_map vs node_map. The fallbacks intentionally bias toward
// node_map (the more common case for the generator).
export function questMapForm(quest: QuestWithMap = {}): "grid_map" | "node_map" {
  const explicit = String(quest.mapForm || quest.travelMode || "").toLowerCase();
  if (explicit === "grid_map" || explicit === "grid") return "grid_map";
  if (explicit === "node_map" || explicit === "node") return "node_map";
  const text = [
    quest.movement,
    quest.mapMode,
    quest.title,
    quest.summary,
    ...(quest.tags || []),
    ...(quest.contextTags || [])
  ].filter(Boolean).join(" ").toLowerCase();
  if (/grid|tile|square|board|tactical|crawl|maze/.test(text)) return "grid_map";
  return "node_map";
}

// Mirrors `_questMapType` in campaign-ui.js — explicit `mapSetting`
// wins (unless 'any'), else a text-search over the same surface
// decides one of the SHAPE_SETTING_LABELS keys; 'any' fallback.
export function questMapType(quest: QuestWithMap = {}): string {
  const explicit = String(quest.mapSetting || "").toLowerCase();
  if (explicit && explicit !== "any") return explicit;
  const text = [
    quest.mapType,
    quest.setting,
    quest.location,
    quest.title,
    quest.summary,
    ...(quest.tags || [])
  ].filter(Boolean).join(" ").toLowerCase();
  if (/town|city|street|market|guild|urban/.test(text)) return "urban";
  if (/forest|grove|wood|pine/.test(text)) return "forest";
  if (/dungeon|crypt|vault/.test(text)) return "dungeon";
  if (/cave|hollow|den/.test(text)) return "cave";
  if (/sewer|canal|drain/.test(text)) return "sewer";
  if (/ruin|relic/.test(text)) return "ruins";
  if (/temple|shrine|holy/.test(text)) return "temple";
  if (/house|home|hut/.test(text)) return "house";
  if (/tavern|inn/.test(text)) return "tavern";
  if (/castle|keep|tower/.test(text)) return "castle";
  if (/mountain|ridge|summit|ice|snow/.test(text)) return "mountain";
  if (/arena|training|spar/.test(text)) return "arena";
  if (/outdoor|road|trail|field|wild/.test(text)) return "outdoor";
  return "any";
}

// Mirrors `_activeRunQuestId`. The launcher uses this to decide whether
// to redirect to maps (the run already belongs to this quest) or refuse
// (a different scenario is active).
interface ActiveRunLike {
  questId?: string;
  [key: string]: unknown;
}
interface ScenarioWithSource {
  source?: { questId?: string; [key: string]: unknown };
  [key: string]: unknown;
}
export function activeRunQuestId(
  run: ActiveRunLike | null | undefined,
  scenario: ScenarioWithSource | null | undefined
): string | null {
  return run?.questId || scenario?.source?.questId || null;
}

export function questObjectiveDone(obj: Objective = {}): boolean {
  return Number(obj.current || 0) >= Math.max(1, Number(obj.required || 1));
}

export function questNextObjective(quest: Quest = {}): Objective | null {
  const objectives = quest.objectives || [];
  return objectives.find((entry) => !questObjectiveDone(entry)) || objectives[0] || null;
}

export function questObjectiveByKinds(quest: Quest = {}, kinds: string[] = []): Objective | null {
  const set = new Set(kinds);
  return (
    (quest.objectives || []).find((objective) => !questObjectiveDone(objective) && set.has(objective.kind || "")) ||
    null
  );
}

export function activeQuestById(questId: string): Quest | null {
  const quest = (cs().getState() as { quests?: Record<string, Quest> } | null)?.quests?.[questId];
  return quest && !isQuestResolved(quest) ? quest : null;
}

// Finds the next mini-game-flagged objective on a quest. Shared by the
// quest-minigame handler in minigame.ts.
export function questMiniGameObjective(quest: Quest = {}): Objective | null {
  return (
    (quest.objectives || []).find((objective) => {
      if (questObjectiveDone(objective)) return false;
      const kind = String(objective.kind || "").toLowerCase();
      return !!(objective.minigame || objective.miniGame || objective.minigameId || kind === "minigame" || kind === "puzzle");
    }) || null
  );
}

interface HarvestLoot {
  op: string;
  id: string;
  qty: number;
}

export function questHarvestLoot(quest: Quest = {}): HarvestLoot {
  const tags = new Set([...(quest.tags || []), ...(quest.contextTags || [])].map((tag) => String(tag).toLowerCase()));
  if (tags.has("mushroom") || tags.has("forage") || tags.has("food")) {
    return { op: "give_quest_item", id: "haven_frostcap_mushroom", qty: 1 };
  }
  if (tags.has("pelt") || tags.has("wolf")) return { op: "give_material", id: "haven_wolf_pelt", qty: 1 };
  if (tags.has("ore") || tags.has("forge") || tags.has("crafting")) {
    return { op: "give_material", id: "haven_ice_crystal", qty: 1 };
  }
  return { op: "give_material", id: "haven_sprite_dust", qty: 1 };
}

// ── Const + stat-name accessor (matches `C()?.STAT_NAMES` lookup) ──
interface ConstModule {
  STATS?: string[];
  STAT_NAMES?: Record<string, string>;
}
function constants(): ConstModule | undefined {
  return mod<ConstModule>("CONST");
}
function statName(stat: string): string {
  return constants()?.STAT_NAMES?.[stat] || stat;
}

// ── Inventory option builder (quest-hand-in only) ──
interface OwnedOption extends PickerOption {
  bucket: string;
  id: string;
  qty: number;
}
const BUCKET_LABELS: Array<[string, string]> = [
  ["questItems", "Quest Item"],
  ["items", "Item"],
  ["materials", "Material"],
  ["food", "Food"]
];
function ownedInventoryOptions(): OwnedOption[] {
  const state = cs().getState() || {};
  const inventory = (state as { inventory?: Record<string, Record<string, number>> }).inventory || {};
  const recordName = utils()?.recordName ?? ((b: string, id: string) => String(id));
  return BUCKET_LABELS.flatMap(([bucket, label]) =>
    Object.entries(inventory[bucket] || {})
      .filter(([, qty]) => Number(qty || 0) > 0)
      .map(([id, qty]) => ({
        value: `${bucket}:${id}`,
        label: recordName(bucket, id),
        sub: `${label} x${qty}`,
        description: id,
        bucket,
        id,
        qty: Number(qty || 0)
      }))
  );
}

function takeOpForBucket(bucket: string): string {
  const map: Record<string, string> = {
    questItems: "take_quest_item",
    items: "take_item",
    materials: "take_material",
    food: "take_food"
  };
  return map[bucket] || "take_item";
}

// ── Actions runtime accessor (for quest-hub-event's roll-hub-pulse) ──
interface ActionsRuntime {
  run?: (name: string, data?: Record<string, unknown>) => void;
}
function actionsRuntime(): ActionsRuntime | undefined {
  return mod<ActionsRuntime>("CampaignActionsRuntime");
}

// ── Handlers ─────────────────────────────────────────────────────
export function questProgress(questId: string, objectiveId: string | null = null, amount = 1): void {
  const state = cs().getState();
  const quest = (state as { quests?: Record<string, Quest> } | null)?.quests?.[questId];
  if (!quest) return;
  let objective: Objective | null | undefined =
    (quest.objectives || []).find((entry) => entry.id === objectiveId) || questNextObjective(quest);
  if (!objective) {
    const fallbackId = `objective_${Date.now()}`;
    cs().mutate((s) => {
      const q = (s as { quests?: Record<string, Quest> }).quests?.[questId];
      if (!q) return;
      q.objectives = [{ id: fallbackId, label: "Manual progress", current: 0, required: 1 }];
    }, { source: "quest_objective_add" });
    objective = (cs().getState() as { quests?: Record<string, Quest> } | null)?.quests?.[questId]?.objectives?.[0];
  }
  if (!objective) return;
  applyOp({ op: "update_quest_progress", questId, objectiveId: objective.id, amount });
}

export function questHubEvent(questId: string): void {
  const quest = activeQuestById(questId);
  if (!quest) {
    toast("Quest is not active", "info");
    return;
  }
  const objective = questObjectiveByKinds(quest, ["hub_event", "event"]) || questNextObjective(quest);
  const table = quest.tags?.includes("tavern") ? "tavern" : quest.tags?.includes("guild") ? "guild" : "town";
  actionsRuntime()?.run?.("roll-hub-pulse", { table });
  if (objective) {
    ops().apply({
      op: "update_quest_progress",
      questId,
      objectiveId: objective.id,
      amount: 1
    }, { source: "quest_hub_event" });
  }
  ops().apply({ op: "log", text: `Quest hub event: ${quest.title || quest.id}.` }, { source: "quest_hub_event" });
}

export function questHarvest(questId: string): void {
  const quest = activeQuestById(questId);
  if (!quest) {
    toast("Quest is not active", "info");
    return;
  }
  const objective = questObjectiveByKinds(quest, ["harvest", "gather", "recover"]) || questNextObjective(quest);
  const loot = questHarvestLoot(quest);
  const harvestOps: Array<{ op: string; [key: string]: unknown }> = [
    { op: loot.op, id: loot.id, qty: loot.qty || 1 },
    { op: "log", text: `Quest harvest: ${quest.title || quest.id} - ${loot.qty || 1} ${loot.id}.` }
  ];
  if (objective) harvestOps.push({ op: "update_quest_progress", questId, objectiveId: objective.id, amount: 1 });
  ops().apply(harvestOps, { source: "quest_harvest" });
}

export function questCheck(questId: string): void {
  const quest = activeQuestById(questId);
  if (!quest) {
    toast("Quest is not active", "info");
    return;
  }
  const objective = questNextObjective(quest);
  const ui = widgets();
  const m = modals();
  if (!ui || !m) return;
  const body = document.createElement("div");
  body.appendChild(m.formLabel("Stat"));
  const stats = constants()?.STATS || ["S", "P", "E", "C", "I", "A", "L"];
  const stat = ui.createSelect({
    options: stats.map((value) => ({ value, label: `${value} - ${statName(value)}` })),
    value: "P"
  });
  body.appendChild(stat);
  body.appendChild(m.formLabel("DC"));
  const dc = ui.createNumberSlider({ value: 12, min: 4, max: 25, step: 1 });
  body.appendChild(dc);
  m.formModal({
    title: `Quest Check: ${quest.title || quest.id}`,
    body,
    primaryLabel: "Roll",
    onSubmit: () => {
      const success: Array<{ op: string; [key: string]: unknown }> = [
        { op: "log", text: `Quest check success: ${quest.title || quest.id}.` }
      ];
      if (objective) success.push({ op: "update_quest_progress", questId, objectiveId: objective.id, amount: 1 });
      const fail: Array<{ op: string; [key: string]: unknown }> = [
        { op: "log", text: `Quest check setback: ${quest.title || quest.id}.` },
        { op: "danger", amount: 1 }
      ];
      ops().apply({ op: "roll_check", stat: stat.value, dc: dc._getValue(), success, fail }, { source: "quest_check" });
    }
  });
}

export function questHandIn(questId: string): void {
  const quest = activeQuestById(questId);
  if (!quest) {
    toast("Quest is not active", "info");
    return;
  }
  const opts = ownedInventoryOptions();
  if (!opts.length) {
    toast("No inventory to hand in", "info");
    return;
  }
  const objective = questNextObjective(quest);
  const maxQty = Math.max(1, ...opts.map((opt) => opt.qty || 1));
  const recordName = utils()?.recordName ?? ((b: string, id: string) => String(id));
  modals()?.opPickerModal({
    title: `Hand In: ${quest.title || quest.id}`,
    options: opts,
    withQty: true,
    qtyDefault: 1,
    qtyMin: 1,
    qtyMax: maxQty,
    primaryLabel: "Hand In",
    placeholder: "Search owned inventory...",
    onSubmit: ({ value, qty }) => {
      const opt = opts.find((entry) => entry.value === value);
      if (!opt) return false;
      const amount = Math.max(1, Math.min(Number(qty || 1), opt.qty || 1));
      const handInOps: Array<{ op: string; [key: string]: unknown }> = [
        { op: takeOpForBucket(opt.bucket), id: opt.id, qty: amount },
        { op: "log", text: `Quest hand-in: ${amount} ${recordName(opt.bucket, opt.id)} for ${quest.title || quest.id}.` }
      ];
      if (objective) handInOps.push({ op: "update_quest_progress", questId, objectiveId: objective.id, amount: 1 });
      ops().apply(handInOps, { source: "quest_hand_in" });
    }
  });
}

export function questAnswer(questId: string): void {
  const quest = activeQuestById(questId);
  if (!quest) {
    toast("Quest is not active", "info");
    return;
  }
  const objective = questNextObjective(quest);
  modals()?.textareaModal({
    title: `Answer: ${quest.title || quest.id}`,
    label: "Answer",
    placeholder: "What did the party answer or do?",
    primaryLabel: "Apply",
    onSubmit: (text) => {
      if (!text) return false;
      const answerOps: Array<{ op: string; [key: string]: unknown }> = [
        { op: "log", text: `Quest answer: ${quest.title || quest.id} - ${text}` }
      ];
      if (objective) answerOps.push({ op: "update_quest_progress", questId, objectiveId: objective.id, amount: 1 });
      ops().apply(answerOps, { source: "quest_answer" });
    }
  });
}
