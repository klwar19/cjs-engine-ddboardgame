// forge.ts — Phase H.3 forge / idea-saving passthrough handlers.
//
// Each delegates to a sibling forge module (quest chains, battle-set
// forge, map-seed forge) by id, exactly as the deleted switch cases did.

import { mod, toast } from "./context";

interface QuestChainsModule {
  saveAsIdea?: (id: string) => void;
}
interface ForgeCard {
  id?: string;
  name?: string;
  [key: string]: unknown;
}
interface BattleSetForgeModule {
  queueBattle?: (id: string) => void;
  saveCard?: (id: string) => void;
  getCard?: (id: string) => ForgeCard | null | undefined;
}
interface MapSeedForgeModule {
  saveSeed?: (id: string) => void;
  getSeed?: (id: string) => ForgeCard | null | undefined;
}
interface SideContentModule {
  copyMarkdown?: (card: Record<string, unknown>) => Promise<unknown>;
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

export function copyBattleCard(id: string): void {
  const card = mod<BattleSetForgeModule>("CampaignBattleSetForge")?.getCard?.(id);
  if (!card) return;
  mod<SideContentModule>("CampaignSideContent")
    ?.copyMarkdown?.({ ...card, type: "battle_set", title: card.name || card.id })
    .then(() => toast("Battle card copied", "success"));
}

export function copyMapSeed(id: string): void {
  const seed = mod<MapSeedForgeModule>("CampaignMapSeedForge")?.getSeed?.(id);
  if (!seed) return;
  mod<SideContentModule>("CampaignSideContent")
    ?.copyMarkdown?.({ ...seed, type: "map_seed", title: seed.name || seed.id })
    .then(() => toast("Map seed copied", "success"));
}
