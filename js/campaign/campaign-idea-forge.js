// campaign-idea-forge.js
// Oracle and keyword prompt helpers for no-runtime-AI side content.

window.CJS = window.CJS || {};

window.CJS.CampaignIdeaForge = (() => {
  'use strict';

  const Loader = () => window.CJS.CampaignDataLoader;
  const Ops = () => window.CJS.CampaignOps;
  const Side = () => window.CJS.CampaignSideContent;

  function rollOracle(tableId) {
    const table = Loader().getOracleTable(tableId);
    if (!table) return null;
    const prompt = _pick(table.prompts || []);
    const card = prompt ? Side().normalizeCard({
      ...prompt,
      id: `idea_${prompt.id}_${Date.now()}`,
      sourceId: prompt.id,
      type: 'oracle_prompt',
      title: prompt.title || prompt.text,
      sourceTableId: table.id
    }, { source: 'oracle' }) : _rollFromKeywords(table);
    Ops().apply({ op: 'side_idea_save', contentCard: card, status: 'idea' }, { source: 'oracle' });
    if (card.canonRisk === 'red') {
      Ops().apply({ op: 'review_queue_add', contentId: card.id, canonRisk: 'red', reason: 'Red-risk oracle result requires GM approval.' }, { source: 'oracle' });
    }
    return card;
  }

  function _rollFromKeywords(table) {
    const t = table.tables || {};
    const adjective = _pick(t.adjectives) || 'strange';
    const noun = _pick(t.nouns) || 'sign';
    const verb = _pick(t.verbs) || 'points at';
    const object = _pick(t.objects) || 'the party';
    const twist = _pick(t.twists) || 'nobody agrees what it means';
    return Side().normalizeCard({
      id: `oracle_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      type: 'oracle_prompt',
      title: `${adjective} ${noun}`,
      text: `The ${adjective} ${noun} ${verb} ${object}, but ${twist}.`,
      suggestedUse: 'Procedural keyword prompt.',
      canonRisk: table.defaultCanonRisk || 'green',
      tags: ['oracle', table.world, table.zone].filter(Boolean),
      sourceTableId: table.id
    }, { source: 'oracle' });
  }

  function _pick(list) {
    if (!Array.isArray(list) || !list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  return Object.freeze({
    rollOracle
  });
})();
