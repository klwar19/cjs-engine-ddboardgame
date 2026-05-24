// cui-options.js — Searchable-select option builders for Campaign UI.
//
// Extracted from campaign-ui.js. Each builder returns an `[{ value, label,
// sub, description?, tags? }]` array suitable for `UI.createSearchableSelect`.
// They read content from `window.CJS.DataStore`, world/campaign info from
// `CampaignState`, and (for status defs) the built-in `CONST.STATUS_DEFINITIONS`.

window.CJS = window.CJS || {};
window.CJS.CampaignUIInternal = window.CJS.CampaignUIInternal || {};

window.CJS.CampaignUIInternal.Options = (function () {
  'use strict';

  function _DS() { return window.CJS && window.CJS.DataStore; }
  function _CS() { return window.CJS && window.CJS.CampaignState; }
  function _C() { return window.CJS && window.CJS.CONST; }
  function _desc() { return window.CJS.CampaignUIInternal.Modals.desc; }

  function bucketOptions(bucket) {
    const DS = _DS();
    const desc = _desc();
    const world = _CS()?.getState?.()?.currentWorld;
    const inWorld = (entry) => !entry._world || entry._world === world || entry._scope === 'universal' || entry._scope === 'system';
    const sortLabel = (a, b) => String(a.label).localeCompare(String(b.label));
    if (bucket === 'materials') {
      return DS.getAllAsArray('materials').filter(inWorld)
        .map((entry) => ({ value: entry.id, label: entry.name || entry.id, sub: entry._world || entry.rarity || '', description: desc(entry), tags: entry.tags || [] }))
        .sort(sortLabel);
    }
    if (bucket === 'food') {
      return DS.getAllAsArray('food').filter(inWorld)
        .map((entry) => ({ value: entry.id, label: entry.name || entry.id, sub: entry._world || entry.type || '', description: desc(entry), tags: entry.tags || [] }))
        .sort(sortLabel);
    }
    return DS.getAllAsArray('items').filter(inWorld)
      .map((entry) => ({ value: entry.id, label: entry.name || entry.id, sub: [entry.type, entry.rarity, entry._world].filter(Boolean).join(' | '), description: desc(entry), tags: entry.tags || [] }))
      .sort(sortLabel);
  }

  function statusOptions() {
    const DS = _DS();
    const desc = _desc();
    const customIds = new Set();
    const opts = DS.getAllAsArray('statuses').map((entry) => {
      customIds.add(entry.id);
      return {
        value: entry.id,
        label: entry.name || entry.id,
        sub: entry.kind || entry.category || '',
        description: desc(entry),
        tags: entry.tags || []
      };
    });
    for (const [id, def] of Object.entries(_C()?.STATUS_DEFINITIONS || {})) {
      if (customIds.has(id)) continue;
      opts.push({
        value: id,
        label: def.name || id,
        sub: def.category || 'Built-in',
        description: desc(def),
        tags: def.tags || []
      });
    }
    return opts.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }

  function seedOptions() {
    const DS = _DS();
    const world = _CS()?.getState?.()?.currentWorld;
    return DS.getAllAsArray('crops')
      .filter((crop) => !crop._world || crop._world === world)
      .map((crop) => ({
        value: crop.id,
        label: crop.name || crop.id,
        sub: crop.growTime ? `${crop.growTime}t` : ''
      }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }

  function worldOptions() {
    const CS = _CS();
    const campaign = CS?.getCurrentCampaign?.();
    const worlds = CS?.getContent?.()?.worlds || {};
    const allowed = campaign?.allowedWorlds || Object.keys(worlds);
    return allowed.map((id) => ({
      value: id,
      label: worlds[id]?.displayName || id,
      sub: id
    }));
  }

  function tentOptions() {
    const DS = _DS();
    const inv = _CS()?.getState?.()?.inventory?.items || {};
    const owned = Object.keys(inv).filter((id) => (inv[id] || 0) > 0);
    const items = DS.getAllAsArray('items');
    const tagged = items.filter((entry) => {
      const tags = entry.tags || [];
      return tags.includes('tent') || tags.includes('camp') || /tent|camp/i.test(entry.id || '');
    });
    const tentIds = new Set(tagged.map((entry) => entry.id));
    const all = new Set([...owned, ...tentIds]);
    return Array.from(all).map((id) => {
      const entry = items.find((e) => e.id === id);
      return { value: id, label: entry?.name || id, sub: `Owned: ${inv[id] || 0}` };
    });
  }

  return Object.freeze({
    bucketOptions,
    statusOptions,
    seedOptions,
    worldOptions,
    tentOptions
  });
})();
