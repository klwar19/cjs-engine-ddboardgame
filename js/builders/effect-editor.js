// effect-editor.js — v3
// Context-sensitive editor with parameterized conditions, descriptive
// cleanse labels, override hints, and status tooltips.
window.CJS = window.CJS || {};
window.CJS.EffectEditor = (() => {
  'use strict';
  const C  = () => window.CJS.CONST;
  const ER = () => window.CJS.EffectRegistry;
  const UI = () => window.CJS.UI;
  const DS = () => window.CJS.DataStore;

  // ── HUMAN LABELS ──────────────────────────────────────────────────
  const TL = {
    stat_mod:'Passive: Modify a Stat', dr_mod:'Passive: Modify DR',
    element_mod:'Passive: Element Interaction', crit_mod:'Passive: Modify Crit',
    evasion_mod:'Passive: Evasion', accuracy_mod:'Passive: Accuracy',
    ap_mod:'Passive: AP/Turn', movement_mod:'Passive: Movement',
    range_mod:'Passive: Range', cost_mod:'Passive: Reduce Costs',
    cooldown_mod:'Passive: Reduce Cooldowns', damage_mod:'Passive: Damage %',
    hp_mod:'Passive: Max HP', mp_mod:'Passive: Max MP',
    status_resist_mod:'Passive: Status Resistance',
    on_hit:'When Dealing Damage', on_take_damage:'When Taking Damage',
    on_kill:'When Killing', on_death:'When Dying',
    on_turn_start:'Turn Start', on_turn_end:'Turn End',
    on_battle_start:'Battle Start', on_low_hp:'HP Below Threshold',
    on_dodge:'When Dodging', on_move:'When Moving',
    on_status_applied:'When Status Applied', on_ally_hit:'Ally Takes Damage',
    on_crit:'Landing a Crit', on_status_tick:'Status Tick (DoT/HoT)',
    on_miss:'When Missing'
  };
  const AL = {
    damage:'Deal Bonus Damage', heal:'Heal HP', mp_restore:'Restore MP',
    mp_drain:'Drain MP', hp_drain:'Drain HP (+Self Heal)',
    status_apply:'Apply a Status', status_remove:'Remove Status',
    reflect:'Reflect Damage', absorb:'Create Shield', counter:'Counter-Attack',
    revive:'Revive at % HP', knockback:'Push Away', pull:'Pull Closer',
    teleport:'Teleport', terrain_create:'Create Terrain', cooldown_reset:'Reset Cooldown',
    ap_grant:'Grant AP', steal_buff:'Steal Buff', execute:'Kill Below HP%',
    extra_action:'Grant Extra Action'
  };
  const SL = {
    flat:'Flat Number', percent:'Percentage (%)', max_hp:'% of Max HP',
    current_hp:'% of Current HP', missing_hp:'% of Missing HP',
    damage_dealt:'% of Damage Dealt', damage_received:'% of Damage Taken',
    caster_S:'× Caster STR', caster_P:'× Caster PER', caster_E:'× Caster END',
    caster_C:'× Caster CHA', caster_I:'× Caster INT', caster_A:'× Caster AGI',
    caster_L:'× Caster LCK', target_max_hp:'% of Target Max HP',
    stack_count:'× Stack Count'
  };
  const TGTL = {
    self:'Self', target:'Current Target', attacker:'Attacker',
    host:'Host (status bearer)', all_allies:'All Allies',
    all_enemies:'All Enemies', all:'Everyone',
    random_enemy:'Random Enemy', random_ally:'Random Ally',
    lowest_hp_ally:'Lowest HP Ally', lowest_hp_enemy:'Lowest HP Enemy',
    adjacent_to_self:'Adjacent to Self'
  };
  const PASSIVE_SET = new Set(C().EFFECT_TRIGGERS.passive);

  // Status list from STATUS_DEFINITIONS
  function _statusList() { return Object.keys(C().STATUS_DEFINITIONS); }

  // Get status tooltip
  function _statusTip(id) {
    const d = C().STATUS_DEFINITIONS[id];
    return d ? `${d.icon} ${d.name}: ${d.desc}` : id;
  }

  let _container, _listEl, _formEl, _activeId = null, _activeFilter = 'all';

  function init(el) {
    _container = el;
    el.innerHTML = `<div class="flex gap-md" style="height:100%">
      <div style="width:280px;flex-shrink:0;display:flex;flex-direction:column;gap:8px">
        <div class="flex gap-sm items-center">
          <input type="search" id="eff-search" placeholder="Search effects..." style="flex:1">
          <button class="btn btn-primary btn-sm" id="eff-new">+ New</button></div>
        <div class="filter-bar" id="eff-filter-bar"></div>
        <div class="data-list" id="eff-list" style="flex:1;max-height:none"></div>
      </div>
      <div style="flex:1;overflow-y:auto" id="eff-form-area">
        <div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select an effect or create a new one</div>
      </div></div>`;
    _listEl = el.querySelector('#eff-list');
    _formEl = el.querySelector('#eff-form-area');
    el.querySelector('#eff-new').onclick = _createNew;
    el.querySelector('#eff-search').oninput = (e) => _renderList(e.target.value);
    _buildFilterBar(); _renderList();
  }

  function _buildFilterBar() {
    const bar = _container.querySelector('#eff-filter-bar');
    const all = ER().getAllEffects(), grp = ER().getEffectsGroupedByCategory();
    let h = `<button class="filter-btn active" data-cat="all">All (${all.length})</button>`;
    for (const [cat, items] of Object.entries(grp)) if (items.length) h += `<button class="filter-btn" data-cat="${cat}">${cat} (${items.length})</button>`;
    bar.innerHTML = h;
    bar.onclick = (e) => { const b=e.target.closest('.filter-btn'); if(!b) return; bar.querySelectorAll('.filter-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); _activeFilter=b.dataset.cat; _renderList(_container.querySelector('#eff-search').value); };
  }

  function _renderList(q) {
    let eff = q ? ER().searchEffects(q) : ER().getAllEffects();
    if (_activeFilter !== 'all') eff = eff.filter(e => e.category === _activeFilter);
    UI().renderDataList({ container: _listEl, items: eff, activeId: _activeId, onSelect: (e) => _load(e.id) });
  }

  function _createNew() { const id = ER().createEffect({name:'New Effect'}); _activeId=id; _renderList(); _buildFilterBar(); _load(id); UI().toast('Effect created','success'); }

  function _load(id) { _activeId=id; _renderList(_container.querySelector('#eff-search').value); const e=ER().getEffect(id); if(e) _renderForm(e); }

  // ══════════════════════════════════════════════════════════════════
  // MAIN FORM
  // ══════════════════════════════════════════════════════════════════
  function _renderForm(e) {
    _formEl.innerHTML = `<div class="card">
      <div class="card-header"><span class="card-title">${e.icon||'✦'} ${e.name||'Unnamed'}</span>
        <div class="btn-group"><button class="btn btn-ghost btn-sm" id="eff-dup">Dup</button>
          <button class="btn btn-danger btn-sm" id="eff-del">Del</button></div></div>
      <div class="hint-box" id="eff-suit"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name</label><input type="text" id="eff-name" value="${_x(e.name||'')}"></div>
        <div class="form-group" style="flex:0 0 80px"><label class="form-label">Icon</label><input type="text" id="eff-icon" value="${_x(e.icon||'✦')}" style="text-align:center;font-size:1.2em"></div></div>
      <div class="form-group"><label class="form-label">① What type of effect?</label>
        <select id="eff-trigger">
          <optgroup label="── Passive (always active) ──">
            ${C().EFFECT_TRIGGERS.passive.map(t=>`<option value="${t}" ${e.trigger===t?'selected':''}>${TL[t]||t}</option>`).join('')}
          </optgroup>
          <optgroup label="── Event (fires on trigger) ──">
            ${C().EFFECT_TRIGGERS.event.map(t=>`<option value="${t}" ${e.trigger===t?'selected':''}>${TL[t]||t}</option>`).join('')}
          </optgroup></select></div>
      <div id="eff-ctx"></div>
      <div id="eff-dur"></div>
      <div class="form-group"><label class="form-label">⑤ Conditions (optional — when should this fire?)</label><div id="eff-cond"></div></div>
      <div class="form-group"><label class="form-label">⑥ Cleansed By (what removes this?)</label><div id="eff-clns"></div></div>
      <div class="form-group"><label class="form-label">⑦ Overridable Fields
        <span style="font-weight:normal;font-size:0.78rem;color:var(--text-dim)"> — Skills/items can change these values when they reference this effect. E.g. if "value" is overridable, one skill can set damage to 5 and another to 20, reusing the same effect template.</span></label>
        <div id="eff-ovr"></div></div>
      <div class="form-group" id="eff-tags-ctr"><label class="form-label">Tags</label></div>
      <div class="form-group"><label class="form-label">Description (blank = auto)</label><textarea id="eff-desc" rows="2">${_x(e.description||'')}</textarea></div>
      <div class="card" style="background:var(--surface2);margin-top:8px"><div style="font-size:0.82rem">
        <b>📝 Auto:</b> <span id="eff-auto">${ER().autoDescribe(e)}</span> | <b>ID:</b> ${e.id}</div></div>
      <div style="margin-top:12px"><button class="btn btn-success" id="eff-save">💾 Save Effect</button></div>
    </div>`;

    _formEl.querySelector('#eff-suit').innerHTML = _suitHint(e);
    _buildCtx(e); _buildDur(e); _buildCondV2(e); _buildClnsV2(e); _buildOvrV2(e);
    const tw = UI().createTagInput({tags:e.tags||[]}); _formEl.querySelector('#eff-tags-ctr').appendChild(tw);

    _formEl.querySelector('#eff-trigger').onchange = () => {
      const ne = {...e, trigger:_formEl.querySelector('#eff-trigger').value};
      _buildCtx(ne); _buildDur(ne);
      _formEl.querySelector('#eff-suit').innerHTML = _suitHint(ne);
    };
    _formEl.querySelector('#eff-save').onclick = () => _save(e.id, tw);
    _formEl.querySelector('#eff-dup').onclick = () => { const n=ER().duplicateEffect(e.id); if(n){_activeId=n;_renderList();_buildFilterBar();_load(n);} };
    _formEl.querySelector('#eff-del').onclick = () => { UI().confirm(`Delete "${e.name}"?`,()=>{ER().deleteEffect(e.id);_activeId=null;_renderList();_buildFilterBar();_formEl.innerHTML='<div class="card" style="text-align:center;padding:40px;color:var(--text-mute)">Select an effect</div>';}); };
  }

  // ── CONTEXT FIELDS (passive vs event) ──────────────────────────────
  function _buildCtx(e) {
    const a = _formEl.querySelector('#eff-ctx'), t = e.trigger||'stat_mod';
    a.innerHTML = PASSIVE_SET.has(t) ? _passiveCtx(t,e) : _eventCtx(t,e);
    // Wire source custom toggle
    const srcSel = _formEl.querySelector('#eff-source');
    if (srcSel) srcSel.onchange = () => {
      const cd = _formEl.querySelector('#eff-src-custom');
      if (cd) cd.style.display = srcSel.value.includes(':')?'block':'none';
    };
    // Wire action change to rebuild action-specific fields
    const actSel = _formEl.querySelector('#eff-action');
    if (actSel && !PASSIVE_SET.has(t)) {
      actSel.onchange = () => {
        const ne = {...e, trigger:t, action:actSel.value};
        const extra = _formEl.querySelector('#eff-action-extra');
        if (extra) extra.innerHTML = _actionExtra(ne);
      };
    }
  }

  function _passiveCtx(t, e) {
    const H = (id,v) => `<input type="hidden" id="${id}" value="${v}">`;
    switch(t) {
      case 'stat_mod': return `<div class="form-row">
        <div class="form-group"><label class="form-label">② Which stat?</label>
          <select id="eff-stat">${C().STATS.map(s=>`<option value="${s}" ${e.stat===s?'selected':''}>${s} — ${C().STAT_NAMES[s]}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">③ Amount (+/-)</label>
          <input type="number" id="eff-value" value="${e.value??0}"></div>
        <div class="form-group"><label class="form-label">Type</label>
          <select id="eff-source"><option value="flat" ${e.source==='flat'?'selected':''}>Flat</option><option value="percent" ${e.source==='percent'?'selected':''}>Percent</option></select></div>
        </div>${H('eff-action','stat_mod')}${H('eff-target','self')}`;
      case 'dr_mod': return `<div class="form-row">
        <div class="form-group"><label class="form-label">② DR Type</label>
          <select id="eff-drtype">${['physical','magic','chaos','all'].map(d=>`<option value="${d}" ${e.drType===d?'selected':''}>${d}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">③ Amount</label>
          <input type="number" id="eff-value" value="${e.value??0}"></div>
        </div>${H('eff-action','dr_mod')}${H('eff-source','flat')}${H('eff-target','self')}`;
      case 'crit_mod': return `<div class="form-row">
        <div class="form-group"><label class="form-label">② Crit Chance +%</label>
          <input type="number" id="eff-value" value="${e.value??0}"></div>
        <div class="form-group"><label class="form-label">③ Crit Damage +%</label>
          <input type="number" id="eff-critdmg" value="${e.critDamageBonus??0}"></div>
        </div>${H('eff-action','crit_mod')}${H('eff-source','flat')}${H('eff-target','self')}`;
      case 'element_mod': return `<div class="form-row">
        <div class="form-group"><label class="form-label">② Add</label>
          <select id="eff-interaction"><option value="weak" ${e.interaction==='weak'?'selected':''}>Weakness</option><option value="resist" ${e.interaction==='resist'?'selected':''}>Resistance</option><option value="immune" ${e.interaction==='immune'?'selected':''}>Immunity</option></select></div>
        <div class="form-group"><label class="form-label">③ Element</label>
          <select id="eff-element">${C().ELEMENTS.map(el=>`<option value="${el}" ${e.element===el?'selected':''}>${el}</option>`).join('')}</select></div>
        </div>${H('eff-action','element_mod')}${H('eff-source','flat')}${H('eff-value','1')}${H('eff-target','self')}`;
      case 'damage_mod': return `<div class="form-row">
        <div class="form-group"><label class="form-label">② Damage bonus %</label>
          <input type="number" id="eff-value" value="${e.value??0}"></div>
        <div class="form-group"><label class="form-label">③ For element</label>
          <select id="eff-element"><option value="">All</option>${C().ELEMENTS.map(el=>`<option value="${el}" ${e.element===el?'selected':''}>${el}</option>`).join('')}</select></div>
        </div>${H('eff-action','damage_mod')}${H('eff-source','percent')}${H('eff-target','self')}`;
      case 'hp_mod': case 'mp_mod': { const r=t==='hp_mod'?'HP':'MP'; return `<div class="form-row">
        <div class="form-group"><label class="form-label">② ${r} bonus</label>
          <input type="number" id="eff-value" value="${e.value??0}"></div>
        <div class="form-group"><label class="form-label">③ Type</label>
          <select id="eff-source"><option value="flat" ${e.source==='flat'?'selected':''}>Flat</option><option value="percent" ${e.source==='percent'?'selected':''}>%</option></select></div>
        </div>${H('eff-action',t)}${H('eff-target','self')}`; }
      case 'status_resist_mod': return `<div class="form-row">
        <div class="form-group"><label class="form-label">② Resist which?</label>
          <select id="eff-statusid">${_statusList().map(s=>`<option value="${s}" ${e.statusId===s?'selected':''} title="${_statusTip(s)}">${C().STATUS_DEFINITIONS[s]?.icon||'✦'} ${s}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">③ Chance %</label>
          <input type="number" id="eff-value" value="${e.value??0}" min="0" max="100"></div>
        </div>${H('eff-action','status_resist')}${H('eff-source','flat')}${H('eff-target','self')}`;
      default: { const lbl={evasion_mod:'Evasion',accuracy_mod:'Accuracy',movement_mod:'Movement',range_mod:'Range',ap_mod:'AP/turn',cost_mod:'Cost reduction',cooldown_mod:'Cooldown reduction'}[t]||'Value';
        return `<div class="form-group"><label class="form-label">② ${lbl} (+/-)</label>
          <input type="number" id="eff-value" value="${e.value??0}"></div>
          ${H('eff-action',t)}${H('eff-source','flat')}${H('eff-target','self')}`; }
    }
  }

  function _eventCtx(t, e) {
    const thr = (t==='on_low_hp'||t==='on_hp_threshold') ? `<div class="form-group"><label class="form-label">HP Threshold %</label>
      <input type="number" id="eff-threshold" value="${e.threshold??30}" min="1" max="99"></div>` : '';
    const aOpt = (acts) => acts.map(a=>`<option value="${a}" ${e.action===a?'selected':''}>${AL[a]||a}</option>`).join('');
    const tOpt = (ts) => ts.map(x=>`<option value="${x}" ${e.target===x?'selected':''}>${TGTL[x]||x}</option>`).join('');
    const sOpt = Object.entries(SL).map(([v,l])=>`<option value="${v}" ${e.source===v?'selected':''}>${l}</option>`).join('');
    return `<div class="hint-box hint-info">🔔 <b>${TL[t]||t}</b></div>${thr}
      <div class="form-group"><label class="form-label">② What happens?</label>
        <select id="eff-action">
          <optgroup label="Damage/Heal">${aOpt(['damage','heal','mp_restore','mp_drain','hp_drain'])}</optgroup>
          <optgroup label="Status">${aOpt(['status_apply','status_remove'])}</optgroup>
          <optgroup label="Defensive">${aOpt(['reflect','absorb','counter','revive'])}</optgroup>
          <optgroup label="Position">${aOpt(['knockback','pull','teleport'])}</optgroup>
          <optgroup label="Terrain">${aOpt(['terrain_create','terrain_remove'])}</optgroup>
          <optgroup label="Utility">${aOpt(['steal_buff','cooldown_reset','ap_grant','extra_action','execute'])}</optgroup>
        </select></div>
      <div class="form-group"><label class="form-label">③ Who?</label>
        <select id="eff-target">
          <optgroup label="Single">${tOpt(['self','target','attacker','host'])}</optgroup>
          <optgroup label="Group">${tOpt(['all_allies','all_enemies','all'])}</optgroup>
          <optgroup label="Smart">${tOpt(['random_enemy','random_ally','lowest_hp_ally','lowest_hp_enemy','adjacent_to_self'])}</optgroup>
        </select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">④ Amount</label>
          <input type="number" id="eff-value" value="${e.value??0}"></div>
        <div class="form-group"><label class="form-label">Based on</label>
          <select id="eff-source">${sOpt}
            <option value="dice:" ${(e.source||'').startsWith('dice:')?'selected':''}>Dice (custom)</option>
          </select></div></div>
      <div id="eff-src-custom" style="display:${(e.source||'').includes(':')?'block':'none'}">
        <div class="form-group"><label class="form-label">Dice expression</label>
          <input type="text" id="eff-source-str" value="${_x(e.source||'')}" placeholder="dice:2d6+3"></div></div>
      <div id="eff-action-extra">${_actionExtra(e)}</div>`;
  }

  function _actionExtra(e) {
    let h = '';
    const a = e.action||'';
    if (a === 'status_apply' || a === 'status_remove') {
      const sList = _statusList();
      const tip = e.statusId ? _statusTip(e.statusId) : '';
      h += `<div class="form-group"><label class="form-label">Which status?</label>
        <select id="eff-statusid">${sList.map(s => {
          const d = C().STATUS_DEFINITIONS[s];
          return `<option value="${s}" ${e.statusId===s?'selected':''} title="${_statusTip(s)}">${d?.icon||'✦'} ${s} — ${d?.name||s}</option>`;
        }).join('')}</select>
        ${tip ? `<div class="hint-box" style="margin-top:4px;font-size:0.8rem">${tip}</div>` : ''}
      </div>`;
    }
    if (a === 'damage' || a === 'heal' || a === 'hp_drain') {
      h += `<div class="form-row">
        <div class="form-group"><label class="form-label">Element</label>
          <select id="eff-element"><option value="">None</option>${C().ELEMENTS.map(el=>`<option value="${el}" ${e.element===el?'selected':''}>${el}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Damage Type</label>
          <select id="eff-dmgtype"><option value="">None</option>${C().DAMAGE_TYPES.map(d=>`<option value="${d}" ${e.damageType===d?'selected':''}>${d}</option>`).join('')}</select></div></div>`;
    }
    if (a === 'terrain_create') {
      h += `<div class="form-group"><label class="form-label">Terrain</label>
        <select id="eff-terrain">${Object.keys(C().TERRAIN_TYPES).map(x=>`<option value="${x}" ${e.terrainType===x?'selected':''}>${x}</option>`).join('')}</select></div>`;
    }
    if (a === 'knockback' || a === 'pull') {
      h += `<div class="form-group"><label class="form-label">Distance (cells)</label>
        <input type="number" id="eff-knockdist" value="${e.knockbackDistance??2}" min="1" max="6"></div>`;
    }
    return h;
  }

  function _buildDur(e) {
    _formEl.querySelector('#eff-dur').innerHTML = `<div class="form-row">
      <div class="form-group"><label class="form-label">Duration (0=permanent)</label>
        <input type="number" id="eff-duration" value="${e.duration??0}" min="0" max="99"></div>
      <div class="form-group"><label class="form-label">Max Stacks</label>
        <input type="number" id="eff-maxstacks" value="${e.maxStacks??1}" min="1" max="99"></div>
      <div class="form-group" style="display:flex;align-items:flex-end;padding-bottom:4px">
        <label class="form-check"><input type="checkbox" id="eff-stacks" ${e.stacks?'checked':''}> Stackable</label></div></div>`;
  }

  // ══════════════════════════════════════════════════════════════════
  // CONDITION BUILDER v2 — uses CONDITION_DEFS with parameters
  // ══════════════════════════════════════════════════════════════════
  function _buildCondV2(e) {
    const area = _formEl.querySelector('#eff-cond');
    const conds = [...(e.conditions || [])]; // stored as strings like "chance_25" or "hp_below_30"
    area._getConds = () => [...conds];
    const defs = C().CONDITION_DEFS;
    const groups = {};
    for (const d of defs) { if (!groups[d.g]) groups[d.g] = []; groups[d.g].push(d); }

    const render = () => {
      area.innerHTML = '';
      // Show existing conditions as chips
      conds.forEach((c, i) => {
        const sp = document.createElement('span');
        sp.className = 'chip'; sp.innerHTML = `${_condLabel(c)} <button class="chip-x" data-i="${i}">×</button>`;
        area.appendChild(sp);
        if (i < conds.length-1) { const a2=document.createElement('span'); a2.className='chip-and'; a2.textContent='AND'; area.appendChild(a2); }
      });
      // Add row: group dropdown → condition dropdown → param input → add button
      const row = document.createElement('div');
      row.style.cssText = 'margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;align-items:center';
      let selHtml = '<select class="cond-add" style="font-size:0.82rem"><option value="">+ Add condition...</option>';
      for (const [g, items] of Object.entries(groups)) {
        selHtml += `<optgroup label="${g}">`;
        for (const d of items) selHtml += `<option value="${d.v}" data-has-param="${d.hasParam?1:0}" data-has-stat="${d.hasStat?1:0}" data-has-status="${d.hasStatus?1:0}" data-has-terrain="${d.hasTerrain?1:0}" data-has-unit-type="${d.hasUnitType?1:0}" data-default="${d.paramDefault||''}">${d.l}</option>`;
        selHtml += '</optgroup>';
      }
      selHtml += '<option value="__custom">Custom (type your own)...</option></select>';
      row.innerHTML = selHtml + '<input type="number" class="cond-param" style="width:60px;display:none" placeholder="#">' +
        '<select class="cond-stat" style="display:none">' + C().STATS.map(s=>`<option value="${s}">${s}</option>`).join('') + '</select>' +
        '<select class="cond-status" style="display:none">' + _statusList().map(s=>`<option value="${s}">${s}</option>`).join('') + '</select>' +
        '<select class="cond-terrain" style="display:none">' + Object.keys(C().TERRAIN_TYPES).map(t=>`<option value="${t}">${t}</option>`).join('') + '</select>' +
        '<select class="cond-utype" style="display:none">' + C().UNIT_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('') + '</select>' +
        '<button class="btn btn-sm btn-primary cond-ok" style="display:none">Add</button>';
      area.appendChild(row);

      const sel = row.querySelector('.cond-add');
      const paramIn = row.querySelector('.cond-param');
      const statSel = row.querySelector('.cond-stat');
      const statusSel = row.querySelector('.cond-status');
      const terrainSel = row.querySelector('.cond-terrain');
      const utypeSel = row.querySelector('.cond-utype');
      const okBtn = row.querySelector('.cond-ok');

      sel.onchange = () => {
        const opt = sel.selectedOptions[0];
        if (!opt || !sel.value) { okBtn.style.display='none'; paramIn.style.display='none'; statSel.style.display='none'; statusSel.style.display='none'; terrainSel.style.display='none'; utypeSel.style.display='none'; return; }
        if (sel.value === '__custom') {
          const c = prompt('Condition string:'); if(c){conds.push(c.trim());render();} sel.value=''; return;
        }
        const needParam = opt.dataset.hasParam==='1';
        const needStat = opt.dataset.hasStat==='1';
        const needStatus = opt.dataset.hasStatus==='1';
        const needTerrain = opt.dataset.hasTerrain==='1';
        const needUType = opt.dataset.hasUnitType==='1';
        paramIn.style.display = needParam?'':'none'; paramIn.value = opt.dataset.default||'';
        statSel.style.display = needStat?'':'none';
        statusSel.style.display = needStatus?'':'none';
        terrainSel.style.display = needTerrain?'':'none';
        utypeSel.style.display = needUType?'':'none';
        // Simple conditions (no param) → add immediately
        if (!needParam && !needStat && !needStatus && !needTerrain && !needUType) {
          conds.push(sel.value); render(); return;
        }
        okBtn.style.display = '';
      };

      okBtn.onclick = () => {
        let v = sel.value;
        const opt = sel.selectedOptions[0];
        if (opt.dataset.hasParam==='1') v += '_' + (paramIn.value||opt.dataset.default||'0');
        if (opt.dataset.hasStat==='1') v += '_' + statSel.value;
        if (opt.dataset.hasStatus==='1') v += '_' + statusSel.value;
        if (opt.dataset.hasTerrain==='1') v += '_' + terrainSel.value;
        if (opt.dataset.hasUnitType==='1') v += '_' + utypeSel.value;
        conds.push(v); render();
      };

      area.querySelectorAll('.chip-x').forEach(b => { b.onclick=()=>{conds.splice(+b.dataset.i,1);render();}; });
    };
    render();
  }

  // Human-readable condition label
  function _condLabel(c) {
    const defs = C().CONDITION_DEFS;
    for (const d of defs) {
      if (c === d.v) return d.l;
      if (c.startsWith(d.v + '_')) {
        const param = c.slice(d.v.length + 1);
        return d.l.replace('X', param).replace('[pick]', param).replace('[stat]', param).replace('[type]', param).replace('[terrain type]', param);
      }
    }
    return c; // fallback: raw string
  }

  // ══════════════════════════════════════════════════════════════════
  // CLEANSED BY v2 — descriptive labels with icons
  // ══════════════════════════════════════════════════════════════════
  function _buildClnsV2(e) {
    const area = _formEl.querySelector('#eff-clns');
    const items = [...(e.cleansedBy || [])];
    area._get_clns = () => [...items];
    const labels = C().CLEANSE_LABELS;
    const allOpts = Object.keys(labels);

    const render = () => {
      area.innerHTML = '';
      items.forEach((it, i) => {
        const lb = labels[it];
        const display = lb ? `${lb.icon} ${lb.label}` : it;
        const sp = document.createElement('span'); sp.className = 'chip';
        sp.innerHTML = `${display} <button class="chip-x" data-i="${i}">×</button>`;
        area.appendChild(sp);
      });
      const sel = document.createElement('select');
      sel.style.fontSize = '0.82rem';
      sel.innerHTML = '<option value="">+ Add cleanse method...</option>' +
        allOpts.filter(o => !items.includes(o)).map(o => {
          const lb = labels[o];
          return `<option value="${o}">${lb.icon} ${lb.label}</option>`;
        }).join('');
      sel.onchange = () => { if(sel.value){items.push(sel.value);render();} };
      area.appendChild(sel);
      area.querySelectorAll('.chip-x').forEach(b=>{b.onclick=()=>{items.splice(+b.dataset.i,1);render();};});
    };
    render();
  }

  // ══════════════════════════════════════════════════════════════════
  // OVERRIDABLE v2 — with explanation
  // ══════════════════════════════════════════════════════════════════
  function _buildOvrV2(e) {
    const area = _formEl.querySelector('#eff-ovr');
    const items = [...(e.overridable || [])];
    area._get_ovr = () => [...items];
    const allFields = ['value','duration','stat','element','statusId','drType','source','terrainType','threshold','maxStacks'];
    const fieldDescs = {
      value:'The main number (damage amount, heal amount, bonus %)',
      duration:'How many turns it lasts',
      stat:'Which SPECIAL stat is affected',
      element:'Which element (Fire, Water, etc.)',
      statusId:'Which status is applied/removed',
      drType:'Physical/Magic/Chaos DR type',
      source:'How the value is calculated (flat, % of HP, etc.)',
      terrainType:'Which terrain is created',
      threshold:'HP % threshold for triggers',
      maxStacks:'Maximum stack count'
    };

    const render = () => {
      area.innerHTML = '';
      items.forEach((it, i) => {
        const desc = fieldDescs[it] || '';
        const sp = document.createElement('span'); sp.className = 'chip'; sp.title = desc;
        sp.innerHTML = `${it} <button class="chip-x" data-i="${i}">×</button>`;
        area.appendChild(sp);
      });
      const sel = document.createElement('select');
      sel.innerHTML = '<option value="">+ Add field...</option>' +
        allFields.filter(o=>!items.includes(o)).map(o=>`<option value="${o}" title="${fieldDescs[o]||''}">${o} — ${fieldDescs[o]||''}</option>`).join('');
      sel.onchange = () => { if(sel.value){items.push(sel.value);render();} };
      area.appendChild(sel);
      area.querySelectorAll('.chip-x').forEach(b=>{b.onclick=()=>{items.splice(+b.dataset.i,1);render();};});
    };
    render();
  }

  // ── SUITABILITY HINT ──────────────────────────────────────────────
  function _suitHint(e) {
    const t = e.trigger||'';
    if (PASSIVE_SET.has(t)) return '<div>✅ <b>Good for:</b> Passives, Item bonuses, Character innates, Buff/debuff statuses</div><div>⚠️ Skills use this as a permanent modifier while active — not a one-time action</div>';
    if (t==='on_status_tick') return '<div>✅ <b>Good for:</b> DoT (Burn/Poison) or HoT (Regen) status tick effects</div><div>💡 Reference from a status_apply effect in a skill</div>';
    let h = '<div>✅ <b>Good for:</b> Skill effects, Triggered passives, Item procs</div>';
    if (t==='on_hit'||t==='on_crit') h+='<div>⚔️ Best on: Skills, Weapons, Combat passives</div>';
    if (t==='on_take_damage') h+='<div>🛡️ Best on: Armor, Tank passives, Defensive skills</div>';
    return h;
  }

  // ── SAVE ──────────────────────────────────────────────────────────
  function _save(id, tw) {
    const f = _formEl;
    const v = (s) => f.querySelector(s)?.value ?? null;
    const n = (s) => { const el=f.querySelector(s); return el?(Number(el.value)||0):null; };
    const srcSel = v('#eff-source')||'flat';
    const source = srcSel.includes(':')?(v('#eff-source-str')||srcSel):srcSel;
    const condArea = f.querySelector('#eff-cond');
    const clnsArea = f.querySelector('#eff-clns');
    const ovrArea = f.querySelector('#eff-ovr');
    const changes = {
      name:v('#eff-name'), icon:v('#eff-icon'), trigger:v('#eff-trigger'),
      action:v('#eff-action'), target:v('#eff-target')||'self',
      value:n('#eff-value'), source,
      element:v('#eff-element')||null, damageType:v('#eff-dmgtype')||null,
      stat:v('#eff-stat')||null, drType:v('#eff-drtype')||null,
      statusId:v('#eff-statusid')||null, terrainType:v('#eff-terrain')||null,
      interaction:v('#eff-interaction')||null,
      duration:n('#eff-duration'), stacks:f.querySelector('#eff-stacks')?.checked||false,
      maxStacks:n('#eff-maxstacks')||1, threshold:n('#eff-threshold')||null,
      critDamageBonus:n('#eff-critdmg')||null, knockbackDistance:n('#eff-knockdist')||null,
      conditions:condArea?._getConds?.()||[], cleansedBy:clnsArea?._get_clns?.()||[],
      overridable:ovrArea?._get_ovr?.()||[], tags:tw._getTags(),
      description:v('#eff-desc')||''
    };
    ER().updateEffect(id, changes);
    _renderList(_container.querySelector('#eff-search').value);
    _buildFilterBar(); _load(id);
    UI().toast(`"${changes.name}" saved`, 'success');
  }

  function _x(s){return String(s).replace(/"/g,'&quot;').replace(/</g,'&lt;');}
  function refresh(){if(_container){_renderList(_container.querySelector('#eff-search')?.value);_buildFilterBar();}}
  return Object.freeze({ init, refresh });
})();
