// minigame.ts — Phase H.3 mini-game session machinery + 3 handlers.
//
// Owns the cohesive "open a mini-game session" cluster:
//   - sequence-play-minigame: pull the active sequence's minigame node and
//     play it; on result, advance the sequence via the action runtime.
//   - haven-play-minigame: open a haven-tile mini-game with the
//     pocket-haven source and apply the result through this module.
//   - quest-minigame: play the active quest's mini-game objective, or pick
//     one from the global mini-game list.
//
// Shared helpers: miniGameConfig (normalize the source node/objective into
// a config), openMiniGameSession (launch via window.CJS.Minigames, route
// onComplete through applyMiniGameResult or a custom callback),
// miniGameStoryContext (title/conversation/contextText + onWinOps),
// showMiniGameBriefing (formModal-based briefing before launch),
// applyMiniGameResult (apply suggestedOps + toast by status). Field names,
// payload keys, default conversation lines, briefing modal copy and the
// `campaign_minigame` / `quest_minigame` / `sequence_minigame` /
// `pocket_haven` sources mirror the deleted closures.

import { cs, mod, ops, rerender, toast } from "./context";
import { modals, utils, widgets } from "./modals";
import { activeQuestById, questMiniGameObjective } from "./quest";

interface MiniGameNodeLike {
  id?: string;
  type?: string;
  title?: string;
  label?: string;
  text?: string;
  speaker?: string;
  minigame?: unknown;
  miniGame?: unknown;
  minigameId?: string;
  gameId?: string;
  levelId?: string;
  difficulty?: number | string;
  seed?: string;
  theme?: string;
  briefingTitle?: string;
  contextText?: string;
  context?: string;
  conversation?: unknown;
  bonusText?: string;
  bonusOps?: unknown;
  contextualBonus?: unknown;
  onWinOps?: unknown;
  winOps?: unknown;
  onLoseOps?: unknown;
  failOps?: unknown;
  loseOps?: unknown;
  [key: string]: unknown;
}

interface MiniGameConfig {
  gameId: string;
  levelId: string;
  difficulty: number;
  seed: string;
  theme: string;
  briefingTitle: string;
  contextText: string;
  conversation: unknown[];
  bonusText: string;
  bonusOps: unknown[];
  contextualBonus: unknown;
  onWinOps: unknown[];
  onLoseOps: unknown[];
}

interface ConvLine {
  speaker: string;
  text: string;
}

interface StoryContext {
  title: string;
  contextText: string;
  conversation: ConvLine[];
  bonusText: string;
  briefingBonusText: string;
  onWinOps: unknown[];
  onLoseOps: unknown[];
}

interface MiniGameResult {
  status?: string;
  suggestedOps?: Array<{ op?: string; questId?: string; objectiveId?: string; [key: string]: unknown }>;
  narrative?: { buffName?: string };
  [key: string]: unknown;
}

interface SessionContext {
  source?: string;
  questId?: string;
  objectiveId?: string;
  eventId?: string;
  mapId?: string;
  nodeId?: string;
  quest?: unknown;
  objective?: unknown;
  sequence?: unknown;
  node?: MiniGameNodeLike;
  requireBriefing?: boolean;
  onComplete?: (result: MiniGameResult, storyContext: StoryContext) => void;
}

interface MinigamesModule {
  openMiniGame?: (cfg: Record<string, unknown>) => unknown;
  listGames?: () => Array<{ id?: string; title?: string }>;
}

interface SequencesModule {
  active?: (state: unknown) => { sequenceId?: string; nodeId?: string } | null | undefined;
  cachedSequence?: (sequenceId: string, world: string | undefined) => unknown;
  findNode?: (sequence: unknown, nodeId: string) => MiniGameNodeLike | null | undefined;
}

interface ActionsRuntime {
  run?: (name: string, data?: Record<string, unknown>) => void;
}

function minigames(): MinigamesModule | undefined {
  return mod<MinigamesModule>("Minigames");
}
function sequences(): SequencesModule | undefined {
  return mod<SequencesModule>("CampaignSequences");
}
function actionsRuntime(): ActionsRuntime | undefined {
  return mod<ActionsRuntime>("CampaignActionsRuntime");
}
function label(value: string): string {
  return utils()?.label(value) ?? String(value || "");
}

