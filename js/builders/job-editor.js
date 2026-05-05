// job-editor.js
// UI: build Jobs (classes). Each job has a list of levels; each level
// can grant statBonus + skills/passives to the wielding character.
// Reads: data-store.js, constants.js, ui-helpers.js, content-manager.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.JobEditor = (() => {
  'use strict';

  const C  = () => window.CJS.CONST;
  const DS = () => window.CJS.DataStore;
  const UI = () => window.CJS.UI;
  const CM = () => window.CJS.ContentManager;

  let _container, _listEl, _formEl, _activeId = null;

  function init(containerEl) {
    _container = containerEl;
    _container.innerHTML = `
      <div class="flex gap-md" style="height:100%">
        <div style="width:260px;flex-shrink:0;display:flex;flex-direction:column;gap:8px">
          <div class="flex gap-sm items-center">
            <input type="search" id="job-search" placeholder="Search jobs..." style="flex:1">
            <button class="btn btn-primary btn-sm" id="job-new">+ New</button>
          </div>
          <div class="data-list" id="job-list" style="flex:1;max-height:none"></div>
        </div>
        <div style="flex:1;overflow-y:auto" id="job-form-area">
          <div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select a job or create a new one</div>
        </div>
      </div>
    `;
    _listEl = _container.querySelector('#job-list');
    _formEl = _container.querySelector('#job-form-area');
    _container.querySelector('#job-new').onclick = _createNew;
    _container.querySelector('#job-search').oninput = (e) => _renderList(e.target.value);
    _renderList();
  }

  function _renderList(q) {
    const items = CM()?.getVisibleItems?.('jobs', q) || (q ? DS().search('jobs', q) : DS().getAllAsArray('jobs'));
    UI().renderDataList({ container: _listEl, items, activeId: _activeId, onSelect: (j) => _load(j.id) });
  }

  function _createNew() {
    const defaults = {
      name: 'New Job',
      icon: '🛡️',
      description: '',
      weaponTypes: [],
      armorTypes: [],
      maxLevel: 10,
      levels: [
        { level: 1, statBonus: {}, grantsSkills: [], grantsPassives: [], description: '' }
      ]
    };
    const create = (id) => { _activeId = id; _renderList(); _load(id); UI().toast('Job created', 'success'); };
    if (CM()?.createEntry) CM().createEntry('jobs', defaults, create);
    else create(DS().create('jobs', defaults));
  }

  function _load(id) {
    _activeId = id;
    _renderList(_container.querySelector('#job-search')?.value);
    const j = DS().get('jobs', id);
    if (!j) return;
    _renderForm(j);
  }

  function _renderForm(j) {
    const levels = Array.isArray(j.levels) ? j.levels : [];

    _formEl.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${j.icon || '🛡️'} ${j.name || 'Unnamed'}</span>
          <div class="btn-group">
            <button class="btn btn-ghost btn-sm" id="job-dup">Duplicate</button>
            <button class="btn btn-danger btn-sm" id="job-del">Delete</button>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group"><label class="form-label">Name</label><input type="text" id="job-name" value="${_esc(j.name || '')}"></div>
          <div class="form-group" style="flex:0 0 80px"><label class="form-label">Icon</label><input type="text" id="job-icon" value="${_esc(j.icon || '🛡️')}" style="text-align:center;font-size:1.2em"></div>
          <div class="form-group" style="flex:0 0 100px"><label class="form-label">Max Level</label><input type="number" id="job-maxlvl" value="${j.maxLevel || 10}" min="1" max="20"></div>
        </div>

        <h3>Equipment Profile</h3>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Weapon Types Allowed</label>
            <div id="job-weapons-area"></div>
            <div class="dim" style="font-size:0.78rem">Wielding a weapon outside this list while this job is active is allowed but no job synergy applies.</div>
          </div>
          <div class="form-group">
            <label class="form-label">Armor Types Allowed</label>
            <div id="job-armors-area"></div>
          </div>
        </div>

        <h3>Levels <span class="dim" style="font-size:0.8em">— each level grants bonuses cumulatively</span></h3>
        <div id="job-levels-area"></div>
        <button class="btn btn-ghost btn-sm" id="job-add-level" style="margin-top:8px">+ Add Level Tier</button>

        <div class="form-group mt-md"><label class="form-label">Description</label><textarea id="job-desc" rows="2">${_esc(j.description || '')}</textarea></div>

        <div style="margin-top:12px"><button class="btn btn-success" id="job-save">💾 Save Job</button></div>
      </div>
    `;

    const weaponWidget = UI().createTagInput({
      tags: Array.isArray(j.weaponTypes) ? j.weaponTypes : [],
      placeholder: 'sword + Enter',
      suggestions: C().WEAPON_TYPES || []
    });
    _formEl.querySelector('#job-weapons-area').appendChild(weaponWidget);

    const armorWidget = UI().createTagInput({
      tags: Array.isArray(j.armorTypes) ? j.armorTypes : [],
      placeholder: 'light + Enter',
      suggestions: C().ARMOR_TYPES || []
    });
    _formEl.querySelector('#job-armors-area').appendChild(armorWidget);

    const levelsArea = _formEl.querySelector('#job-levels-area');
    const levelEditors = [];
    let workingLevels = levels.length ? JSON.parse(JSON.stringify(levels)) : [{ level: 1, statBonus: {}, grantsSkills: [], grantsPassives: [], description: '' }];

    function _renderLevels() {
      levelsArea.innerHTML = '';
      levelEditors.length = 0;
      workingLevels.sort((a, b) => Number(a.level || 0) - Number(b.level || 0));
      for (let i = 0; i < workingLevels.length; i++) {
        const tier = workingLevels[i];
        const editor = _renderLevelTier(tier, i, workingLevels.length, () => {
          workingLevels.splice(i, 1);
          _renderLevels();
        }, (newTier) => {
          workingLevels[i] = newTier;
        });
        levelsArea.appendChild(editor.el);
        levelEditors.push(editor);
      }
    }

    _renderLevels();

    _formEl.querySelector('#job-add-level').onclick = () => {
      // Snapshot current widget values before re-rendering.
      for (let i = 0; i < levelEditors.length; i++) {
        workingLevels[i] = levelEditors[i].snapshot();
      }
      const usedLevels = new Set(workingLevels.map(t => Number(t.level || 0)));
      let next = 2;
      while (usedLevels.has(next)) next++;
      workingLevels.push({ level: next, statBonus: {}, grantsSkills: [], grantsPassives: [], description: '' });
      _renderLevels();
    };

    _formEl.querySelector('#job-save').onclick = () => {
      const payload = {
        id: j.id,
        name: _formEl.querySelector('#job-name').value,
        icon: _formEl.querySelector('#job-icon').value,
        maxLevel: Number(_formEl.querySelector('#job-maxlvl').value) || 10,
        weaponTypes: weaponWidget._getTags(),
        armorTypes: armorWidget._getTags(),
        levels: levelEditors.map((ed) => ed.snapshot()).sort((a, b) => Number(a.level) - Number(b.level)),
        description: _formEl.querySelector('#job-desc').value
      };
      DS().replace('jobs', j.id, payload);
      _renderList(); _load(j.id);
      UI().toast('Job saved', 'success');
    };

    _formEl.querySelector('#job-dup').onclick = () => {
      const nid = DS().duplicate('jobs', j.id);
      if (nid) { _activeId = nid; _renderList(); _load(nid); UI().toast('Duplicated', 'success'); }
    };

    _formEl.querySelector('#job-del').onclick = () => {
      UI().confirm(`Delete "${j.name}"?`, () => {
        DS().remove('jobs', j.id);
        _activeId = null;
        _renderList();
        _formEl.innerHTML = '<div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select a job</div>';
        UI().toast('Deleted', 'info');
      });
    };
  }

  function _renderLevelTier(tier, index, total, onRemove, onChange) {
    const el = document.createElement('div');
    el.className = 'card';
    el.style.background = 'var(--surface2)';
    el.style.marginBottom = '8px';

    const stats = (C().STATS || ['S','P','E','C','I','A','L']);
    const sb = { ...(tier.statBonus || {}) };

    el.innerHTML = `
      <div class="form-row">
        <div class="form-group" style="flex:0 0 90px"><label class="form-label">Level</label><input type="number" class="job-tier-level" value="${Number(tier.level || 1)}" min="1" max="20"></div>
        <div class="form-group" style="flex:1"><label class="form-label">Tier Description</label><input type="text" class="job-tier-desc" value="${_esc(tier.description || '')}"></div>
        ${total > 1 ? '<button class="btn btn-danger btn-sm job-tier-remove" style="align-self:flex-end;margin-bottom:4px">Remove</button>' : ''}
      </div>
      <div class="dim" style="font-size:0.78rem;margin:-2px 0 4px">Stat bonuses are CUMULATIVE on top of all earlier tiers when the character reaches this level.</div>
      <div class="form-row" id="job-tier-stats-row-${index}">
        ${stats.map(s => `
          <div class="form-group" style="flex:0 0 70px">
            <label class="form-label">${s}</label>
            <input type="number" class="job-tier-stat" data-stat="${s}" value="${Number(sb[s] || 0)}" style="width:100%">
          </div>`).join('')}
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label class="form-label">Grants Skills (skill IDs, comma separated)</label>
          <input type="text" class="job-tier-skills" value="${_esc((tier.grantsSkills || []).join(', '))}">
          <div class="dim" style="font-size:0.74rem">Granted skills are auto-learned when the character reaches this job level.</div>
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label">Grants Passives (passive IDs, comma separated)</label>
          <input type="text" class="job-tier-passives" value="${_esc((tier.grantsPassives || []).join(', '))}">
        </div>
      </div>
    `;

    const removeBtn = el.querySelector('.job-tier-remove');
    if (removeBtn) removeBtn.onclick = onRemove;

    function snapshot() {
      const out = {
        level: Number(el.querySelector('.job-tier-level').value || 1),
        description: el.querySelector('.job-tier-desc').value,
        statBonus: {},
        grantsSkills: (el.querySelector('.job-tier-skills').value || '').split(',').map(s => s.trim()).filter(Boolean),
        grantsPassives: (el.querySelector('.job-tier-passives').value || '').split(',').map(s => s.trim()).filter(Boolean)
      };
      el.querySelectorAll('.job-tier-stat').forEach((inp) => {
        const v = Number(inp.value || 0);
        if (v) out.statBonus[inp.dataset.stat] = v;
      });
      onChange(out);
      return out;
    }

    el.addEventListener('change', snapshot);

    return { el, snapshot };
  }

  function _esc(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function refresh() { if (_container) _renderList(); }
  return Object.freeze({ init, refresh });
})();
