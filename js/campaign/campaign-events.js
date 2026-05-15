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

  function pickTable(tableIds, context = {}) {
    const ids = (tableIds || []).filter(Boolean);
    if (!ids.length) return null;
    const world = context.world || CS().getState()?.currentWorld;
    const scored = ids
      .map((id) => ({ id, table: getTable(id) }))
      .filter((entry) => entry.table)
      .map((entry) => ({ id: entry.id, table: entry.table, score: _scoreTable(entry.table, context, world) }))
      .sort((a, b) => b.score - a.score);
    return scored[0]?.id || ids[0];
  }

  function _scoreTable(table, context, world) {
    const tableTags = new Set((table.tags || []).map((t) => String(t).toLowerCase()));
    const tableSettings = new Set((table.settings || []).map((t) => String(t).toLowerCase()));
    const ctxSetting = String(context.setting || '').toLowerCase();
    const ctxTags = (context.tags || []).map((t) => String(t).toLowerCase());
    let score = 0;
    if (table.world && world && table.world === world) score += 1;
    if (ctxSetting) {
      if (tableTags.has(ctxSetting)) score += 6;
      else if (tableSettings.has(ctxSetting)) score += 2;
    }
    for (const tag of ctxTags) {
      if (tableTags.has(tag)) score += 3;
      else if (tableSettings.has(tag)) score += 1;
    }
    if (tableTags.has('aftermath')) {
      if (context.afterBattle) score += 10;
      else score -= 6;
    }
    return score;
  }

  function roll(tableId, options = {}) {
    if (options.chance !== undefined && Math.random() > Number(options.chance)) {
      return null;
    }

    const table = getTable(tableId);
    if (!table || !Array.isArray(table.entries) || table.entries.length === 0) return null;

    const candidates = _filterEntries(table.entries, options);
    const pool = candidates.length ? candidates : table.entries;
    const entry = weightedPick(pool);
    const result = {
      ...CS().clone(entry),
      tableId,
      tableName: table.name || tableId,
      rolledAt: new Date().toISOString()
    };
    CS().mutate((state) => {
      state.lastEvent = result;
    }, { source: 'event_roll' });
    const Chat = window.CJS.CampaignPartyChat;
    if (Chat?.auto) {
      const state = CS().getState();
      Chat.auto({
        world: state?.currentWorld,
        situation: state?.activeScenarioRun ? 'scenario' : 'town',
        scenarioId: state?.activeScenarioRun?.scenarioId || '',
        locationKind: 'event',
        tags: [...(result.tags || []), 'event']
      }, { chance: 0.4 });
    }
    return result;
  }

  function _filterEntries(entries, context = {}) {
    const state = CS().getState();
    const partyIds = new Set(Object.keys(state?.party || {}));
    const ctxTags = new Set((context.tags || []).map((t) => String(t).toLowerCase()));
    const ctxSetting = String(context.setting || '').toLowerCase();
    const ctxLocation = String(context.locationKind || '').toLowerCase();
    const flags = state?.flags || {};
    return entries.filter((entry) => {
      for (const id of entry.requiresParty || []) if (!partyIds.has(id)) return false;
      for (const id of entry.excludesParty || []) if (partyIds.has(id)) return false;
      for (const flag of entry.requiresFlag || []) if (!flags[flag]) return false;
      for (const flag of entry.excludesFlag || []) if (flags[flag]) return false;
      if ((entry.settings || []).length) {
        if (!entry.settings.map((s) => String(s).toLowerCase()).includes(ctxSetting)) return false;
      }
      if ((entry.locationKinds || []).length) {
        if (!entry.locationKinds.map((s) => String(s).toLowerCase()).includes(ctxLocation)) return false;
      }
      if ((entry.requiredTags || []).length) {
        const need = entry.requiredTags.map((t) => String(t).toLowerCase());
        if (!need.every((tag) => ctxTags.has(tag))) return false;
      }
      return true;
    });
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
    if (!ops.some((op) => op?.op === 'event_log_add')) {
      Ops().apply({ op: 'event_log_add', entry: _eventLogEntry(event, ops, 'applied') }, { source: 'event' });
    }
    Ops().apply({ op: 'log', text: `Event applied: ${event.title || event.id}.` }, { source: 'event' });
    return applied;
  }

  function ignoreEvent(event, noteOnly = false) {
    if (!event) return;
    if (noteOnly) {
      Ops().apply({ op: 'event_log_add', entry: _eventLogEntry(event, [], 'noted') }, { source: 'event_note' });
    }
    Ops().apply({
      op: 'log',
      text: noteOnly
        ? `Event saved as note: ${event.title || event.id} - ${event.prompt || ''}`
        : `Event ignored: ${event.title || event.id}.`
    }, { source: 'event' });
  }

  function _eventLogEntry(event = {}, ops = [], status = 'noted') {
    const summary = event.manualSummary?.short
      || event.summary
      || event.prompt
      || event.gmHook
      || event.title
      || event.id
      || 'Event happened.';
    return {
      id: `event_log_${event.id || Date.now()}_${status}`,
      title: event.title || event.id || 'Event',
      summary,
      source: event.source || event.tableName || 'event',
      scope: event.type || event.kind || event.scope || 'event',
      relatedId: event.id || null,
      tags: [
        ...(event.tags || []),
        ...(event.manualSummary?.tags || []),
        status
      ],
      consequences: Ops().describe(ops || []).filter(Boolean)
    };
  }

  function pinAsPlotSeed(event) {
    if (!event) return;
    const lines = [event.title ? `Plot seed: ${event.title}` : 'Plot seed'];
    if (event.gmHook) lines.push(event.gmHook);
    else if (event.prompt) lines.push(event.prompt);
    if (event.gmIdea) lines.push(`Hook kind: ${event.gmIdea}`);
    if (event.oracleTableId) lines.push(`Oracle table: ${event.oracleTableId}`);
    const text = lines.join(' — ');
    CS().mutate((state) => {
      state.pinnedNotes = state.pinnedNotes || [];
      state.pinnedNotes.unshift({ at: new Date().toISOString(), text, source: 'plot_seed', eventId: event.id });
    }, { source: 'plot_seed' });
    Ops().apply({ op: 'log', text: `Plot seed pinned: ${event.title || event.id}.` }, { source: 'plot_seed' });
    if (event.oracleTableId && window.CJS.CampaignOracle?.roll) {
      const oracle = window.CJS.CampaignOracle.roll();
      if (oracle) {
        CS().mutate((state) => { state.lastOracle = { ...oracle, source: `plot_seed:${event.id}` }; }, { source: 'plot_seed_oracle' });
      }
    }
  }

  return Object.freeze({
    getTable,
    pickTable,
    roll,
    weightedPick,
    applyEvent,
    ignoreEvent,
    pinAsPlotSeed
  });
})();
