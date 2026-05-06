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
      weaponType: 'sword', armorType: '', accessoryType: '',
      characteristic: '', changeNotes: '',
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
    const gearKind = _gearKind(item);
    const isWeapon = gearKind === 'weapon';
    const isArmor = gearKind === 'armor';
    const isAccessory = gearKind === 'accessory';
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
          <div class="form-group" style="flex:0 0 240px"><label class="form-label">Icon (emoji or image)</label>
            <div class="cjs-icon-upload" data-icon-upload data-icon-target="itm-icon" data-icon-kind="item">
              <span class="cjs-icon-preview" data-icon-preview></span>
              <input type="text" id="itm-icon" value="${_esc(item.icon||'📦')}" placeholder="emoji or image URL">
              <button type="button" class="btn btn-sm btn-ghost" data-icon-upload-trigger title="Upload image">📁</button>
              <input type="file" accept="image/*" data-icon-upload-input style="display:none">
            </div>
          </div>
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

        <h3>Equipment Type</h3>
        <div class="form-row">
          <div class="form-group" id="itm-weapon-type-wrap" style="display:${isWeapon?'block':'none'}">
            <label class="form-label">Weapon Type</label>
            <input type="text" id="itm-weapon-type" list="itm-weapon-types" value="${_esc(_weaponType(item) || 'sword')}" placeholder="sword, bow, staff...">
            <datalist id="itm-weapon-types">${_typeOptions(C().WEAPON_TYPES || [])}</datalist>
          </div>
          <div class="form-group" id="itm-armor-type-wrap" style="display:${isArmor?'block':'none'}">
            <label class="form-label">Armor Type</label>
            <input type="text" id="itm-armor-type" list="itm-armor-types" value="${_esc(_armorType(item) || 'light')}" placeholder="light, heavy, robe...">
            <datalist id="itm-armor-types">${_typeOptions(C().ARMOR_TYPES || [])}</datalist>
          </div>
          <div class="form-group" id="itm-accessory-type-wrap" style="display:${isAccessory?'block':'none'}">
            <label class="form-label">Accessory Type</label>
            <input type="text" id="itm-accessory-type" list="itm-accessory-types" value="${_esc(_accessoryType(item) || 'ring')}" placeholder="ring, amulet, charm...">
            <datalist id="itm-accessory-types">${_typeOptions(C().ACCESSORY_TYPES || [])}</datalist>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Characteristic</label><input type="text" id="itm-characteristic" value="${_esc(item.characteristic || '')}" placeholder="fast bow, heavy defense, magic focus..."></div>
          <div class="form-group"><label class="form-label">Change Notes</label><input type="text" id="itm-change" value="${_esc(item.changeNotes || '')}" placeholder="+S, longer range, grants skill, etc."></div>
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
        id: item.id,
        name: item.name,
        fallbackIcon: item.icon || '?'
      });
      portraitArea.appendChild(portraitWidget.el);

      const iconInput = _formEl.querySelector('#itm-icon');
      const syncPortraitFallback = () => portraitWidget?.setFallbackIcon(iconInput?.value || '?');
      iconInput?.addEventListener('input', syncPortraitFallback);
      iconInput?.addEventListener('change', syncPortraitFallback);
    }

    // Toggle equipment-specific fields on slot change
    const slotSelect = _formEl.querySelector('#itm-slot');

    const effectBuilder = UI().createEffectListBuilder({ effects: item.effects || [], onChange: () => _preview(effectBuilder) });
    _formEl.querySelector('#itm-effects-area').appendChild(effectBuilder);
    slotSelect.onchange = (e) => {
      _syncEquipmentFields(e.target.value);
      _preview(effectBuilder);
    };
    ['#itm-weapon-type', '#itm-armor-type', '#itm-accessory-type', '#itm-change'].forEach((selector) => {
      _formEl.querySelector(selector)?.addEventListener('input', () => _preview(effectBuilder));
    });

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
    const slot = _formEl.querySelector('#itm-slot')?.value || '';
    const type = _typeForCurrentForm(slot);
    const change = _formEl.querySelector('#itm-change')?.value || '';
    el.innerHTML = `<div class="dim" style="font-size:0.82rem"><b>${_gearKindFromSlot(slot)}:</b> ${type || 'untyped'} ${change ? `| <b>Change:</b> ${_esc(change)}` : ''} | <b>Effects:</b> ${descs.join(', ')||'None'} | <b>ID:</b> ${_activeId}</div>`;
  }

  function _save(id, effectBuilder, grantedSkills, portraitWidget, currentPortrait) {
    const f = _formEl;
    const slot = f.querySelector('#itm-slot').value;
    const equipmentCategory = _gearKindFromSlot(slot);
    const weaponType = _cleanType(f.querySelector('#itm-weapon-type')?.value || '');
    const armorType = _cleanType(f.querySelector('#itm-armor-type')?.value || '');
    const accessoryType = _cleanType(f.querySelector('#itm-accessory-type')?.value || '');
    const obj = {
      id, name: f.querySelector('#itm-name').value, icon: f.querySelector('#itm-icon').value,
      portrait: portraitWidget ? portraitWidget.getValue() : currentPortrait,
      slot, rarity: f.querySelector('#itm-rarity').value,
      equipmentCategory,
      weaponType: equipmentCategory === 'weapon' ? (weaponType || 'sword') : '',
      armorType: equipmentCategory === 'armor' ? (armorType || 'light') : '',
      accessoryType: equipmentCategory === 'accessory' ? (accessoryType || 'ring') : '',
      characteristic: f.querySelector('#itm-characteristic').value,
      changeNotes: f.querySelector('#itm-change').value,
      effects: effectBuilder._getEffects(),
      grantedSkills: grantedSkills || [],
      weaponData: equipmentCategory === 'weapon' ? {
        baseDamage: Number(f.querySelector('#itm-wdmg').value)||0,
        damageType: f.querySelector('#itm-wtype').value,
        element: f.querySelector('#itm-welem').value || null,
        range: Number(f.querySelector('#itm-wrange').value)||1,
        weaponType: weaponType || 'sword'
      } : null,
      description: f.querySelector('#itm-desc').value
    };
    DS().replace('items', id, obj);
    _renderList(); _load(id);
    UI().toast('Item saved', 'success');
  }

  function _syncEquipmentFields(slot) {
    const kind = _gearKindFromSlot(slot);
    const show = (id, active) => {
      const el = _formEl.querySelector(id);
      if (el) el.style.display = active ? 'block' : 'none';
    };
    show('#itm-weapon-section', kind === 'weapon');
    show('#itm-weapon-type-wrap', kind === 'weapon');
    show('#itm-armor-type-wrap', kind === 'armor');
    show('#itm-accessory-type-wrap', kind === 'accessory');
  }

  function _gearKind(item = {}) {
    return item.equipmentCategory || _gearKindFromSlot(item.slot);
  }

  function _gearKindFromSlot(slot) {
    if (slot === 'weapon' || slot === 'offhand') return 'weapon';
    if (['armor', 'head', 'body', 'legs', 'feet'].includes(slot)) return 'armor';
    if (['accessory', 'accessory1', 'accessory2'].includes(slot)) return 'accessory';
    return slot || 'item';
  }

  function _weaponType(item = {}) {
    return _cleanType(item.weaponType || item.weaponData?.weaponType || item.type || _inferType(item, C().WEAPON_TYPES || []));
  }

  function _armorType(item = {}) {
    return _cleanType(item.armorType || item.type || _inferType(item, C().ARMOR_TYPES || []));
  }

  function _accessoryType(item = {}) {
    return _cleanType(item.accessoryType || item.type || _inferType(item, C().ACCESSORY_TYPES || []));
  }

  function _inferType(item, types) {
    const text = [item.id, item.name, item.slot, ...(item.tags || [])].join(' ').toLowerCase();
    const aliases = {
      blade: 'sword', longsword: 'sword', shortsword: 'sword', katana: 'sword',
      fang: 'dagger', knife: 'dagger',
      longbow: 'bow', shortbow: 'bow',
      fist: 'knuckles', claw: 'knuckles', gauntlet: 'knuckles',
      rod: 'staff', tome: 'staff',
      leather: 'light', cloak: 'light', boots: 'light', cloth: 'robe', mail: 'heavy', plate: 'heavy',
      pendant: 'amulet', necklace: 'amulet', coin: 'charm', core: 'trinket'
    };
    for (const [alias, type] of Object.entries(aliases)) {
      if ((types || []).includes(type) && text.includes(alias)) return type;
    }
    return (types || []).find((type) => text.includes(type)) || '';
  }

  function _typeForCurrentForm(slot) {
    const kind = _gearKindFromSlot(slot);
    if (kind === 'weapon') return _cleanType(_formEl.querySelector('#itm-weapon-type')?.value || '');
    if (kind === 'armor') return _cleanType(_formEl.querySelector('#itm-armor-type')?.value || '');
    if (kind === 'accessory') return _cleanType(_formEl.querySelector('#itm-accessory-type')?.value || '');
    return '';
  }

  function _typeOptions(types) {
    return types.map((type) => `<option value="${_esc(type)}"></option>`).join('');
  }

  function _cleanType(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_ -]+/g, '').replace(/\s+/g, '_');
  }

  function _esc(s) { return String(s).replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function refresh() { if (_container) _renderList(); }
  return Object.freeze({ init, refresh });
})();
