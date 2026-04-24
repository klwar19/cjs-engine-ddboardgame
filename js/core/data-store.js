// data-store.js
// Central data manager: single source of truth for all game data.
// Handles: CRUD for all entity types, ID generation, cross-reference
// validation, import/export JSON, dirty tracking.
// Reads: constants.js (for ID_PREFIXES)
// Used by: all editor modules, combat startup, stat-compiler
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.DataStore = (() => {
  'use strict';

  const C  = () => window.CJS.CONST;
  const UM = () => window.CJS.UndoManager;

  // Push to undo stack if manager is loaded and enabled.
  // Skips array types (quips, quizBank) — those aren't undoable entities.
  function _undo(action, type, id, before, after) {
    if (!UM() || Array.isArray(_data[type])) return;
    UM().push(action, type, id, before, after);
  }

  // ── INTERNAL STATE ─────────────────────────────────────────────────
  let _data = {
    effects:    {},   // id → effect object
    skills:     {},   // id → skill object
    items:      {},   // id → item object
    passives:   {},   // id → passive object
    characters: {},   // id → character object
    monsters:   {},   // id → monster object
    encounters: {},   // id → encounter object
    statuses:   {},   // id → status definition
    quips:      [],   // array of quip fragments
    quizBank:   []    // array of quiz questions
  };

  let _dirty = false;
  let _counters = {};  // { eff: 1, skl: 1, ... } for ID generation

  // ── NORMALIZATION ──────────────────────────────────────────────────
  // Phase 9: accept legacy string-form skill refs on load/import,
  // but keep canonical object form in store/export.
  function _normalizeSkillEntry(entry) {
    const SR = window.CJS.SkillResolver;
    if (SR && SR.normalize) return SR.normalize(entry);

    if (!entry) return null;
    if (typeof entry === 'string') {
      return { skillId: entry, overrides: {}, level: 1 };
    }
    if (typeof entry === 'object' && entry.skillId) {
      return {
        skillId: entry.skillId,
        overrides: entry.overrides || {},
        level: entry.level || 1
      };
    }
    return null;
  }

  function _normalizeSkillEntries(skills) {
    if (!Array.isArray(skills)) return skills;
    return skills.map(_normalizeSkillEntry).filter(Boolean);
  }

  function _normalizeForStorage(type, obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;

    const normalized = { ...obj };
    if (type === 'characters' || type === 'monsters') {
      normalized.skills = _normalizeSkillEntries(normalized.skills || []);
    }
    return normalized;
  }

  function _normalizeCollection(type, collection) {
    const out = {};
    for (const [id, obj] of Object.entries(collection || {})) {
      const normalized = _normalizeForStorage(type, obj);
      if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
        normalized.id = normalized.id || id;
      }
      out[id] = normalized;
    }
    return out;
  }

  function _exportSnapshot() {
    return {
      effects:    { ..._data.effects },
      skills:     { ..._data.skills },
      items:      { ..._data.items },
      passives:   { ..._data.passives },
      characters: _normalizeCollection('characters', _data.characters),
      monsters:   _normalizeCollection('monsters', _data.monsters),
      encounters: { ..._data.encounters },
      statuses:   { ..._data.statuses },
      quips:      [..._data.quips],
      quizBank:   [..._data.quizBank]
    };
  }

  // ── ID GENERATION ──────────────────────────────────────────────────
  function _nextId(prefix) {
    if (!_counters[prefix]) _counters[prefix] = 1;

    // Find next available ID
    const collection = _getCollectionByPrefix(prefix);
    let id;
    do {
      id = `${prefix}_${String(_counters[prefix]).padStart(3, '0')}`;
      _counters[prefix]++;
    } while (collection && collection[id]);

    return id;
  }

  function _getCollectionByPrefix(prefix) {
    const map = {
      eff: _data.effects,
      skl: _data.skills,
      itm: _data.items,
      pas: _data.passives,
      chr: _data.characters,
      mon: _data.monsters,
      enc: _data.encounters,
      sts: _data.statuses
    };
    return map[prefix] || null;
  }

  function _getPrefixForType(type) {
    return C().ID_PREFIXES[type] || type.substring(0, 3);
  }

  // ── GENERIC CRUD ───────────────────────────────────────────────────

  function getAll(type) {
    if (!_data[type]) return {};
    return { ..._data[type] };
  }

  function getAllAsArray(type) {
    if (!_data[type]) return [];
    if (Array.isArray(_data[type])) return [..._data[type]];
    return Object.values(_data[type]);
  }

  function get(type, id) {
    if (!_data[type]) return null;
    return _data[type][id] || null;
  }

  function exists(type, id) {
    return _data[type] && !!_data[type][id];
  }

  // Create: auto-generates ID if not provided. Returns the new ID.
  function create(type, obj) {
    if (!_data[type]) {
      console.error(`DataStore.create: unknown type "${type}"`);
      return null;
    }
    if (Array.isArray(_data[type])) {
      // For arrays (quips, quizBank), just push
      _data[type].push(obj);
      _dirty = true;
      return _data[type].length - 1;
    }

    const singularType = type.replace(/s$/, ''); // "effects" → "effect"
    const prefix = _getPrefixForType(singularType);
    const id = obj.id || _nextId(prefix);
    const normalized = _normalizeForStorage(type, { ...obj, id });
    normalized.id = id;
    _data[type][id] = normalized;
    _dirty = true;
    _undo('create', type, id, null, normalized);
    return id;
  }

  // Update: merges new fields into existing object
  function update(type, id, changes) {
    if (!_data[type] || !_data[type][id]) {
      console.error(`DataStore.update: ${type}/${id} not found`);
      return false;
    }
    const before = JSON.parse(JSON.stringify(_data[type][id]));
    const merged = _normalizeForStorage(type, {
      ..._data[type][id],
      ...changes,
      id
    });
    merged.id = id; // never allow ID change
    _data[type][id] = merged;
    _dirty = true;
    _undo('update', type, id, before, _data[type][id]);
    return true;
  }

  // Replace: wholesale replace the object (keeps ID)
  function replace(type, id, obj) {
    if (!_data[type]) return false;
    const before = _data[type][id] ? JSON.parse(JSON.stringify(_data[type][id])) : null;
    const normalized = _normalizeForStorage(type, { ...obj, id });
    normalized.id = id;
    _data[type][id] = normalized;
    _dirty = true;
    _undo('replace', type, id, before, normalized);
    return true;
  }

  function remove(type, id) {
    if (!_data[type] || !_data[type][id]) return false;
    const before = JSON.parse(JSON.stringify(_data[type][id]));
    delete _data[type][id];
    _dirty = true;
    _undo('remove', type, id, before, null);
    return true;
  }

  // Duplicate: clone an object with a new ID
  function duplicate(type, id) {
    const original = get(type, id);
    if (!original) return null;
    const clone = JSON.parse(JSON.stringify(original));
    delete clone.id;
    clone.name = (clone.name || id) + ' (Copy)';
    return create(type, clone);
  }

  // ── SEARCH / FILTER ────────────────────────────────────────────────

  function search(type, query) {
    const items = getAllAsArray(type);
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(item => {
      const searchable = [
        item.name, item.id, item.description,
        ...(item.tags || []),
        item.category, item.trigger, item.action
      ].filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(q);
    });
  }

  function filterByTags(type, tags) {
    if (!tags || tags.length === 0) return getAllAsArray(type);
    const items = getAllAsArray(type);
    return items.filter(item =>
      item.tags && tags.some(t => item.tags.includes(t))
    );
  }

  function filterByCategory(type, category) {
    const items = getAllAsArray(type);
    return items.filter(item => item.category === category);
  }

  // ── REFERENCE RESOLUTION ───────────────────────────────────────────
  // Get full objects for a list of IDs (with override merging for effects)

  function resolveEffectRefs(effectRefs) {
    // effectRefs = [{ effectId: "burn_dot", overrides: { value: 8 } }, ...]
    return effectRefs.map(ref => {
      const master = get('effects', ref.effectId);
      if (!master) {
        console.warn(`Effect "${ref.effectId}" not found in master library`);
        return null;
      }
      if (!ref.overrides || Object.keys(ref.overrides).length === 0) {
        return { ...master };
      }
      // Merge overrides
      return { ...master, ...ref.overrides, id: master.id };
    }).filter(Boolean);
  }

  function resolveSkillRefs(skillIds) {
    return skillIds.map(id => get('skills', id)).filter(Boolean);
  }

  function resolveItemRefs(itemIds) {
    return itemIds.map(id => get('items', id)).filter(Boolean);
  }

  // ── CROSS-REFERENCE VALIDATION ─────────────────────────────────────
  // Checks that all references point to existing entries.

  function validate() {
    const errors = [];
    const warnings = [];

    // Validate skills → effects
    for (const [id, skill] of Object.entries(_data.skills)) {
      if (skill.effects) {
        for (const ref of skill.effects) {
          if (!exists('effects', ref.effectId)) {
            errors.push(`Skill "${id}" references missing effect "${ref.effectId}"`);
          }
        }
      }
    }

    // Validate items → effects
    for (const [id, item] of Object.entries(_data.items)) {
      if (item.effects) {
        for (const ref of item.effects) {
          if (!exists('effects', ref.effectId)) {
            errors.push(`Item "${id}" references missing effect "${ref.effectId}"`);
          }
        }
      }
    }

    // Validate passives → effects
    for (const [id, passive] of Object.entries(_data.passives)) {
      if (passive.effects) {
        for (const ref of passive.effects) {
          if (!exists('effects', ref.effectId)) {
            errors.push(`Passive "${id}" references missing effect "${ref.effectId}"`);
          }
        }
      }
    }

    // Helper: extract skillId from string or { skillId, overrides } format
    const _sid = (entry) => typeof entry === 'string' ? entry : (entry?.skillId || null);

    // Validate characters → skills, items, passives
    for (const [id, char] of Object.entries(_data.characters)) {
      (char.skills || []).forEach(entry => {
        const sid = _sid(entry);
        if (sid && !exists('skills', sid)) {
          errors.push(`Character "${id}" references missing skill "${sid}"`);
        }
      });
      (char.equipment || []).forEach(iid => {
        if (!exists('items', iid)) {
          errors.push(`Character "${id}" references missing item "${iid}"`);
        }
      });
      (char.innatePassives || []).forEach(pid => {
        if (!exists('passives', pid) && !exists('effects', pid)) {
          warnings.push(`Character "${id}" references unknown passive/effect "${pid}"`);
        }
      });
    }

    // Validate monsters → same as characters + AI skill refs
    for (const [id, mon] of Object.entries(_data.monsters)) {
      (mon.skills || []).forEach(entry => {
        const sid = _sid(entry);
        if (sid && !exists('skills', sid)) {
          errors.push(`Monster "${id}" references missing skill "${sid}"`);
        }
      });
      (mon.aiRules || []).forEach((rule, i) => {
        if (rule.action && rule.action.startsWith('use_skill:')) {
          const skillId = rule.action.split(':')[1];
          const monSkillIds = (mon.skills || []).map(_sid);
          if (!exists('skills', skillId)) {
            errors.push(`Monster "${id}" AI rule ${i} references non-existent skill "${skillId}"`);
          } else if (!monSkillIds.includes(skillId)) {
            warnings.push(`Monster "${id}" AI rule ${i} references skill "${skillId}" not in its skill list`);
          }
        }
      });
    }

    // Validate encounters → characters/monsters
    for (const [id, enc] of Object.entries(_data.encounters)) {
      (enc.units || []).forEach(u => {
        if (!exists('characters', u.id) && !exists('monsters', u.id)) {
          errors.push(`Encounter "${id}" references missing unit "${u.id}"`);
        }
      });
    }

    return { errors, warnings, valid: errors.length === 0 };
  }

  // ── IMPORT / EXPORT ────────────────────────────────────────────────

  function exportJSON() {
    return JSON.stringify(_exportSnapshot(), null, 2);
  }

  function exportBlob() {
    const json = exportJSON();
    return new Blob([json], { type: 'application/json' });
  }

  function downloadJSON(filename) {
    const blob = exportBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'cjs-gamedata.json';
    a.click();
    URL.revokeObjectURL(url);
    _dirty = false;
  }

  function importJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      return loadData(parsed);
    } catch (e) {
      console.error('Import failed:', e);
      return { success: false, error: e.message };
    }
  }

  function loadData(obj) {
    // Disable undo during bulk load
    if (UM()) UM().disable();

    // Merge or replace each collection
    const collections = [
      'effects', 'skills', 'items', 'passives',
      'characters', 'monsters', 'encounters', 'statuses'
    ];
    for (const col of collections) {
      if (obj[col]) {
        if (typeof obj[col] === 'object' && !Array.isArray(obj[col])) {
          _data[col] = { ..._data[col], ..._normalizeCollection(col, obj[col]) };
        }
      }
    }
    // Arrays: replace entirely
    if (obj.quips) _data.quips = obj.quips;
    if (obj.quizBank) _data.quizBank = obj.quizBank;

    // Rebuild ID counters
    _rebuildCounters();

    // Validate
    const validation = validate();
    _dirty = false;

    // Re-enable undo and clear stack (fresh start after load)
    if (UM()) { UM().enable(); UM().clear(); }

    return { success: true, validation };
  }

  function _rebuildCounters() {
    _counters = {};
    const collections = {
      eff: _data.effects,
      skl: _data.skills,
      itm: _data.items,
      pas: _data.passives,
      chr: _data.characters,
      mon: _data.monsters,
      enc: _data.encounters,
      sts: _data.statuses
    };

    for (const [prefix, col] of Object.entries(collections)) {
      let maxNum = 0;
      for (const id of Object.keys(col)) {
        const match = id.match(new RegExp(`^${prefix}_(\\d+)$`));
        if (match) {
          maxNum = Math.max(maxNum, parseInt(match[1], 10));
        }
      }
      _counters[prefix] = maxNum + 1;
    }
  }

  // ── RESET / STATE ──────────────────────────────────────────────────

  function reset() {
    _data = {
      effects: {}, skills: {}, items: {}, passives: {},
      characters: {}, monsters: {}, encounters: {}, statuses: {},
      quips: [], quizBank: []
    };
    _counters = {};
    _dirty = false;
    if (UM()) UM().clear();
  }

  function isDirty() { return _dirty; }
  function markClean() { _dirty = false; }

  function getCounts() {
    return {
      effects:    Object.keys(_data.effects).length,
      skills:     Object.keys(_data.skills).length,
      items:      Object.keys(_data.items).length,
      passives:   Object.keys(_data.passives).length,
      characters: Object.keys(_data.characters).length,
      monsters:   Object.keys(_data.monsters).length,
      encounters: Object.keys(_data.encounters).length,
      statuses:   Object.keys(_data.statuses).length,
      quips:      _data.quips.length,
      quizBank:   _data.quizBank.length
    };
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    // CRUD
    getAll, getAllAsArray, get, exists,
    create, update, replace, remove, duplicate,
    // Search
    search, filterByTags, filterByCategory,
    // References
    resolveEffectRefs, resolveSkillRefs, resolveItemRefs,
    // Validation
    validate,
    // Import/Export
    exportJSON, exportBlob, downloadJSON, importJSON, loadData,
    // State
    reset, isDirty, markClean, getCounts
  });
})();
