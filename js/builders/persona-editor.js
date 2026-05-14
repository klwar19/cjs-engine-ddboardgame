// persona-editor.js
// UI: build Personas (world-specific character skins).
// A persona reshapes how a character behaves in a specific world:
//   - characterId (owner) + world (home world)
//   - statOverrides on top of the character's universal SPECIAL stats
//   - defaultJob / availableJobs / availableBranches
//   - skills / equipment / innatePassives / weapon&armor allowances
//   - unlock rules (default / requiresChapter / requiresPhaseNumber /
//                   requiresPhaseType / requiresFlag / world)
//   - crossWorldPenalty applied when used outside home world
//   - relationshipPerWorld hints for NPC / quip systems
//
// Reads: data-store.js, constants.js, ui-helpers.js, content-manager.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.PersonaEditor = (() => {
  'use strict';

  const C  = () => window.CJS.CONST;
  const DS = () => window.CJS.DataStore;
  const UI = () => window.CJS.UI;
  const CM = () => window.CJS.ContentManager;

  let _container, _listEl, _formEl, _activeId = null;

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function init(containerEl) {
    _container = containerEl;
    _container.innerHTML = `
      <div class="flex gap-md" style="height:100%">
        <div style="width:280px;flex-shrink:0;display:flex;flex-direction:column;gap:8px">
          <div class="flex gap-sm items-center">
            <input type="search" id="persona-search" placeholder="Search personas..." style="flex:1">
            <button class="btn btn-primary btn-sm" id="persona-new">+ New</button>
          </div>
          <div class="data-list" id="persona-list" style="flex:1;max-height:none"></div>
        </div>
        <div style="flex:1;overflow-y:auto" id="persona-form-area">
          <div class="card" style="text-align:center;color:var(--text-mute);padding:40px">
            Select a persona or create a new one
          </div>
        </div>
      </div>
    `;
    _listEl = _container.querySelector('#persona-list');
    _formEl = _container.querySelector('#persona-form-area');
    _container.querySelector('#persona-new').onclick = _createNew;
    _container.querySelector('#persona-search').oninput = (e) => _renderList(e.target.value);
    _renderList();
  }

  function refresh() {
    if (!_container) return;
    _renderList(_container.querySelector('#persona-search')?.value);
    if (_activeId) _load(_activeId);
  }

  function _renderList(q) {
    const items = CM()?.getVisibleItems?.('personas', q) || (q ? DS().search('personas', q) : DS().getAllAsArray('personas'));
    UI().renderDataList({
      container: _listEl,
      items,
      activeId: _activeId,
      onSelect: (p) => _load(p.id),
      renderItem: (p) => {
        const ownerChar = p.characterId ? DS().get('characters', p.characterId) : null;
        const ownerName = ownerChar?.name || p.characterId || '—';
        const worldName = p.world ? (DS().get('worlds', p.world)?.displayName || p.world) : '—';
        return `
          <span class="item-icon">${_esc(p.icon || '🎭')}</span>
          <div style="min-width:0">
            <div class="item-name">${_esc(p.name || p.id)}</div>
            <div class="item-sub">${_esc(ownerName)} · ${_esc(worldName)}</div>
          </div>
        `;
      }
    });
  }

  function _createNew() {
    const defaults = {
      name: 'New Persona',
      icon: '🎭',
      characterId: '',
      world: '',
      rank: 'F',
      description: '',
      statOverrides: {},
      defaultJob: '',
      availableJobs: [],
      availableBranches: [],
      innatePassives: [],
      skills: [],
      equipment: [],
      allowedWeaponTypes: [],
      allowedArmorTypes: [],
      unlock: { default: true },
      crossWorldPenalty: {
        statFlat: {},
        damageDealtMultiplier: 0.8,
        damageTakenMultiplier: 1.2,
        relationshipModifier: -1,
        tags: []
      },
      relationshipPerWorld: {},
      tags: []
    };
    const create = (id) => { _activeId = id; _renderList(); _load(id); UI().toast('Persona created', 'success'); };
    if (CM()?.createEntry) CM().createEntry('personas', defaults, create);
    else create(DS().create('personas', defaults));
  }

  function _load(id) {
    _activeId = id;
    _renderList(_container.querySelector('#persona-search')?.value);
    const p = DS().get('personas', id);
    if (!p) return;
    _renderForm(p);
  }

  function _renderForm(p) {
    const characters = DS().getAllAsArray('characters');
    const worlds = DS().getAllAsArray('worlds');
    const jobs = DS().getAllAsArray('jobs');

    const charOptions = '<option value="">— pick character —</option>' + characters
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)))
      .map((c) => `<option value="${_esc(c.id)}" ${p.characterId === c.id ? 'selected' : ''}>${_esc(c.name || c.id)}</option>`)
      .join('');

    const worldOptions = '<option value="">— pick world —</option>' + worlds
      .sort((a, b) => Number(a.order || 999) - Number(b.order || 999))
      .map((w) => `<option value="${_esc(w.id)}" ${p.world === w.id ? 'selected' : ''}>${_esc(w.displayName || w.id)}</option>`)
      .join('');

    const jobOptions = '<option value="">— none —</option>' + jobs
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)))
      .map((j) => `<option value="${_esc(j.id)}" ${p.defaultJob === j.id ? 'selected' : ''}>${j.icon || ''} ${_esc(j.name || j.id)}</option>`)
      .join('');

    const ranks = (C().RANKS || ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SR', 'SSR']);
    const rankOptions = ranks.map((r) => `<option value="${r}" ${(p.rank || 'F') === r ? 'selected' : ''}>${r}</option>`).join('');

    const unlock = p.unlock || {};
    const pen = p.crossWorldPenalty || {};
    const stats = (C().STATS || ['S', 'P', 'E', 'C', 'I', 'A', 'L']);

    const statOverrides = p.statOverrides || {};
    const penFlat = pen.statFlat || {};

    _formEl.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${_esc(p.icon || '🎭')} ${_esc(p.name || 'Unnamed')}</span>
          <div class="btn-group">
            <button class="btn btn-ghost btn-sm" id="persona-dup">Duplicate</button>
            <button class="btn btn-danger btn-sm" id="persona-del">Delete</button>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group"><label class="form-label">ID</label><input type="text" value="${_esc(p.id)}" disabled></div>
          <div class="form-group"><label class="form-label">Name</label><input type="text" id="persona-name" value="${_esc(p.name || '')}"></div>
          <div class="form-group" style="flex:0 0 100px"><label class="form-label">Icon</label><input type="text" id="persona-icon" value="${_esc(p.icon || '🎭')}" style="text-align:center;font-size:1.2em"></div>
          <div class="form-group" style="flex:0 0 90px"><label class="form-label">Rank</label><select id="persona-rank">${rankOptions}</select></div>
        </div>

        <div class="form-row">
          <div class="form-group"><label class="form-label">Owner Character</label><select id="persona-char">${charOptions}</select></div>
          <div class="form-group"><label class="form-label">Home World</label><select id="persona-world">${worldOptions}</select></div>
        </div>

        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea id="persona-desc" rows="2">${_esc(p.description || '')}</textarea>
        </div>

        <h3>Stat Overrides <span class="dim" style="font-size:0.8em">— added on top of universal SPECIAL</span></h3>
        <div class="form-row" id="persona-stats-row">
          ${stats.map((s) => `
            <div class="form-group" style="flex:0 0 90px">
              <label class="form-label">${s}</label>
              <input type="number" data-stat-override="${s}" value="${Number(statOverrides[s] || 0)}">
            </div>
          `).join('')}
        </div>

        <h3>Loadout</h3>
        <div class="form-row">
          <div class="form-group" style="flex:0 0 280px"><label class="form-label">Default Job</label><select id="persona-default-job">${jobOptions}</select></div>
          <div class="form-group">
            <label class="form-label">Available Jobs</label>
            <div id="persona-available-jobs-area"></div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Available Branches</label>
            <div id="persona-branches-area"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Innate Passives</label>
            <div id="persona-passives-area"></div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Persona Skills</label>
            <div id="persona-skills-area"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Persona Starting Equipment</label>
            <div id="persona-equipment-area"></div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Weapon Types Allowed</label>
            <div id="persona-weapons-area"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Armor Types Allowed</label>
            <div id="persona-armors-area"></div>
          </div>
        </div>

        <h3>Unlock Rules</h3>
        <div class="form-row">
          <div class="form-group" style="flex:0 0 160px">
            <label class="form-label"><input type="checkbox" id="persona-unlock-default" ${unlock.default ? 'checked' : ''}> Default unlocked</label>
          </div>
          <div class="form-group" style="flex:0 0 140px"><label class="form-label">Chapter ≥</label><input type="number" id="persona-unlock-chapter" value="${Number(unlock.requiresChapter || 0)}" min="0"></div>
          <div class="form-group" style="flex:0 0 160px"><label class="form-label">Phase # ≥</label><input type="number" id="persona-unlock-phase-number" value="${Number(unlock.requiresPhaseNumber || 0)}" min="0"></div>
          <div class="form-group" style="flex:0 0 160px"><label class="form-label">Phase Type</label><input type="text" id="persona-unlock-phase-type" value="${_esc(unlock.requiresPhaseType || '')}" placeholder="travel_phase"></div>
          <div class="form-group"><label class="form-label">Required Flag</label><input type="text" id="persona-unlock-flag" value="${_esc(unlock.requiresFlag || '')}" placeholder="zombie_first_camp_secured"></div>
        </div>
        <div class="dim" style="font-size:0.78rem;margin-bottom:8px">Set "Default unlocked" for starter personas. Other rules gate phase-locked personas; all conditions must pass.</div>

        <h3>Cross-World Penalty <span class="dim" style="font-size:0.8em">— applied when used outside home world</span></h3>
        <div class="form-row">
          <div class="form-group" style="flex:0 0 180px"><label class="form-label">Damage Dealt ×</label><input type="number" step="0.05" id="persona-pen-dealt" value="${Number(pen.damageDealtMultiplier ?? 1)}"></div>
          <div class="form-group" style="flex:0 0 180px"><label class="form-label">Damage Taken ×</label><input type="number" step="0.05" id="persona-pen-taken" value="${Number(pen.damageTakenMultiplier ?? 1)}"></div>
          <div class="form-group" style="flex:0 0 200px"><label class="form-label">Relationship Modifier</label><input type="number" id="persona-pen-relationship" value="${Number(pen.relationshipModifier ?? 0)}"></div>
        </div>
        <div class="form-row" id="persona-pen-flat-row">
          ${stats.map((s) => `
            <div class="form-group" style="flex:0 0 90px">
              <label class="form-label">${s} (flat)</label>
              <input type="number" data-pen-flat="${s}" value="${Number(penFlat[s] || 0)}">
            </div>
          `).join('')}
        </div>
        <div class="form-group">
          <label class="form-label">Cross-world tags (comma-separated)</label>
          <input type="text" id="persona-pen-tags" value="${_esc((pen.tags || []).join(', '))}" placeholder="out_of_place, rot_smell">
          <div class="dim" style="font-size:0.78rem;margin-top:4px">NPC dialogue / quips can gate by these tags.</div>
        </div>

        <div class="form-group">
          <label class="form-label">Persona tags</label>
          <input type="text" id="persona-tags" value="${_esc((p.tags || []).join(', '))}" placeholder="adventurer, fantasy">
        </div>

        <div style="margin-top:12px"><button class="btn btn-success" id="persona-save">💾 Save Persona</button></div>
      </div>
    `;

    _formEl.querySelector('#persona-dup').onclick = () => {
      const newId = DS().duplicate('personas', p.id);
      if (newId) { _activeId = newId; _renderList(); _load(newId); UI().toast('Duplicated', 'success'); }
    };
    _formEl.querySelector('#persona-del').onclick = () => {
      UI().confirm(`Delete persona "${p.name || p.id}"?`, () => {
        DS().remove('personas', p.id);
        _activeId = null;
        _renderList();
        _formEl.innerHTML = '<div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select a persona</div>';
        UI().toast('Deleted', 'info');
      });
    };

    // Multi-input widgets
    const passiveOptions = (DS().getAllAsArray('passives') || []).map((x) => x.id);
    const skillOptions   = (DS().getAllAsArray('skills') || []).map((x) => x.id);
    const itemOptions    = (DS().getAllAsArray('items') || []).map((x) => x.id);
    const jobIds         = jobs.map((j) => j.id);

    const branchInput = UI().createTagInput({
      tags: Array.isArray(p.availableBranches) ? p.availableBranches : [],
      placeholder: 'warrior + Enter'
    });
    _formEl.querySelector('#persona-branches-area').appendChild(branchInput);

    const availJobsInput = UI().createTagInput({
      tags: Array.isArray(p.availableJobs) ? p.availableJobs : [],
      placeholder: 'job_warrior + Enter',
      suggestions: jobIds
    });
    _formEl.querySelector('#persona-available-jobs-area').appendChild(availJobsInput);

    const passivesInput = UI().createTagInput({
      tags: Array.isArray(p.innatePassives) ? p.innatePassives : [],
      placeholder: 'passive id + Enter',
      suggestions: passiveOptions
    });
    _formEl.querySelector('#persona-passives-area').appendChild(passivesInput);

    const skillsInput = UI().createTagInput({
      tags: Array.isArray(p.skills) ? p.skills : [],
      placeholder: 'skill id + Enter',
      suggestions: skillOptions
    });
    _formEl.querySelector('#persona-skills-area').appendChild(skillsInput);

    const equipmentInput = UI().createTagInput({
      tags: Array.isArray(p.equipment) ? p.equipment : [],
      placeholder: 'item id + Enter',
      suggestions: itemOptions
    });
    _formEl.querySelector('#persona-equipment-area').appendChild(equipmentInput);

    const weaponInput = UI().createTagInput({
      tags: Array.isArray(p.allowedWeaponTypes) ? p.allowedWeaponTypes : [],
      placeholder: 'sword + Enter',
      suggestions: C().WEAPON_TYPES || []
    });
    _formEl.querySelector('#persona-weapons-area').appendChild(weaponInput);

    const armorInput = UI().createTagInput({
      tags: Array.isArray(p.allowedArmorTypes) ? p.allowedArmorTypes : [],
      placeholder: 'light + Enter',
      suggestions: C().ARMOR_TYPES || []
    });
    _formEl.querySelector('#persona-armors-area').appendChild(armorInput);

    _formEl.querySelector('#persona-save').onclick = () => {
      const overrides = {};
      _formEl.querySelectorAll('[data-stat-override]').forEach((input) => {
        const stat = input.dataset.statOverride;
        const v = Number(input.value);
        if (Number.isFinite(v) && v !== 0) overrides[stat] = v;
      });

      const penFlatOut = {};
      _formEl.querySelectorAll('[data-pen-flat]').forEach((input) => {
        const stat = input.dataset.penFlat;
        const v = Number(input.value);
        if (Number.isFinite(v) && v !== 0) penFlatOut[stat] = v;
      });

      const next = {
        ...p,
        name: _formEl.querySelector('#persona-name').value.trim() || 'Unnamed Persona',
        icon: _formEl.querySelector('#persona-icon').value.trim() || '🎭',
        rank: _formEl.querySelector('#persona-rank').value,
        characterId: _formEl.querySelector('#persona-char').value || null,
        world: _formEl.querySelector('#persona-world').value || null,
        description: _formEl.querySelector('#persona-desc').value,
        statOverrides: overrides,
        defaultJob: _formEl.querySelector('#persona-default-job').value || null,
        availableJobs: availJobsInput.getTags(),
        availableBranches: branchInput.getTags(),
        innatePassives: passivesInput.getTags(),
        skills: skillsInput.getTags(),
        equipment: equipmentInput.getTags(),
        allowedWeaponTypes: weaponInput.getTags(),
        allowedArmorTypes: armorInput.getTags(),
        unlock: {
          default: _formEl.querySelector('#persona-unlock-default').checked,
          requiresChapter: Number(_formEl.querySelector('#persona-unlock-chapter').value) || 0,
          requiresPhaseNumber: Number(_formEl.querySelector('#persona-unlock-phase-number').value) || 0,
          requiresPhaseType: _formEl.querySelector('#persona-unlock-phase-type').value.trim() || null,
          requiresFlag: _formEl.querySelector('#persona-unlock-flag').value.trim() || null,
          world: _formEl.querySelector('#persona-world').value || null
        },
        crossWorldPenalty: {
          ...(p.crossWorldPenalty || {}),
          statFlat: penFlatOut,
          damageDealtMultiplier: Number(_formEl.querySelector('#persona-pen-dealt').value) || 1,
          damageTakenMultiplier: Number(_formEl.querySelector('#persona-pen-taken').value) || 1,
          relationshipModifier: Number(_formEl.querySelector('#persona-pen-relationship').value) || 0,
          tags: _formEl.querySelector('#persona-pen-tags').value.split(',').map((s) => s.trim()).filter(Boolean)
        },
        tags: _formEl.querySelector('#persona-tags').value.split(',').map((s) => s.trim()).filter(Boolean)
      };
      const prepared = CM()?.prepareRecord ? CM().prepareRecord('personas', p.id, next) : next;
      DS().replace('personas', p.id, prepared);
      UI().toast('Persona saved', 'success');
      _load(p.id);
    };
  }

  return Object.freeze({ init, refresh });
})();
