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
    UI().renderDataList({
      container: _listEl,
      items,
      activeId: _activeId,
      onSelect: (c) => _load(c.id),
      renderItem: (c) => {
        const team = c.team === 'enemy' ? '🟥 enemy' : '🟦 player';
        const sub = `${team} · ${c.rank || 'F'} · ${c.type || ''}`;
        return `
          <span class="item-icon">${c.icon || '🧑'}</span>
          <div style="min-width:0">
            <div class="item-name">${c.name || c.id}</div>
            <div class="item-sub">${sub}</div>
          </div>
        `;
      }
    });
  }

  function _createNew() {
    const PROG = C().PROGRESSION || {};
    const id = DS().create('characters', {
      name: 'New Character', icon: '🧑', team: 'player', rank: 'F', type: 'humanoid',
      stats: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 },
      skills: [], equipment: [], innatePassives: [],
      allowedWeaponTypes: ['sword', 'bow', 'staff'],
      allowedArmorTypes: ['light', 'robe'],
      availableJobs: [], availableBranches: [], defaultJob: null,
      maxJobs: Number(PROG.maxJobsDefault ?? 3),
      weaponSlots: 2,
      skillSlots:    Number(PROG.defaultSkillSlots ?? 4),
      passiveSlots:  Number(PROG.defaultPassiveSlots ?? 3),
      skillPoints:   Number(PROG.defaultSkillPoints ?? 10),
      passivePoints: Number(PROG.defaultPassivePoints ?? 10),
      weak: [], resist: [], immune: [],
      portrait: '',
      battleSfx: {},
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
        <div class="hint-box">Equipment proficiencies control what this character can equip in Campaign Mode.</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Allowed Weapon Types</label>
            <div id="chr-weapon-types-area"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Allowed Armor Types</label>
            <div id="chr-armor-types-area"></div>
          </div>
          <div class="form-group" style="flex:0 0 130px">
            <label class="form-label">Weapon Slots</label>
            <input type="number" id="chr-weapon-slots" value="${Number(c.weaponSlots || 2)}" min="1" max="4">
            <div class="dim" style="font-size:0.74rem">How many distinct weapon types this character can master (informational).</div>
          </div>
        </div>

        <h3>Available Jobs</h3>
        <div class="hint-box">Jobs the character can pick from in Campaign Mode. The default job is auto-applied when the party is created.</div>
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label class="form-label">Available Jobs</label>
            <div id="chr-jobs-area"></div>
          </div>
          <div class="form-group" style="flex:0 0 200px">
            <label class="form-label">Default Job</label>
            <select id="chr-default-job"></select>
            <div class="dim" style="font-size:0.74rem">— None — keeps the character jobless until campaign assigns one.</div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label class="form-label">Available Branches</label>
            <div id="chr-job-branches-area"></div>
            <div class="dim" style="font-size:0.74rem">Branches allow later-tier jobs such as warrior -> knight after prerequisites are met.</div>
          </div>
          <div class="form-group" style="flex:0 0 130px">
            <label class="form-label">Max Jobs</label>
            <input type="number" id="chr-max-jobs" value="${Number(c.maxJobs ?? C().PROGRESSION?.maxJobsDefault ?? 3)}" min="1" max="20">
          </div>
        </div>

        <h3>Selection Budget</h3>
        <div class="hint-box">In Campaign Mode the player explicitly equips a subset of known skills/passives. Both caps apply: total count must fit slots, and total spCost must fit the points budget.</div>
        <div class="form-row">
          <div class="form-group" style="flex:0 0 130px"><label class="form-label">Skill Slots</label><input type="number" id="chr-skill-slots" value="${Number(c.skillSlots ?? C().PROGRESSION?.defaultSkillSlots ?? 4)}" min="0" max="20"></div>
          <div class="form-group" style="flex:0 0 130px"><label class="form-label">Passive Slots</label><input type="number" id="chr-passive-slots" value="${Number(c.passiveSlots ?? C().PROGRESSION?.defaultPassiveSlots ?? 3)}" min="0" max="20"></div>
          <div class="form-group" style="flex:0 0 130px"><label class="form-label">Skill Points</label><input type="number" id="chr-skill-points" value="${Number(c.skillPoints ?? C().PROGRESSION?.defaultSkillPoints ?? 10)}" min="0" max="100"></div>
          <div class="form-group" style="flex:0 0 130px"><label class="form-label">Passive Points</label><input type="number" id="chr-passive-points" value="${Number(c.passivePoints ?? C().PROGRESSION?.defaultPassivePoints ?? 10)}" min="0" max="100"></div>
          <div class="dim" style="align-self:flex-end;padding-bottom:6px;font-size:0.78rem">Effective values get +bonuses from level / rank / job / item / passive at runtime.</div>
        </div>

        <h3>Innate Passives</h3>
        <div id="chr-passives-area"></div>

        <h3>Elemental Interactions</h3>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Weaknesses</label><div id="chr-weak-area"></div></div>
          <div class="form-group"><label class="form-label">Resistances</label><div id="chr-resist-area"></div></div>
          <div class="form-group"><label class="form-label">Immunities</label><div id="chr-immune-area"></div></div>
        </div>

        <h3>Battle SFX</h3>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Fight Line ID</label><input type="text" id="chr-sfx-attack" value="${_esc(c.battleSfx?.attack || c.battleSfx?.fight || '')}" placeholder="bin_fight"></div>
          <div class="form-group"><label class="form-label">Hurt Line ID</label><input type="text" id="chr-sfx-hurt" value="${_esc(c.battleSfx?.hurt || '')}" placeholder="bin_hurt"></div>
          <div class="form-group"><label class="form-label">Happy Line ID</label><input type="text" id="chr-sfx-happy" value="${_esc(c.battleSfx?.happy || '')}" placeholder="bin_happy"></div>
          <div class="form-group"><label class="form-label">Angry Line ID</label><input type="text" id="chr-sfx-angry" value="${_esc(c.battleSfx?.angry || c.battleSfx?.miss || '')}" placeholder="bin_angry"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Expression ID</label><input type="text" id="chr-sfx-expression" value="${_esc(c.battleSfx?.expression || '')}" placeholder="optional_expression"></div>
          <div class="form-group"><label class="form-label">Archer Shot ID</label><input type="text" id="chr-sfx-archerAttack" value="${_esc(c.battleSfx?.archerAttack || '')}" placeholder="weapon_bow_shot"></div>
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
        id: c.id,
        name: c.name,
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
    const weaponTypeWidget = UI().createTagInput({
      tags: Array.isArray(c.allowedWeaponTypes) ? c.allowedWeaponTypes : [c.allowedWeaponTypes].filter(Boolean),
      placeholder: 'sword + Enter',
      suggestions: C().WEAPON_TYPES || []
    });
    _formEl.querySelector('#chr-weapon-types-area').appendChild(weaponTypeWidget);
    const armorTypeWidget = UI().createTagInput({
      tags: Array.isArray(c.allowedArmorTypes) ? c.allowedArmorTypes : [c.allowedArmorTypes].filter(Boolean),
      placeholder: 'light + Enter',
      suggestions: C().ARMOR_TYPES || []
    });
    _formEl.querySelector('#chr-armor-types-area').appendChild(armorTypeWidget);

    // ── Passives picker ──
    const passivesArea = _formEl.querySelector('#chr-passives-area');
    const passivePicker = _createRefPicker('passives', c.innatePassives || [], 'passive');
    passivesArea.appendChild(passivePicker.el);

    // ── Jobs picker (available jobs + default job) ──
    const jobsArea = _formEl.querySelector('#chr-jobs-area');
    const jobsPicker = _createRefPicker('jobs', c.availableJobs || [], 'job');
    jobsArea.appendChild(jobsPicker.el);
    const branchSuggestions = Array.from(new Set((DS().getAllAsArray('jobs') || [])
      .map((job) => job.branch)
      .filter(Boolean)))
      .sort();
    const jobBranchWidget = UI().createTagInput({
      tags: Array.isArray(c.availableBranches) ? c.availableBranches : [c.availableBranches].filter(Boolean),
      placeholder: 'warrior + Enter',
      suggestions: branchSuggestions
    });
    _formEl.querySelector('#chr-job-branches-area').appendChild(jobBranchWidget);

    const defaultJobSel = _formEl.querySelector('#chr-default-job');
    function _refreshDefaultJobOptions() {
      const ids = jobsPicker.getIds();
      const opts = ['<option value="">— None —</option>'];
      for (const jid of ids) {
        const job = DS().get('jobs', jid);
        const label = job ? `${job.icon || '🛡️'} ${job.name}` : jid;
        const selected = c.defaultJob === jid ? ' selected' : '';
        opts.push(`<option value="${jid}"${selected}>${label}</option>`);
      }
      defaultJobSel.innerHTML = opts.join('');
    }
    _refreshDefaultJobOptions();
    // Re-render the default job dropdown whenever the available list changes.
    const jobsRefreshObserver = new MutationObserver(_refreshDefaultJobOptions);
    jobsRefreshObserver.observe(jobsArea, { childList: true, subtree: true });

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
      const battleSfx = _collectBattleSfx(c, 'chr', ['attack', 'hurt', 'happy', 'angry', 'expression', 'archerAttack']);
      const availableJobs = jobsPicker.getIds();
      const chosenDefaultJob = defaultJobSel.value || null;
      DS().replace('characters', c.id, {
        ...c,
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
        allowedWeaponTypes: weaponTypeWidget._getTags(),
        allowedArmorTypes: armorTypeWidget._getTags(),
        weaponSlots: Math.max(1, Number(_formEl.querySelector('#chr-weapon-slots').value) || 2),
        skillSlots:    Math.max(0, Number(_formEl.querySelector('#chr-skill-slots').value) || 0),
        passiveSlots:  Math.max(0, Number(_formEl.querySelector('#chr-passive-slots').value) || 0),
        skillPoints:   Math.max(0, Number(_formEl.querySelector('#chr-skill-points').value) || 0),
        passivePoints: Math.max(0, Number(_formEl.querySelector('#chr-passive-points').value) || 0),
        availableJobs,
        availableBranches: jobBranchWidget._getTags(),
        maxJobs: Math.max(1, Number(_formEl.querySelector('#chr-max-jobs').value) || Number(C().PROGRESSION?.maxJobsDefault ?? 3)),
        defaultJob: availableJobs.includes(chosenDefaultJob) ? chosenDefaultJob : null,
        innatePassives: passivePicker.getIds(),
        weak: weakWidget._getTags(),
        resist: resistWidget._getTags(),
        immune: immuneWidget._getTags(),
        battleSfx: Object.keys(battleSfx).length ? battleSfx : {},
        description: _formEl.querySelector('#chr-desc').value
      });
      _renderList(); _load(c.id);
      UI().toast('Character saved', 'success');
    };
    _formEl.querySelector('#chr-dup').onclick = () => { const nid=DS().duplicate('characters',c.id); if(nid){_activeId=nid;_renderList();_load(nid);UI().toast('Duplicated','success');} };
    _formEl.querySelector('#chr-del').onclick = () => { UI().confirm(`Delete "${c.name}"?`,()=>{DS().remove('characters',c.id);_activeId=null;_renderList();_formEl.innerHTML='<div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select a character</div>';UI().toast('Deleted','info');}); };
  }

  function _collectBattleSfx(current, prefix, keys) {
    const out = { ...(current?.battleSfx || {}) };
    for (const key of keys) {
      const value = String(_formEl.querySelector(`#${prefix}-sfx-${key}`)?.value || '').trim();
      if (value) out[key] = value;
      else delete out[key];
    }
    return out;
  }

  function _updateDerived(sliders, rank) {
    const stats = {};
    let total = 0;
    for (const s of C().STATS) { stats[s] = sliders[s]._getValue(); total += stats[s]; }
    const totalEl = _formEl.querySelector('#chr-stat-total');
    if (totalEl) totalEl.textContent = total;

    const el = _formEl.querySelector('#chr-derived');
    if (!el) return;
    const hp = F().calcMaxHP(stats, rank, { team: 'player', plotArmor: true });
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

  // ── Skill Override Picker (skills with optional overrides + level) ──
  // Stores as: [{ skillId: 'fire_slash', overrides: { power: 20 }, level: 3 }]
  // Backwards-compatible: bare string IDs treated as { skillId, overrides: {}, level: 1 }
  function _createSkillRefPicker(currentEntries) {
    const el = document.createElement('div');
    // Normalize: accept both bare IDs and { skillId, overrides, level }
    let entries = (currentEntries || []).map(e =>
      typeof e === 'string' ? { skillId: e, overrides: {}, level: 1 } : { ...e, level: e.level || 1 }
    );

    function render() {
      el.innerHTML = '';
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const skill = DS().get('skills', entry.skillId);
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'margin-bottom:6px';

        const chip = document.createElement('div');
        chip.className = 'effect-chip';

        const hasOverrides = entry.overrides && Object.keys(entry.overrides).length > 0;
        const Formulas = F();
        const maxLevel = (skill && Formulas?.getSkillMaxLevel) ? Formulas.getSkillMaxLevel(skill) : 5;
        const curLevel = Math.max(1, Math.min(entry.level || 1, maxLevel));

        if (skill) {
          const overrideHint = hasOverrides
            ? `<span style="color:var(--gold);font-size:0.75em"> ✏️ ${Object.keys(entry.overrides).join(', ')}</span>`
            : '';
          chip.innerHTML = `<span class="chip-icon">${skill.icon||'⚔️'}</span><span class="chip-name">${skill.name}${overrideHint}</span><span class="chip-desc">${skill.ap||0}AP ${skill.mp||0}MP | Lv ${curLevel}/${maxLevel}</span>`;
        } else {
          chip.innerHTML = `<span class="chip-icon">⚠️</span><span class="chip-name">${entry.skillId}</span><span class="chip-desc" style="color:var(--red)">Not found</span>`;
        }

        const actions = document.createElement('div');
        actions.className = 'chip-actions';
        actions.style.display = 'flex';
        actions.style.gap = '2px';
        actions.style.alignItems = 'center';

        // Level controls
        if (skill) {
          const lvlDown = document.createElement('button');
          lvlDown.className = 'btn-icon';
          lvlDown.textContent = '−';
          lvlDown.title = 'Decrease level';
          lvlDown.style.cssText = 'font-weight:bold;font-size:1.1em';
          lvlDown.disabled = curLevel <= 1;
          lvlDown.onclick = () => { entry.level = Math.max(1, curLevel - 1); render(); };
          actions.appendChild(lvlDown);

          const lvlLabel = document.createElement('span');
          lvlLabel.style.cssText = 'font-size:0.82em;min-width:18px;text-align:center;font-weight:bold;color:var(--accent)';
          lvlLabel.textContent = curLevel;
          actions.appendChild(lvlLabel);

          const lvlUp = document.createElement('button');
          lvlUp.className = 'btn-icon';
          lvlUp.textContent = '+';
          lvlUp.title = 'Increase level';
          lvlUp.style.cssText = 'font-weight:bold;font-size:1.1em';
          lvlUp.disabled = curLevel >= maxLevel;
          lvlUp.onclick = () => { entry.level = Math.min(maxLevel, curLevel + 1); render(); };
          actions.appendChild(lvlUp);

          // Separator
          const sep = document.createElement('span');
          sep.style.cssText = 'border-left:1px solid var(--border);height:18px;margin:0 2px';
          actions.appendChild(sep);

          // Edit overrides button
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
        wrapper.appendChild(chip);

        // Perk preview (earned + next) if skill has levelPerks
        if (skill && Formulas) {
          const earned = Formulas.getEarnedSkillPerks ? Formulas.getEarnedSkillPerks(skill, curLevel) : [];
          const next = Formulas.getNextSkillPerk ? Formulas.getNextSkillPerk(skill, curLevel) : null;
          if (earned.length || next) {
            const perkDiv = document.createElement('div');
            perkDiv.style.cssText = 'font-size:0.78em;padding:2px 8px 4px 28px;color:var(--text-dim)';
            let html = '';
            if (earned.length) {
              html += `<span style="color:var(--green)">✔ ${earned.map(p => `Lv${p.level}: ${_esc(p.description || 'perk')}`).join(' · ')}</span>`;
            }
            if (next) {
              html += `${earned.length ? ' | ' : ''}<span style="color:var(--accent)">Next at Lv${next.level}: ${_esc(next.description || '...')}</span>`;
            }
            perkDiv.innerHTML = html;
            wrapper.appendChild(perkDiv);
          }
        }

        el.appendChild(wrapper);
      }

      // Add skill button
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-ghost btn-sm';
      addBtn.textContent = '+ Add skill';
      addBtn.onclick = () => _openRefPicker('skills', 'skill', (picked) => {
        if (!entries.some(e => e.skillId === picked.id)) {
          entries.push({ skillId: picked.id, overrides: {}, level: 1 });
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
      // Return entries in the { skillId, overrides, level } format
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
