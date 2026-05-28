// solo.ts — Phase H.3 solo-hook offer / accept / dismissal handlers.
//
// The "offer" actions roll a hub-pulse card and stash it as a pending
// solo hook the Story tab surfaces. The "save"/"ignore" actions take the
// pending card and either save it to side content or reject it, then
// clear the pending pointer. The accept/quest/rumor handlers turn an
// already-offered card into a started run / new quest / rumor entry.
// random-quest-offer + startQuestRunFromOffer share the chain launcher
// (CampaignQuestLauncher.startQuestScenario / quest-chain.startQuestChainRun);
// `_pendingSoloHookCard` / `_clearPendingSoloHook` are also called by
// still-JS code, so the JS originals stay and the TS handlers reach
// the same shape inline / via the CampaignQuestLauncher install.
//
// Mutation sources, op payloads, mode/tab jumps, confirm copy and toast
// strings mirror the deleted closures exactly.

import { applyOp, cs, mod, ops, rerender, setActiveModeRaw, setActiveTabRaw, toast } from "./context";
import { modals, widgets } from "./modals";
import { startQuestChainRun } from "./quest-chain";
import { isQuestResolved, questMapForm, questMapType } from "./quest";
import type { LauncherQuest } from "./quest-launcher";

interface SoloCard {
  id?: string;
  type?: string;
  name?: string;
  title?: string;
  summary?: string;
  prompt?: string;
  canonRisk?: string;
  tags?: string[];
  questTemplate?: LauncherQuest;
  questChainTemplateId?: string;
  rewardOps?: unknown[];
  mapForm?: string;
  mapType?: string;
  travelMode?: string;
  setting?: string;
  suggestedChoices?: Array<{ label?: string; ops?: Array<{ op: string; [key: string]: unknown }> }>;
  [key: string]: unknown;
}
interface HubModule {
  rollHubPulse?: (table: string) => SoloCard | null | undefined;
  getCurrentHubId?: () => string | undefined;
}
interface SideContentModule {
  saveCard?: (card: SoloCard, opts: { status: string; source: string }) => void;
  rejectCard?: (id: string, reason: string) => void;
  risk?: (value: string) => string;
}
interface QuestLauncherRuntime {
  startQuestScenario?: (questId: string, overrides?: Record<string, unknown>) => { error?: string; scenario?: unknown } | null;
}
interface TagsModule {
  getActiveTags?: (state: Record<string, unknown>) => string[];
}

function hub(): HubModule | undefined {
  return mod<HubModule>("CampaignHub");
}
function side(): SideContentModule | undefined {
  return mod<SideContentModule>("CampaignSideContent");
}
function launcher(): QuestLauncherRuntime | undefined {
  return mod<QuestLauncherRuntime>("CampaignQuestLauncher");
}

function setPendingSoloHook(card: SoloCard, kind: string): void {
  const id = card?.id;
  if (!id) return;
  cs().mutate((state) => {
    (state as { pendingSoloHook?: unknown }).pendingSoloHook = {
      cardId: id,
      kind: kind || card.type || "hook",
      at: new Date().toISOString()
    };
  }, { source: "solo_hook" });
}

function clearPendingSoloHook(): void {
  cs().mutate((state) => {
    (state as { pendingSoloHook?: unknown }).pendingSoloHook = null;
  }, { source: "solo_hook" });
}

function pendingSoloHookCard(): SoloCard | null {
  const state = cs().getState() as
    | { pendingSoloHook?: { cardId?: string }; sideContent?: { generatedIdeas?: Record<string, SoloCard> }; lastSideContentCard?: SoloCard }
    | null;
  const id = state?.pendingSoloHook?.cardId;
  if (!id) return null;
  return (
    state?.sideContent?.generatedIdeas?.[id] ||
    (state?.lastSideContentCard?.id === id ? state.lastSideContentCard : null)
  );
}

export function rollSoloSurprise(): void {
  const tables = ["town", "guild", "tavern", "forge", "weird"];
  const table = tables[Math.floor(Math.random() * tables.length)];
  const card = hub()?.rollHubPulse?.(table);
  if (!card) {
    toast("No solo hooks available", "info");
    return;
  }
  setPendingSoloHook(card, "surprise");
  setActiveModeRaw("story");
  setActiveTabRaw("storyHome");
  rerender();
  toast("Story offer ready", "success");
}

export function offerRandomRumor(): void {
  const tables = ["tavern", "town", "weird"];
  const table = tables[Math.floor(Math.random() * tables.length)];
  const card = hub()?.rollHubPulse?.(table);
  if (!card) {
    toast("No rumor hooks available", "info");
    return;
  }
  setPendingSoloHook({ ...card, type: "rumor_offer" }, "rumor_offer");
  rerender();
}

