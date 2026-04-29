// campaign-hub.js
// Living hub helpers for Side Content Forge.

window.CJS = window.CJS || {};

window.CJS.CampaignHub = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const Ops = () => window.CJS.CampaignOps;
  const Loader = () => window.CJS.CampaignDataLoader;
  const Side = () => window.CJS.CampaignSideContent;

  function getCurrentHubDefinition() {
    return Loader().getHubDefinition();
  }

  function getCurrentHubId() {
    return getCurrentHubDefinition()?.id || Object.keys(CS().getState()?.hubState || {})[0] || null;
  }

  function getCurrentHubState() {
    const hubId = getCurrentHubId();
    return hubId ? CS().getHubState(hubId) : null;
  }

  function getHubEvents(tableKey) {
    const hub = getCurrentHubDefinition();
    const pack = Loader().getSideContentPack(null, null, hub?.id);
    const tableId = tableKey ? hub?.eventTables?.[tableKey] || tableKey : null;
    return (pack?.hubEvents || pack?.events || [])
      .filter((event) => !tableId || event.table === tableId || (event.tables || []).includes(tableId));
  }

  function rollHubPulse(tableKey) {
    const events = getHubEvents(tableKey);
    if (!events.length) return null;
    const selected = _weighted(events);
    const card = Side().normalizeCard({
      ...selected,
      id: `idea_${selected.id}_${Date.now()}`,
      sourceId: selected.id
    }, {
      type: 'hub_pulse',
      source: 'hub_pulse',
      hubId: getCurrentHubId(),
      status: 'idea'
    });
    Ops().apply({ op: 'side_idea_save', contentCard: card, status: 'idea' }, { source: 'hub_pulse' });
    if (card.canonRisk === 'red') {
      Ops().apply({ op: 'review_queue_add', contentId: card.id, canonRisk: 'red', reason: card.gmNote || 'Red-risk hub pulse requires GM review.' }, { source: 'hub_pulse' });
    }
    return card;
  }

  function applyChoice(cardId, choiceIndex = 0, options = {}) {
    const idea = CS().getState()?.sideContent?.generatedIdeas?.[cardId] || CS().getState()?.lastSideContentCard;
    if (!idea) return;
    if (idea.canonRisk === 'red' && !options.approved) {
      Ops().apply({ op: 'review_queue_add', contentId: idea.id, canonRisk: 'red', reason: 'Red-risk hub pulse was not auto-applied.' }, { source: 'hub_pulse' });
      return;
    }
    const choice = (idea.suggestedChoices || [])[choiceIndex];
    const ops = choice?.ops || idea.suggestedOps || idea.ops || [];
    if (ops.length) Ops().apply(ops, { source: 'hub_pulse_choice' });
    Ops().apply({ op: 'side_idea_promote', contentId: idea.id, targetType: 'hub_event', approved: !!options.approved }, { source: 'hub_pulse' });
  }

  function saveLastPulse() {
    const card = CS().getState()?.lastSideContentCard;
    if (!card) return;
    Side().saveCard(card, { status: 'saved', source: 'hub_pulse' });
  }

  function rejectLastPulse(reason) {
    const card = CS().getState()?.lastSideContentCard;
    if (card) Side().rejectCard(card.id, reason || 'Rejected from hub pulse.');
  }

  function _weighted(items) {
    const total = items.reduce((sum, item) => sum + Number(item.weight || 1), 0);
    let roll = Math.random() * total;
    for (const item of items) {
      roll -= Number(item.weight || 1);
      if (roll <= 0) return item;
    }
    return items[items.length - 1];
  }

  return Object.freeze({
    getCurrentHubDefinition,
    getCurrentHubId,
    getCurrentHubState,
    getHubEvents,
    rollHubPulse,
    applyChoice,
    saveLastPulse,
    rejectLastPulse
  });
})();
