// effect-editor.js — REBUILT
// Context-sensitive editor: trigger choice transforms the form.
// Human-readable labels, condition dropdown builder, chip selectors.
window.CJS = window.CJS || {};
window.CJS.EffectEditor = (() => {
  'use strict';
  const C  = () => window.CJS.CONST;
  const ER = () => window.CJS.EffectRegistry;
  const UI = () => window.CJS.UI;

  const TL = {
    stat_mod:'Passive: Modify a Stat', dr_mod:'Passive: Modify Damage Resistance',
    element_mod:'Passive: Change Element Interaction', crit_mod:'Passive: Modify Crit',
    evasion_mod:'Passive: Modify Evasion', accuracy_mod:'Passive: Modify Accuracy',
    ap_mod:'Passive: Modify AP/Turn', movement_mod:'Passive: Modify Movement',
    range_mod:'Passive: Modify Range', cost_mod:'Passive: Reduce Skill Costs',
    cooldown_mod:'Passive: Reduce Cooldowns', damage_mod:'Passive: Damage Bonus %',
    hp_mod:'Passive: Modify Max HP', mp_mod:'Passive: Modify Max MP',
    status_resist_mod:'Passive: Status Resistance',
    on_hit:'Event: When Dealing Damage', on_take_damage:'Event: When Taking Damage',
    on_kill:'Event: When Killing', on_death:'Event: When Dying',
    on_turn_start:'Event: Turn Start', on_turn_end:'Event: Turn End',
    on_battle_start:'Event: Battle Start', on_low_hp:'Event: HP Below Threshold',
    on_dodge:'Event: When Dodging', on_move:'Event: When Moving',
    on_status_applied:'Event: When Status Applied', on_ally_hit:'Event: Ally Takes Damage',
    on_crit:'Event: Landing a Crit', on_status_tick:'Event: Status Tick (DoT/HoT)',
    on_miss:'Event: When Missing'
  };
  const AL = {
    damage:'Deal Bonus Damage', heal:'Heal HP', mp_restore:'Restore MP', mp_drain:'Drain MP',
    hp_drain:'Drain HP (Damage+Self Heal)', status_apply:'Apply a Status',
    status_remove:'Remove/Cleanse Status', reflect:'Reflect Damage Back',
    absorb:'Create Shield', counter:'Auto Counter-Attack', revive:'Revive at % HP',
    knockback:'Push Target Away', pull:'Pull Target Closer', teleport:'Teleport',
    terrain_create:'Create Terrain Zone', cooldown_reset:'Reset Cooldown',
    ap_grant:'Grant Bonus AP', steal_buff:'Steal a Buff', execute:'Instant Kill Below HP%',
    extra_action:'Grant Extra Action'
  };
  const SL = {
    flat:'Flat Number', percent:'Percentage (%)', max_hp:'% of Max HP',
    current_hp:'% of Current HP', missing_hp:'% of Missing HP',
    damage_dealt:'% of Damage Dealt', damage_received:'% of Damage Taken',
    caster_S:'x Caster STR', caster_P:'x Caster PER', caster_E:'x Caster END',
    caster_C:'x Caster CHA', caster_I:'x Caster INT', caster_A:'x Caster AGI', caster_L:'x Caster LCK',
    target_max_hp:'% of Target Max HP', stack_count:'x Stack Count'
  };
  const TGTL = {
    self:'Self', target:'Current Target', attacker:'Attacker (who hit me)', host:'Host (status bearer)',
    all_allies:'All Allies', all_enemies:'All Enemies', all:'Everyone',
    random_enemy:'Random Enemy', random_ally:'Random Ally',
    lowest_hp_ally:'Lowest HP Ally', lowest_hp_enemy:'Lowest HP Enemy',
    adjacent_to_self:'Adjacent to Self'
  };
  const COND_GROUPS = [
    {g:'HP / MP', items:[
      ['hp_below_30','HP below 30%'],['hp_below_50','HP below 50%'],['hp_above_50','HP above 50%'],
      ['is_full_hp','HP is full'],['mp_below_30','MP below 30%']]},
    {g:'Status', items:[
      ['has_status_burn','Has Burn'],['has_status_poison','Has Poison'],['has_status_stun','Has Stun'],
      ['has_status_freeze','Has Freeze'],['has_status_shield','Has Shield'],
      ['not_has_status_burn','No Burn'],['not_has_status_poison','No Poison']]},
    {g:'Target Type', items:[
      ['target_type_beast','Target is Beast'],['target_type_undead','Target is Undead'],
      ['target_type_demon','Target is Demon'],['target_type_dragon','Target is Dragon']]},
    {g:'Position', items:[
      ['any_adjacent_enemy','Enemy adjacent'],['no_adjacent_enemy','No enemy adjacent']]},
    {g:'Combat', items:[
      ['is_first_turn','First turn'],['target_hp_above_0','Target alive']]}
  ];
  const STATUSES = 'burn,poison,bleed,frostbite,shock,stun,freeze,sleep,petrify,charm,confuse,silence,blind,taunt,fear,slow,root,regen,shield,haste,berserk,stealth,doom,weakness,fragile'.split(',');
  const CLEANSE_OPTS = [...C().ELEMENTS, 'purify','dispel','cleanse_dot','cleanse_cc','cleanse_all'];
  const OVERRIDE_FIELDS = ['value','duration','stat','element','statusId','drType','source','terrainType','threshold','maxStacks'];
  const PASSIVE_SET = new Set(C().EFFECT_TRIGGERS.passive);

  let _container, _listEl, _formEl, _activeId = null, _activeFilter = 'all';

  function init(el) {
    _container = el;
    el.innerHTML = `<div class="flex gap-md" style="height:100%">
      <div style="width:280px;flex-shrink:0;display:flex;flex-direction:column;gap:8px">
        <div class="flex gap-sm items-center">
          <input type="search" id="eff-search" placeholder="Search effects..." style="flex:1">
          <button class="btn btn-primary btn-sm" id="eff-new">+ New</button>
        </div>
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
    const all = ER().getAllEffects();
    const grp = ER().getEffectsGroupedByCategory();
    let h = `<button class="filter-btn active" data-cat="all">All (${all.length})</button>`;
    for (const [cat, items] of Object.entries(grp)) {
      if (items.length) h += `<button class="filter-btn" data-cat="${cat}">${cat} (${items.length})</button>`;
    }
    bar.innerHTML = h;
    bar.onclick = (e) => {
      const b = e.target.closest('.filter-btn'); if (!b) return;
      bar.querySelectorAll('.filter-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); _activeFilter = b.dataset.cat;
      _renderList(_container.querySelector('#eff-search').value);
    };
  }

  function _renderList(q) {
    let eff = q ? ER().searchEffects(q) : ER().getAllEffects();
    if (_activeFilter !== 'all') eff = eff.filter(e => e.category === _activeFilter);
    UI().renderDataList({ container: _listEl, items: eff, activeId: _activeId, onSelect: (e) => _load(e.id) });
  }

  function _createNew() {
    const id = ER().createEffect({ name: 'New Effect' });
    _activeId = id; _renderList(); _buildFilterBar(); _load(id);
    UI().toast('Effect created', 'success');
  }

  function _load(id) {
    _activeId = id; _renderList(_container.querySelector('#eff-search').value);
    const e = ER().getEffect(id); if (e) _renderForm(e);
  }

  // ── MAIN FORM ─────────────────────────────────────────────────────
  function _renderForm(e) {
    const suit = _suitHint(e);
    _formEl.innerHTML = `<div class="card">
      <div class="card-header"><span class="card-title">${e.icon||'✦'} ${e.name||'Unnamed'}</span>
        <div class="btn-group"><button class="btn btn-ghost btn-sm" id="eff-dup">Duplicate</button>
          <button class="btn btn-danger btn-sm" id="eff-del">Delete</button></div></div>
      <div class="hint-box" id="eff-suit">${suit}</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name</label><input type="text" id="eff-name" value="${_x(e.name||'')}"></div>
        <div class="form-group" style="flex:0 0 80px"><label class="form-label">Icon</label><input type="text" id="eff-icon" value="${_x(e.icon||'✦')}" style="text-align:center;font-size:1.2em"></div>
      </div>
      <div class="form-group"><label class="form-label">\u2460 What type of effect?</label>
        <select id="eff-trigger">
          <optgroup label="\u2500\u2500 Passive (always active) \u2500\u2500">
            ${C().EFFECT_TRIGGERS.passive.map(t=>`<option value="${t}" ${e.trigger===t?'selected':''}>${TL[t]||t}</option>`).join('')}
          </optgroup>
          <optgroup label="\u2500\u2500 Event (fires on trigger) \u2500\u2500">
            ${C().EFFECT_TRIGGERS.event.map(t=>`<option value="${t}" ${e.trigger===t?'selected':''}>${TL[t]||t}</option>`).join('')}
          </optgroup>
        </select></div>
      <div id="eff-ctx"></div>
      <div id="eff-dur"></div>
      <div class="form-group"><label class="form-label">\u2464 Conditions (optional)</label><div id="eff-cond"></div></div>
      <div class="form-group"><label class="form-label">\u2465 Cleansed By</label><div id="eff-clns"></div></div>
      <div class="form-group"><label class="form-label">\u2466 Overridable Fields (skills/items can change these)</label><div id="eff-ovr"></div></div>
      <div class="form-group" id="eff-tags-ctr"><label class="form-label">Tags</label></div>
      <div class="form-group"><label class="form-label">Description (blank = auto)</label><textarea id="eff-desc" rows="2">${_x(e.description||'')}</textarea></div>
      <div class="card" style="background:var(--surface2);margin-top:8px"><div style="font-size:0.82rem">
        <b>\ud83d\udcdd Auto:</b> <span id="eff-auto">${ER().autoDescribe(e)}</span> | <b>ID:</b> ${e.id}</div></div>
      <div style="margin-top:12px"><button class="btn btn-success" id="eff-save">\ud83d\udcbe Save Effect</button></div>
    </div>`;

    _buildCtx(e); _buildDur(e); _buildCond(e);
    _buildChips(_formEl.querySelector('#eff-clns'), e.cleansedBy||[], CLEANSE_OPTS, 'clns');
    _buildChips(_formEl.querySelector('#eff-ovr'), e.overridable||[], OVERRIDE_FIELDS, 'ovr');
    const tw = UI().createTagInput({tags:e.tags||[]}); _formEl.querySelector('#eff-tags-ctr').appendChild(tw);

    _formEl.querySelector('#eff-trigger').onchange = () => {
      const ne = {...e, trigger:_formEl.querySelector('#eff-trigger').value};
      _buildCtx(ne); _buildDur(ne);
      _formEl.querySelector('#eff-suit').innerHTML = _suitHint(ne);
    };

    const srcSel = _formEl.querySelector('#eff-source');
    if (srcSel) srcSel.onchange = () => {
      const cd = _formEl.querySelector('#eff-src-custom');
      if (cd) cd.style.display = srcSel.value.includes(':')?'block':'none';
    };

    _formEl.querySelector('#eff-save').onclick = () => _save(e.id, tw);
    _formEl.querySelector('#eff-dup').onclick = () => {
      const n = ER().duplicateEffect(e.id);
      if(n){_activeId=n;_renderList();_buildFilterBar();_load(n);UI().toast('Duplicated','success');}
    };
    _formEl.querySelector('#eff-del').onclick = () => {
      UI().confirm(`Delete "${e.name}"?`, () => {
        ER().deleteEffect(e.id);_activeId=null;_renderList();_buildFilterBar();
        _formEl.innerHTML='<div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select an effect</div>';
      });
    };
  }

  // ── CONTEXT FIELDS ────────────────────────────────────────────────
  function _buildCtx(e) {
    const a = _formEl.querySelector('#eff-ctx');
    const t = e.trigger || 'stat_mod';
    if (PASSIVE_SET.has(t)) { a.innerHTML = _passiveCtx(t, e); }
    else { a.innerHTML = _eventCtx(t, e); }
  }

  function _passiveCtx(t, e) {
    const hid = (id,v) => `<input type="hidden" id="${id}" value="${v}">`;
    switch(t) {
      case 'stat_mod': return `<div class="form-row">
        <div class="form-group"><label class="form-label">\u2461 Which stat?</label>
          <select id="eff-stat">${C().STATS.map(s=>`<option value="${s}" ${e.stat===s?'selected':''}>${s} \u2014 ${C().STAT_NAMES[s]}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">\u2462 Amount (+/-)</label>
          <input type="number" id="eff-value" value="${e.value??0}"></div>
        <div class="form-group"><label class="form-label">Type</label>
          <select id="eff-source"><option value="flat" ${e.source==='flat'?'selected':''}>Flat</option><option value="percent" ${e.source==='percent'?'selected':''}>Percent</option></select></div>
        </div>${hid('eff-action','stat_mod')}${hid('eff-target','self')}`;

      case 'dr_mod': return `<div class="form-row">
        <div class="form-group"><label class="form-label">\u2461 DR Type</label>
          <select id="eff-drtype">${['physical','magic','chaos','all'].map(d=>`<option value="${d}" ${e.drType===d?'selected':''}>${d}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">\u2462 Amount (+/-)</label>
          <input type="number" id="eff-value" value="${e.value??0}"></div>
        </div>${hid('eff-action','dr_mod')}${hid('eff-source','flat')}${hid('eff-target','self')}`;

      case 'crit_mod': return `<div class="form-row">
        <div class="form-group"><label class="form-label">\u2461 Crit Chance +%</label>
          <input type="number" id="eff-value" value="${e.value??0}"></div>
        <div class="form-group"><label class="form-label">\u2462 Crit Damage +%</label>
          <input type="number" id="eff-critdmg" value="${e.critDamageBonus??0}"></div>
        </div>${hid('eff-action','crit_mod')}${hid('eff-source','flat')}${hid('eff-target','self')}`;

      case 'element_mod': return `<div class="form-row">
        <div class="form-group"><label class="form-label">\u2461 Interaction</label>
          <select id="eff-interaction"><option value="weak" ${e.interaction==='weak'?'selected':''}>Add Weakness</option><option value="resist" ${e.interaction==='resist'?'selected':''}>Add Resistance</option><option value="immune" ${e.interaction==='immune'?'selected':''}>Add Immunity</option></select></div>
        <div class="form-group"><label class="form-label">\u2462 Element</label>
          <select id="eff-element">${C().ELEMENTS.map(el=>`<option value="${el}" ${e.element===el?'selected':''}>${el}</option>`).join('')}</select></div>
        </div>${hid('eff-action','element_mod')}${hid('eff-source','flat')}${hid('eff-value','1')}${hid('eff-target','self')}`;

      case 'damage_mod': return `<div class="form-row">
        <div class="form-group"><label class="form-label">\u2461 Damage bonus %</label>
          <input type="number" id="eff-value" value="${e.value??0}"></div>
        <div class="form-group"><label class="form-label">\u2462 For element</label>
          <select id="eff-element"><option value="">All</option>${C().ELEMENTS.map(el=>`<option value="${el}" ${e.element===el?'selected':''}>${el}</option>`).join('')}</select></div>
        </div>${hid('eff-action','damage_mod')}${hid('eff-source','percent')}${hid('eff-target','self')}`;

      case 'hp_mod': case 'mp_mod': { const r=t==='hp_mod'?'HP':'MP'; return `<div class="form-row">
        <div class="form-group"><label class="form-label">\u2461 ${r} bonus</label>
          <input type="number" id="eff-value" value="${e.value??0}"></div>
        <div class="form-group"><label class="form-label">\u2462 Type</label>
          <select id="eff-source"><option value="flat" ${e.source==='flat'?'selected':''}>Flat</option><option value="percent" ${e.source==='percent'?'selected':''}>Percent</option></select></div>
        </div>${hid('eff-action',t)}${hid('eff-target','self')}`; }

      case 'status_resist_mod': return `<div class="form-row">
        <div class="form-group"><label class="form-label">\u2461 Resist which?</label>
          <select id="eff-statusid">${STATUSES.map(s=>`<option value="${s}" ${e.statusId===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">\u2462 Chance %</label>
          <input type="number" id="eff-value" value="${e.value??0}" min="0" max="100"></div>
        </div>${hid('eff-action','status_resist')}${hid('eff-source','flat')}${hid('eff-target','self')}`;

      default: {
        const lbl = {evasion_mod:'Evasion bonus',accuracy_mod:'Accuracy bonus',movement_mod:'Movement +/- cells',
          range_mod:'Range +/- cells',ap_mod:'AP/turn +/-',cost_mod:'Cost reduction',cooldown_mod:'Cooldown reduction'}[t]||'Value';
        return `<div class="form-group"><label class="form-label">\u2461 ${lbl}</label>
          <input type="number" id="eff-value" value="${e.value??0}"></div>
          ${hid('eff-action',t)}${hid('eff-source','flat')}${hid('eff-target','self')}`;
      }
    }
  }

  function _eventCtx(t, e) {
    const thr = (t==='on_low_hp'||t==='on_hp_threshold') ? `<div class="form-group"><label class="form-label">HP Threshold %</label>
      <input type="number" id="eff-threshold" value="${e.threshold??30}" min="1" max="99"></div>` : '';

    const actOpts = (acts) => acts.map(a=>`<option value="${a}" ${e.action===a?'selected':''}>${AL[a]||a}</option>`).join('');
    const tgtOpts = (tgts) => tgts.map(x=>`<option value="${x}" ${e.target===x?'selected':''}>${TGTL[x]||x}</option>`).join('');
    const srcOpts = Object.entries(SL).map(([v,l])=>`<option value="${v}" ${e.source===v?'selected':''}>${l}</option>`).join('');

    let extra = '';
    const a = e.action || '';
    if (a==='status_apply'||a==='status_remove') extra += `<div class="form-group"><label class="form-label">Which status?</label>
      <select id="eff-statusid">${STATUSES.map(s=>`<option value="${s}" ${e.statusId===s?'selected':''}>${s}</option>`).join('')}</select></div>`;
    if (a==='damage'||a==='heal'||a==='hp_drain') extra += `<div class="form-row">
      <div class="form-group"><label class="form-label">Element</label>
        <select id="eff-element"><option value="">None</option>${C().ELEMENTS.map(el=>`<option value="${el}" ${e.element===el?'selected':''}>${el}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Damage Type</label>
        <select id="eff-dmgtype"><option value="">None</option>${C().DAMAGE_TYPES.map(d=>`<option value="${d}" ${e.damageType===d?'selected':''}>${d}</option>`).join('')}</select></div></div>`;
    if (a==='terrain_create') extra += `<div class="form-group"><label class="form-label">Terrain</label>
      <select id="eff-terrain">${Object.keys(C().TERRAIN_TYPES).map(x=>`<option value="${x}" ${e.terrainType===x?'selected':''}>${x}</option>`).join('')}</select></div>`;
    if (a==='knockback'||a==='pull') extra += `<div class="form-group"><label class="form-label">Distance (cells)</label>
      <input type="number" id="eff-knockdist" value="${e.knockbackDistance??2}" min="1" max="6"></div>`;

    return `<div class="hint-box hint-info">\ud83d\udd14 <b>${TL[t]||t}</b></div>${thr}
      <div class="form-group"><label class="form-label">\u2461 What happens?</label>
        <select id="eff-action">
          <optgroup label="Damage/Heal">${actOpts(['damage','heal','mp_restore','mp_drain','hp_drain'])}</optgroup>
          <optgroup label="Status">${actOpts(['status_apply','status_remove'])}</optgroup>
          <optgroup label="Defensive">${actOpts(['reflect','absorb','counter','revive'])}</optgroup>
          <optgroup label="Position">${actOpts(['knockback','pull','teleport'])}</optgroup>
          <optgroup label="Terrain/Summon">${actOpts(['terrain_create','terrain_remove','summon'])}</optgroup>
          <optgroup label="Utility">${actOpts(['steal_buff','cooldown_reset','ap_grant','extra_action','execute'])}</optgroup>
        </select></div>
      <div class="form-group"><label class="form-label">\u2462 Who is affected?</label>
        <select id="eff-target">
          <optgroup label="Single">${tgtOpts(['self','target','attacker','host'])}</optgroup>
          <optgroup label="Group">${tgtOpts(['all_allies','all_enemies','all'])}</optgroup>
          <optgroup label="Smart">${tgtOpts(['random_enemy','random_ally','lowest_hp_ally','lowest_hp_enemy','adjacent_to_self'])}</optgroup>
        </select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">\u2463 Amount</label>
          <input type="number" id="eff-value" value="${e.value??0}"></div>
        <div class="form-group"><label class="form-label">Based on</label>
          <select id="eff-source">${srcOpts}
            <option value="dice:" ${(e.source||'').startsWith('dice:')?'selected':''}>Dice (custom)</option>
          </select></div></div>
      <div id="eff-src-custom" style="display:${(e.source||'').includes(':')?'block':'none'}">
        <div class="form-group"><label class="form-label">Dice expression</label>
          <input type="text" id="eff-source-str" value="${_x(e.source||'')}" placeholder="dice:2d6+3"></div></div>
      ${extra}`;
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

  // ── CONDITION BUILDER ─────────────────────────────────────────────
  function _buildCond(e) {
    const area = _formEl.querySelector('#eff-cond');
    const conds = [...(e.conditions||[])];
    area._getConds = () => [...conds];
    const render = () => {
      area.innerHTML = '';
      conds.forEach((c,i) => {
        const s = document.createElement('span'); s.className = 'chip';
        s.innerHTML = `${c} <button class="chip-x" data-i="${i}">\u00d7</button>`;
        area.appendChild(s);
        if (i < conds.length-1) { const a2 = document.createElement('span'); a2.className='chip-and'; a2.textContent='AND'; area.appendChild(a2); }
      });
      let sel = '<select class="cond-add"><option value="">+ Add condition...</option>';
      for (const g of COND_GROUPS) {
        sel += `<optgroup label="${g.g}">`;
        for (const [v,l] of g.items) { if (!conds.includes(v)) sel += `<option value="${v}">${l}</option>`; }
        sel += '</optgroup>';
      }
      sel += '<option value="__custom">Custom...</option></select>';
      const wrap = document.createElement('div'); wrap.innerHTML = sel; area.appendChild(wrap.firstChild);
      area.querySelectorAll('.chip-x').forEach(b => { b.onclick=()=>{conds.splice(+b.dataset.i,1);render();}; });
      area.querySelector('.cond-add').onchange = (ev) => {
        const v = ev.target.value;
        if (v==='__custom') { const c=prompt('Condition string:'); if(c){conds.push(c.trim());render();} }
        else if (v) { conds.push(v); render(); }
        ev.target.value = '';
      };
    };
    render();
  }

  // ── CHIP SELECTOR (reusable) ──────────────────────────────────────
  function _buildChips(area, selected, allOpts, key) {
    const items = [...selected];
    area['_get_'+key] = () => [...items];
    const render = () => {
      area.innerHTML = '';
      items.forEach((it,i) => {
        const s = document.createElement('span'); s.className='chip';
        s.innerHTML = `${it} <button class="chip-x" data-i="${i}">\u00d7</button>`;
        area.appendChild(s);
      });
      const sel = document.createElement('select');
      sel.innerHTML = '<option value="">+ Add...</option>' + allOpts.filter(o=>!items.includes(o)).map(o=>`<option value="${o}">${o}</option>`).join('');
      sel.onchange = () => { if(sel.value){items.push(sel.value);render();} };
      area.appendChild(sel);
      area.querySelectorAll('.chip-x').forEach(b=>{b.onclick=()=>{items.splice(+b.dataset.i,1);render();};});
    };
    render();
  }

  // ── SUITABILITY HINT ──────────────────────────────────────────────
  function _suitHint(e) {
    const t = e.trigger||'';
    if (PASSIVE_SET.has(t)) return '<div>\u2705 <b>Good for:</b> Passives, Item bonuses, Character innates, Buff/debuff statuses</div><div>\u26a0\ufe0f Skills use this as a permanent modifier while active \u2014 not a one-time hit</div>';
    if (t==='on_status_tick') return '<div>\u2705 <b>Good for:</b> DoT (Burn/Poison) or HoT (Regen) status definitions</div><div>\ud83d\udca1 Reference this from a status_apply effect in a skill</div>';
    let h = '<div>\u2705 <b>Good for:</b> Skill effects, Triggered passives (on-hit, on-kill), Item procs</div>';
    if (t==='on_hit'||t==='on_crit') h += '<div>\u2694\ufe0f Best on: Skills, Weapons, Combat passives</div>';
    if (t==='on_take_damage') h += '<div>\ud83d\udee1\ufe0f Best on: Armor, Tank passives, Defensive skills</div>';
    return h;
  }

  // ── SAVE ──────────────────────────────────────────────────────────
  function _save(id, tw) {
    const f = _formEl;
    const v = (s) => f.querySelector(s)?.value ?? null;
    const n = (s) => { const el=f.querySelector(s); return el?(Number(el.value)||0):null; };
    const srcSel = v('#eff-source')||'flat';
    const srcStr = v('#eff-source-str');
    const source = srcSel.includes(':')?(srcStr||srcSel):srcSel;
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
