// monster-editor.js
// UI: build monsters with stats, skills, items, AI behavior rules, loot tables.
// Reads: data-store.js, constants.js, formulas.js, ui-helpers.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.MonsterEditor = (() => {
  'use strict';

  const C  = () => window.CJS.CONST;
  const DS = () => window.CJS.DataStore;
  const F  = () => window.CJS.Formulas;
  const UI = () => window.CJS.UI;
  const PP = () => window.CJS.PortraitPicker;

  let _container, _listEl, _formEl, _activeId = null;

  function init(containerEl) {
    _container = containerEl;
    _container.innerHTML = `
      <div class="flex gap-md" style="height:100%">
        <div style="width:260px;flex-shrink:0;display:flex;flex-direction:column;gap:8px">
          <div class="flex gap-sm items-center">
            <input type="search" id="mon-search" placeholder="Search monsters..." style="flex:1">
            <button class="btn btn-primary btn-sm" id="mon-new">+ New</button>
          </div>
          <div class="data-list" id="mon-list" style="flex:1;max-height:none"></div>
        </div>
        <div style="flex:1;overflow-y:auto" id="mon-form-area">
          <div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select a monster or create a new one</div>
        </div>
      </div>
    `;
    _listEl = _container.querySelector('#mon-list');
    _formEl = _container.querySelector('#mon-form-area');
    _container.querySelector('#mon-new').onclick = _createNew;
    _container.querySelector('#mon-search').oninput = (e) => _renderList(e.target.value);
    _renderList();
  }

  function _renderList(q) {
    const items = q ? DS().search('monsters', q) : DS().getAllAsArray('monsters');
    UI().renderDataList({
      container: _listEl, items, activeId: _activeId,
      onSelect: (m) => _load(m.id),
      renderItem: (m) => `<span class="item-icon">${m.icon||'👾'}</span><div><div class="item-name">${m.name||m.id}</div><div class="item-sub">Rank ${m.rank||'F'} · ${m.type||'beast'} · ${m.behaviorAI||'aggressive'}</div></div>`
    });
  }

  function _createNew() {
    const id = DS().create('monsters', {
      name: 'New Monster', icon: '👾', team: 'enemy', rank: 'F', type: 'beast',
      stats: { S:5,P:5,E:5,C:3,I:3,A:5,L:3 },
      skills: [], equipment: [], innatePassives: [],
      weak: [], resist: [], immune: [],
      loot: [], behaviorAI: 'aggressive', aiRules: [],
      portrait: '',
      description: ''
    });
    _activeId = id; _renderList(); _load(id);
    UI().toast('Monster created', 'success');
  }

  function _load(id) {
    _activeId = id;
    _renderList(_container.querySelector('#mon-search')?.value);
    const m = DS().get('monsters', id);
    if (!m) return;
    _renderForm(m);
  }

  function _renderForm(m) {
    const stats = m.stats || {S:5,P:5,E:5,C:3,I:3,A:5,L:3};
    const rd = C().RANK_DATA[m.rank||'F'] || C().RANK_DATA.F;

    _formEl.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${m.icon||'👾'} ${m.name||'Unnamed'}</span>
          <div class="btn-group">
            <button class="btn btn-ghost btn-sm" id="mon-dup">Duplicate</button>
            <button class="btn btn-danger btn-sm" id="mon-del">Delete</button>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group"><label class="form-label">Name</label><input type="text" id="mon-name" value="${_esc(m.name||'')}"></div>
          <div class="form-group" style="flex:0 0 80px"><label class="form-label">Icon</label><input type="text" id="mon-icon" value="${_esc(m.icon||'👾')}" style="text-align:center;font-size:1.2em"></div>
        </div>
        <div id="mon-portrait-area" style="margin-bottom:8px"></div>

        <div class="form-row">
          <div class="form-group"><label class="form-label">Rank</label>
            <select id="mon-rank">${C().RANKS.map(r=>`<option value="${r}" ${m.rank===r?'selected':''}>${r}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label class="form-label">Unit Type</label>
            <select id="mon-type">${C().UNIT_TYPES.map(t=>`<option value="${t}" ${m.type===t?'selected':''}>${t}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label class="form-label">AI Archetype</label>
            <select id="mon-ai">${C().AI_ARCHETYPES.map(a=>`<option value="${a}" ${m.behaviorAI===a?'selected':''}>${a}</option>`).join('')}</select>
          </div>
        </div>

        <h3>SPECIAL Stats <span class="dim" style="font-size:0.8em">(${rd.statMin}–${rd.statMax})</span></h3>
        <div id="mon-stats-area"></div>

        <div class="form-row mt-sm">
          <div class="form-group" style="flex:0 0 140px"><label class="form-label">Base Movement</label><input type="number" id="mon-movement" value="${m.movement||3}" min="0" max="8" style="width:100%"></div>
          <div class="form-group" style="flex:0 0 140px"><label class="form-label">Size</label>
            <select id="mon-size">${Object.entries(C().UNIT_SIZES).map(([k,v])=>`<option value="${k}" ${(m.size||'1x1')===k?'selected':''}>${v.label}</option>`).join('')}</select>
          </div>
          <div class="dim" style="align-self:flex-end;padding-bottom:6px;font-size:0.82rem">Movement: cells/turn · Size: grid footprint (bosses: 2×2)</div>
        </div>

        <h3>Derived Stats</h3>
        <div class="card" style="background:var(--surface2)" id="mon-derived"></div>

        <h3>Skills</h3>
        <div id="mon-skills-area"></div>

        <h3>Innate Passives / Effects</h3>
        <div id="mon-passives-area"></div>

        <h3>Elemental Interactions</h3>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Weak</label><div id="mon-weak"></div></div>
          <div class="form-group"><label class="form-label">Resist</label><div id="mon-resist"></div></div>
          <div class="form-group"><label class="form-label">Immune</label><div id="mon-immune"></div></div>
        </div>

        <h3>AI Behavior Rules</h3>
        <p class="dim" style="font-size:0.82rem;margin-bottom:8px">Priority order — first matching rule fires. Drag to reorder.</p>
        <div id="mon-ai-rules"></div>
        <button class="btn btn-ghost btn-sm mt-sm" id="mon-add-rule">+ Add Rule</button>

        <h3>Loot Table</h3>
        <div id="mon-loot-area"></div>
        <button class="btn btn-ghost btn-sm mt-sm" id="mon-add-loot">+ Add Loot</button>

        <div class="form-group mt-md"><label class="form-label">Description</label><textarea id="mon-desc" rows="2">${_esc(m.description||'')}</textarea></div>

        <div style="margin-top:12px"><button class="btn btn-success" id="mon-save">💾 Save Monster</button></div>
      </div>
    `;

    // ── Stats ──
    let portraitWidget = null;
    const portraitArea = _formEl.querySelector('#mon-portrait-area');
    if (portraitArea && PP()) {
      portraitWidget = PP().createWidget({
        currentPath: m.portrait || '',
        category: 'monsters',
        fallbackIcon: m.icon || '?'
      });
      portraitArea.appendChild(portraitWidget.el);

      const iconInput = _formEl.querySelector('#mon-icon');
      const syncPortraitFallback = () => portraitWidget?.setFallbackIcon(iconInput?.value || '?');
      iconInput?.addEventListener('input', syncPortraitFallback);
      iconInput?.addEventListener('change', syncPortraitFallback);
    }

    const statsArea = _formEl.querySelector('#mon-stats-area');
    const sliders = {};
    for (const s of C().STATS) {
      const slider = UI().createNumberSlider({
        value: stats[s]||5, min:1, max: rd.statMax+10, label: s,
        onChange: () => _updateDerived(sliders, m.rank||'F')
      });
      sliders[s] = slider;
      statsArea.appendChild(slider);
    }
    _updateDerived(sliders, m.rank||'F');

    // Movement input → update derived
    _formEl.querySelector('#mon-movement').onchange = () => _updateDerived(sliders, _formEl.querySelector('#mon-rank')?.value || 'F');

    // ── Skill picker (with override support) ──
    const skillPicker = _createSkillRefPicker(m.skills||[]);
    _formEl.querySelector('#mon-skills-area').appendChild(skillPicker.el);

    const passivePicker = _createRefPicker('passives', m.innatePassives||[], 'passive');
    _formEl.querySelector('#mon-passives-area').appendChild(passivePicker.el);

    // ── Elements ──
    const weakW = UI().createTagInput({tags:m.weak||[]});
    _formEl.querySelector('#mon-weak').appendChild(weakW);
    const resistW = UI().createTagInput({tags:m.resist||[]});
    _formEl.querySelector('#mon-resist').appendChild(resistW);
    const immuneW = UI().createTagInput({tags:m.immune||[]});
    _formEl.querySelector('#mon-immune').appendChild(immuneW);

    // ── AI Rules ──
    let aiRules = JSON.parse(JSON.stringify(m.aiRules||[]));
    const rulesArea = _formEl.querySelector('#mon-ai-rules');
    _renderAIRules(rulesArea, aiRules, skillPicker);
    _formEl.querySelector('#mon-add-rule').onclick = () => {
      aiRules.push({ priority: aiRules.length+1, condition:'default', action:'move_toward', target:'lowest_hp_enemy' });
      _renderAIRules(rulesArea, aiRules, skillPicker);
    };

    // ── Loot ──
    let loot = JSON.parse(JSON.stringify(m.loot||[]));
    const lootArea = _formEl.querySelector('#mon-loot-area');
    _renderLoot(lootArea, loot);
    _formEl.querySelector('#mon-add-loot').onclick = () => {
      loot.push({ itemId:'', name:'New Drop', rarity:'Common', chance:0.5 });
      _renderLoot(lootArea, loot);
    };

    // ── Save ──
    _formEl.querySelector('#mon-save').onclick = () => {
      const cs = {};
      for (const s of C().STATS) cs[s] = sliders[s]._getValue();
      _readAIRules(rulesArea, aiRules);
      _readLoot(lootArea, loot);
      DS().replace('monsters', m.id, {
        id: m.id,
        name: _formEl.querySelector('#mon-name').value,
        icon: _formEl.querySelector('#mon-icon').value,
        portrait: portraitWidget ? portraitWidget.getValue() : (m.portrait || ''),
        team: 'enemy',
        rank: _formEl.querySelector('#mon-rank').value,
        type: _formEl.querySelector('#mon-type').value,
        behaviorAI: _formEl.querySelector('#mon-ai').value,
        stats: cs,
        movement: Number(_formEl.querySelector('#mon-movement').value) || 3,
        size: _formEl.querySelector('#mon-size').value || '1x1',
        skills: skillPicker.getEntries(),
        equipment: [],
        innatePassives: passivePicker.getIds(),
        weak: weakW._getTags(), resist: resistW._getTags(), immune: immuneW._getTags(),
        aiRules, loot,
        description: _formEl.querySelector('#mon-desc').value
      });
      _renderList(); _load(m.id);
      UI().toast('Monster saved', 'success');
    };
    _formEl.querySelector('#mon-dup').onclick = () => { const nid=DS().duplicate('monsters',m.id); if(nid){_activeId=nid;_renderList();_load(nid);UI().toast('Duplicated','success');} };
    _formEl.querySelector('#mon-del').onclick = () => { UI().confirm(`Delete "${m.name}"?`,()=>{DS().remove('monsters',m.id);_activeId=null;_renderList();_formEl.innerHTML='<div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select a monster</div>';UI().toast('Deleted','info');}); };
  }

  function _updateDerived(sliders, rank) {
    const st = {};
    for (const s of C().STATS) st[s] = sliders[s]._getValue();
    const el = _formEl.querySelector('#mon-derived');
    if (!el) return;
    el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:12px;font-size:0.88rem">
      <span><b style="color:var(--red)">HP</b> ${F().calcMaxHP(st,rank)}</span>
      <span><b style="color:var(--blue)">MP</b> ${F().calcMaxMP(st,rank)}</span>
      <span><b style="color:var(--text-dim)">Phys DR</b> ${F().calcPhysicalDR(st)}</span>
      <span><b style="color:var(--accent)">Mag DR</b> ${F().calcMagicDR(st)}</span>
      <span><b style="color:var(--green)">Move</b> ${F().calcMovement(Number(_formEl.querySelector('#mon-movement')?.value)||3,0)}</span>
      <span><b style="color:var(--gold)">Crit</b> ${F().calcCritChance(st.L,0).toFixed(1)}%</span>
    </div>`;
  }

  // ── AI Rules Renderer ──
  function _renderAIRules(container, rules, skillPicker) {
    container.innerHTML = '';
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      const row = document.createElement('div');
      row.className = 'form-row items-center';
      row.style.marginBottom = '6px';
      row.innerHTML = `
        <span class="dim" style="width:24px;text-align:center;font-weight:600">${i+1}</span>
        <div class="form-group" style="flex:2"><input type="text" data-field="condition" value="${_esc(r.condition||'default')}" placeholder="condition string"></div>
        <div class="form-group" style="flex:1.5"><input type="text" data-field="action" value="${_esc(r.action||'move_toward')}" placeholder="action e.g. use_skill:fire_swipe"></div>
        <div class="form-group" style="flex:1">
          <select data-field="target">${C().AI_TARGET_TYPES.map(t=>`<option value="${t}" ${r.target===t?'selected':''}>${t}</option>`).join('')}</select>
        </div>
        <button class="btn-icon" data-remove="${i}" title="Remove">❌</button>
      `;
      row.querySelector('[data-remove]').onclick = () => { rules.splice(i,1); _renderAIRules(container,rules,skillPicker); };
      container.appendChild(row);
    }
  }

  function _readAIRules(container, rules) {
    const rows = container.querySelectorAll('.form-row');
    rows.forEach((row, i) => {
      if (rules[i]) {
        rules[i].priority = i + 1;
        rules[i].condition = row.querySelector('[data-field="condition"]')?.value || 'default';
        rules[i].action = row.querySelector('[data-field="action"]')?.value || 'move_toward';
        rules[i].target = row.querySelector('[data-field="target"]')?.value || 'lowest_hp_enemy';
      }
    });
  }

  // ── Loot Table Renderer ──
  function _renderLoot(container, loot) {
    container.innerHTML = '';
    for (let i = 0; i < loot.length; i++) {
      const l = loot[i];
      const row = document.createElement('div');
      row.className = 'form-row items-center';
      row.style.marginBottom = '6px';
      row.innerHTML = `
        <div class="form-group" style="flex:2"><input type="text" data-field="name" value="${_esc(l.name||l.itemId||'')}" placeholder="Item name/ID"></div>
        <div class="form-group" style="flex:1">
          <select data-field="rarity">${C().RARITIES.map(r=>`<option value="${r}" ${l.rarity===r?'selected':''}>${r}</option>`).join('')}</select>
        </div>
        <div class="form-group" style="flex:0 0 90px"><input type="number" data-field="chance" value="${l.chance||0}" min="0" max="1" step="0.05" style="width:100%"></div>
        <button class="btn-icon" data-rm-loot="${i}" title="Remove">❌</button>
      `;
      row.querySelector('[data-rm-loot]').onclick = () => { loot.splice(i,1); _renderLoot(container,loot); };
      container.appendChild(row);
    }
  }

  function _readLoot(container, loot) {
    const rows = container.querySelectorAll('.form-row');
    rows.forEach((row, i) => {
      if (loot[i]) {
        loot[i].name = row.querySelector('[data-field="name"]')?.value || '';
        loot[i].itemId = loot[i].name;
        loot[i].rarity = row.querySelector('[data-field="rarity"]')?.value || 'Common';
        loot[i].chance = Number(row.querySelector('[data-field="chance"]')?.value) || 0;
      }
    });
  }

  // ── Ref Picker (for passives — no overrides) ──
  function _createRefPicker(type, currentIds, label) {
    const el = document.createElement('div');
    let ids = [...currentIds];
    function render() {
      el.innerHTML = '';
      for (let i = 0; i < ids.length; i++) {
        const item = DS().get(type, ids[i]);
        const chip = document.createElement('div');
        chip.className = 'effect-chip';
        chip.innerHTML = item
          ? `<span class="chip-icon">${item.icon||'✦'}</span><span class="chip-name">${item.name}</span><span class="chip-desc">${item.id}</span>`
          : `<span class="chip-icon">⚠️</span><span class="chip-name">${ids[i]}</span><span class="chip-desc" style="color:var(--red)">Not found</span>`;
        const rm = document.createElement('button');
        rm.className = 'btn-icon'; rm.textContent = '❌';
        rm.onclick = () => { ids.splice(i,1); render(); };
        chip.appendChild(rm);
        el.appendChild(chip);
      }
      const btn = document.createElement('button');
      btn.className = 'btn btn-ghost btn-sm';
      btn.textContent = `+ Add ${label}`;
      btn.onclick = () => {
        const body = document.createElement('div');
        const search = document.createElement('input');
        search.type = 'search'; search.placeholder = `Search ${label}s...`;
        search.style.cssText = 'width:100%;margin-bottom:8px';
        const list = document.createElement('div');
        list.className = 'data-list'; list.style.maxHeight = '300px';
        function r(q) {
          const all = q ? DS().search(type,q) : DS().getAllAsArray(type);
          list.innerHTML = '';
          if (!all.length) { list.innerHTML = '<div class="data-list-empty">None</div>'; return; }
          for (const it of all) {
            const row = document.createElement('div');
            row.className = 'data-list-item';
            row.innerHTML = `<span class="item-icon">${it.icon||'✦'}</span><div><div class="item-name">${it.name||it.id}</div></div>`;
            row.onclick = () => { UI().closeModal(ov); if (!ids.includes(it.id)){ids.push(it.id);render();} };
            list.appendChild(row);
          }
        }
        search.oninput = () => r(search.value);
        body.appendChild(search); body.appendChild(list);
        const ov = UI().openModal({title:`Pick ${label}`,content:body,width:'500px'});
        r(''); search.focus();
      };
      el.appendChild(btn);
    }
    render();
    return { el, getIds: () => [...ids] };
  }

  // ── Skill Override Picker (skills with optional overrides) ────────
  function _createSkillRefPicker(currentEntries) {
    const el = document.createElement('div');
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
        const hasOvr = entry.overrides && Object.keys(entry.overrides).length > 0;
        if (skill) {
          const hint = hasOvr ? `<span style="color:var(--gold);font-size:0.75em"> ✏️ ${Object.keys(entry.overrides).join(', ')}</span>` : '';
          chip.innerHTML = `<span class="chip-icon">${skill.icon||'⚔️'}</span><span class="chip-name">${skill.name}${hint}</span><span class="chip-desc">${skill.ap||0}AP ${skill.mp||0}MP</span>`;
        } else {
          chip.innerHTML = `<span class="chip-icon">⚠️</span><span class="chip-name">${entry.skillId}</span><span class="chip-desc" style="color:var(--red)">Not found</span>`;
        }
        const acts = document.createElement('div');
        acts.className = 'chip-actions'; acts.style.cssText = 'display:flex;gap:2px';
        if (skill) {
          const eb = document.createElement('button');
          eb.className = 'btn-icon'; eb.textContent = '✏️'; eb.title = 'Edit overrides';
          eb.onclick = () => _openSkillOvr(i, entry, skill);
          acts.appendChild(eb);
        }
        const rb = document.createElement('button');
        rb.className = 'btn-icon'; rb.textContent = '❌';
        rb.onclick = () => { entries.splice(i,1); render(); };
        acts.appendChild(rb);
        chip.appendChild(acts);
        el.appendChild(chip);
      }
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-ghost btn-sm';
      addBtn.textContent = '+ Add skill';
      addBtn.onclick = () => {
        const body = document.createElement('div');
        const search = document.createElement('input');
        search.type = 'search'; search.placeholder = 'Search skills...';
        search.style.cssText = 'width:100%;margin-bottom:8px';
        const list = document.createElement('div');
        list.className = 'data-list'; list.style.maxHeight = '300px';
        function r(q) {
          const all = q ? DS().search('skills',q) : DS().getAllAsArray('skills');
          list.innerHTML = '';
          if (!all.length) { list.innerHTML = '<div class="data-list-empty">None</div>'; return; }
          for (const it of all) {
            const row = document.createElement('div');
            row.className = 'data-list-item';
            row.innerHTML = `<span class="item-icon">${it.icon||'⚔️'}</span><div><div class="item-name">${it.name||it.id}</div></div>`;
            row.onclick = () => { UI().closeModal(ov); if(!entries.some(e=>e.skillId===it.id)){entries.push({skillId:it.id,overrides:{}});render();} };
            list.appendChild(row);
          }
        }
        search.oninput = () => r(search.value);
        body.appendChild(search); body.appendChild(list);
        const ov = UI().openModal({title:'Pick skill',content:body,width:'500px'});
        r(''); search.focus();
      };
      el.appendChild(addBtn);
    }

    function _openSkillOvr(index, entry, masterSkill) {
      const form = document.createElement('div');
      const cur = { ...(entry.overrides || {}) };
      const fields = [
        { key:'power',label:'Power',type:'number',def:masterSkill.power||0 },
        { key:'element',label:'Element',type:'select',opts:['', ...(C().ELEMENTS||[])],def:masterSkill.element||'' },
        { key:'ap',label:'AP Cost',type:'number',def:masterSkill.ap||1 },
        { key:'mp',label:'MP Cost',type:'number',def:masterSkill.mp||0 },
        { key:'range',label:'Range',type:'number',def:masterSkill.range||1 },
        { key:'cooldown',label:'Cooldown',type:'number',def:masterSkill.cooldown||0 },
        { key:'scalingStat',label:'Scaling Stat',type:'select',opts:['', ...C().STATS],def:masterSkill.scalingStat||'' }
      ];
      const hint = document.createElement('div');
      hint.className = 'hint-box';
      hint.innerHTML = '💡 Override values for <b>this monster only</b>.';
      form.appendChild(hint);
      for (const f of fields) {
        const grp = document.createElement('div');
        grp.className = 'form-group'; grp.style.marginBottom = '8px';
        const lbl = document.createElement('label');
        lbl.className = 'form-label'; lbl.textContent = `${f.label} (default: ${f.def})`;
        grp.appendChild(lbl);
        if (f.type === 'number') {
          const inp = document.createElement('input'); inp.type = 'number';
          inp.value = cur[f.key] !== undefined ? cur[f.key] : ''; inp.placeholder = String(f.def);
          inp.onchange = () => { if (inp.value===''||inp.value===String(f.def)) delete cur[f.key]; else cur[f.key]=Number(inp.value); };
          grp.appendChild(inp);
        } else if (f.type === 'select') {
          const sel = document.createElement('select');
          sel.innerHTML = f.opts.map(o=>`<option value="${o}" ${(cur[f.key]||f.def)===o?'selected':''}>${o||'— Default —'}</option>`).join('');
          sel.onchange = () => { if (sel.value===''||sel.value===f.def) delete cur[f.key]; else cur[f.key]=sel.value; };
          grp.appendChild(sel);
        }
        form.appendChild(grp);
      }
      const footer = document.createElement('div');
      const doneBtn = document.createElement('button');
      doneBtn.className = 'btn btn-primary'; doneBtn.textContent = 'Done';
      footer.appendChild(doneBtn);
      const ov = UI().openModal({ title:`Override: ${masterSkill.icon||'⚔️'} ${masterSkill.name}`, content:form, footer, width:'450px' });
      doneBtn.onclick = () => { entries[index].overrides={...cur}; UI().closeModal(ov); render(); };
    }

    render();
    return { el, getEntries:()=>JSON.parse(JSON.stringify(entries)), getIds:()=>entries.map(e=>e.skillId) };
  }

  function _esc(s) { return String(s).replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function refresh() { if (_container) _renderList(); }
  return Object.freeze({ init, refresh });
})();
