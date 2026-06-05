// campaign-battle-set-forge.ts — Tier 3 TS port of
// js/campaign/campaign-battle-set-forge.js (engine cluster: campaign). GM-ready
// battle cards + bridge handoff (getCards/getCard/saveCard/queueBattle/
// victoryOps). DOM-free; reads window.CJS.* lazily. Exports
// `CampaignBattleSetForge` and installs window.CJS.CampaignBattleSetForge.
// Body verbatim from the legacy IIFE.

window.CJS = window.CJS || {};

export const CampaignBattleSetForge = (() => {
  'use strict';

  const Ops = () => window.CJS.CampaignOps;
  const Loader = () => window.CJS.CampaignDataLoader;
  const Side = () => window.CJS.CampaignSideContent;

  function getCards(filters: any = {}) {
    return Loader().getBattleSetCards(filters.world, filters.zone, filters.hubId)
      .filter((card) => !filters.rank || String(card.rank || '').includes(filters.rank))
      .filter((card) => !filters.tag || (card.tags || []).includes(filters.tag));
  }

  function getCard(cardId) {
    return Loader().getBattleSetCard(cardId);
  }

  function saveCard(cardId) {
    const card = getCard(cardId);
    if (!card) return;
    Side().saveCard({
      ...card,
      id: `idea_${card.id}`,
      battleSetId: card.id,
      type: 'battle_set',
      title: card.name || card.title
    }, { status: 'saved', source: 'battle_set_forge' });
  }

  function queueBattle(cardId) {
    const card = getCard(cardId);
    if (!card) return;
    Ops().apply({
      op: 'start_battle',
      encounterId: card.encounterId || null,
      battleSetId: card.id,
      label: card.name || card.id,
      source: 'side_content',
      rewardOps: card.rewardOps || [],
      objective: card.objective || '',
      notes: card.gimmick || '',
      battleMap: _battleMapForCard(card)
    }, { source: 'battle_set_forge' });
  }

  function victoryOps(cardId) {
    const card = getCard(cardId);
    return card?.rewardOps || [];
  }

  function _battleMapForCard(card: any = {}) {
    const text = [card.name, card.objective, card.gimmick, ...(card.tags || [])].join(' ').toLowerCase();
    let theme = 'forest';
    if (/temple|shrine|holy/.test(text)) theme = 'temple';
    else if (/ruins|relic|pillar/.test(text)) theme = 'ruins';
    else if (/cave|cellar|sewer|underground|den/.test(text)) theme = 'cave';
    else if (/snow|ice|frost|ridge|mountain/.test(text)) theme = 'tundra';
    else if (/arena|spar|training|guild|tavern|house|urban|street/.test(text)) theme = 'arena';
    return {
      theme,
      width: Number(card.grid?.width || 8),
      height: Number(card.grid?.height || 8)
    };
  }

  return Object.freeze({
    getCards,
    getCard,
    saveCard,
    queueBattle,
    victoryOps
  });
})();

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.CampaignBattleSetForge = CampaignBattleSetForge;
