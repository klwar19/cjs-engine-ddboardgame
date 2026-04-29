// campaign-events.js
// Weighted event table rolling and apply/edit/ignore handoff.

window.CJS = window.CJS || {};

window.CJS.CampaignEvents = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const Ops = () => window.CJS.CampaignOps;

  function getTable(tableId) {
    if (!tableId) return null;
    return CS().getContent().campaignEvents[tableId] || null;
  }

  function roll(tableId, options = {}) {
    if (options.chance !== undefined && Math.random() > Number(options.chance)) {
      return null;
    }

    const table = getTable(tableId);
    if (!table || !Array.isArray(table.entries) || table.entries.length === 0) return null;

    const entry = weightedPick(table.entries);
    const result = {
      ...CS().clone(entry),
      tableId,
      tableName: table.name || tableId,
      rolledAt: new Date().toISOString()
    };
    CS().mutate((state) => {
      state.lastEvent = result;
    }, { source: 'event_roll' });
    return result;
  }

  function weightedPick(entries) {
    const total = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.weight || 1)), 0);
    let cursor = Math.random() * (total || entries.length || 1);
    for (const entry of entries) {
      cursor -= Math.max(0, Number(entry.weight || 1));
      if (cursor <= 0) return entry;
    }
    return entries[entries.length - 1];
  }

  function applyEvent(event, operations) {
    const ops = operations || event?.suggested || [];
    if (!event) return [];
    const applied = Ops().apply(ops, { source: 'event' });
    Ops().apply({ op: 'log', text: `Event applied: ${event.title || event.id}.` }, { source: 'event' });
    return applied;
  }

  function ignoreEvent(event, noteOnly = false) {
    if (!event) return;
    Ops().apply({
      op: 'log',
      text: noteOnly
        ? `Event saved as note: ${event.title || event.id} - ${event.prompt || ''}`
        : `Event ignored: ${event.title || event.id}.`
    }, { source: 'event' });
  }

  return Object.freeze({
    getTable,
    roll,
    weightedPick,
    applyEvent,
    ignoreEvent
  });
})();
