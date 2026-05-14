// campaign-party-chat.js
// CSV-backed party banter for Campaign Mode.

window.CJS = window.CJS || {};

window.CJS.CampaignPartyChat = (() => {
  'use strict';

  const DEFAULT_PATHS = ['data/campaigns/haven/side_content/party_chatter.csv'];
  const CS = () => window.CJS.CampaignState;
  const DS = () => window.CJS.DataStore;
  const Bridge = () => window.CJS.CampaignCombatBridge;

  let _rows = [];
  let _loaded = false;

  async function load(paths = DEFAULT_PATHS) {
    const next = [];
    for (const path of paths) {
      try {
        const res = await fetch(path, { cache: 'no-store' });
        if (!res.ok) continue;
        const text = await res.text();
        next.push(...parseCsv(text).map((row) => normalizeRow(row, path)));
      } catch (error) {
        console.warn('Party chat CSV failed to load:', path, error);
      }
    }
    _rows = next.filter((row) => row.line);
    _loaded = true;
    return _rows;
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
    // Auto-inject persona tags so chatter CSV rows tagged "rot_smell" or
    // "guild_adventurer" can match when the speaker's active persona carries
    // those tags. Context-provided tags still take precedence.
    const enrichedContext = _withPersonaTags(context, state);
    const pool = _rows.filter((row) => matches(row, enrichedContext, state, readyIds));
    const picked = weightedPick(pool);
    return picked ? hydrate(picked, party, enrichedContext) : null;
  }

  // Collect persona tags from every battle-ready party member (and the
  // out-of-world penalty tags if applicable). Allows beats authored against
  // "out_of_place" / "rot_smell" to fire when Bin's persona doesn't fit.
  function _withPersonaTags(context = {}, state) {
    const PS = window.CJS.PersonaService;
    if (!PS || !state?.party) return context;
    const currentWorld = state.currentWorld;
    const tags = new Set((context.tags || []).map((tag) => String(tag).toLowerCase()));
    for (const member of Object.values(state.party)) {
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
    }, { source: 'party_chat_auto' });
    return chat;
  }

  function matches(row, context, state, readyIds) {
    if (row.world && row.world !== '*' && row.world !== (context.world || state?.currentWorld)) return false;
    if (row.scenarioId && row.scenarioId !== '*' && row.scenarioId !== context.scenarioId) return false;
    if (row.situation && row.situation !== '*' && row.situation !== context.situation) return false;
    if (row.speaker && !readyIds.has(row.speaker)) return false;
    if (row.target && row.target !== 'party' && !readyIds.has(row.target)) return false;
    for (const id of row.requiresPresent) if (!readyIds.has(id)) return false;
    for (const id of row.excludesPresent) if (readyIds.has(id)) return false;
    if (row.tags.length && context.tags?.length) {
      const ctx = new Set(context.tags.map((tag) => String(tag).toLowerCase()));
      if (!row.tags.some((tag) => ctx.has(tag))) return false;
    }
    if (row.locationKind && row.locationKind !== '*' && row.locationKind !== context.locationKind) return false;
    return true;
  }

  function hydrate(row, party, context) {
    return {
      id: row.id,
      world: row.world,
      situation: context.situation || row.situation || 'scenario',
      scenarioId: context.scenarioId || row.scenarioId || '',
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

  function normalizeRow(row, sourcePath) {
    return {
      id: row.id || `chat_${Math.floor(Math.random() * 1000000)}`,
      world: row.world || '*',
      situation: row.situation || '*',
      scenarioId: row.scenarioId || '',
      locationKind: row.locationKind || '',
      speaker: row.speaker || '',
      target: row.target || '',
      line: row.line || '',
      reply: row.reply || '',
      tags: splitList(row.tags),
      requiresPresent: splitList(row.requiresPresent),
      excludesPresent: splitList(row.excludesPresent),
      weight: Math.max(1, Number(row.weight || 1)),
      sourcePath
    };
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
    return String(value || '')
      .split(/[|;]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function parseCsv(text) {
    const rows = [];
    const parsed = [];
    let cell = '';
    let row = [];
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];
      if (quoted && ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        row.push(cell);
        cell = '';
      } else if ((ch === '\n' || ch === '\r') && !quoted) {
        if (ch === '\r' && next === '\n') i++;
        row.push(cell);
        parsed.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
    row.push(cell);
    parsed.push(row);
    const headers = (parsed.shift() || []).map((header) => header.trim());
    for (const values of parsed) {
      if (!values.some((value) => String(value || '').trim())) continue;
      const entry = {};
      headers.forEach((header, index) => { entry[header] = (values[index] || '').trim(); });
      rows.push(entry);
    }
    return rows;
  }

  function label(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  return Object.freeze({
    load,
    rows,
    roll,
    auto,
    parseCsv
  });
})();
