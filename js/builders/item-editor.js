// item-editor.js
// UI: build items by picking effects + slot + rarity + weapon data.
// Reads: data-store.js, effect-registry.js, ui-helpers.js, constants.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.ItemEditor = (() => {
  'use strict';

  const C  = () => window.CJS.CONST;
  const DS = () => window.CJS.DataStore;
  const ER = () => window.CJS.EffectRegistry;
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
            <input type="search" id="itm-search" placeholder="Search items..." style="flex:1">
            <button class="btn btn-primary btn-sm" id="itm-new">+ New</button>
          </div>
          <div class="data-list" id="itm-list" style="flex:1;max-height:none"></div>
        </div>
        <div style="flex:1;overflow-y:auto" id="itm-form-area">
          <div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select an item or create a new one</div>
        </div>
      </div>
    `;
    _listEl = _container.querySelector('#itm-list');
    _formEl = _container.querySelector('#itm-form-area');
    _container.querySelector('#itm-new').onclick = _createNew;
    _container.querySelector('#itm-search').oninput = (e) => _renderList(e.target.value);
    _renderList();
  }

  function _renderList(q) {
    const items = CM()?.getVisibleItems?.('items', q) || (q ? DS().search('items', q) : DS().getAllAsArray('items'));
    UI().renderDataList({
      container: _listEl, items, activeId: _activeId,
      onSelect: (i) => _load(i.id),
      renderItem: (i) => {
        const color = C().RARITY_COLORS[i.rarity] || 'var(--text-dim)';
        return `<span class="item-icon">${i.icon||'📦'}</span><div><div class="item-name" style="color:${color}">${i.name||i.id}</div><div class="item-sub">${i.slot||''} · ${i.rarity||''}</div></div>`;
      }
    });
  }

  function _createNew() {
    const id = DS().create('items', {
      name: 'New Item', icon: '📦', slot: 'weapon', rarity: 'Common',
      effects: [], weaponData: null, portrait: '', description: ''
    });
    _activeId = id; _renderList(); _load(id);
    UI().toast('Item created', 'success');
  }

  function _load(id) {
    _activeId = id;
    _renderList(_container.querySelector('#itm-search')?.value);
    const item = DS().get('items', id);
    if (!item) return;
    _renderForm(item);
  }

  function _renderForm(item) {
    const isWeapon = item.slot === 'weapon';
    _formEl.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title" style="color:${C().RARITY_COLORS[item.rarity]||''}">${item.icon||'📦'} ${item.name||'Unnamed'}</span>
          <div class="btn-group">
            <button class="btn btn-ghost btn-sm" id="itm-dup">Duplicate</button>
            <button class="btn btn-danger btn-sm" id="itm-del">Delete</button>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Name</label><input type="text" id="itm-name" value="${_esc(item.name||'')}"></div>
          <div class="form-group" style="flex:0 0 80px"><label class="form-label">Icon</label><input type="text" id="itm-icon" value="${_esc(item.icon||'📦')}" style="text-align:center;font-size:1.2em"></div>
        </div>
        <div id="itm-portrait-area" style="margin-bottom:8px"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Slot</label>
            <select id="itm-slot">${C().EQUIPMENT_SLOTS.map(s=>`<option value="${s}" ${item.slot===s?'selected':''}>${s}</option>`).join('')}
              <option value="consumable" ${item.slot==='consumable'?'selected':''}>consumable</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Rarity</label>
            <select id="itm-rarity">${C().RARITIES.map(r=>`<option value="${r}" ${item.rarity===r?'selected':''}>${r}</option>`).join('')}</select>
          </div>
        </div>

        <div id="itm-weapon-section" style="display:${isWeapon?'block':'none'}">
          <h3>Weapon Data</h3>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Base Damage</label><input type="number" id="itm-wdmg" value="${item.weaponData?.baseDamage||0}" min="0" style="width:100%"></div>
            <div class="form-group"><label class="form-label">Damage Type</label>
              <select id="itm-wtype">${C().DAMAGE_TYPES.map(d=>`<option value="${d}" ${item.weaponData?.damageType===d?'selected':''}>${d}</option>`).join('')}</select>
            </div>
            <div class="form-group"><label class="form-label">Element</label>
              <select id="itm-welem"><option value="">— None —</option>${C().ELEMENTS.map(e=>`<option value="${e}" ${item.weaponData?.element===e?'selected':''}>${e}</option>`).join('')}</select>
            </div>
            <div class="form-group"><label class="form-label">Range</label><input type="number" id="itm-wrange" value="${item.weaponData?.range||1}" min="1" max="8" style="width:100%"></div>
          </div>
        </div>

        <h3>Effects (active while equipped / on use)</h3>
        <div id="itm-effects-area"></div>

        <h3>Granted Skills (item gives the user these active skills)</h3>
        <div class="hint-box">💡 Skills listed here become available to any character who equips this item. Remove the item = lose the skill.</div>
        <div id="itm-skills-area"></div>

        <div class="form-group mt-md"><label class="form-label">Description</label><textarea id="itm-desc" rows="2">${_esc(item.description||'')}</textarea></div>

        <div class="card" style="background:var(--surface2);margin-top:8px" id="itm-preview"></div>
        <div style="margin-top:12px"><button class="btn btn-success" id="itm-save">💾 Save Item</button></div>
      </div>
    `;

    let portraitWidget = null;
    const portraitArea = _formEl.querySelector('#itm-portrait-area');
    if (portraitArea && PP()) {
      portraitWidget = PP().createWidget({
        currentPath: item.portrait || '',
        category: 'items',
        fallbackIcon: item.icon || '?'
      });
      portraitArea.appendChild(portraitWidget.el);

      const iconInput = _formEl.querySelector('#itm-icon');
      const syncPortraitFallback = () => portraitWidget?.setFallbackIcon(iconInput?.value || '?');
      iconInput?.addEventListener('input', syncPortraitFallback);
      iconInput?.addEventListener('change', syncPortraitFallback);
    }

    // Toggle weapon section on slot change
    _formEl.querySelector('#itm-slot').onchange = (e) => {
      _formEl.querySelector('#itm-weapon-section').style.display = e.target.value === 'weapon' ? 'block' : 'none';
    };

    const effectBuilder = UI().createEffectListBuilder({ effects: item.effects || [], onChange: () => _preview(effectBuilder) });
    _formEl.querySelector('#itm-effects-area').appendChild(effectBuilder);

    // Granted skills picker
    const skillsArea = _formEl.querySelector('#itm-skills-area');
    const grantedSkills = [...(item.grantedSkills || [])];
    _renderSkillPicker(skillsArea, grantedSkills);

    _preview(effectBuilder);

    _formEl.querySelector('#itm-save').onclick = () => _save(item.id, effectBuilder, grantedSkills, portraitWidget, item.portrait || '');
    _formEl.querySelector('#itm-dup').onclick = () => { const nid = DS().duplicate('items',item.id); if(nid){_activeId=nid;_renderList();_load(nid);UI().toast('Duplicated','success');} };
    _formEl.querySelector('#itm-del').onclick = () => { UI().confirm(`Delete "${item.name}"?`,()=>{DS().remove('items',item.id);_activeId=null;_renderList();_formEl.innerHTML='<div class="card" style="text-align:center;color:var(--text-mute);padding:40px">Select an item</div>';UI().toast('Deleted','info');}); };
  }

  function _renderSkillPicker(area, grantedSkills) {
    const render = () => {
      area.innerHTML = '';
      grantedSkills.forEach((sid, i) => {
        const skill = DS().get('skills', sid);
        const name = skill ? `${skill.icon||'⚔️'} ${skill.name}` : sid;
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.innerHTML = `${name} <button class="chip-x" data-i="${i}">×</button>`;
        area.appendChild(chip);
      });
      // Add dropdown
      const allSkills = DS().getAllAsArray('skills');
      const available = allSkills.filter(s => !grantedSkills.includes(s.id));
      if (available.length > 0) {
        const sel = document.createElement('select');
        sel.innerHTML = '<option value="">+ Add skill...</option>' +
          available.map(s => `<option value="${s.id}">${s.icon||'⚔️'} ${s.name||s.id} (${s.ap||0}AP, ${s.mp||0}MP)</option>`).join('');
        sel.onchange = () => { if (sel.value) { grantedSkills.push(sel.value); render(); } };
        area.appendChild(sel);
      }
      area.querySelectorAll('.chip-x').forEach(btn => {
        btn.onclick = () => { grantedSkills.splice(+btn.dataset.i, 1); render(); };
      });
    };
    render();
  }

  function _preview(effectBuilder) {
    const el = _formEl.querySelector('#itm-preview');
    if (!el || !effectBuilder) return;
    const resolved = ER().resolveRefs(effectBuilder._getEffects());
    const descs = resolved.map(e => ER().autoDescribe(e));
    el.innerHTML = `<div class="dim" style="font-size:0.82rem"><b>Effects:</b> ${descs.join(', ')||'None'} | <b>ID:</b> ${_activeId}</div>`;
  }

  function _save(id, effectBuilder, grantedSkills, portraitWidget, currentPortrait) {
    const f = _formEl;
    const slot = f.querySelector('#itm-slot').value;
    const obj = {
      id, name: f.querySelector('#itm-name').value, icon: f.querySelector('#itm-icon').value,
      portrait: portraitWidget ? portraitWidget.getValue() : currentPortrait,
      slot, rarity: f.querySelector('#itm-rarity').value,
      effects: effectBuilder._getEffects(),
      grantedSkills: grantedSkills || [],
      weaponData: slot === 'weapon' ? {
        baseDamage: Number(f.querySelector('#itm-wdmg').value)||0,
        damageType: f.querySelector('#itm-wtype').value,
        element: f.querySelector('#itm-welem').value || null,
        range: Number(f.querySelector('#itm-wrange').value)||1
      } : null,
      description: f.querySelector('#itm-desc').value
    };
    DS().replace('items', id, obj);
    _renderList(); _load(id);
    UI().toast('Item saved', 'success');
  }

  function _esc(s) { return String(s).replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function refresh() { if (_container) _renderList(); }
  return Object.freeze({ init, refresh });
})();
