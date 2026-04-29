// campaign-battle-set-forge.js
// GM-ready battle cards and bridge handoff helpers.

window.CJS = window.CJS || {};

window.CJS.CampaignBattleSetForge = (() => {
  'use strict';

  const Ops = () => window.CJS.CampaignOps;
  const Loader = () => window.CJS.CampaignDataLoader;
  const Side = () => window.CJS.CampaignSideContent;

  function getCards(filters = {}) {
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
      notes: card.gimmick || ''
    }, { source: 'battle_set_forge' });
  }

  function victoryOps(cardId) {
    const card = getCard(cardId);
    return card?.rewardOps || [];
  }

  return Object.freeze({
    getCards,
    getCard,
    saveCard,
    queueBattle,
    victoryOps
  });
})();