// ── Config / context builders ─────────────────────────────────────
export function miniGameConfig(source: MiniGameNodeLike = {}, options: { includeOps?: boolean } = {}): MiniGameConfig {
  const raw = (source.minigame || source.miniGame || {}) as MiniGameNodeLike | string;
  const nested: MiniGameNodeLike = typeof raw === "string" ? { gameId: raw } : raw;
  const includeOps = options.includeOps !== false;
  return {
    gameId: nested.gameId || source.minigameId || source.gameId || "",
    levelId: nested.levelId || source.levelId || "",
    difficulty: Number(nested.difficulty || source.difficulty || 1),
    seed: nested.seed || source.seed || "",
    theme: nested.theme || source.theme || "",
    briefingTitle: nested.briefingTitle || source.briefingTitle || nested.title || source.title || "",
    contextText:
      nested.contextText ||
      nested.context ||
      source.contextText ||
      source.context ||
      source.text ||
      "",
    conversation: (nested.conversation as unknown[]) || (source.conversation as unknown[]) || [],
    bonusText: nested.bonusText || source.bonusText || "",
    bonusOps: includeOps ? ((nested.bonusOps as unknown[]) || (source.bonusOps as unknown[]) || []) : [],
    contextualBonus: nested.contextualBonus ?? source.contextualBonus,
    onWinOps: includeOps
      ? ((nested.onWinOps as unknown[]) || (source.onWinOps as unknown[]) || (source.winOps as unknown[]) || [])
      : [],
    onLoseOps: includeOps
      ? ((nested.onLoseOps as unknown[]) ||
        (source.onLoseOps as unknown[]) ||
        (source.failOps as unknown[]) ||
        (source.loseOps as unknown[]) ||
        [])
      : []
  };
}