export function saveSoloHook(): void {
  const card = pendingSoloHookCard();
  if (!card) return;
  side()?.saveCard?.(card, { status: "saved", source: "solo_hook" });
  clearPendingSoloHook();
}

export function ignoreSoloHook(): void {
  const card = pendingSoloHookCard();
  if (card) side()?.rejectCard?.(card.id || "", "Ignored from story offer.");
  clearPendingSoloHook();
}

// ── Random quest offer + accept-hook handlers (port of _offerRandomQuest /
// _acceptSoloHook / _soloHookToQuest / _soloHookToRumor) ───────────────

interface CampaignStateLike {
  currentWorld?: string;
  phase?: { type?: string };
  currentChapter?: string;
  party?: Record<string, { activePersona?: string; rank?: string }>;
  quests?: Record<string, LauncherQuest>;
  activeScenarioRun?: unknown;
  [key: string]: unknown;
}

interface QuestTemplate extends LauncherQuest {
  rankBand?: string[];
  ranks?: string[];
  kind?: string;
  repeat?: boolean;
  monsterTags?: string[];
}

interface OfferCard extends SoloCard {
  questTemplate?: QuestTemplate;
}

// Mirrors `_questTemplateWeight`. Bias the random offer toward
// world / phase / chapter / persona / rank-matching templates so the
// player doesn't see ice-world quests in a desert campaign.
function questTemplateWeight(quest: QuestTemplate = {}, state: CampaignStateLike | null = cs().getState() as CampaignStateLike | null): number {
  const activeTags = new Set([
    state?.currentWorld ? `world:${state.currentWorld}` : "",
    state?.phase?.type ? `phase:${state.phase.type}` : "",
    state?.currentChapter ? `chapter:${state.currentChapter}` : "",
    ...(mod<TagsModule>("CampaignTags")?.getActiveTags?.(state as Record<string, unknown>) || []),
    ...(Object.values(state?.party || {}).flatMap((member) =>
      member.activePersona ? [`persona:${member.activePersona}`] : []
    ) || [])
  ].filter(Boolean).map((tag) => String(tag).toLowerCase()));
  let weight = 1;
  for (const tag of [...(quest.tags || []), ...(quest.contextTags || []), ...(quest.monsterTags || [])]) {
    const cleaned = String(tag || "").toLowerCase();
    if (activeTags.has(cleaned) || activeTags.has(`world:${cleaned}`) || activeTags.has(`phase:${cleaned}`)) weight += 1;
    if (cleaned.includes(String(state?.currentWorld || "").toLowerCase())) weight += 1;
  }
  const rank = Object.values(state?.party || {})[0]?.rank || "F";
  if ((quest.rankBand || quest.ranks || []).includes(rank)) weight += 2;
  if (quest.kind === "daily" || quest.repeat) weight += 1;
  return Math.max(1, weight);
}

