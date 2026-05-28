// battle-pool.ts — Phase H.3 shared battle-pool / context helpers.
//
// Build "pending battle" payloads from battle-set cards, encounters and
// monster pools; derive the defeat-fields block and a themed battle map;
// score the pool against the active scenario / quest context and pick a
// contextual battle. These are shared by the battle-selection handlers
// (combat.ts) AND the still-in-JS manual event builder (`_manualEventOps`
// / `_manualEventBattleOptions`), so the module also installs
// `window.CJS.CampaignBattlePool` for those JS callers until the event
// builder itself ports to TS. Field names, scoring weights, world filtering
// and the QP / CampaignBattleSetForge calls mirror the deleted closures.

import { cs, ds, mod } from "./context";

// Permissive shape covering the union of fields read off battle entries,
// battle-set cards and pool items (the source objects are dynamic).
export interface BattleLike {
  id?: string;
  battleSetId?: string | null;
  encounterId?: string | null;
  monsterIds?: string[];
  label?: string;
  name?: string;
  rewardOps?: unknown[];
  objective?: string;
  notes?: string;
  gimmick?: string;
  battleMap?: unknown;
  setting?: string;
  type?: string;
  tags?: string[];
  contextTags?: string[];
  monsterTags?: string[];
  grid?: { width?: number; height?: number };
  rank?: string;
  icon?: string;
  _world?: string;
  defeatOutcome?: string | null;
  defeatMode?: string | null;
  defeatOps?: unknown[];
  lossOps?: unknown[];
  drawOps?: unknown[];
  badEndingOps?: unknown[];
  badEndingOnDefeat?: boolean;
  badEndingFlag?: string | null;
  defeatNoRecovery?: boolean;
  noDefeatRecovery?: boolean;
  [key: string]: unknown;
}

export interface BattleMap {
  theme: string;
  width: number;
  height: number;
}

export interface DefeatFields {
  defeatOps: unknown[];
  drawOps: unknown[];
  badEndingOps: unknown[];
  badEndingOnDefeat: boolean;
  badEndingFlag: string | null;
  defeatOutcome: string | null;
  defeatMode: string | null;
  defeatNoRecovery: boolean;
}

interface ScenarioLike {
  setting?: string;
}
interface QuestPulseModule {
  battleContextForPending?: (
    state: unknown,
    battle: unknown
  ) => {
    contextTags?: string[];
    monsterTags?: string[];
    questId?: string;
    questChainId?: string;
    objectiveId?: string;
    tags?: string[];
  } | null | undefined;
  monsterTags?: (monster: unknown) => string[];
}
interface BattleSetForgeModule {
  getCards?: (opts?: { world?: string }) => BattleLike[];
}

function qp(): QuestPulseModule | undefined {
  return mod<QuestPulseModule>("CampaignQuestPulse");
}

export interface BattleContext {
  contextTags?: string[];
  monsterTags?: string[];
  questId?: string;
  questChainId?: string;
  objectiveId?: string;
  tags?: string[];
}

// QP-derived quest/monster context for a (possibly pending) battle.
export function battleContextFor(battle: unknown): BattleContext | null {
  return qp()?.battleContextForPending?.(cs().getState(), battle) || null;
}
function activeScenario(): ScenarioLike | null | undefined {
  return cs().getActiveScenario() as ScenarioLike | null | undefined;
}

export function battleMapForArea(area: string | undefined): BattleMap {
  const key = String(area || "").toLowerCase();
  let theme = "forest";
  if (["dungeon", "cave", "sewer", "house"].includes(key)) theme = "cave";
  else if (key === "temple") theme = "temple";
  else if (key === "ruins") theme = "ruins";
  else if (["urban", "tavern", "castle", "arena"].includes(key)) theme = "arena";
  else if (key === "mountain") theme = "tundra";
  return { theme, width: 8, height: 8 };
}

export function battleMapForCard(card: BattleLike = {}): BattleMap {
  const text = [card.name, card.objective, card.gimmick, ...(card.tags || [])].join(" ").toLowerCase();
  let theme = "forest";
  if (/temple|shrine|holy/.test(text)) theme = "temple";
  else if (/ruins|relic|pillar/.test(text)) theme = "ruins";
  else if (/cave|cellar|sewer|underground|den/.test(text)) theme = "cave";
  else if (/snow|ice|frost|ridge|mountain/.test(text)) theme = "tundra";
  else if (/arena|spar|training|guild|tavern|house|urban|street/.test(text)) theme = "arena";
  return {
    theme,
    width: Number(card.grid?.width || 8),
    height: Number(card.grid?.height || 8)
  };
}

export function battleDefeatFields(entry: BattleLike = {}, card: BattleLike = {}): DefeatFields {
  const defeatOutcome = entry.defeatOutcome || card?.defeatOutcome || null;
  const defeatMode = entry.defeatMode || card?.defeatMode || null;
  return {
    defeatOps: entry.defeatOps || entry.lossOps || card?.defeatOps || card?.lossOps || [],
    drawOps: entry.drawOps || card?.drawOps || [],
    badEndingOps: entry.badEndingOps || card?.badEndingOps || [],
    badEndingOnDefeat: !!(
      entry.badEndingOnDefeat ||
      card?.badEndingOnDefeat ||
      defeatOutcome === "bad_ending" ||
      defeatMode === "bad_ending"
    ),
    badEndingFlag: entry.badEndingFlag || card?.badEndingFlag || null,
    defeatOutcome,
    defeatMode,
    defeatNoRecovery: !!(
      entry.defeatNoRecovery ||
      entry.noDefeatRecovery ||
      card?.defeatNoRecovery ||
      card?.noDefeatRecovery
    )
  };
}