function asOps(value: unknown): unknown[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

function normalizeMiniGameConversation(lines: unknown): ConvLine[] {
  return (Array.isArray(lines) ? lines : [])
    .map((line) => {
      if (typeof line === "string") return { speaker: "Scene", text: line };
      const l = line as { speaker?: string; name?: string; text?: string; line?: string };
      return {
        speaker: l?.speaker || l?.name || "Scene",
        text: l?.text || l?.line || ""
      };
    })
    .filter((line) => line.text);
}

interface QuestLike {
  id?: string;
  title?: string;
  summary?: string;
  giver?: string;
}
interface ObjectiveLike {
  id?: string;
  label?: string;
}

function defaultMiniGameConversation(
  source: string,
  quest: QuestLike | null,
  objective: ObjectiveLike | null,
  node: MiniGameNodeLike | null
): ConvLine[] {
  if (source === "quest_minigame" && quest) {
    const giver = quest.giver || "Guild Clerk";
    const objLabel = objective?.label || "the puzzle room";
    return [
      { speaker: giver, text: `This is part of the job, not a side diversion. Clear ${objLabel} and I can mark the bonus.` },
      { speaker: "Bin", text: "Then it counts. Open the room." }
    ];
  }
  if (source === "scenario_progress") {
    return [{ speaker: "Route Beat", text: "The obstacle is small, but it decides whether the run keeps momentum." }];
  }
  if (node?.speaker && node?.text) {
    return [{ speaker: node.speaker, text: node.text }];
  }
  return [];
}

function questMiniGameContextText(quest: QuestLike = {}, objective: ObjectiveLike = {}): string {
  return [
    quest.summary || "",
    objective?.label ? `Objective: ${objective.label}.` : "",
    quest.giver ? `Giver: ${quest.giver}.` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function miniGameContextWinOps(
  config: MiniGameConfig,
  context: SessionContext,
  resolved: { quest?: QuestLike; objective?: ObjectiveLike; title?: string }
): unknown[] {
  if (config.contextualBonus === false) return [];
  const source = String(context.source || "");
  const quest = resolved.quest;
  const objective = resolved.objective;
  if (source === "quest_minigame" && quest) {
    return [{
      op: "log",
      text: `Quest mini-game cleared in context: ${quest.title || quest.id}${objective?.label ? ` - ${objective.label}` : ""}.`
    }];
  }
  if (source === "sequence_minigame") {
    return [{ op: "log", text: `Story mini-game cleared: ${resolved.title || config.gameId || "scene challenge"}.` }];
  }
  if (source === "scenario_progress") {
    return [{ op: "log", text: "Scenario mini-game cleared and the route keeps its momentum." }];
  }
  return [];
}

export function miniGameStoryContext(config: MiniGameConfig, context: SessionContext = {}): StoryContext {
  const source = String(context.source || "campaign_minigame");
  const quest = (context.quest as QuestLike | null) || (context.questId ? activeQuestById(context.questId) : null);
  const objective =
    (context.objective as ObjectiveLike | null) ||
    (quest ? (questMiniGameObjective(quest as Parameters<typeof questMiniGameObjective>[0]) as ObjectiveLike | null) : null);
  const node = context.node || null;
  const title =
    config.briefingTitle ||
    (quest ? `${quest.title || quest.id}: ${objective?.label || "Puzzle room"}` : "") ||
    node?.title ||
    node?.label ||
    label(config.gameId || "Mini-game");
  const contextText =
    config.contextText ||
    (quest ? questMiniGameContextText(quest, objective || {}) : "") ||
    node?.text ||
    (source === "scenario_progress" ? "A route obstacle resolves as a small puzzle beat before the run can continue." : "");
  const conversation = normalizeMiniGameConversation(config.conversation);
  const defaultConv = conversation.length ? [] : defaultMiniGameConversation(source, quest, objective, node);
  const bonusOps = asOps(config.bonusOps);
  const contextOps = miniGameContextWinOps(config, context, { quest: quest || undefined, objective: objective || undefined, title });
  return {
    title,
    contextText,
    conversation: conversation.length ? conversation : defaultConv,
    bonusText: config.bonusText || "",
    briefingBonusText: config.bonusText || "Clear bonus: the selected room applies its next-battle buff and JP reward on success.",
    onWinOps: [...asOps(config.onWinOps), ...bonusOps, ...contextOps],
    onLoseOps: asOps(config.onLoseOps)
  };
}

export function applyMiniGameResult(
  result: MiniGameResult | null | undefined,
  source = "campaign_minigame",
  storyContext: StoryContext | null = null
): void {
  if (!result) return;
  const opsList = (result.suggestedOps || []).filter((op) => {
    return !(op?.op === "update_quest_progress" && (!op.questId || !op.objectiveId));
  });
  if (opsList.length) ops().apply(opsList as Array<{ op: string; [key: string]: unknown }>, { source });
  else rerender();
  if (result.status === "win") {
    const buff = result.narrative?.buffName || "";
    if (buff) {
      toast(`Mini-game cleared: ${buff} ready`, "success");
      return;
    }
    if (storyContext?.bonusText) {
      toast(`Mini-game cleared: ${storyContext.bonusText}`, "success");
      return;
    }
    toast("Mini-game cleared", "success");
    return;
  }
  if (result.status === "fail") {
    toast("Mini-game failed", "info");
    return;
  }
  if (result.status === "giveup") {
    toast("Mini-game abandoned", "info");
    return;
  }
  if (result.status === "error") {
    toast("Mini-game returned an error", "error");
  }
}

function showMiniGameBriefing(storyContext: StoryContext, launch: () => unknown): void {
  const body = document.createElement("div");
  body.className = "campaign-minigame-briefing";
  if (storyContext.contextText) {
    const p = document.createElement("p");
    p.className = "campaign-minigame-briefing-context";
    p.textContent = storyContext.contextText;
    body.appendChild(p);
  }
  for (const line of storyContext.conversation || []) {
    const row = document.createElement("p");
    row.className = "campaign-minigame-briefing-line";
    const speaker = document.createElement("strong");
    speaker.textContent = line.speaker || "Scene";
    const text = document.createElement("span");
    text.textContent = line.text || "";
    row.appendChild(speaker);
    row.appendChild(text);
    body.appendChild(row);
  }
  if (storyContext.briefingBonusText) {
    const bonus = document.createElement("div");
    bonus.className = "campaign-minigame-briefing-bonus";
    bonus.textContent = storyContext.briefingBonusText;
    body.appendChild(bonus);
  }
  modals()?.formModal({
    title: storyContext.title || "Mini-Game Beat",
    body,
    width: "540px",
    primaryLabel: "Play Mini-Game",
    onSubmit: () => { launch?.(); }
  });
}

export async function openMiniGameSession(config: MiniGameConfig, context: SessionContext = {}): Promise<unknown> {
  const mg = minigames();
  if (!mg?.openMiniGame) {
    toast("Mini-game module is not loaded", "error");
    return null;
  }
  if (!config.gameId) {
    toast("No mini-game is linked here", "info");
    return null;
  }
  const questId = context.questId && context.objectiveId ? context.questId : null;
  const objectiveId = context.questId && context.objectiveId ? context.objectiveId : null;
  const storyContext = miniGameStoryContext(config, context);
  const launch = async () => {
    try {
      const session = await mg.openMiniGame?.({
        gameId: config.gameId,
        levelId: config.levelId || undefined,
        difficulty: config.difficulty || undefined,
        seed: config.seed || undefined,
        theme: config.theme || undefined,
        source: context.source || "campaign_minigame",
        questId,
        objectiveId,
        eventId: context.eventId || null,
        mapId: context.mapId || null,
        nodeId: context.nodeId || null,
        contextText: storyContext.contextText || undefined,
        conversation: storyContext.conversation || [],
        bonusText: storyContext.bonusText || undefined,
        onWinOps: storyContext.onWinOps || [],
        onLoseOps: storyContext.onLoseOps || [],
        onComplete: (result: MiniGameResult) =>
          context.onComplete
            ? context.onComplete(result, storyContext)
            : applyMiniGameResult(result, context.source || "campaign_minigame", storyContext)
      });
      if (!session) toast("Mini-game could not open", "error");
      return session;
    } catch (error) {
      console.error(error);
      toast((error as Error)?.message || "Mini-game failed to open", "error");
      return null;
    }
  };
  if (context.requireBriefing) {
    showMiniGameBriefing(storyContext, launch);
    return null;
  }
  return launch();
}

// ── Handlers ─────────────────────────────────────────────────────
interface SequenceActive {
  sequenceId?: string;
  nodeId?: string;
}

export async function playSequenceMiniGame(): Promise<unknown> {
  const seq = sequences();
  const state = cs().getState();
  const active = seq?.active?.(state) as SequenceActive | null | undefined;
  const sequence = active ? seq?.cachedSequence?.(active.sequenceId || "", (state as { currentWorld?: string } | null)?.currentWorld) : null;
  const node = sequence ? (seq?.findNode?.(sequence, active?.nodeId || "") as MiniGameNodeLike | null | undefined) : null;
  if (!node || String(node.type || "").toLowerCase() !== "minigame") {
    toast("No active mini-game node", "info");
    return null;
  }
  const config = miniGameConfig(node, { includeOps: false });
  config.seed = config.seed || `${active?.sequenceId}:${node.id}`;
  return openMiniGameSession(config, {
    source: "sequence_minigame",
    eventId: active?.sequenceId,
    nodeId: node.id,
    sequence,
    node,
    onComplete: (result, storyContext) => {
      applyMiniGameResult(result, "sequence_minigame", storyContext);
      const runtime = actionsRuntime();
      if (result?.status === "win") {
        runtime?.run?.("sequence-win");
        return;
      }
      if (result?.status === "fail" || result?.status === "giveup") {
        runtime?.run?.("sequence-lose");
        return;
      }
      toast("Mini-game could not resolve this sequence node", "error");
    }
  });
}

export async function havenPlayMinigame(gameId: string): Promise<unknown> {
  if (!gameId) return null;
  const mg = minigames();
  if (!mg?.openMiniGame) {
    toast("Mini-game module is not loaded", "error");
    return null;
  }
  try {
    const session = await mg.openMiniGame({
      gameId,
      source: "pocket_haven",
      mapId: "pocket_haven",
      nodeId: gameId,
      onComplete: (result: MiniGameResult) => {
        applyMiniGameResult(result, "pocket_haven");
        if (result?.status === "win") {
          toast(`${result.narrative?.buffName || "Buff"} applied for the next battle`, "success");
        }
      }
    });
    if (!session) toast("Mini-game could not open", "error");
    return session;
  } catch (error) {
    console.error(error);
    toast((error as Error)?.message || "Mini-game failed to open", "error");
    return null;
  }
}

export function questMiniGame(questId: string): void {
  const quest = activeQuestById(questId);
  if (!quest) {
    toast("Quest is not active", "info");
    return;
  }
  const objective = questMiniGameObjective(quest);
  if (!objective) {
    toast("This quest has no mini-game objective", "info");
    return;
  }
  const config = miniGameConfig(objective as MiniGameNodeLike);
  if (config.gameId) {
    config.seed = config.seed || `${quest.id}:${objective.id || "objective"}`;
    void openMiniGameSession(config, {
      source: "quest_minigame",
      questId,
      objectiveId: objective.id,
      quest,
      objective,
      requireBriefing: true
    });
    return;
  }
  const mg = minigames();
  if (!mg?.listGames || !mg?.openMiniGame) {
    toast("Mini-game module is not loaded", "error");
    return;
  }
  const games = mg.listGames() || [];
  if (!games.length) {
    toast("No mini-games are registered", "info");
    return;
  }
  const m = modals();
  const ui = widgets();
  if (!m || !ui) return;
  const body = document.createElement("div");
  body.appendChild(m.formLabel("Mini-Game"));
  const game = ui.createSelect({
    options: games.map((entry) => ({ value: entry.id || "", label: entry.title || label(entry.id || "") })),
    value: games[0]?.id || ""
  });
  body.appendChild(game);
  body.appendChild(m.formLabel("Difficulty"));
  const difficulty = ui.createSelect({
    options: [1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `Difficulty ${value}` })),
    value: "1"
  });
  body.appendChild(difficulty);
  m.formModal({
    title: `Mini-Game: ${quest.title || quest.id}`,
    body,
    primaryLabel: "Play",
    onSubmit: () => {
      void openMiniGameSession(
        {
          ...miniGameConfig({}),
          gameId: game.value,
          difficulty: Number(difficulty.value || 1),
          seed: `${quest.id}:${objective.id || "objective"}`
        },
        {
          source: "quest_minigame",
          questId,
          objectiveId: objective.id,
          quest,
          objective,
          requireBriefing: true
        }
      );
    }
  });
}
