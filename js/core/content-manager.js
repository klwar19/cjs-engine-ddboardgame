// content-manager.js
// Manifest-aware data orchestration for multi-file content loading, editing,
// validation, migration, and save/export assembly.

window.CJS = window.CJS || {};

window.CJS.ContentManager = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const UI = () => window.CJS.UI;
  const C = () => window.CJS.CONST;

  const LEGACY_PATHS = {
    bundle: 'data/gamedata.json',
    effects: 'data/master-effects.json',
    quips: 'data/quips.json',
    quizBank: 'data/quiz-bank.json',
    manifest: 'data/_manifest.json'
  };

  const TYPE_TO_CATEGORY = {
    effects: 'effects',
    statuses: 'statuses',
    passives: 'passives',
    skills: 'skills',
    items: 'items',
    food: 'food',
    characters: 'characters',
    monsters: 'monsters',
    encounters: 'encounters',
    materials: 'materials',
    crafting: 'crafting',
    crops: 'crops',
    shops: 'shops',
    zones: 'zones',
    stories: 'stories'
  };

  const CATEGORY_TO_TYPE = Object.freeze(
    Object.entries(TYPE_TO_CATEGORY).reduce((out, [type, category]) => {
      out[category] = type;
      return out;
    }, {})
  );

  const TYPE_ORDER = [
    'effects', 'statuses', 'passives', 'skills', 'items', 'food',
    'characters', 'monsters', 'encounters', 'materials', 'crafting',
    'crops', 'shops', 'zones', 'stories'
  ];

  const SCOPE_LABELS = {
    system: 'System',
    universal: 'Universal',
    world: 'World',
    legacy: 'Legacy'
  };

  const SCOPE_COLORS = {
    system: '#f59e0b',
    universal: '#10b981',
    legacy: '#64748b'
  };

  const WORLD_UNIVERSAL_IDS = {
    characters: new Set(['bin']),
    passives: new Set(['jester_luck', 'comedy_armor']),
    skills: new Set(['basic_attack', 'taunt_mock', 'jester_gambit']),
    items: new Set([])
  };

  let _manifest = null;
  let _fileEntries = [];
  let _fileHeaders = {};
  let _dirtyFiles = new Set();
  let _loadMode = 'legacy';
  let _filters = { scope: 'all', world: 'all' };
  let _validationIssues = [];
  let _validationIndex = {};
  let _lastMigration = null;
  let _storeBound = false;
  let _suspendDirtyTracking = false;

  function _bindStore() {
    if (_storeBound || !DS().subscribe) return;
    DS().subscribe(_handleStoreChange);
    _storeBound = true;
  }

  function _handleStoreChange(change) {
    if (_suspendDirtyTracking || !_manifest) return;

    _validationIssues = [];
    _validationIndex = {};

    const beforePath = change.before && change.before._origin;
    const afterPath = change.after && change.after._origin;
    if (beforePath) _dirtyFiles.add(beforePath);
    if (afterPath) _dirtyFiles.add(afterPath);
  }

  function _escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function _clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function _stripMeta(value) {
    if (Array.isArray(value)) return value.map(_stripMeta);
    if (!value || typeof value !== 'object') return value;

    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (key.startsWith('_')) continue;
      out[key] = _stripMeta(val);
    }
    return out;
  }

  function _sortById(items) {
    return [...items].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  }

  function _scopeOrder(scope) {
    return { system: 0, universal: 1, world: 2, legacy: 3 }[scope] ?? 9;
  }

  function _worldOrder(worldId) {
    const world = DS().get('worlds', worldId);
    return world?.order ?? 999;
  }

  function _defaultWorldColor(worldId) {
    const world = DS().get('worlds', worldId);
    return world?.color || '#3b82f6';
  }

  function _defaultHeader(entry) {
    return {
      version: 1,
      format: entry.category === '_meta' ? 'cjs-world-meta' : 'cjs-collection',
      scope: entry.scope,
      ...(entry.world ? { world: entry.world } : {}),
      category: entry.category,
      status: 'active'
    };
  }

  function _findManifestEntry(path) {
    return _fileEntries.find((entry) => entry.path === path) || null;
  }

  function _findTargetEntry(type, scope, world) {
    const category = TYPE_TO_CATEGORY[type];
    if (!category || !_manifest) return null;
    return _fileEntries.find((entry) =>
      entry.category === category &&
      entry.scope === scope &&
      (scope !== 'world' || entry.world === world)
    ) || null;
  }

  function _allowedScopes(type) {
    switch (type) {
      case 'effects':
      case 'statuses':
        return ['system'];
      case 'monsters':
      case 'encounters':
      case 'materials':
      case 'crafting':
      case 'crops':
      case 'shops':
      case 'zones':
      case 'stories':
        return ['world'];
      case 'characters':
      case 'passives':
      case 'skills':
      case 'items':
      case 'food':
        return ['universal', 'world'];
      default:
        return ['system'];
    }
  }

  function _getScopeMeta(item) {
    if (!item) return null;

    const scope = item._scope || (_loadMode === 'manifest' ? null : 'legacy');
    if (!scope) return null;

    if (scope === 'world') {
      const world = DS().get('worlds', item._world);
      return {
        label: world?.displayName || item._world || 'World',
        color: world?.color || _defaultWorldColor(item._world),
        title: item._origin || item._world || 'world'
      };
    }

    return {
      label: SCOPE_LABELS[scope] || scope,
      color: SCOPE_COLORS[scope] || '#64748b',
      title: item._origin || scope
    };
  }

  function renderScopeChip(item) {
    const meta = _getScopeMeta(item);
    if (!meta) return '';
    return `<span class="scope-chip" title="${_escapeHtml(meta.title)}" style="margin-left:auto;display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;border:1px solid ${meta.color};color:${meta.color};font-size:0.7rem;font-weight:600;white-space:nowrap">${_escapeHtml(meta.label)}</span>`;
  }

  function getVisibleItems(type, query) {
    const items = query ? DS().search(type, query) : DS().getAllAsArray(type);
    return items
      .filter((item) => _matchesFilters(item))
      .sort((a, b) => {
        const scopeDelta = _scopeOrder(a._scope) - _scopeOrder(b._scope);
        if (scopeDelta !== 0) return scopeDelta;
        const worldDelta = _worldOrder(a._world) - _worldOrder(b._world);
        if (worldDelta !== 0) return worldDelta;
        return String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''));
      });
  }

  function _matchesFilters(item) {
    if (!_manifest) return true;

    const scope = item._scope || 'legacy';
    if (_filters.scope !== 'all' && scope !== _filters.scope) return false;

    if (_filters.world !== 'all') {
      if (scope !== 'world') return false;
      if ((item._world || '') !== _filters.world) return false;
    }

    return true;
  }

  function getFilters() {
    return { ..._filters };
  }

  function setFilters(next) {
    _filters = {
      scope: next?.scope || 'all',
      world: next?.world || 'all'
    };
    return getFilters();
  }

  function getDirtyFiles() {
    return Array.from(_dirtyFiles).sort();
  }

  function clearDirtyFiles(paths) {
    if (!paths) {
      _dirtyFiles.clear();
      return;
    }
    for (const path of paths) _dirtyFiles.delete(path);
  }

  function getValidationIssues() {
    return _clone(_validationIssues);
  }

  function getEntityIssueCount(type, id) {
    return _validationIndex[`${type}:${id}`] || 0;
  }

  function _addValidationIssue(issues, level, file, type, id, path, message) {
    const issue = { level, file, type, id, path, message };
    issues.push(issue);
    const key = `${type}:${id}`;
    _validationIndex[key] = (_validationIndex[key] || 0) + 1;
  }

  function validateReferencesDetailed() {
    const issues = [];
    _validationIndex = {};

    const skillIdOf = (entry) => typeof entry === 'string' ? entry : entry?.skillId;

    for (const skill of DS().getAllAsArray('skills')) {
      for (let i = 0; i < (skill.effects || []).length; i++) {
        const ref = skill.effects[i];
        if (ref?.effectId && !DS().exists('effects', ref.effectId)) {
          _addValidationIssue(issues, 'error', skill._origin, 'skills', skill.id, `effects[${i}]`, `Missing effect "${ref.effectId}"`);
        }
      }
    }

    for (const item of DS().getAllAsArray('items')) {
      for (let i = 0; i < (item.effects || []).length; i++) {
        const ref = item.effects[i];
        if (ref?.effectId && !DS().exists('effects', ref.effectId)) {
          _addValidationIssue(issues, 'error', item._origin, 'items', item.id, `effects[${i}]`, `Missing effect "${ref.effectId}"`);
        }
      }
      for (let i = 0; i < (item.grantedSkills || []).length; i++) {
        const skillId = item.grantedSkills[i];
        if (skillId && !DS().exists('skills', skillId)) {
          _addValidationIssue(issues, 'error', item._origin, 'items', item.id, `grantedSkills[${i}]`, `Missing skill "${skillId}"`);
        }
      }
    }

    for (const passive of DS().getAllAsArray('passives')) {
      for (let i = 0; i < (passive.effects || []).length; i++) {
        const ref = passive.effects[i];
        if (ref?.effectId && !DS().exists('effects', ref.effectId)) {
          _addValidationIssue(issues, 'error', passive._origin, 'passives', passive.id, `effects[${i}]`, `Missing effect "${ref.effectId}"`);
        }
      }
    }

    for (const char of DS().getAllAsArray('characters')) {
      for (let i = 0; i < (char.skills || []).length; i++) {
        const skillId = skillIdOf(char.skills[i]);
        if (skillId && !DS().exists('skills', skillId)) {
          _addValidationIssue(issues, 'error', char._origin, 'characters', char.id, `skills[${i}]`, `Missing skill "${skillId}"`);
        }
      }
      for (let i = 0; i < (char.equipment || []).length; i++) {
        const itemId = char.equipment[i];
        if (itemId && !DS().exists('items', itemId)) {
          _addValidationIssue(issues, 'error', char._origin, 'characters', char.id, `equipment[${i}]`, `Missing item "${itemId}"`);
        }
      }
      for (let i = 0; i < (char.innatePassives || []).length; i++) {
        const passiveId = char.innatePassives[i];
        if (passiveId && !DS().exists('passives', passiveId)) {
          _addValidationIssue(issues, 'warning', char._origin, 'characters', char.id, `innatePassives[${i}]`, `Missing passive "${passiveId}"`);
        }
      }
    }

    for (const mon of DS().getAllAsArray('monsters')) {
      const ownedSkillIds = (mon.skills || []).map(skillIdOf).filter(Boolean);

      for (let i = 0; i < (mon.skills || []).length; i++) {
        const skillId = skillIdOf(mon.skills[i]);
        if (skillId && !DS().exists('skills', skillId)) {
          _addValidationIssue(issues, 'error', mon._origin, 'monsters', mon.id, `skills[${i}]`, `Missing skill "${skillId}"`);
        }
      }

      for (let i = 0; i < (mon.innatePassives || []).length; i++) {
        const passiveId = mon.innatePassives[i];
        if (passiveId && !DS().exists('passives', passiveId)) {
          _addValidationIssue(issues, 'warning', mon._origin, 'monsters', mon.id, `innatePassives[${i}]`, `Missing passive "${passiveId}"`);
        }
      }

      for (let i = 0; i < (mon.aiRules || []).length; i++) {
        const action = mon.aiRules[i]?.action || '';
        if (!action.startsWith('use_skill:')) continue;
        const skillId = action.split(':')[1];
        if (!DS().exists('skills', skillId)) {
          _addValidationIssue(issues, 'error', mon._origin, 'monsters', mon.id, `aiRules[${i}]`, `AI references missing skill "${skillId}"`);
        } else if (!ownedSkillIds.includes(skillId)) {
          _addValidationIssue(issues, 'warning', mon._origin, 'monsters', mon.id, `aiRules[${i}]`, `AI references unowned skill "${skillId}"`);
        }
      }

      for (let i = 0; i < (mon.loot || []).length; i++) {
        const itemId = mon.loot[i]?.itemId;
        if (!itemId) continue;
        if (!DS().exists('items', itemId) && !DS().exists('materials', itemId)) {
          _addValidationIssue(issues, 'warning', mon._origin, 'monsters', mon.id, `loot[${i}]`, `Loot item "${itemId}" is not defined as an item or material`);
        }
      }
    }

    for (const enc of DS().getAllAsArray('encounters')) {
      for (let i = 0; i < (enc.units || []).length; i++) {
        const unitId = enc.units[i]?.id;
        if (!unitId) continue;
        if (!DS().exists('characters', unitId) && !DS().exists('monsters', unitId)) {
          _addValidationIssue(issues, 'error', enc._origin, 'encounters', enc.id, `units[${i}]`, `Missing encounter unit "${unitId}"`);
        }
      }
    }

    _validationIssues = issues;
    return {
      valid: !issues.some((issue) => issue.level === 'error'),
      issues,
      byFile: issues.reduce((out, issue) => {
        const key = issue.file || 'unknown';
        if (!out[key]) out[key] = [];
        out[key].push(issue);
        return out;
      }, {})
    };
  }

  function formatValidationReport(result) {
    const lines = [];
    const byFile = result?.byFile || {};
    for (const file of Object.keys(byFile).sort()) {
      lines.push(file);
      for (const issue of byFile[file]) {
        lines.push(`  [${issue.level}] ${issue.type}/${issue.id} :: ${issue.path} :: ${issue.message}`);
      }
      lines.push('');
    }
    return lines.join('\n').trim() || 'No issues found.';
  }

  async function _fetchJson(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to load ${path} (${response.status})`);
    return response.json();
  }

  function _validateManifest(manifest) {
    if (!manifest || !Array.isArray(manifest.files)) {
      throw new Error('Manifest is missing a files array');
    }
  }

  function _validateFileHeader(doc, entry) {
    const header = doc?._file;
    if (!header) throw new Error(`${entry.path} is missing a _file header`);
    if (header.scope !== entry.scope) {
      throw new Error(`${entry.path} scope mismatch: manifest=${entry.scope}, file=${header.scope}`);
    }
    if ((header.world || null) !== (entry.world || null)) {
      throw new Error(`${entry.path} world mismatch: manifest=${entry.world || 'none'}, file=${header.world || 'none'}`);
    }
  }

  function _ensurePrefixedId(entry, obj) {
    if (entry.scope !== 'world' || !obj?.id) return;
    if (entry.category === 'quips' || entry.category === '_meta') return;
    if (!String(obj.id).startsWith(`${entry.world}_`)) {
      throw new Error(`${entry.path} contains "${obj.id}" but world-scoped IDs must start with "${entry.world}_"`);
    }
  }

  function _safeReplace(type, id, obj, entry) {
    const existing = DS().get(type, id);
    if (existing && existing._origin && existing._origin !== entry.path) {
      throw new Error(`ID collision for ${type}/${id}: ${existing._origin} vs ${entry.path}`);
    }
    DS().replace(type, id, obj);
  }

  function _entriesFromDocument(doc, entry) {
    if (entry.category === 'effects') {
      if (Array.isArray(doc.entries)) return doc.entries;
      const effects = doc.effects || {};
      return Object.entries(effects)
        .filter(([id]) => !String(id).startsWith('__COMMENT'))
        .map(([id, effect]) => ({ ...effect, id: effect.id || id }));
    }
    if (entry.category === 'statuses') return doc.entries || doc.statuses || [];
    if (entry.category === 'quizBank') return doc.questions || doc.entries || [];
    if (entry.category === 'quips') return doc.fragments || doc.entries || [];
    return doc.entries || [];
  }

  function _loadManifestDocuments(manifest, docs, options = {}) {
    _bindStore();
    _manifest = manifest;
    _fileEntries = [...(manifest.files || [])];
    _fileHeaders = {};
    _loadMode = 'manifest';

    const quips = [];
    const quizBank = [];

    _suspendDirtyTracking = true;
    DS().reset();

    for (const { entry, doc } of docs) {
      _validateFileHeader(doc, entry);
      _fileHeaders[entry.path] = _clone(doc._file || _defaultHeader(entry));

      if (entry.category === '_meta') {
        const worldRecord = doc.world || { id: entry.world };
        _safeReplace('worlds', worldRecord.id || entry.world, {
          ...worldRecord,
          id: worldRecord.id || entry.world,
          _scope: 'world',
          _world: entry.world,
          _origin: entry.path
        }, entry);
        continue;
      }

      const entries = _entriesFromDocument(doc, entry);
      if (entry.category === 'quips') {
        for (const fragment of entries) {
          quips.push({
            ...fragment,
            _scope: entry.scope,
            _world: entry.world || null,
            _origin: entry.path
          });
        }
        continue;
      }

      if (entry.category === 'quizBank') {
        for (const question of entries) {
          quizBank.push({
            ...question,
            _scope: entry.scope,
            _world: entry.world || null,
            _origin: entry.path
          });
        }
        continue;
      }

      const type = CATEGORY_TO_TYPE[entry.category];
      if (!type) continue;

      for (const obj of entries) {
        _ensurePrefixedId(entry, obj);
        _safeReplace(type, obj.id, {
          ...obj,
          _scope: entry.scope,
          _world: entry.world || null,
          _origin: entry.path
        }, entry);
      }
    }

    DS().loadData({ quips, quizBank });
    DS().markClean();
    _suspendDirtyTracking = false;

    if (options.markDirty) {
      _dirtyFiles = new Set(_fileEntries.map((entry) => entry.path));
    } else {
      _dirtyFiles.clear();
    }

    _validationIssues = [];
    _validationIndex = {};

    return {
      success: true,
      mode: 'manifest',
      manifest,
      counts: DS().getCounts()
    };
  }

  async function loadManifest(manifestPath = LEGACY_PATHS.manifest) {
    const manifest = await _fetchJson(manifestPath);
    _validateManifest(manifest);

    const docs = await Promise.all((manifest.files || []).map(async (entry) => ({
      entry,
      doc: await _fetchJson(entry.path)
    })));

    return _loadManifestDocuments(manifest, docs);
  }

  async function loadLegacyData() {
    _bindStore();

    const [bundle, masterEffects, quipsDoc, quizDoc] = await Promise.all([
      _fetchJson(LEGACY_PATHS.bundle),
      _fetchJson(LEGACY_PATHS.effects),
      _fetchJson(LEGACY_PATHS.quips),
      _fetchJson(LEGACY_PATHS.quizBank)
    ]);

    _suspendDirtyTracking = true;
    DS().reset();
    DS().loadData(bundle);

    const legacyCollections = ['skills', 'items', 'passives', 'characters', 'monsters', 'encounters'];
    for (const type of legacyCollections) {
      for (const entry of DS().getAllAsArray(type)) {
        DS().replace(type, entry.id, {
          ...entry,
          _scope: 'legacy',
          _world: null,
          _origin: LEGACY_PATHS.bundle
        });
      }
    }

    const effectEntries = Object.entries(masterEffects.effects || {})
      .filter(([id]) => !String(id).startsWith('__COMMENT'))
      .map(([id, effect]) => ({ ...effect, id: effect.id || id }));
    for (const effect of effectEntries) {
      DS().replace('effects', effect.id, {
        ...effect,
        _scope: 'legacy',
        _world: null,
        _origin: LEGACY_PATHS.effects
      });
    }

    const quips = (quipsDoc.fragments || quipsDoc || []).map((fragment) => ({
      ...fragment,
      _scope: 'legacy',
      _world: null,
      _origin: LEGACY_PATHS.quips
    }));
    const questions = (quizDoc.questions || quizDoc || []).map((question) => ({
      ...question,
      _scope: 'legacy',
      _world: null,
      _origin: LEGACY_PATHS.quizBank
    }));

    const statuses = Object.entries(C().STATUS_DEFINITIONS || {}).map(([id, def]) => ({
      ..._stripMeta(def),
      id,
      _scope: 'system',
      _world: null,
      _origin: 'js/core/constants.js'
    }));

    DS().loadData({ quips, quizBank: questions, statuses: Object.fromEntries(statuses.map((status) => [status.id, status])) });
    DS().markClean();
    _suspendDirtyTracking = false;

    _manifest = null;
    _fileEntries = [];
    _fileHeaders = {};
    _dirtyFiles.clear();
    _loadMode = 'legacy';
    _validationIssues = [];
    _validationIndex = {};

    return { success: true, mode: 'legacy', counts: DS().getCounts() };
  }

  async function loadDefaultData() {
    try {
      return await loadManifest();
    } catch (error) {
      console.warn('Manifest load failed, falling back to legacy data:', error.message);
      return loadLegacyData();
    }
  }

  function _worldsForUi() {
    return _sortById(DS().getAllAsArray('worlds')).sort((a, b) => (_worldOrder(a.id) - _worldOrder(b.id)));
  }

  function _suggestTarget(type) {
    const allowedScopes = _allowedScopes(type);
    const scope = allowedScopes.includes(_filters.scope) ? _filters.scope : allowedScopes[0];
    const worlds = _worldsForUi();
    const world = _filters.world !== 'all'
      ? _filters.world
      : (worlds[0]?.id || 'haven');
    return _resolveTarget(type, { scope, world });
  }

  function _resolveTarget(type, target) {
    const allowedScopes = _allowedScopes(type);
    const scope = allowedScopes.includes(target?.scope) ? target.scope : allowedScopes[0];
    const world = scope === 'world'
      ? (target?.world || _worldsForUi()[0]?.id || 'haven')
      : null;
    const entry = _findTargetEntry(type, scope, world);
    return {
      scope,
      world,
      path: entry?.path || null
    };
  }

  function buildNewRecord(type, defaults, target) {
    const resolved = _resolveTarget(type, target || _suggestTarget(type));
    return {
      ...defaults,
      _scope: resolved.scope,
      _world: resolved.world,
      _origin: resolved.path
    };
  }

  function prepareRecord(type, id, record) {
    const current = DS().get(type, id) || {};
    const resolved = _resolveTarget(type, {
      scope: record._scope || current._scope || _suggestTarget(type).scope,
      world: record._world || current._world || _suggestTarget(type).world
    });
    return {
      ...record,
      _scope: record._scope || current._scope || resolved.scope,
      _world: (record._scope || current._scope || resolved.scope) === 'world'
        ? (record._world || current._world || resolved.world)
        : null,
      _origin: record._origin || current._origin || resolved.path
    };
  }

  function createEntry(type, defaults, onCreated) {
    if (!_manifest || !UI()) {
      const id = DS().create(type, defaults);
      if (onCreated) onCreated(id);
      return;
    }

    const worlds = _worldsForUi();
    const allowedScopes = _allowedScopes(type);
    const suggested = _suggestTarget(type);

    if (allowedScopes.length === 1 && allowedScopes[0] !== 'world') {
      const id = DS().create(type, buildNewRecord(type, defaults, suggested));
      if (onCreated) onCreated(id);
      return;
    }

    if (allowedScopes.length === 1 && allowedScopes[0] === 'world' && worlds.length <= 1) {
      const id = DS().create(type, buildNewRecord(type, defaults, suggested));
      if (onCreated) onCreated(id);
      return;
    }

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Scope</label>
          <select id="cm-create-scope">
            ${allowedScopes.map((scope) => `<option value="${scope}" ${suggested.scope === scope ? 'selected' : ''}>${SCOPE_LABELS[scope] || scope}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="cm-create-world-group" style="display:${suggested.scope === 'world' ? '' : 'none'}">
          <label class="form-label">World</label>
          <select id="cm-create-world">
            ${worlds.map((world) => `<option value="${world.id}" ${suggested.world === world.id ? 'selected' : ''}>${_escapeHtml(world.displayName || world.id)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="hint-box hint-info">
        This decides which multi-file JSON document the new ${_escapeHtml(type.replace(/s$/, ''))} will be saved into.
      </div>
      <div class="sync-status-box" id="cm-create-path">Target file: ${_escapeHtml(suggested.path || 'unresolved')}</div>
    `;

    const footer = document.createElement('div');
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = 'Cancel';
    const createBtn = document.createElement('button');
    createBtn.className = 'btn btn-primary';
    createBtn.textContent = 'Create';
    footer.appendChild(cancelBtn);
    footer.appendChild(createBtn);

    const overlay = UI().openModal({
      title: `Create ${type.replace(/s$/, '')}`,
      content: body,
      footer,
      width: '520px'
    });

    const scopeSel = body.querySelector('#cm-create-scope');
    const worldGroup = body.querySelector('#cm-create-world-group');
    const worldSel = body.querySelector('#cm-create-world');
    const pathBox = body.querySelector('#cm-create-path');

    function refreshPath() {
      const target = _resolveTarget(type, {
        scope: scopeSel.value,
        world: worldSel?.value
      });
      worldGroup.style.display = scopeSel.value === 'world' ? '' : 'none';
      pathBox.textContent = `Target file: ${target.path || 'unresolved'}`;
    }

    scopeSel.addEventListener('change', refreshPath);
    worldSel?.addEventListener('change', refreshPath);
    refreshPath();

    cancelBtn.onclick = () => UI().closeModal(overlay);
    createBtn.onclick = () => {
      const target = _resolveTarget(type, {
        scope: scopeSel.value,
        world: worldSel?.value
      });
      const id = DS().create(type, buildNewRecord(type, defaults, target));
      UI().closeModal(overlay);
      if (onCreated) onCreated(id);
    };
  }

  function getManifest() {
    return _manifest ? _clone(_manifest) : null;
  }

  function getLoadMode() {
    return _loadMode;
  }

  function getWorldOptions() {
    return _worldsForUi().map((world) => ({
      id: world.id,
      displayName: world.displayName || world.id,
      color: world.color || _defaultWorldColor(world.id),
      order: world.order || 999
    }));
  }

  function _collectEntriesForPath(type, entry) {
    return _sortById(
      DS().getAllAsArray(type).filter((item) => {
        if (item._origin) return item._origin === entry.path;
        if ((item._scope || null) !== entry.scope) return false;
        if ((item._world || null) !== (entry.world || null)) return false;
        return true;
      }).map((item) => _stripMeta(item))
    );
  }

  function buildFileMap(options = {}) {
    if (!_manifest) return {};

    const includeOnlyDirty = !!options.includeOnlyDirty;
    const fileMap = {};

    for (const entry of _fileEntries) {
      if (includeOnlyDirty && !_dirtyFiles.has(entry.path)) continue;

      const header = _clone(_fileHeaders[entry.path] || _defaultHeader(entry));
      let doc;

      if (entry.category === '_meta') {
        doc = {
          _file: header,
          world: _stripMeta(DS().get('worlds', entry.world) || {
            id: entry.world,
            displayName: entry.world,
            status: 'stub'
          })
        };
      } else if (entry.category === 'effects') {
        const effects = {};
        for (const effect of _collectEntriesForPath('effects', entry)) {
          effects[effect.id] = effect;
        }
        doc = { _file: header, effects };
      } else if (entry.category === 'statuses') {
        doc = { _file: header, entries: _collectEntriesForPath('statuses', entry) };
      } else if (entry.category === 'quizBank') {
        doc = {
          _file: header,
          questions: DS().getAllAsArray('quizBank')
            .filter((question) => (question._origin || entry.path) === entry.path)
            .map((question) => _stripMeta(question))
        };
      } else if (entry.category === 'quips') {
        doc = {
          _file: header,
          fragments: DS().getAllAsArray('quips')
            .filter((fragment) => (fragment._origin || entry.path) === entry.path)
            .map((fragment) => _stripMeta(fragment))
        };
      } else {
        const type = CATEGORY_TO_TYPE[entry.category];
        doc = { _file: header, entries: type ? _collectEntriesForPath(type, entry) : [] };
      }

      fileMap[entry.path] = {
        path: entry.path,
        entry,
        content: JSON.stringify(doc, null, 2) + '\n'
      };
    }

    return fileMap;
  }

  function _materialIcon(itemId, fallbackName) {
    const key = `${itemId} ${fallbackName || ''}`.toLowerCase();
    if (key.includes('pelt') || key.includes('hide')) return '🧶';
    if (key.includes('fang') || key.includes('claw')) return '🦴';
    if (key.includes('dust')) return '✨';
    if (key.includes('crystal') || key.includes('core')) return '💎';
    return '🧱';
  }

  function _materialDescription(name, rarity) {
    return `${name} material drop (${rarity || 'Common'}).`;
  }

  function _classifyHavenQuip(fragment) {
    const blob = JSON.stringify(fragment).toLowerCase();
    const tags = [...(fragment.required_tags || []), ...(fragment.excluded_tags || [])].join(' ').toLowerCase();
    return (
      /actor_bowy|actor_mitia|actor_garr|target_bowy|target_mitia|target_garr/.test(tags) ||
      /\bbowy\b|\bmitia\b|\bgarr\b|\bfrostwood\b|\bfrostbitten\b|\bchimera\b/.test(blob)
    );
  }

  function _renameId(oldId, isUniversal, worldId) {
    return isUniversal ? oldId : `${worldId}_${oldId}`;
  }

  function _renameSkillEntry(entry, skillMap) {
    if (typeof entry === 'string') return skillMap[entry] || entry;
    return {
      ...entry,
      skillId: skillMap[entry.skillId] || entry.skillId
    };
  }

  function _rewriteAiRules(rules, skillMap) {
    return (rules || []).map((rule) => {
      const action = rule?.action || '';
      if (!action.startsWith('use_skill:')) return _clone(rule);
      const skillId = action.split(':')[1];
      return {
        ..._clone(rule),
        action: `use_skill:${skillMap[skillId] || skillId}`
      };
    });
  }

  function _rewriteEffectRefs(list) {
    return (list || []).map((ref) => ({
      ...ref,
      overrides: ref.overrides ? _clone(ref.overrides) : {}
    }));
  }

  function _buildMigrationReport(data) {
    const sections = [];
    sections.push('# Migration Report');
    sections.push('');
    sections.push(`Generated: ${new Date().toISOString()}`);
    sections.push('');

    for (const [label, map] of Object.entries(data.renameMaps)) {
      const rows = Object.entries(map);
      if (!rows.length) continue;
      sections.push(`## ${label}`);
      sections.push('');
      sections.push('| Old ID | New ID |');
      sections.push('|---|---|');
      for (const [from, to] of rows) {
        sections.push(`| ${from} | ${to} |`);
      }
      sections.push('');
    }

    if (data.materials.length) {
      sections.push('## Generated Materials');
      sections.push('');
      sections.push('| ID | Name | Source |');
      sections.push('|---|---|---|');
      for (const material of data.materials) {
        sections.push(`| ${material.id} | ${material.name} | loot |`);
      }
      sections.push('');
    }

    if (data.notes.length) {
      sections.push('## Notes');
      sections.push('');
      for (const note of data.notes) sections.push(`- ${note}`);
      sections.push('');
    }

    return sections.join('\n');
  }

  async function migrateLegacyData() {
    if (!_manifest) throw new Error('Manifest must be loaded before running migration.');

    const [legacyBundle, masterEffects, quipsDoc, quizDoc] = await Promise.all([
      _fetchJson(LEGACY_PATHS.bundle),
      _fetchJson(LEGACY_PATHS.effects),
      _fetchJson(LEGACY_PATHS.quips),
      _fetchJson(LEGACY_PATHS.quizBank)
    ]);

    const worldId = 'haven';
    const renameMaps = {
      characters: {},
      passives: {},
      skills: {},
      items: {},
      monsters: {},
      encounters: {},
      materials: {}
    };

    const notes = [
      'World passives were added as first-class files in the manifest because Haven-specific passives need their own storage.',
      'Loot-only drops not defined in the legacy item table were generated into worlds/haven/materials.json.'
    ];

    for (const id of Object.keys(legacyBundle.characters || {})) {
      renameMaps.characters[id] = _renameId(id, WORLD_UNIVERSAL_IDS.characters.has(id), worldId);
    }
    for (const id of Object.keys(legacyBundle.passives || {})) {
      renameMaps.passives[id] = _renameId(id, WORLD_UNIVERSAL_IDS.passives.has(id), worldId);
    }
    for (const id of Object.keys(legacyBundle.skills || {})) {
      renameMaps.skills[id] = _renameId(id, WORLD_UNIVERSAL_IDS.skills.has(id), worldId);
    }
    for (const id of Object.keys(legacyBundle.items || {})) {
      renameMaps.items[id] = _renameId(id, WORLD_UNIVERSAL_IDS.items.has(id), worldId);
    }
    for (const id of Object.keys(legacyBundle.monsters || {})) {
      renameMaps.monsters[id] = `${worldId}_${id}`;
    }
    for (const id of Object.keys(legacyBundle.encounters || {})) {
      renameMaps.encounters[id] = `${worldId}_${id}`;
    }

    const materialMap = {};
    for (const monster of Object.values(legacyBundle.monsters || {})) {
      for (const loot of (monster.loot || [])) {
        if (!loot?.itemId) continue;
        if (legacyBundle.items?.[loot.itemId]) continue;
        if (!materialMap[loot.itemId]) {
          const newId = `${worldId}_${loot.itemId}`;
          renameMaps.materials[loot.itemId] = newId;
          materialMap[loot.itemId] = {
            id: newId,
            name: loot.name || loot.itemId,
            icon: _materialIcon(loot.itemId, loot.name),
            rarity: loot.rarity || 'Common',
            subCategory: 'material',
            description: _materialDescription(loot.name || loot.itemId, loot.rarity),
            value: { Junk: 3, Common: 8, Uncommon: 16, Rare: 28, Epic: 50, Legendary: 90 }[loot.rarity || 'Common'] || 8
          };
        }
      }
    }

    const docs = [];

    const systemEffectsEntry = _findTargetEntry('effects', 'system');
    const statusesEntry = _fileEntries.find((entry) => entry.scope === 'system' && entry.category === 'statuses');
    const systemQuizEntry = _fileEntries.find((entry) => entry.scope === 'system' && entry.category === 'quizBank');
    const systemQuipsEntry = _fileEntries.find((entry) => entry.scope === 'system' && entry.category === 'quips');
    const universalCharsEntry = _findTargetEntry('characters', 'universal');
    const universalPassivesEntry = _findTargetEntry('passives', 'universal');
    const universalSkillsEntry = _findTargetEntry('skills', 'universal');
    const universalItemsEntry = _findTargetEntry('items', 'universal');
    const universalFoodEntry = _findTargetEntry('food', 'universal');

    docs.push({
      entry: systemEffectsEntry,
      doc: {
        _file: _clone(_fileHeaders[systemEffectsEntry.path] || _defaultHeader(systemEffectsEntry)),
        effects: Object.fromEntries(
          Object.entries(masterEffects.effects || {})
            .filter(([id]) => !String(id).startsWith('__COMMENT'))
            .map(([id, effect]) => [id, { ..._stripMeta(effect), id: effect.id || id }])
        )
      }
    });

    docs.push({
      entry: statusesEntry,
      doc: {
        _file: _clone(_fileHeaders[statusesEntry.path] || _defaultHeader(statusesEntry)),
        entries: _sortById(
          Object.entries(C().STATUS_DEFINITIONS || {}).map(([id, def]) => ({
            ..._stripMeta(def),
            id
          }))
        )
      }
    });

    docs.push({
      entry: systemQuizEntry,
      doc: {
        _file: _clone(_fileHeaders[systemQuizEntry.path] || _defaultHeader(systemQuizEntry)),
        questions: (quizDoc.questions || quizDoc || []).map((question) => _stripMeta(question))
      }
    });

    const systemQuips = [];
    const havenQuips = [];
    for (const fragment of (quipsDoc.fragments || quipsDoc || [])) {
      (_classifyHavenQuip(fragment) ? havenQuips : systemQuips).push(_stripMeta(fragment));
    }

    docs.push({
      entry: systemQuipsEntry,
      doc: {
        _file: _clone(_fileHeaders[systemQuipsEntry.path] || _defaultHeader(systemQuipsEntry)),
        fragments: systemQuips
      }
    });

    docs.push({
      entry: universalCharsEntry,
      doc: {
        _file: _clone(_fileHeaders[universalCharsEntry.path] || _defaultHeader(universalCharsEntry)),
        entries: _sortById(
          Object.values(legacyBundle.characters || {})
            .filter((character) => WORLD_UNIVERSAL_IDS.characters.has(character.id))
            .map((character) => ({
              ..._stripMeta(character),
              id: renameMaps.characters[character.id],
              skills: (character.skills || []).map((skill) => renameMaps.skills[skill] || skill),
              equipment: (character.equipment || []).map((itemId) => renameMaps.items[itemId] || itemId),
              innatePassives: (character.innatePassives || []).map((passiveId) => renameMaps.passives[passiveId] || passiveId)
            }))
        )
      }
    });

    docs.push({
      entry: universalPassivesEntry,
      doc: {
        _file: _clone(_fileHeaders[universalPassivesEntry.path] || _defaultHeader(universalPassivesEntry)),
        entries: _sortById(
          Object.values(legacyBundle.passives || {})
            .filter((passive) => WORLD_UNIVERSAL_IDS.passives.has(passive.id))
            .map((passive) => ({
              ..._stripMeta(passive),
              id: renameMaps.passives[passive.id],
              effects: _rewriteEffectRefs(passive.effects)
            }))
        )
      }
    });

    docs.push({
      entry: universalSkillsEntry,
      doc: {
        _file: _clone(_fileHeaders[universalSkillsEntry.path] || _defaultHeader(universalSkillsEntry)),
        entries: _sortById(
          Object.values(legacyBundle.skills || {})
            .filter((skill) => WORLD_UNIVERSAL_IDS.skills.has(skill.id))
            .map((skill) => ({
              ..._stripMeta(skill),
              id: renameMaps.skills[skill.id],
              effects: _rewriteEffectRefs(skill.effects)
            }))
        )
      }
    });

    docs.push({
      entry: universalItemsEntry,
      doc: {
        _file: _clone(_fileHeaders[universalItemsEntry.path] || _defaultHeader(universalItemsEntry)),
        entries: []
      }
    });

    docs.push({
      entry: universalFoodEntry,
      doc: {
        _file: _clone(_fileHeaders[universalFoodEntry.path] || _defaultHeader(universalFoodEntry)),
        entries: []
      }
    });

    for (const entry of _fileEntries.filter((file) => file.scope === 'world' && file.world === worldId)) {
      if (entry.category === '_meta') continue;
      if (entry.category === 'quips') {
        docs.push({
          entry,
          doc: {
            _file: _clone(_fileHeaders[entry.path] || _defaultHeader(entry)),
            fragments: havenQuips
          }
        });
        continue;
      }

      if (entry.category === 'characters') {
        docs.push({
          entry,
          doc: {
            _file: _clone(_fileHeaders[entry.path] || _defaultHeader(entry)),
            entries: _sortById(
              Object.values(legacyBundle.characters || {})
                .filter((character) => !WORLD_UNIVERSAL_IDS.characters.has(character.id))
                .map((character) => ({
                  ..._stripMeta(character),
                  id: renameMaps.characters[character.id],
                  skills: (character.skills || []).map((skill) => renameMaps.skills[skill] || skill),
                  equipment: (character.equipment || []).map((itemId) => renameMaps.items[itemId] || itemId),
                  innatePassives: (character.innatePassives || []).map((passiveId) => renameMaps.passives[passiveId] || passiveId)
                }))
            )
          }
        });
        continue;
      }

      if (entry.category === 'passives') {
        docs.push({
          entry,
          doc: {
            _file: _clone(_fileHeaders[entry.path] || _defaultHeader(entry)),
            entries: _sortById(
              Object.values(legacyBundle.passives || {})
                .filter((passive) => !WORLD_UNIVERSAL_IDS.passives.has(passive.id))
                .map((passive) => ({
                  ..._stripMeta(passive),
                  id: renameMaps.passives[passive.id],
                  effects: _rewriteEffectRefs(passive.effects)
                }))
            )
          }
        });
        continue;
      }

      if (entry.category === 'skills') {
        docs.push({
          entry,
          doc: {
            _file: _clone(_fileHeaders[entry.path] || _defaultHeader(entry)),
            entries: _sortById(
              Object.values(legacyBundle.skills || {})
                .filter((skill) => !WORLD_UNIVERSAL_IDS.skills.has(skill.id))
                .map((skill) => ({
                  ..._stripMeta(skill),
                  id: renameMaps.skills[skill.id],
                  effects: _rewriteEffectRefs(skill.effects)
                }))
            )
          }
        });
        continue;
      }

      if (entry.category === 'items') {
        docs.push({
          entry,
          doc: {
            _file: _clone(_fileHeaders[entry.path] || _defaultHeader(entry)),
            entries: _sortById(
              Object.values(legacyBundle.items || {}).map((item) => ({
                ..._stripMeta(item),
                id: renameMaps.items[item.id],
                grantedSkills: (item.grantedSkills || []).map((skillId) => renameMaps.skills[skillId] || skillId)
              }))
            )
          }
        });
        continue;
      }

      if (entry.category === 'monsters') {
        docs.push({
          entry,
          doc: {
            _file: _clone(_fileHeaders[entry.path] || _defaultHeader(entry)),
            entries: _sortById(
              Object.values(legacyBundle.monsters || {}).map((monster) => ({
                ..._stripMeta(monster),
                id: renameMaps.monsters[monster.id],
                skills: (monster.skills || []).map((skill) => renameMaps.skills[skill] || skill),
                innatePassives: (monster.innatePassives || []).map((passiveId) => renameMaps.passives[passiveId] || passiveId),
                aiRules: _rewriteAiRules(monster.aiRules, renameMaps.skills),
                loot: (monster.loot || []).map((loot) => ({
                  ..._stripMeta(loot),
                  itemId: renameMaps.items[loot.itemId] || renameMaps.materials[loot.itemId] || loot.itemId
                }))
              }))
            )
          }
        });
        continue;
      }

      if (entry.category === 'encounters') {
        docs.push({
          entry,
          doc: {
            _file: _clone(_fileHeaders[entry.path] || _defaultHeader(entry)),
            entries: _sortById(
              Object.values(legacyBundle.encounters || {}).map((encounter) => ({
                ..._stripMeta(encounter),
                id: renameMaps.encounters[encounter.id],
                units: (encounter.units || []).map((unit) => ({
                  ..._stripMeta(unit),
                  id: renameMaps.characters[unit.id] || renameMaps.monsters[unit.id] || unit.id
                }))
              }))
            )
          }
        });
        continue;
      }

      if (entry.category === 'materials') {
        docs.push({
          entry,
          doc: {
            _file: _clone(_fileHeaders[entry.path] || _defaultHeader(entry)),
            entries: _sortById(Object.values(materialMap))
          }
        });
        continue;
      }

      docs.push({
        entry,
        doc: {
          _file: _clone(_fileHeaders[entry.path] || _defaultHeader(entry)),
          entries: []
        }
      });
    }

    const report = _buildMigrationReport({
      renameMaps,
      materials: Object.values(materialMap),
      notes
    });

    return {
      manifest: _clone(_manifest),
      docs,
      report,
      renameMaps,
      materials: Object.values(materialMap)
    };
  }

  async function applyLegacyMigration() {
    const migration = await migrateLegacyData();
    _lastMigration = migration;
    return _loadManifestDocuments(migration.manifest, migration.docs, { markDirty: true });
  }

  function getLastMigration() {
    return _lastMigration ? {
      report: _lastMigration.report,
      renameMaps: _clone(_lastMigration.renameMaps),
      materials: _clone(_lastMigration.materials)
    } : null;
  }

  return Object.freeze({
    buildFileMap,
    buildNewRecord,
    createEntry,
    formatValidationReport,
    getDirtyFiles,
    getEntityIssueCount,
    getFilters,
    getLastMigration,
    getLoadMode,
    getManifest,
    getValidationIssues,
    getVisibleItems,
    getWorldOptions,
    loadDefaultData,
    loadLegacyData,
    loadManifest,
    prepareRecord,
    renderScopeChip,
    clearDirtyFiles,
    setFilters,
    validateReferencesDetailed,
    migrateLegacyData,
    applyLegacyMigration
  });
})();