export function fallbackBattlePool(): BattleLike[] {
  const world = (cs().getState()?.currentWorld as string | undefined);
  const cards = mod<BattleSetForgeModule>("CampaignBattleSetForge")?.getCards?.({ world }) || [];
  const fromCards = cards
    .map((card) => ({
      id: card.id,
      battleSetId: card.id,
      encounterId: card.encounterId || null,
      label: card.name || card.id,
      rewardOps: card.rewardOps || [],
      ...battleDefeatFields(card),
      objective: card.objective || "",
      notes: card.gimmick || "",
      battleMap: battleMapForCard(card),
      tags: card.tags || [],
      contextTags: card.tags || [],
      monsterTags: card.tags || []
    }))
    .filter((entry) => entry.encounterId || entry.battleSetId);
  if (fromCards.length) return fromCards;
  const encounters = (ds()?.getAllAsArray("encounters") as BattleLike[] | undefined || [])
    .filter((enc) => !enc._world || enc._world === world)
    .slice(0, 6)
    .map((enc) => ({ id: enc.id, encounterId: enc.id, label: enc.name || enc.id }));
  if (encounters.length) return encounters;
  const monsters = (ds()?.getAllAsArray("monsters") as BattleLike[] | undefined || [])
    .filter((monster) => !world || !monster._world || monster._world === world)
    .slice(0, 8);
  if (!monsters.length) return [];
  return monsters.map((monster) => ({
    id: `monster_pool_${monster.id}`,
    monsterIds: [monster.id as string],
    label: monster.name || monster.id,
    setting: (activeScenario()?.setting || "outdoor"),
    battleMap: battleMapForArea(activeScenario()?.setting || "outdoor"),
    tags: [monster.type, monster.id].filter((t): t is string => Boolean(t)),
    monsterTags: qp()?.monsterTags?.(monster) || [monster.type, monster.id].filter((t): t is string => Boolean(t))
  }));
}

export function battleContextTags(): string[] {
  const state = cs().getState() || {};
  const ctx = qp()?.battleContextForPending?.(state, (state as { pendingBattle?: unknown }).pendingBattle || {}) || {};
  const run = ((state as { activeScenarioRun?: { questTask?: { label?: string; location?: string } } }).activeScenarioRun) || {};
  const raw = [
    run.questTask?.label,
    run.questTask?.location,
    ...(ctx.tags || []),
    ...(ctx.contextTags || []),
    ...(ctx.monsterTags || [])
  ]
    .filter((t): t is string => Boolean(t))
    .map((tag) => tag.toLowerCase());
  return Array.from(new Set(raw.flatMap((tag) => [tag, tag.replace(/[^a-z0-9_:-]+/g, "_")])));
}

export function battleContextScore(entry: BattleLike = {}): number {
  const context = battleContextTags();
  const entryTags = [
    entry.label,
    entry.objective,
    entry.notes,
    entry.setting,
    ...(entry.tags || []),
    ...(entry.contextTags || []),
    ...(entry.monsterTags || [])
  ]
    .join(" ")
    .toLowerCase();
  let score = 1;
  for (const tag of context) {
    if (tag && entryTags.includes(tag)) score += 5;
  }
  if (/boss|chimera|preview/.test(entryTags) && !context.includes("boss") && !context.includes("training")) score -= 4;
  return Math.max(1, score);
}

export function pickContextualBattle(pool: BattleLike[] = []): BattleLike | undefined {
  const scored = pool
    .map((entry) => ({ entry, score: battleContextScore(entry) }))
    .sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.min(4, scored.length));
  const total = top.reduce((sum, item) => sum + Math.max(1, item.score), 0);
  let roll = Math.random() * total;
  for (const item of top) {
    roll -= Math.max(1, item.score);
    if (roll <= 0) return item.entry;
  }
  return top[0]?.entry || pool[Math.floor(Math.random() * pool.length)];
}

// Install the shared pool on window.CJS for the still-in-JS manual event
// builder (`_manualEventOps` / `_manualEventBattleOptions`). When that
// builder ports to TS it imports these directly and this exposure becomes
// redundant; keeping it is harmless.
interface BattlePoolRuntime {
  battleDefeatFields: typeof battleDefeatFields;
  battleMapForArea: typeof battleMapForArea;
  battleMapForCard: typeof battleMapForCard;
  fallbackBattlePool: typeof fallbackBattlePool;
  pickContextualBattle: typeof pickContextualBattle;
}
interface PoolCjs {
  CampaignBattlePool?: BattlePoolRuntime;
  [key: string]: unknown;
}
const poolCjs = window as unknown as { CJS?: PoolCjs };
poolCjs.CJS = poolCjs.CJS || ({} as PoolCjs);
poolCjs.CJS.CampaignBattlePool = {
  battleDefeatFields,
  battleMapForArea,
  battleMapForCard,
  fallbackBattlePool,
  pickContextualBattle
};
