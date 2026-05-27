// forge.ts — Phase H.3 forge / idea-saving passthrough handlers.
//
// Each delegates to a sibling forge module (quest chains, battle-set
// forge, map-seed forge) by id, exactly as the deleted switch cases did.

import { mod } from "./context";

interface QuestChainsModule {
  saveAsIdea?: (id: string) => void;
}
interface BattleSetForgeModule {
  queueBattle?: (id: string) => void;
  saveCard?: (id: string) => void;
}
interface MapSeedForgeModule {
  saveSeed?: (id: string) => void;
}

export function saveChainAsIdea(id: string): void {
  mod<QuestChainsModule>("CampaignQuestChains")?.saveAsIdea?.(id);
}

export function queueBattleSet(id: string): void {
  mod<BattleSetForgeModule>("CampaignBattleSetForge")?.queueBattle?.(id);
}

export function saveBattleCard(id: string): void {
  mod<BattleSetForgeModule>("CampaignBattleSetForge")?.saveCard?.(id);
}

export function saveMapSeed(id: string): void {
  mod<MapSeedForgeModule>("CampaignMapSeedForge")?.saveSeed?.(id);
}
