// quest-chain.ts — Phase H.3 quest-chain (side story arc) action handlers.
//
// Ports the quest-chain handlers that delegate straight to the
// CampaignQuestChains module (advance / complete / fail a tracked arc,
// promote a template into the Event tracker). Toast strings + the
// promote-chain mode/tab jump mirror the deleted closures.
//
// start-chain / chain-scenario / chain-battle also live here: each
// gates on the active scenario run, ensures the chain's tracked quest
// exists (CampaignQuestChains.toQuest + add_quest op), then routes
// through CampaignQuestLauncher (scenario flavor) or CampaignActionsRuntime
// ('chain-battle' → questBattle). Mode/tab jumps + toast strings mirror
// the deleted closures.

import { applyOp, cs, mod, rerender, setActiveModeRaw, setActiveTabRaw, toast } from "./context";
import { goto } from "./nav";
import { activeRunQuestId, isQuestResolved, questMapForm, questMapType } from "./quest";
import type { LauncherOverrides, LauncherQuest } from "./quest-launcher";

interface ChainTemplate {
  id?: string;
  mapType?: string;
  mapForm?: string;
  travelMode?: string;
  size?: string;
  linkedScenario?: string;
  [key: string]: unknown;
}

interface QuestChainsModule {
  advance?: (templateId: string) => void;
  complete?: (templateId: string) => void;
  fail?: (templateId: string) => void;
  start?: (templateId: string) => void;
  getTemplate?: (templateId: string) => ChainTemplate | null | undefined;
  toQuest?: (chain: ChainTemplate) => LauncherQuest;
}

interface ActiveRun {
  questChainId?: string;
  [key: string]: unknown;
}

interface QuestLauncherRuntime {
  startQuestScenario?: (
    questId: string,
    overrides?: LauncherOverrides
  ) => { error?: string; scenario?: unknown } | null;
  questBattle?: (questId: string) => void;
}

function chains(): QuestChainsModule | undefined {
  return mod<QuestChainsModule>("CampaignQuestChains");
}

function launcher(): QuestLauncherRuntime | undefined {
  return mod<QuestLauncherRuntime>("CampaignQuestLauncher");
}

export function advanceChain(templateId: string): void {
  chains()?.advance?.(templateId);
  rerender();
}

export function completeChain(templateId: string): void {
  chains()?.complete?.(templateId);
  rerender();
  toast("Quest arc resolved", "success");
}

export function failChain(templateId: string): void {
  chains()?.fail?.(templateId);
  rerender();
  toast("Quest arc failed", "info");
}

export function promoteChain(templateId: string): void {
  chains()?.start?.(templateId);
  setActiveModeRaw("event");
  setActiveTabRaw("questChains");
  rerender();
  toast("Side story added to Event", "success");
}

// Mirrors `_ensureQuestChainQuest`. Returns the existing (unresolved)
// quest for this chain when present, otherwise builds + adds a new one
// from the chain template (the chain's `toQuest()` is the canonical
// template-to-quest conversion).
export function ensureQuestChainQuest(chain: ChainTemplate): LauncherQuest | null {
  const chainId = chain?.id;
  if (!chainId) return null;
  const questId = `quest_${chainId}`;
  const state = cs().getState() as { quests?: Record<string, LauncherQuest> } | null;
  const existing = state?.quests?.[questId];
  if (existing && !isQuestResolved(existing)) return existing;
  const chainsModule = chains();
  if (!chainsModule?.toQuest) return null;
  const quest = chainsModule.toQuest(chain);
  applyOp({ op: "add_quest", quest }, "quest_chain");
  const refreshed = (cs().getState() as { quests?: Record<string, LauncherQuest> } | null)?.quests?.[questId];
  return refreshed || quest;
}

// Mirrors `_startQuestChainRun` (action: `start-chain`). Refuses if an
// active scenario is in progress, otherwise starts the chain and routes
// to the chain's scenario map.
export function startQuestChainRun(templateId: string): unknown {
  const chainsModule = chains();
  const chain = chainsModule?.getTemplate?.(templateId);
  if (!chain) {
    toast("Quest arc not found", "info");
    return;
  }
  if ((cs().getState() as { activeScenarioRun?: unknown } | null)?.activeScenarioRun) {
    setActiveModeRaw("event");
    setActiveTabRaw("maps");
    rerender();
    toast("A scenario is already active. Finish it before starting a quest arc run.", "info");
    return;
  }
  chainsModule?.start?.(templateId);
  return startQuestChainScenario(templateId);
}

// Mirrors `_startQuestChainScenario` (action: `chain-scenario`). Looks
// up the chain template, ensures its quest, redirects to the active
// run's maps tab if it already belongs to this chain (or refuses if
// it belongs to a different quest), then routes through the launcher.
export function startQuestChainScenario(templateId: string): unknown {
  const chain = chains()?.getTemplate?.(templateId);
  if (!chain) {
    toast("Quest arc not found", "info");
    return;
  }
  const quest = ensureQuestChainQuest(chain);
  if (!quest) return null;
  const state = cs().getState() as { activeScenarioRun?: ActiveRun } | null;
  const activeRun = state?.activeScenarioRun;
  const activeScenario = cs().getActiveScenario() as { source?: { questId?: string } } | null | undefined;
  if (activeRun) {
    if (activeRunQuestId(activeRun, activeScenario) === quest.id || activeRun.questChainId === templateId) {
      goto(null, "maps");
      return;
    }
    toast("End the active scenario before starting this quest arc map", "info");
    return;
  }
  return launcher()?.startQuestScenario?.(quest.id || "", {
    quest,
    source: "quest_chain",
    questChainId: templateId,
    mapForm: questMapForm(chain),
    mapType: chain.mapType || questMapType(chain),
    size: chain.size || "small",
    forceGenerated: !chain.linkedScenario
  });
}

// Mirrors `_questChainBattle` (action: `chain-battle`). Resolves the
// chain's tracked quest then queues a quest battle through the
// launcher (matches the questBattle action handler path).
export function chainBattle(templateId: string): void {
  const chain = chains()?.getTemplate?.(templateId);
  if (!chain) {
    toast("Quest arc not found", "info");
    return;
  }
  const quest = ensureQuestChainQuest(chain);
  if (!quest?.id) return;
  launcher()?.questBattle?.(quest.id);
}
