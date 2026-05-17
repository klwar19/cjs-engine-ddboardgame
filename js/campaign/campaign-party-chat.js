// campaign-party-chat.js
// Context-aware party banter for Campaign Mode.

window.CJS = window.CJS || {};

window.CJS.CampaignPartyChat = (() => {
  'use strict';

  const DEFAULT_PATHS = ['data/campaigns/haven/side_content/party_banter.json'];
  const CS = () => window.CJS.CampaignState;
  const DS = () => window.CJS.DataStore;
  const Bridge = () => window.CJS.CampaignCombatBridge;

  let _rows = [];
  let _sets = new Map();
  let _loaded = false;

  async function load(paths = DEFAULT_PATHS) {
    const next = [];
    for (const path of paths) {
      try {
        const res = await fetch(path, { cache: 'no-store' });
        if (!res.ok) continue;
        const json = await res.json();
        next.push(...normalizeDocument(json, path));
      } catch (error) {
        console.warn('Party banter failed to load:', path, error);
      }
    }
    _rows = next.filter((row) => row.line);
    _sets = groupBySet(_rows);
    _loaded = true;
    return rows();
  }

  function rows() {
    return _rows.slice();
  }

  function roll(context = {}) {
    if (!_loaded) return null;
    const state = CS()?.getState?.();
    const party = state?.party || {};
    const readyIds = new Set(Object.entries(party)
      .filter(([, member]) => !Bridge()?.isMemberBattleReady || Bridge().isMemberBattleReady(member))
      .map(([id]) => id));
    const enrichedContext = _withPersonaTags(normalizeContext(context), state);
    const pool = _poolForContext(enrichedContext, state, readyIds);
    const picked = weightedPick(pool);
    return picked ? hydrate(picked, party, enrichedContext) : null;
  }

  // Collect persona tags from every battle-ready party member so authored
  // beats can key off active personas without every caller passing those tags.
  function _withPersonaTags(context = {}, state) {
    const PS = window.CJS.PersonaService;
    if (!PS || !state?.party) return context;
    const currentWorld = state.currentWorld;
    const tags = new Set((context.tags || []).map((tag) => String(tag).toLowerCase()));
    for (const member of Object.values(state.party)) {
      if (Bridge()?.isMemberBattleReady && !Bridge().isMemberBattleReady(member)) continue;
      const persona = PS.getActivePersona(member);
      if (!persona) continue;
      for (const tag of persona.tags || []) tags.add(String(tag).toLowerCase());
      const rel = PS.relationshipModifier(member, currentWorld);
      for (const tag of rel.tags || []) tags.add(String(tag).toLowerCase());
      if (PS.isOutOfWorld(member, currentWorld)) {
        for (const tag of persona.crossWorldPenalty?.tags || []) tags.add(String(tag).toLowerCase());
        tags.add('persona_out_of_world');
      }
    }
    return { ...context, tags: Array.from(tags) };
  }

  function auto(context = {}, options = {}) {
    const chance = Number(options.chance ?? 0.35);
    if (Math.random() > chance) return null;
    const chat = roll(context);
    if (!chat) return null;
    commit(chat, options.source || 'party_chat_auto');
    return chat;
  }

  function commit(chat, source = 'party_chat_auto') {
    if (!chat || !CS()?.mutate) return;
    CS().mutate((state) => {
      state.lastPartyChat = chat;
      state.log.unshift({
        id: `log_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        at: new Date().toISOString(),
        phase: state.phase?.number || 1,
        world: state.currentWorld,
        text: `${chat.speakerName || chat.speaker}: ${chat.line}`,
        op: 'party_chat'
      });
      state.log = state.log.slice(0, 500);
    }, { source });
  }

  function _poolForContext(context, state, readyIds) {
    for (const key of setKeys(context)) {
      const pool = (_sets.get(key) || []).filter((row) => matches(row, context, state, readyIds));
      if (pool.length) return pool;
    }
    return [];
  }

  function setKeys(context = {}) {
    const keys = [];
    const add = (key) => {
      const normalized = setKey(key);
      if (normalized && !keys.includes(normalized)) keys.push(normalized);
    };
    const addPrefixed = (prefix, value) => {
      if (value) add(`${prefix}:${value}`);
    };
    addPrefixed('map', context.mapId);
    addPrefixed('scenario', context.scenarioId);
    addPrefixed('quest', context.questId);
    addPrefixed('story', context.storyId);
    addPrefixed('event', context.eventId || context.tableId);
    addPrefixed('location', context.locationKind);
    addPrefixed('situation', context.situation);
    add(context.locationKind);
    add(context.situation);
    add('normal');
    add('default');
    return keys;
  }

  function matches(row, context, state, readyIds) {
    if (row.world && row.world !== '*' && row.world !== (context.world || state?.currentWorld)) return false;
    if (!matchesAny(row.mapIds, context.mapId)) return false;
    if (!matchesAny(row.scenarioIds, context.scenarioId)) return false;
    if (!matchesAny(row.questIds, context.questId)) return false;
    if (!matchesAny(row.storyIds, context.storyId)) return false;
    if (!matchesAny(row.eventIds, context.eventId || context.tableId)) return false;
    if (!matchesAny(row.situations, context.situation)) return false;
    if (!matchesAny(row.locationKinds, context.locationKind)) return false;
    if (row.speaker && !readyIds.has(row.speaker)) return false;
    if (row.target && row.target !== 'party' && !readyIds.has(row.target)) return false;
    for (const id of row.requiresPresent) if (!readyIds.has(id)) return false;
    for (const id of row.excludesPresent) if (readyIds.has(id)) return false;

    const ctxTags = new Set((context.tags || []).map((tag) => String(tag).toLowerCase()));
    if (row.requiredTags.length && !row.requiredTags.every((tag) => ctxTags.has(tag))) return false;
    if (row.excludedTags.length && row.excludedTags.some((tag) => ctxTags.has(tag))) return false;
    return true;
  }

  function hydrate(row, party, context) {
    return {
      id: row.id,
      setId: row.setId,
      world: row.world,
      situation: context.situation || row.situations[0] || 'scenario',
      scenarioId: context.scenarioId || row.scenarioIds[0] || '',
      mapId: context.mapId || row.mapIds[0] || '',
      questId: context.questId || row.questIds[0] || '',
      locationKind: context.locationKind || row.locationKinds[0] || '',
      speaker: row.speaker,
      speakerName: party[row.speaker]?.name || DS()?.get?.('characters', row.speaker)?.name || label(row.speaker || 'Party'),
      target: row.target,
      targetName: party[row.target]?.name || DS()?.get?.('characters', row.target)?.name || label(row.target || ''),
      line: row.line,
      reply: row.reply,
      tags: row.tags,
      sourcePath: row.sourcePath,
      rolledAt: new Date().toISOString()
    };
  }

  function normalizeDocument(raw = {}, sourcePath = '') {
    const sets = raw.sets || { normal: raw.entries || [] };
    const globalDefaults = raw.defaults || {};
    const rows = [];
    for (const [setId, spec] of Object.entries(sets || {})) {
      const entries = Array.isArray(spec) ? spec : (spec.entries || []);
      const setDefaults = Array.isArray(spec) ? {} : (spec.defaults || {});
      for (const entry of entries) {
        rows.push(normalizeRow({
          ...globalDefaults,
          ...setDefaults,
          ...entry
        }, sourcePath, setId));
      }
    }
    return rows;
  }

  function normalizeRow(row, sourcePath, setId) {
    return {
      id: row.id || `chat_${Math.floor(Math.random() * 1000000)}`,
      setId: setKey(row.setId || setId || 'normal'),
      world: row.world || '*',
      situations: splitList(row.situations ?? row.situation),
      scenarioIds: splitList(row.scenarioIds ?? row.scenarioId),
      mapIds: splitList(row.mapIds ?? row.mapId),
      questIds: splitList(row.questIds ?? row.questId),
      storyIds: splitList(row.storyIds ?? row.storyId),
      eventIds: splitList(row.eventIds ?? row.eventId ?? row.tableId),
      locationKinds: splitList(row.locationKinds ?? row.locationKind),
      speaker: row.speaker || '',
      target: row.target || '',
      line: row.line || '',
      reply: row.reply || '',
      tags: splitList(row.tags),
      requiredTags: splitList(row.requiredTags),
      excludedTags: splitList(row.excludedTags),
      requiresPresent: splitList(row.requiresPresent),
      excludesPresent: splitList(row.excludesPresent),
      weight: Math.max(1, Number(row.weight || 1)),
      sourcePath
    };
  }

  function normalizeContext(context = {}) {
    return {
      ...context,
      world: context.world || CS()?.getState?.()?.currentWorld || '',
      situation: key(context.situation || ''),
      mapId: key(context.mapId || ''),
      scenarioId: key(context.scenarioId || ''),
      questId: key(context.questId || ''),
      storyId: key(context.storyId || ''),
      eventId: key(context.eventId || ''),
      tableId: key(context.tableId || ''),
      locationKind: key(context.locationKind || ''),
      tags: splitList(context.tags)
    };
  }

  function groupBySet(rows) {
    const grouped = new Map();
    for (const row of rows) {
      const setId = setKey(row.setId || 'normal');
      if (!grouped.has(setId)) grouped.set(setId, []);
      grouped.get(setId).push(row);
    }
    return grouped;
  }

  function matchesAny(needles, value) {
    if (!needles.length) return true;
    if (needles.includes('*')) return true;
    const normalized = key(value);
    return !!normalized && needles.some((needle) => key(needle) === normalized);
  }

  function weightedPick(pool) {
    if (!pool.length) return null;
    const total = pool.reduce((sum, row) => sum + row.weight, 0);
    let rollValue = Math.random() * total;
    for (const row of pool) {
      rollValue -= row.weight;
      if (rollValue <= 0) return row;
    }
    return pool[pool.length - 1];
  }

  function splitList(value) {
    if (Array.isArray(value)) return value.map(key).filter(Boolean);
    return String(value || '')
      .split(/[|;]/)
      .map(key)
      .filter(Boolean);
  }

  function key(value) {
    return String(value || '').trim().toLowerCase();
  }

  function setKey(value) {
    return key(value).replace(/\s+/g, '_');
  }

  function label(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  return Object.freeze({
    load,
    rows,
    roll,
    auto
  });
})();
