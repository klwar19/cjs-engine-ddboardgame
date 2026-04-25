// char-editor.js
// UI: build characters with stats, skills, items, innate passives.
// Reads: data-store.js, constants.js, formulas.js, ui-helpers.js, effect-registry.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.CharEditor = (() => {
  'use strict';

  const C  = () => window.CJS.CONST;
  const DS = () => window.CJS.DataStore;
  const F  = () => window.CJS.Formulas;
  const UI = () => window.CJS.UI;
  const CM = () => window.CJS.ContentManager;
  const PP = () => window.CJS.PortraitPicker;

  let _container, _listEl, _formEl, _activeId = null;

  function init(containerEl) {
    _container = containerEl;
    _container.innerHTML = `
      <div class="flex gap-md" style="height:100%">
        <div style="width:260px;flex-shrink:0;display:flex;flex-direction:column;gap:8px">
          <div class="flex gap-sm items-center">
            <input type="search" id="chr-search" placeholder="Search characters..." style="flex:1">
            <button class="btn btn-primary btn-sm" id="chr-new">+ New</button>
          </div>
          <div class="data-list" id="chr-list" style="flex:1;max-height:none"></div>
        </div>
        <div style="flex:1;overflow-y:auto" id="chr-form-area">
          <div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select a character or create a new one</div>
        </div>
      </div>
    `;
    _listEl = _container.querySelector('#chr-list');
    _formEl = _container.querySelector('#chr-form-area');
    _container.querySelector('#chr-new').onclick = _createNew;
    _container.querySelector('#chr-search').oninput = (e) => _renderList(e.target.value);
    _renderList();
  }

  function _renderList(q) {
    const items = CM()?.getVisibleItems?.('characters', q) || (q ? DS().search('characters', q) : DS().getAllAsArray('characters'));
    UI().renderDataList({ container: _listEl, items, activeId: _activeId, onSelect: (c) => _load(c.id) });
  }

  function _createNew() {
    const id = DS().create('characters', {
      name: 'New Character', icon: '🧑', team: 'player', rank: 'F', type: 'humanoid',
      stats: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 },
      skills: [], equipment: [], innatePassives: [],
      weak: [], resist: [], immune: [],
      portrait: '',
      description: ''
    });
    _activeId = id; _renderList(); _load(id);
    UI().toast('Character created', 'success');
  }

  function _load(id) {
    _activeId = id;
    _renderList(_container.querySelector('#chr-search')?.value);
    const c = DS().get('characters', id);
    if (!c) return;
    _renderForm(c);
  }

  function _renderForm(c) {
    const stats = c.stats || { S:5,P:5,E:5,C:5,I:5,A:5,L:5 };
    const rankData = C().RANK_DATA[c.rank || 'F'] || C().RANK_DATA.F;

    _formEl.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${c.icon||'🧑'} ${c.name||'Unnamed'}</span>
          <div class="btn-group">
            <button class="btn btn-ghost btn-sm" id="chr-dup">Duplicate</button>
            <button class="btn btn-danger btn-sm" id="chr-del">Delete</button>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group"><label class="form-label">Name</label><input type="text" id="chr-name" value="${_esc(c.name||'')}"></div>
          <div class="form-group" style="flex:0 0 80px"><label class="form-label">Icon</label><input type="text" id="chr-icon" value="${_esc(c.icon||'🧑')}" style="text-align:center;font-size:1.2em"></div>
        </div>
        <div id="chr-portrait-area" style="margin-bottom:8px"></div>

        <div class="form-row">
          <div class="form-group"><label class="form-label">Team</label>
            <select id="chr-team"><option value="player" ${c.team==='player'?'selected':''}>Player</option><option value="ally" ${c.team==='ally'?'selected':''}>Ally</option><option value="neutral" ${c.team==='neutral'?'selected':''}>Neutral</option></select>
          </div>
          <div class="form-group"><label class="form-label">Rank</label>
            <select id="chr-rank">${C().RANKS.map(r=>`<option value="${r}" ${c.rank===r?'selected':''}>${r}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label class="form-label">Unit Type</label>
            <select id="chr-type">${C().UNIT_TYPES.map(t=>`<option value="${t}" ${c.type===t?'selected':''}>${t}</option>`).join('')}</select>
          </div>
        </div>

        <h3>SPECIAL Stats <span class="dim" style="font-size:0.8em">(Rank ${c.rank||'F'}: ${rankData.statMin}–${rankData.statMax}, total ~${rankData.totalSpecial})</span></h3>
        <div id="chr-stats-area"></div>
        <div class="dim" style="font-size:0.82rem;margin-top:4px">Total: <b id="chr-stat-total">0</b> / ~${rankData.totalSpecial}</div>

        <div class="form-row mt-sm">
          <div class="form-group" style="flex:0 0 140px"><label class="form-label">Base Movement</label><input type="number" id="chr-movement" value="${c.movement||3}" min="0" max="8" style="width:100%"></div>
          <div class="form-group" style="flex:0 0 140px"><label class="form-label">Size</label>
            <select id="chr-size">${Object.entries(C().UNIT_SIZES).map(([k,v])=>`<option value="${k}" ${(c.size||'1x1')===k?'selected':''}>${v.label}</option>`).join('')}</select>
          </div>
          <div class="dim" style="align-self:flex-end;padding-bottom:6px;font-size:0.82rem">Movement: cells/turn · Size: grid footprint</div>
        </div>

        <h3>Derived Stats</h3>
        <div class="card" style="background:var(--surface2)" id="chr-derived"></div>

        <h3>Skills</h3>
        <div id="chr-skills-area"></div>

        <h3>Equipment</h3>
        <div id="chr-equip-area"></div>

        <h3>Innate Passives</h3>
        <div id="chr-passives-area"></div>

        <h3>Elemental Interactions</h3>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Weaknesses</label><div id="chr-weak-area"></div></div>
          <div class="form-group"><label class="form-label">Resistances</label><div id="chr-resist-area"></div></div>
          <div class="form-group"><label class="form-label">Immunities</label><div id="chr-immune-area"></div></div>
        </div>

        <div class="form-group mt-md"><label class="form-label">Description</label><textarea id="chr-desc" rows="2">${_esc(c.description||'')}</textarea></div>

        <div style="margin-top:12px"><button class="btn btn-success" id="chr-save">💾 Save Character</button></div>
      </div>
    `;

    // ── Stat sliders ──
    let portraitWidget = null;
    const portraitArea = _formEl.querySelector('#chr-portrait-area');
    if (portraitArea && PP()) {
      portraitWidget = PP().createWidget({
        currentPath: c.portrait || '',
        category: 'characters',
        fallbackIcon: c.icon || '?'
      });
      portraitArea.appendChild(portraitWidget.el);

      const iconInput = _formEl.querySelector('#chr-icon');
      const syncPortraitFallback = () => portraitWidget?.setFallbackIcon(iconInput?.value || '?');
      iconInput?.addEventListener('input', syncPortraitFallback);
      iconInput?.addEventListener('change', syncPortraitFallback);
    }

    const statsArea = _formEl.querySelector('#chr-stats-area');
    const statSliders = {};
    for (const s of C().STATS) {
      const slider = UI().createNumberSlider({
        value: stats[s] || 5, min: 1, max: rankData.statMax + 10, label: `${s}`,
        onChange: () => _updateDerived(statSliders, c.rank || 'F')
      });
      statSliders[s] = slider;
      statsArea.appendChild(slider);
    }
    _updateDerived(statSliders, c.rank || 'F');

    // Movement input → update derived
    _formEl.querySelector('#chr-movement').onchange = () => _updateDerived(statSliders, _formEl.querySelector('#chr-rank').value || 'F');

    // Rank change → update stat limits
    _formEl.querySelector('#chr-rank').onchange = (e) => {
      const rd = C().RANK_DATA[e.target.value] || C().RANK_DATA.F;
      _formEl.querySelector('h3 .dim').textContent = `(Rank ${e.target.value}: ${rd.statMin}–${rd.statMax}, total ~${rd.totalSpecial})`;
      _updateDerived(statSliders, e.target.value);
    };

    // ── Skills picker (with override support) ──
    const skillsArea = _formEl.querySelector('#chr-skills-area');
    const skillPicker = _createSkillRefPicker(c.skills || []);
    skillsArea.appendChild(skillPicker.el);

    // ── Equipment picker ──
    const equipArea = _formEl.querySelector('#chr-equip-area');
    const equipPicker = _createRefPicker('items', c.equipment || [], 'item');
    equipArea.appendChild(equipPicker.el);

    // ── Passives picker ──
    const passivesArea = _formEl.querySelector('#chr-passives-area');
    const passivePicker = _createRefPicker('passives', c.innatePassives || [], 'passive');
    passivesArea.appendChild(passivePicker.el);

    // ── Elemental tag inputs ──
    const weakWidget = UI().createTagInput({ tags: c.weak || [], placeholder: 'e.g. Fire + Enter' });
    _formEl.querySelector('#chr-weak-area').appendChild(weakWidget);
    const resistWidget = UI().createTagInput({ tags: c.resist || [], placeholder: 'e.g. Water + Enter' });
    _formEl.querySelector('#chr-resist-area').appendChild(resistWidget);
    const immuneWidget = UI().createTagInput({ tags: c.immune || [], placeholder: 'e.g. Dark + Enter' });
    _formEl.querySelector('#chr-immune-area').appendChild(immuneWidget);

    // ── Save ──
    _formEl.querySelector('#chr-save').onclick = () => {
      const currentStats = {};
      for (const s of C().STATS) currentStats[s] = statSliders[s]._getValue();
      DS().replace('characters', c.id, {
        id: c.id,
        name: _formEl.querySelector('#chr-name').value,
        icon: _formEl.querySelector('#chr-icon').value,
        portrait: portraitWidget ? portraitWidget.getValue() : (c.portrait || ''),
        team: _formEl.querySelector('#chr-team').value,
        rank: _formEl.querySelector('#chr-rank').value,
        type: _formEl.querySelector('#chr-type').value,
        stats: currentStats,
        movement: Number(_formEl.querySelector('#chr-movement').value) || 3,
        size: _formEl.querySelector('#chr-size').value || '1x1',
        skills: skillPicker.getEntries(),
        equipment: equipPicker.getIds(),
        innatePassives: passivePicker.getIds(),
        weak: weakWidget._getTags(),
        resist: resistWidget._getTags(),
        immune: immuneWidget._getTags(),
        description: _formEl.querySelector('#chr-desc').value
      });
      _renderList(); _load(c.id);
      UI().toast('Character saved', 'success');
    };
    _formEl.querySelector('#chr-dup').onclick = () => { const nid=DS().duplicate('characters',c.id); if(nid){_activeId=nid;_renderList();_load(nid);UI().toast('Duplicated','success');} };
    _formEl.querySelector('#chr-del').onclick = () => { UI().confirm(`Delete "${c.name}"?`,()=>{DS().remove('characters',c.id);_activeId=null;_renderList();_formEl.innerHTML='<div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select a character</div>';UI().toast('Deleted','info');}); };
  }

  function _updateDerived(sliders, rank) {
    const stats = {};
    let total = 0;
    for (const s of C().STATS) { stats[s] = sliders[s]._getValue(); total += stats[s]; }
    const totalEl = _formEl.querySelector('#chr-stat-total');
    if (totalEl) totalEl.textContent = total;

    const el = _formEl.querySelector('#chr-derived');
    if (!el) return;
    const hp = F().calcMaxHP(stats, rank);
    const mp = F().calcMaxMP(stats, rank);
    const pdr = F().calcPhysicalDR(stats);
    const mdr = F().calcMagicDR(stats);
    const cdr = F().calcChaosDR(stats);
    const move = F().calcMovement(Number(_formEl.querySelector('#chr-movement')?.value) || 3, 0);
    const crit = F().calcCritChance(stats.L, 0);
    el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:12px;font-size:0.88rem">
      <span><b style="color:var(--red)">HP</b> ${hp}</span>
      <span><b style="color:var(--blue)">MP</b> ${mp}</span>
      <span><b style="color:var(--text-dim)">Phys DR</b> ${pdr}</span>
      <span><b style="color:var(--accent)">Mag DR</b> ${mdr}</span>
      <span><b style="color:var(--pink)">Chaos DR</b> ${cdr}</span>
      <span><b style="color:var(--green)">Move</b> ${move}</span>
      <span><b style="color:var(--gold)">Crit</b> ${crit.toFixed(1)}%</span>
    </div>`;
  }

  // ── Reference Picker (for items/passives — no overrides) ──────────
  function _createRefPicker(type, currentIds, label) {
    const el = document.createElement('div');
    let ids = [...currentIds];

    function render() {
      el.innerHTML = '';
      for (let i = 0; i < ids.length; i++) {
        const item = DS().get(type, ids[i]);
        const chip = document.createElement('div');
        chip.className = 'effect-chip';
        if (item) {
          chip.innerHTML = `<span class="chip-icon">${item.icon||'✦'}</span><span class="chip-name">${item.name}</span><span class="chip-desc">${item.description?.substring(0,50)||item.id}</span>`;
        } else {
          chip.innerHTML = `<span class="chip-icon">⚠️</span><span class="chip-name">${ids[i]}</span><span class="chip-desc" style="color:var(--red)">Not found</span>`;
        }
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-icon';
        removeBtn.textContent = '❌';
        removeBtn.onclick = () => { ids.splice(i, 1); render(); };
        chip.appendChild(removeBtn);
        el.appendChild(chip);
      }

      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-ghost btn-sm';
      addBtn.textContent = `+ Add ${label}`;
      addBtn.onclick = () => _openRefPicker(type, label, (picked) => {
        if (!ids.includes(picked.id)) { ids.push(picked.id); render(); }
      });
      el.appendChild(addBtn);
    }

    render();
    return { el, getIds: () => [...ids] };
  }

  // ── Skill Override Picker (skills with optional overrides) ────────
  // Stores as: [{ skillId: 'fire_slash', overrides: { power: 20 } }]
  // Backwards-compatible: bare string IDs treated as { skillId, overrides: {} }
  function _createSkillRefPicker(currentEntries) {
    const el = document.createElement('div');
    // Normalize: accept both bare IDs and { skillId, overrides }
    let entries = (currentEntries || []).map(e =>
      typeof e === 'string' ? { skillId: e, overrides: {} } : { ...e }
    );

    function render() {
      el.innerHTML = '';
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const skill = DS().get('skills', entry.skillId);
        const chip = document.createElement('div');
        chip.className = 'effect-chip';

        const hasOverrides = entry.overrides && Object.keys(entry.overrides).length > 0;

        if (skill) {
          const overrideHint = hasOverrides
            ? `<span style="color:var(--gold);font-size:0.75em"> ✏️ ${Object.keys(entry.overrides).join(', ')}</span>`
            : '';
          chip.innerHTML = `<span class="chip-icon">${skill.icon||'⚔️'}</span><span class="chip-name">${skill.name}${overrideHint}</span><span class="chip-desc">${skill.ap||0}AP ${skill.mp||0}MP</span>`;
        } else {
          chip.innerHTML = `<span class="chip-icon">⚠️</span><span class="chip-name">${entry.skillId}</span><span class="chip-desc" style="color:var(--red)">Not found</span>`;
        }

        const actions = document.createElement('div');
        actions.className = 'chip-actions';
        actions.style.display = 'flex';
        actions.style.gap = '2px';

        // Edit overrides button
        if (skill) {
          const editBtn = document.createElement('button');
          editBtn.className = 'btn-icon';
          editBtn.textContent = '✏️';
          editBtn.title = 'Edit overrides for this unit';
          editBtn.onclick = () => _openSkillOverrideEditor(i, entry, skill);
          actions.appendChild(editBtn);
        }

        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-icon';
        removeBtn.textContent = '❌';
        removeBtn.onclick = () => { entries.splice(i, 1); render(); };
        actions.appendChild(removeBtn);

        chip.appendChild(actions);
        el.appendChild(chip);
      }

      // Add skill button
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-ghost btn-sm';
      addBtn.textContent = '+ Add skill';
      addBtn.onclick = () => _openRefPicker('skills', 'skill', (picked) => {
        if (!entries.some(e => e.skillId === picked.id)) {
          entries.push({ skillId: picked.id, overrides: {} });
          render();
        }
      });
      el.appendChild(addBtn);
    }

    function _openSkillOverrideEditor(index, entry, masterSkill) {
      const form = document.createElement('div');
      const current = { ...(entry.overrides || {}) };

      // Overridable fields for skills
      const fields = [
        { key: 'power',    label: 'Power (base damage)', type: 'number', default: masterSkill.power || 0 },
        { key: 'element',  label: 'Element',             type: 'select', options: ['', ...(C().ELEMENTS || [])], default: masterSkill.element || '' },
        { key: 'ap',       label: 'AP Cost',             type: 'number', default: masterSkill.ap || 1 },
        { key: 'mp',       label: 'MP Cost',             type: 'number', default: masterSkill.mp || 0 },
        { key: 'range',    label: 'Range',               type: 'number', default: masterSkill.range || 1 },
        { key: 'cooldown', label: 'Cooldown (turns)',     type: 'number', default: masterSkill.cooldown || 0 },
        { key: 'scalingStat', label: 'Scaling Stat',      type: 'select', options: ['', ...C().STATS], default: masterSkill.scalingStat || '' }
      ];

      const hint = document.createElement('div');
      hint.className = 'hint-box';
      hint.innerHTML = '💡 Override values for <b>this unit only</b>. Leave blank/unchanged to use the skill\'s default.';
      form.appendChild(hint);

      for (const f of fields) {
        const group = document.createElement('div');
        group.className = 'form-group';
        group.style.marginBottom = '8px';
        const label = document.createElement('label');
        label.className = 'form-label';
        label.textContent = `${f.label} (default: ${f.default})`;
        group.appendChild(label);

        if (f.type === 'number') {
          const inp = document.createElement('input');
          inp.type = 'number';
          inp.value = current[f.key] !== undefined ? current[f.key] : '';
          inp.placeholder = String(f.default);
          inp.onchange = () => {
            if (inp.value === '' || inp.value === String(f.default)) {
              delete current[f.key];
            } else {
              current[f.key] = Number(inp.value);
            }
          };
          group.appendChild(inp);
        } else if (f.type === 'select') {
          const sel = document.createElement('select');
          sel.innerHTML = f.options.map(o => `<option value="${o}" ${(current[f.key]||f.default)===o?'selected':''}>${o || '— Default —'}</option>`).join('');
          sel.onchange = () => {
            if (sel.value === '' || sel.value === f.default) {
              delete current[f.key];
            } else {
              current[f.key] = sel.value;
            }
          };
          group.appendChild(sel);
        }

        form.appendChild(group);
      }

      const footer = document.createElement('div');
      const doneBtn = document.createElement('button');
      doneBtn.className = 'btn btn-primary';
      doneBtn.textContent = 'Done';
      footer.appendChild(doneBtn);

      const overlay = UI().openModal({
        title: `Override: ${masterSkill.icon || '⚔️'} ${masterSkill.name}`,
        content: form,
        footer,
        width: '450px'
      });
      doneBtn.onclick = () => {
        entries[index].overrides = { ...current };
        UI().closeModal(overlay);
        render();
      };
    }

    render();
    return {
      el,
      // Return entries in the { skillId, overrides } format
      getEntries: () => JSON.parse(JSON.stringify(entries)),
      // Also support getIds for backwards compat — returns bare IDs
      getIds: () => entries.map(e => e.skillId)
    };
  }

  function _openRefPicker(type, label, onPick) {
    const body = document.createElement('div');
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = `Search ${label}s...`;
    search.style.cssText = 'width:100%;margin-bottom:8px';

    const list = document.createElement('div');
    list.className = 'data-list';
    list.style.maxHeight = '350px';

    function render(q) {
      const items = q ? DS().search(type, q) : DS().getAllAsArray(type);
      list.innerHTML = '';
      if (items.length === 0) { list.innerHTML = '<div class="data-list-empty">None found</div>'; return; }
      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'data-list-item';
        row.innerHTML = `<span class="item-icon">${item.icon||'✦'}</span><div><div class="item-name">${item.name||item.id}</div><div class="item-sub">${item.description?.substring(0,60)||''}</div></div>`;
        row.onclick = () => { UI().closeModal(overlay); onPick(item); };
        list.appendChild(row);
      }
    }

    search.oninput = () => render(search.value);
    body.appendChild(search);
    body.appendChild(list);

    const overlay = UI().openModal({ title: `Pick ${label}`, content: body, width: '550px' });
    render('');
    search.focus();
  }

  function _esc(s) { return String(s).replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function refresh() { if (_container) _renderList(); }
  return Object.freeze({ init, refresh });
})();