// Mirrors `_randomQuestOfferCard`. Picks a non-active quest template
// weighted toward the player's current context, then wraps it as a
// side-content offer card.
function randomQuestOfferCard(): OfferCard | null {
  const state = cs().getState() as CampaignStateLike | null;
  const content = cs().getContent() as { campaignQuests?: Record<string, { templates?: QuestTemplate[] }> };
  const activeQuestIds = new Set(
    Object.values(state?.quests || {})
      .filter((quest) => !isQuestResolved(quest))
      .map((quest) => quest.id || "")
  );
  const templates = Object.values(content.campaignQuests || {})
    .flatMap((record) => record.templates || [])
    .filter((quest) => !activeQuestIds.has(quest.id || ""));
  const options = templates.map((quest) => ({ quest }));
  if (!options.length) return null;
  const weighted = options.map((option) => ({ option, weight: questTemplateWeight(option.quest, state) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * Math.max(1, total);
  let pick = weighted[0]?.option;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) {
      pick = entry.option;
      break;
    }
  }
  if (!pick) return null;
  const quest = cs().clone(pick.quest);
  return {
    id: `idea_offer_${quest.id}_${Date.now()}`,
    type: "quest_offer",
    title: quest.title || quest.id,
    summary: quest.summary || "",
    canonRisk: quest.canonRisk || "green",
    tags: quest.tags || [],
    questTemplate: quest,
    suggestedChoices: [
      {
        label: "Start this quest run",
        ops: [{ op: "add_quest", quest }]
      }
    ]
  };
}

// Mirrors `_questFromOfferCard`. Builds a Quest from the offer card's
// `questTemplate` (cloning so the original isn't mutated) or, lacking
// one, synthesizes a follow-this-hook stub. The mapForm / mapType
// fall back to the text-search inference.
function questFromOfferCard(card: OfferCard): LauncherQuest {
  const base: LauncherQuest = card.questTemplate
    ? cs().clone(card.questTemplate)
    : {
        id: `quest_${card.id || Date.now()}`,
        title: card.title || card.name || "Quest Run",
        summary: card.summary || card.prompt || "",
        objectives: [{ id: "follow_hook", label: "Follow this hook", current: 0, required: 1 }],
        rewards: card.rewardOps || [],
        tags: card.tags || []
      };
  (base as { templateId?: string }).templateId = (base as { templateId?: string }).templateId || base.id;
  base.mapForm = base.mapForm || card.mapForm || card.travelMode || questMapForm(base);
  base.mapType = base.mapType || card.mapType || card.setting || questMapType(base);
  base.status = "active";
  return base;
}

// Mirrors `_clearPendingSoloHook`. The JS original stays for still-JS
// callers; this is the local copy the TS solo-hook handlers use.
function clearPendingSoloHookMutate(): void {
  cs().mutate((state) => {
    (state as { pendingSoloHook?: unknown }).pendingSoloHook = null;
  }, { source: "solo_hook" });
}

// Mirrors `_startQuestRunFromOffer`. Refuses if a run is active, then
// either kicks off the quest chain (when the card carries
// `questChainTemplateId`) or builds a quest from the template and
// launches its scenario through the launcher. Side-idea promotion +
// the add_quest op match the deleted closure's ordering.
export function startQuestRunFromOffer(card: OfferCard | null): unknown {
  if (!card) return null;
  if ((cs().getState() as { activeScenarioRun?: unknown } | null)?.activeScenarioRun) {
    setActiveModeRaw("quest");
    setActiveTabRaw("maps");
    rerender();
    toast("A scenario is already active. Finish it before starting another quest run.", "info");
    return { error: "active_run" };
  }
  if (card.questChainTemplateId) {
    ops().apply(
      { op: "side_idea_promote", contentId: card.id, targetType: "quest_chain_run", approved: true },
      { source: "quest_run" }
    );
    clearPendingSoloHookMutate();
    return startQuestChainRun(card.questChainTemplateId);
  }

  const quest = questFromOfferCard(card);
  if (!quest) return null;
  ops().apply({ op: "add_quest", quest }, { source: "quest_run" });
  ops().apply(
    { op: "side_idea_promote", contentId: card.id, targetType: "quest_run", approved: true },
    { source: "quest_run" }
  );
  clearPendingSoloHookMutate();
  const result = launcher()?.startQuestScenario?.(quest.id || "", {
    quest,
    mapForm: questMapForm(quest),
    mapType: quest.mapType || questMapType(quest)
  });
  if ((result as { error?: string } | null)?.error) {
    setActiveModeRaw("quest");
    setActiveTabRaw("quests");
    rerender();
  }
  return result;
}

// Mirrors `_offerRandomQuest` (action: `random-quest-offer`).
export function offerRandomQuest(): unknown {
  if ((cs().getState() as { activeScenarioRun?: unknown } | null)?.activeScenarioRun) {
    setActiveModeRaw("quest");
    setActiveTabRaw("maps");
    rerender();
    toast("A scenario is already active. Finish it before starting another quest run.", "info");
    return;
  }
  const card = randomQuestOfferCard();
  if (!card) {
    toast("No single-quest templates available. Finish an active quest or add more quest templates.", "info");
    return;
  }
  side()?.saveCard?.(card, { status: "active", source: "quest_run" });
  return startQuestRunFromOffer(card);
}

// Mirrors `_acceptSoloHook` (action: `accept-solo-hook`). Routes to the
// appropriate accept path: quest-template / chain → run-from-offer;
// suggested-choice ops → hub-event apply; nothing → soloHookToQuest.
export function acceptSoloHook(): void {
  const card = pendingSoloHookCard() as OfferCard | null;
  if (!card) return;
  const apply = (): void => {
    if (card.questTemplate || card.questChainTemplateId || card.type === "quest_offer") {
      startQuestRunFromOffer(card);
      return;
    }
    const choice = card.suggestedChoices?.[0];
    if (choice?.ops?.length) {
      ops().apply(choice.ops, { source: "solo_hook_accept" });
      ops().apply(
        { op: "side_idea_promote", contentId: card.id, targetType: "hub_event", approved: true },
        { source: "solo_hook" }
      );
    } else {
      soloHookToQuest(true);
      return;
    }
    clearPendingSoloHookMutate();
    setActiveModeRaw("story");
    setActiveTabRaw("storyHome");
    rerender();
    toast("Story offer accepted", "success");
  };
  if (side()?.risk?.(card.canonRisk || "") === "red") {
    widgets()?.confirm("This is red-risk content. Accept it now?", apply);
    return;
  }
  apply();
}

// Mirrors `_soloHookToQuest` (action: `solo-hook-quest`). Red-risk
// confirms, then either promotes a chain (when carried on the card)
// or builds + adds a quest from the card's template.
export function soloHookToQuest(approved = false): void {
  const card = pendingSoloHookCard() as OfferCard | null;
  if (!card) return;
  if (side()?.risk?.(card.canonRisk || "") === "red" && !approved) {
    widgets()?.confirm("This is red-risk content. Make it a quest now?", () => soloHookToQuest(true));
    return;
  }
  if (card.questChainTemplateId) {
    const choice = card.suggestedChoices?.[0];
    if (choice?.ops?.length) ops().apply(choice.ops, { source: "solo_hook_chain" });
    ops().apply(
      { op: "side_idea_promote", contentId: card.id, targetType: "quest_chain", approved: true },
      { source: "solo_hook" }
    );
    clearPendingSoloHookMutate();
    setActiveModeRaw("quest");
    setActiveTabRaw("quests");
    rerender();
    toast("Quest arc added", "success");
    return;
  }
  const quest: LauncherQuest = card.questTemplate
    ? cs().clone(card.questTemplate)
    : {
        id: `quest_${card.id}`,
        title: card.title || card.name || "Story Quest",
        status: "active",
        summary: card.summary || card.prompt || "",
        objectives: [{ id: "follow_hook", label: "Follow this hook", current: 0, required: 1 }],
        rewards: card.rewardOps || []
      };
  ops().apply({ op: "add_quest", quest }, { source: "solo_hook_quest" });
  ops().apply(
    { op: "side_idea_promote", contentId: card.id, targetType: "accepted_hook", approved: true },
    { source: "solo_hook" }
  );
  clearPendingSoloHookMutate();
  setActiveModeRaw("quest");
  setActiveTabRaw("quests");
  rerender();
  toast(`Quest added: ${quest.title || quest.id}`, "success");
}

// Mirrors `_soloHookToRumor` (action: `solo-hook-rumor`). Red-risk
// confirms, then drops the card's text into the current hub's rumor
// table and promotes the source idea.
export function soloHookToRumor(approved = false): void {
  const card = pendingSoloHookCard() as OfferCard | null;
  if (!card) return;
  if (side()?.risk?.(card.canonRisk || "") === "red" && !approved) {
    widgets()?.confirm("This is red-risk content. Make it a rumor now?", () => soloHookToRumor(true));
    return;
  }
  const hubId = hub()?.getCurrentHubId?.();
  ops().apply(
    {
      op: "add_rumor",
      hubId,
      text: card.prompt || card.summary || card.title || card.name || card.id,
      canonRisk: card.canonRisk || "green",
      tags: card.tags || [],
      source: "solo_hook"
    },
    { source: "solo_hook_rumor" }
  );
  ops().apply(
    { op: "side_idea_promote", contentId: card.id, targetType: "rumor", approved: true },
    { source: "solo_hook" }
  );
  clearPendingSoloHookMutate();
}

export function manualRumorModal(): void {
  const ui = widgets();
  const m = modals();
  if (!ui || !m) return;
  const body = document.createElement("div");
  const hint = document.createElement("div");
  hint.className = "campaign-muted";
  hint.style.marginBottom = "8px";
  hint.textContent = "Rumors are stored leads. They do not change mechanics until you promote or apply them later.";
  body.appendChild(hint);
  body.appendChild(m.formLabel("Rumor"));
  const text = document.createElement("textarea");
  text.style.width = "100%";
  text.style.minHeight = "90px";
  text.placeholder = "What are people whispering about?";
  body.appendChild(text);
  body.appendChild(m.formLabel("Canon risk"));
  const risk = ui.createSelect({
    options: [
      { value: "green", label: "Green" },
      { value: "yellow", label: "Yellow" },
      { value: "red", label: "Red" }
    ],
    value: "green"
  });
  body.appendChild(risk);
  m.formModal({
    title: "Add Rumor",
    body,
    width: "520px",
    primaryLabel: "Add Rumor",
    onSubmit: () => {
      const value = text.value.trim();
      if (!value) {
        toast("Rumor text required", "error");
        return false;
      }
      applyOp({
        op: "add_rumor",
        hubId: hub()?.getCurrentHubId?.(),
        text: value,
        canonRisk: risk.value,
        source: "manual"
      });
    }
  });
}
