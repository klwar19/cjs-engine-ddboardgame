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
  const CM = () => window.CJS.ContentManager;
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
    const items = CM()?.getVisibleItems?.('monsters', q) || (q ? DS().search('monsters', q) : DS().getAllAsArray('monsters'));
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
      battleSfx: {},
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
            <select id="mon-ai">${_aiArchetypeOptions(m.behaviorAI).map(a=>`<option value="${_esc(a)}" ${(m.behaviorAI||'aggressive')===a?'selected':''}>${_esc(_aiArchetypeLabel(a))}</option>`).join('')}</select>
            <div class="dim" id="mon-ai-help" style="font-size:0.78rem;margin-top:4px">${_esc(_aiArchetypeDescription(m.behaviorAI))}</div>
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

        <h3>Battle SFX</h3>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Attack SFX ID</label><input type="text" id="mon-sfx-attack" value="${_esc(m.battleSfx?.attack || m.battleSfx?.monsterAttack || '')}" placeholder="zombie_attack"></div>
          <div class="form-group"><label class="form-label">Hurt SFX ID</label><input type="text" id="mon-sfx-hurt" value="${_esc(m.battleSfx?.hurt || m.battleSfx?.monsterHurt || '')}" placeholder="zombie_hurt"></div>
        </div>

        <h3>AI Behavior Rules</h3>
        <div class="monster-ai-builder">
          <div class="monster-ai-summary">
            <b>Rule order matters.</b> The first matching rule runs; otherwise the archetype fallback takes over.
            Use presets for common patterns, then tune the condition, action, skill, and target.
          </div>
          <div class="monster-ai-presets" id="mon-ai-rule-presets"></div>
          <div id="mon-ai-rules"></div>
          <div class="monster-ai-preview" id="mon-ai-rule-preview"></div>
          <button class="btn btn-ghost btn-sm mt-sm" id="mon-add-rule">+ Add Custom Rule</button>
        </div>

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
        currentFocus: m.portraitFocus,
        category: 'monsters',
        id: m.id,
        name: m.name,
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

    const aiSelect = _formEl.querySelector('#mon-ai');
    const aiHelp = _formEl.querySelector('#mon-ai-help');
    const syncAIHelp = () => {
      if (aiSelect && aiHelp) aiHelp.textContent = _aiArchetypeDescription(aiSelect.value);
    };
    aiSelect?.addEventListener('change', syncAIHelp);
    syncAIHelp();

    // ── Skill picker (with override support) ──
    let skillPicker = null;
    const refreshAIRuleSuggestions = () => {
      const rulesArea = _formEl.querySelector('#mon-ai-rules');
      const presetArea = _formEl.querySelector('#mon-ai-rule-presets');
      if (rulesArea && skillPicker) _renderAIRules(rulesArea, aiRules, skillPicker);
      if (presetArea && skillPicker) _renderAIRulePresets(presetArea, aiRules, rulesArea, skillPicker);
    };
    skillPicker = _createSkillRefPicker(m.skills||[], refreshAIRuleSuggestions);
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
    const presetArea = _formEl.querySelector('#mon-ai-rule-presets');
    _renderAIRulePresets(presetArea, aiRules, rulesArea, skillPicker);
    _renderAIRules(rulesArea, aiRules, skillPicker);
    _formEl.querySelector('#mon-add-rule').onclick = () => {
      _readAIRules(rulesArea, aiRules);
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
      const battleSfx = _collectBattleSfx(m, 'mon', ['attack', 'hurt']);
      DS().replace('monsters', m.id, {
        id: m.id,
        name: _formEl.querySelector('#mon-name').value,
        icon: _formEl.querySelector('#mon-icon').value,
        portrait: portraitWidget ? portraitWidget.getValue() : (m.portrait || ''),
        portraitFocus: portraitWidget ? portraitWidget.getFocus() : (m.portraitFocus || undefined),
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
        ...(Object.keys(battleSfx).length ? { battleSfx } : {}),
        aiRules, loot,
        description: _formEl.querySelector('#mon-desc').value
      });
      _renderList(); _load(m.id);
      UI().toast('Monster saved', 'success');
    };
    _formEl.querySelector('#mon-dup').onclick = () => { const nid=DS().duplicate('monsters',m.id); if(nid){_activeId=nid;_renderList();_load(nid);UI().toast('Duplicated','success');} };
    _formEl.querySelector('#mon-del').onclick = () => { UI().confirm(`Delete "${m.name}"?`,()=>{DS().remove('monsters',m.id);_activeId=null;_renderList();_formEl.innerHTML='<div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select a monster</div>';UI().toast('Deleted','info');}); };
  }

  function _collectBattleSfx(current, prefix, keys) {
    const out = { ...(current?.battleSfx || {}) };
    delete out.monsterAttack;
    delete out.monsterHurt;
    for (const key of keys) {
      const value = String(_formEl.querySelector(`#${prefix}-sfx-${key}`)?.value || '').trim();
      if (value) out[key] = value;
      else delete out[key];
    }
    return out;
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
  function _aiArchetypeOptions(currentValue) {
    const options = [...(C().AI_ARCHETYPES || [])];
    const current = String(currentValue || 'aggressive').trim();
    if (current && !options.includes(current)) options.push(current);
    return options;
  }

  function _aiArchetypeLabel(id) {
    return C().AI_ARCHETYPE_INFO?.[id]?.label || _labelize(id);
  }

  function _aiArchetypeDescription(id) {
    const key = String(id || 'aggressive').trim() || 'aggressive';
    return C().AI_ARCHETYPE_INFO?.[key]?.desc || 'Custom AI archetype. Authored rules still run before the fallback behavior.';
  }

  function _aiTargetOptions(currentValue) {
    const options = [...(C().AI_TARGET_TYPES || [])];
    const current = String(currentValue || 'nearest_enemy').trim();
    if (current && !options.includes(current)) options.push(current);
    return options;
  }

  function _aiTargetLabel(id) {
    return C().AI_TARGET_INFO?.[id]?.label || _labelize(id);
  }

  function _aiRuleDatalistHtml(skillPicker) {
    const skillIds = [...new Set((skillPicker?.getIds?.() || []).filter(Boolean))];
    const conditionValues = [
      'default', 'hp_below_30', 'hp_below_50', 'hp_above_50', 'hp_full',
      'ap_at_least_1', 'ap_at_least_2', 'mp_at_least_10', 'mp_below_25',
      'any_adjacent_enemy', 'no_adjacent_enemy', 'outnumbered', 'winning_numbers',
      'allies_alive_lt_3', 'allies_alive_gt_1', 'enemies_alive_lt_2',
      'ally_wounded', 'any_ally_dying', 'first_turn', 'turn_above_3',
      'enemies_in_range:3 >= 2',
      ...skillIds.flatMap(id => [
        `skill_ready:${id}`,
        `skill_off_cooldown:${id}`,
        `skill_on_cooldown:${id}`
      ])
    ];
    const actionValues = [
      'attack', 'move_toward', 'move_away', 'defend', 'wait', 'flee',
      ...skillIds.map(id => `use_skill:${id}`)
    ];
    const optionHtml = (values) => values.map(v => `<option value="${_esc(v)}"></option>`).join('');
    return `
      <datalist id="mon-ai-condition-options">${optionHtml(conditionValues)}</datalist>
      <datalist id="mon-ai-action-options">${optionHtml(actionValues)}</datalist>
    `;
  }

  function _renderAIRules(container, rules, skillPicker) {
    container.innerHTML = _aiRuleDatalistHtml(skillPicker);
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      const row = document.createElement('div');
      row.className = 'form-row items-center';
      row.style.marginBottom = '6px';
      row.innerHTML = `
        <span class="dim" style="width:24px;text-align:center;font-weight:600">${i+1}</span>
        <div class="form-group" style="flex:2"><input type="text" data-field="condition" list="mon-ai-condition-options" value="${_esc(r.condition||'default')}" placeholder="condition string"></div>
        <div class="form-group" style="flex:1.5"><input type="text" data-field="action" list="mon-ai-action-options" value="${_esc(r.action||'move_toward')}" placeholder="action e.g. use_skill:fire_swipe"></div>
        <div class="form-group" style="flex:1">
          <select data-field="target">${_aiTargetOptions(r.target).map(t=>`<option value="${_esc(t)}" ${(r.target||'nearest_enemy')===t?'selected':''}>${_esc(_aiTargetLabel(t))}</option>`).join('')}</select>
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
  function _createSkillRefPicker(currentEntries, onChange) {
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
        rb.onclick = () => { entries.splice(i,1); render(); onChange?.(); };
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
            row.onclick = () => { UI().closeModal(ov); if(!entries.some(e=>e.skillId===it.id)){entries.push({skillId:it.id,overrides:{}});render(); onChange?.();} };
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

  // Structured AI rule builder overrides the older raw text row renderer
  // while preserving the same saved `{ priority, condition, action, target }`
  // schema used by the combat AI.
  function _aiConditionOptions(skillPicker) {
    const skillIds = [...new Set((skillPicker?.getIds?.() || []).filter(Boolean))];
    const base = [
      ['default', 'Always', 'Runs when no earlier rule matched.'],
      ['first_turn', 'First turn', 'Good for opening buffs or ambush shots.'],
      ['hp_below_30', 'HP below 30%', 'Panic, flee, defend, or desperation skill.'],
      ['hp_below_50', 'HP below 50%', 'A safer wounded threshold.'],
      ['hp_above_50', 'HP above 50%', 'Keeps pressure while healthy.'],
      ['hp_full', 'HP full', 'Opening confidence behavior.'],
      ['ap_at_least_1', 'AP at least 1', 'Can afford cheap actions.'],
      ['ap_at_least_2', 'AP at least 2', 'Can afford most skills.'],
      ['mp_at_least_10', 'MP at least 10', 'Enough MP for special actions.'],
      ['mp_below_25', 'MP below 25%', 'Conserve MP or reposition.'],
      ['any_adjacent_enemy', 'Adjacent enemy', 'Someone is in melee range.'],
      ['no_adjacent_enemy', 'No adjacent enemy', 'Good for kiting or ranged attacks.'],
      ['enemies_in_range:3 >= 2', 'Two enemies within 3', 'Use AoE or control when clustered.'],
      ['ally_wounded', 'Ally wounded', 'Protect, heal, or draw pressure.'],
      ['any_ally_dying', 'Ally dying', 'Emergency support behavior.'],
      ['outnumbered', 'Outnumbered', 'Defensive or retreat behavior.'],
      ['winning_numbers', 'Winning numbers', 'Aggressive pressure while ahead.'],
      ['allies_alive_lt_3', 'Allies alive below 3', 'Late-fight fallback.'],
      ['allies_alive_gt_1', 'More than one ally alive', 'Team tactics available.'],
      ['enemies_alive_lt_2', 'One enemy left', 'Finish-off behavior.'],
      ['turn_above_3', 'After turn 3', 'Use once the fight has settled.']
    ];
    for (const id of skillIds) {
      const skill = DS().get('skills', id) || {};
      const label = skill.name || id;
      base.push([`skill_ready:${id}`, `${label} ready`, 'Skill exists and can be used now.']);
      base.push([`skill_off_cooldown:${id}`, `${label} off cooldown`, 'Cooldown is not blocking this skill.']);
      base.push([`skill_on_cooldown:${id}`, `${label} on cooldown`, 'Fallback while waiting for this skill.']);
    }
    return base.map(([value, label, help]) => ({ value, label, help }));
  }

  function _aiActionOptions() {
    return [
      { value: 'attack', label: 'Basic attack' },
      { value: 'use_skill', label: 'Use skill' },
      { value: 'move_toward', label: 'Move toward' },
      { value: 'move_away', label: 'Move away' },
      { value: 'defend', label: 'Defend' },
      { value: 'wait', label: 'Wait' },
      { value: 'flee', label: 'Flee' }
    ];
  }

  function _renderAIRulePresets(container, rules, rulesArea, skillPicker) {
    if (!container) return;
    const skillIds = skillPicker?.getIds?.() || [];
    const firstSkill = skillIds[0] || '';
    const secondSkill = skillIds[1] || firstSkill;
    const presets = [
      { label: 'Use opener skill', rule: { condition: firstSkill ? `skill_ready:${firstSkill}` : 'first_turn', action: firstSkill ? `use_skill:${firstSkill}` : 'attack', target: 'nearest_enemy' } },
      { label: 'Kite ranged', rule: { condition: 'any_adjacent_enemy', action: 'move_away', target: 'nearest_enemy' } },
      { label: 'Finish weak target', rule: { condition: 'enemies_alive_lt_2', action: secondSkill ? `use_skill:${secondSkill}` : 'attack', target: 'lowest_hp_enemy' } },
      { label: 'Defend when hurt', rule: { condition: 'hp_below_30', action: 'defend', target: 'self' } },
      { label: 'Protect wounded ally', rule: { condition: 'ally_wounded', action: 'move_toward', target: 'lowest_hp_ally' } }
    ];
    container.innerHTML = presets.map((preset, index) => `
      <button type="button" class="filter-btn" data-ai-preset="${index}" title="${_esc(_aiRuleSentence(preset.rule))}">
        ${_esc(preset.label)}
      </button>
    `).join('');
    container.querySelectorAll('[data-ai-preset]').forEach((btn) => {
      btn.onclick = () => {
        _readAIRules(rulesArea, rules);
        const preset = presets[Number(btn.dataset.aiPreset)];
        if (!preset) return;
        rules.push({ priority: rules.length + 1, ...preset.rule });
        _renderAIRules(rulesArea, rules, skillPicker);
      };
    });
  }

  function _renderAIRules(container, rules, skillPicker) {
    const conditionOptions = _aiConditionOptions(skillPicker);
    const actionOptions = _aiActionOptions();
    const skillIds = [...new Set((skillPicker?.getIds?.() || []).filter(Boolean))];
    if (!container) return;
    container.innerHTML = '';
    if (!rules.length) {
      const empty = document.createElement('div');
      empty.className = 'monster-ai-empty';
      empty.textContent = 'No custom rules yet. The archetype fallback handles behavior until you add one.';
      container.appendChild(empty);
    }
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i] || {};
      const row = document.createElement('div');
      row.className = 'monster-ai-rule-card';
      row.dataset.ruleIndex = String(i);
      const currentCondition = r.condition || 'default';
      const conditionKnown = conditionOptions.some((opt) => opt.value === currentCondition);
      const conditionValue = conditionKnown ? currentCondition : '__custom__';
      const action = _parseAIAction(r.action || 'move_toward');
      const skillWrapClass = action.type === 'use_skill' ? '' : 'hidden';
      const customWrapClass = conditionKnown ? 'hidden' : '';
      row.innerHTML = `
        <div class="monster-ai-rule-index">${i + 1}</div>
        <div class="monster-ai-rule-main">
          <div class="form-row monster-ai-rule-fields">
            <div class="form-group">
              <label class="form-label">When</label>
              <select data-field="condition-select">
                ${conditionOptions.map((opt) => `<option value="${_esc(opt.value)}" ${conditionValue === opt.value ? 'selected' : ''}>${_esc(opt.label)}</option>`).join('')}
                <option value="__custom__" ${conditionValue === '__custom__' ? 'selected' : ''}>Custom condition...</option>
              </select>
            </div>
            <div class="form-group ${customWrapClass}" data-custom-condition-wrap>
              <label class="form-label">Custom</label>
              <input type="text" data-field="condition-custom" value="${_esc(conditionKnown ? '' : currentCondition)}" placeholder="condition string">
            </div>
            <div class="form-group">
              <label class="form-label">Do</label>
              <select data-field="action-type">
                ${actionOptions.map((opt) => `<option value="${_esc(opt.value)}" ${action.type === opt.value ? 'selected' : ''}>${_esc(opt.label)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group ${skillWrapClass}" data-skill-action-wrap>
              <label class="form-label">Skill</label>
              <select data-field="skill-id">
                ${skillIds.length ? skillIds.map((id) => {
                  const skill = DS().get('skills', id) || {};
                  return `<option value="${_esc(id)}" ${action.skillId === id ? 'selected' : ''}>${_esc(skill.name || id)}</option>`;
                }).join('') : '<option value="">No skills equipped</option>'}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Target</label>
              <select data-field="target">${_aiTargetOptions(r.target).map(t=>`<option value="${_esc(t)}" ${(r.target||'nearest_enemy')===t?'selected':''}>${_esc(_aiTargetLabel(t))}</option>`).join('')}</select>
            </div>
          </div>
          <div class="monster-ai-rule-help" data-rule-help>${_esc(_aiRuleSentence(r))}</div>
        </div>
        <div class="monster-ai-rule-controls">
          <button type="button" class="btn-icon" data-move-up title="Move up" ${i === 0 ? 'disabled' : ''}>Up</button>
          <button type="button" class="btn-icon" data-move-down title="Move down" ${i === rules.length - 1 ? 'disabled' : ''}>Down</button>
          <button type="button" class="btn-icon danger" data-remove title="Remove">Remove</button>
        </div>
      `;
      _bindAIRuleRow(row, rules, container, skillPicker);
      container.appendChild(row);
    }
    _updateAIRulePreview(container, rules);
  }

  function _bindAIRuleRow(row, rules, container, skillPicker) {
    const index = Number(row.dataset.ruleIndex || 0);
    const syncAndPreview = () => {
      _syncAIRuleRow(row, rules[index], index);
      const help = row.querySelector('[data-rule-help]');
      if (help) help.textContent = _aiRuleSentence(rules[index]);
      _updateAIRulePreview(container, rules);
    };
    row.querySelector('[data-field="condition-select"]')?.addEventListener('change', (event) => {
      const custom = row.querySelector('[data-custom-condition-wrap]');
      if (custom) custom.classList.toggle('hidden', event.target.value !== '__custom__');
      syncAndPreview();
    });
    row.querySelector('[data-field="action-type"]')?.addEventListener('change', (event) => {
      const skillWrap = row.querySelector('[data-skill-action-wrap]');
      if (skillWrap) skillWrap.classList.toggle('hidden', event.target.value !== 'use_skill');
      syncAndPreview();
    });
    row.querySelectorAll('input,select').forEach((input) => {
      input.addEventListener('input', syncAndPreview);
      input.addEventListener('change', syncAndPreview);
    });
    row.querySelector('[data-remove]')?.addEventListener('click', () => {
      _readAIRules(container, rules);
      rules.splice(index, 1);
      _renderAIRules(container, rules, skillPicker);
    });
    row.querySelector('[data-move-up]')?.addEventListener('click', () => {
      if (index <= 0) return;
      _readAIRules(container, rules);
      [rules[index - 1], rules[index]] = [rules[index], rules[index - 1]];
      _renderAIRules(container, rules, skillPicker);
    });
    row.querySelector('[data-move-down]')?.addEventListener('click', () => {
      if (index >= rules.length - 1) return;
      _readAIRules(container, rules);
      [rules[index + 1], rules[index]] = [rules[index], rules[index + 1]];
      _renderAIRules(container, rules, skillPicker);
    });
    syncAndPreview();
  }

  function _readAIRules(container, rules) {
    const rows = container?.querySelectorAll?.('.monster-ai-rule-card') || [];
    rows.forEach((row, i) => {
      if (!rules[i]) rules[i] = {};
      _syncAIRuleRow(row, rules[i], i);
    });
    rules.length = rows.length;
  }

  function _syncAIRuleRow(row, rule, index) {
    if (!row || !rule) return;
    const selectedCondition = row.querySelector('[data-field="condition-select"]')?.value || 'default';
    const customCondition = row.querySelector('[data-field="condition-custom"]')?.value || '';
    const actionType = row.querySelector('[data-field="action-type"]')?.value || 'move_toward';
    const skillId = row.querySelector('[data-field="skill-id"]')?.value || '';
    rule.priority = index + 1;
    rule.condition = selectedCondition === '__custom__' ? (customCondition || 'default') : selectedCondition;
    rule.action = actionType === 'use_skill' ? (skillId ? `use_skill:${skillId}` : 'attack') : actionType;
    rule.target = row.querySelector('[data-field="target"]')?.value || 'lowest_hp_enemy';
  }

  function _parseAIAction(action = '') {
    const text = String(action || '').trim();
    if (text.startsWith('use_skill:')) return { type: 'use_skill', skillId: text.split(':')[1] || '' };
    return { type: text || 'move_toward', skillId: '' };
  }

  function _aiRuleSentence(rule = {}) {
    const action = _parseAIAction(rule.action || 'move_toward');
    const actionLabel = action.type === 'use_skill'
      ? `use ${DS().get('skills', action.skillId)?.name || action.skillId || 'a skill'}`
      : _labelize(action.type);
    return `When ${_labelize(rule.condition || 'default')}, ${actionLabel} targeting ${_aiTargetLabel(rule.target || 'nearest_enemy')}.`;
  }

  function _updateAIRulePreview(container, rules) {
    const preview = _formEl?.querySelector?.('#mon-ai-rule-preview');
    if (!preview) return;
    const rows = container?.querySelectorAll?.('.monster-ai-rule-card') || [];
    rows.forEach((row, i) => _syncAIRuleRow(row, rules[i], i));
    preview.innerHTML = rules.length
      ? `<b>Runtime order:</b> ${rules.map((rule, index) => `<span>${index + 1}. ${_esc(_aiRuleSentence(rule))}</span>`).join('')}`
      : '<b>Runtime order:</b> archetype fallback only.';
  }

  function _labelize(s) {
    return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
  }

  function _esc(s) { return String(s).replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function refresh() { if (_container) _renderList(); }
  return Object.freeze({ init, refresh });
})();
