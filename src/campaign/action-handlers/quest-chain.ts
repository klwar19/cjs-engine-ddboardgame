// quest-chain.ts — Phase H.3 quest-chain (side story arc) action handlers.
//
// Ports the quest-chain handlers that delegate straight to the
// CampaignQuestChains module (advance / complete / fail a tracked arc,
// promote a template into the Event tracker). Toast strings + the
// promote-chain mode/tab jump mirror the deleted closures.
//
// start-chain / chain-scenario / chain-battle stay in the switch — they
// reach into the scenario-launch closures (_startQuestChainScenario /
// _ensureQuestChainQuest / _startQuestScenario / _questBattle).

import { mod, rerender, setActiveModeRaw, setActiveTabRaw, toast } from "./context";

interface QuestChainsModule {
  advance?: (templateId: string) => void;
  complete?: (templateId: string) => void;
  fail?: (templateId: string) => void;
  start?: (templateId: string) => void;
}

function chains(): QuestChainsModule | undefined {
  return mod<QuestChainsModule>("CampaignQuestChains");
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
