// cui-equipment.js — Equipment loadout helpers for Campaign UI.
//
// Extracted from campaign-ui.js. These resolve slot kinds, allowed
// weapon/armor types, picker options for the equip-item modal, and the
// human-readable summary string a card uses to describe a swap.
// All read from `window.CJS.DataStore` and `CampaignState` directly; no
// closure-scoped state from the main IIFE.

window.CJS = window.CJS || {};
window.CJS.CampaignUIInternal = window.CJS.CampaignUIInternal || {};

window.CJS.CampaignUIInternal.Equipment = (function () {
  'use strict';

  function _DS() { return window.CJS && window.CJS.DataStore; }
  function _CS() { return window.CJS && window.CJS.CampaignState; }
  function _C() { return window.CJS && window.CJS.CONST; }
  function _U() { return window.CJS.CampaignUIInternal.Utils; }
  function _M() { return window.CJS.CampaignUIInternal.Modals; }
  const _esc = (v) => _U().esc(v);
  const _label = (v) => _U().label(v);
  const _desc = (r) => _M().desc(r);
  const _sortOptionLabel = (a, b) => _M().sortOptionLabel(a, b);

  function cleanType(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_ -]+/g, '').replace(/\s+/g, '_');
  }

  function inferType(item, types) {
    const text = [item?.id, item?.name, item?.slot, ...(item?.tags || [])].join(' ').toLowerCase();
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

  function weaponType(item = {}) {
    return cleanType(item.weaponType || item.weaponData?.weaponType || item.type || inferType(item, _C()?.WEAPON_TYPES || []));
  }

  function armorType(item = {}) {
    return cleanType(item.armorType || item.type || inferType(item, _C()?.ARMOR_TYPES || []));
  }

  function accessoryType(item = {}) {
    return cleanType(item.accessoryType || item.type || inferType(item, _C()?.ACCESSORY_TYPES || []));
  }

  function allowedTypes(member = {}, key) {
    const base = _DS().get('characters', member.baseCharacterId) || {};
    const values = [...(base[key] || []), ...(member[key] || [])].map(cleanType).filter(Boolean);
    return Array.from(new Set(values));
  }

  function memberCanUseWeapon(member, item) {
    const allowed = allowedTypes(member, 'allowedWeaponTypes');
    return !allowed.length || allowed.includes(weaponType(item));
  }

  function memberCanUseArmor(member, item) {
    const allowed = allowedTypes(member, 'allowedArmorTypes');
    return !allowed.length || allowed.includes(armorType(item));
  }

  function equipmentKind(item = {}) {
    const slot = item?.slot || '';
    if (item?.equipmentCategory) return item.equipmentCategory;
    if (slot === 'weapon' || slot === 'offhand') return 'weapon';
    if (['armor', 'head', 'body', 'legs', 'feet'].includes(slot)) return 'armor';
    if (['accessory', 'accessory1', 'accessory2'].includes(slot)) return 'accessory';
    return '';
  }

  function equipmentType(item = {}) {
    const kind = equipmentKind(item);
    if (kind === 'weapon') return _label(weaponType(item) || 'weapon');
    if (kind === 'armor') return _label(armorType(item) || 'armor');
    if (kind === 'accessory') return _label(accessoryType(item) || 'accessory');
    return '';
  }

  function weaponSummary(item = {}) {
    const data = item.weaponData || {};
    if (equipmentKind(item) !== 'weapon' || !Object.keys(data).length) return '';
    return [
      data.baseDamage != null ? `Damage ${data.baseDamage}` : '',
      data.range != null ? `Range ${data.range}` : '',
      data.damageType || '',
      data.element ? `${data.element} element` : ''
    ].filter(Boolean).join(', ');
  }

  function effectSummary(item = {}) {
    const effects = item.effects || [];
    if (!effects.length) return '';
    return effects.slice(0, 3).map((effect) => {
      const def = _DS().get('effects', effect.effectId || effect.id) || {};
      const value = effect.overrides?.value ?? effect.value ?? def.value;
      return `${def.name || effect.effectId || effect.id}${value != null ? ` ${Number(value) >= 0 ? '+' : ''}${value}` : ''}`;
    }).join(', ') + (effects.length > 3 ? `, +${effects.length - 3} more` : '');
  }

  function equipmentDesc(item = {}) {
    return [
      _desc(item),
      item.characteristic ? `Characteristic: ${item.characteristic}` : '',
      item.changeNotes ? `Change: ${item.changeNotes}` : '',
      weaponSummary(item),
      effectSummary(item)
    ].filter(Boolean).join(' ');
  }

  function delta(next, prior) {
    const diff = Number(next || 0) - Number(prior || 0);
    return `${Number(next || 0)} (${diff >= 0 ? '+' : ''}${diff})`;
  }

  function slotKind(slot) {
    if (slot === 'weapon') return 'weapon';
    if (slot === 'armor') return 'armor';
    return 'accessory';
  }

  function slotLabel(slot) {
    if (slot === 'accessory1') return 'Accessory 1';
    if (slot === 'accessory2') return 'Accessory 2';
    return _label(slot);
  }

  function normalizeEquipmentSlots(rawSlots, equipment = []) {
    const slots = {
      weapon: rawSlots?.weapon || null,
      armor: rawSlots?.armor || null,
      accessory1: rawSlots?.accessory1 || null,
      accessory2: rawSlots?.accessory2 || null
    };
    const used = new Set(Object.values(slots).filter(Boolean));
    for (const itemId of equipment || []) {
      if (!itemId || used.has(itemId)) continue;
      const item = _DS().get('items', itemId);
      const kind = equipmentKind(item);
      if (kind === 'weapon' && !slots.weapon) slots.weapon = itemId;
      else if (kind === 'armor' && !slots.armor) slots.armor = itemId;
      else if (kind === 'accessory' && !slots.accessory1) slots.accessory1 = itemId;
      else if (kind === 'accessory' && !slots.accessory2) slots.accessory2 = itemId;
      used.add(itemId);
    }
    return slots;
  }

  function equipmentChangeDescription(member, slot, item, includeCurrent = true) {
    const slots = normalizeEquipmentSlots(member.equipmentSlots, member.equipment);
    const current = _DS().get('items', slots[slot]);
    const parts = [];
    if (includeCurrent) parts.push(current ? `Replaces ${current.name || slots[slot]}` : 'Fills empty slot');
    if (equipmentKind(item) === 'weapon') {
      const next = item.weaponData || {};
      const prior = current?.weaponData || {};
      if (next.baseDamage != null || prior.baseDamage != null) parts.push(`Damage ${delta(next.baseDamage, prior.baseDamage)}`);
      if (next.range != null || prior.range != null) parts.push(`Range ${delta(next.range, prior.range)}`);
      if (next.element || prior.element) parts.push(`Element ${next.element || 'None'}`);
    }
    if ((item.effects || []).length || (current?.effects || []).length) {
      parts.push(`Effects ${(current?.effects || []).length} -> ${(item.effects || []).length}`);
    }
    if (item.changeNotes) parts.push(item.changeNotes);
    return parts.filter(Boolean).join(' | ');
  }

  function equipmentOptions(member, slot) {
    const kind = slotKind(slot);
    const slots = normalizeEquipmentSlots(member.equipmentSlots, member.equipment);
    const currentId = slots[slot];
    const otherAccessorySlot = slot === 'accessory1' ? 'accessory2' : 'accessory1';
    const otherAccessory = kind === 'accessory' ? _DS().get('items', slots[otherAccessorySlot]) : null;
    const otherAccessoryType = otherAccessory ? accessoryType(otherAccessory) : '';
    const state = _CS().getState() || {};
    const world = state.currentWorld;
    const itemInventory = state.inventory?.items || {};
    const equipmentInventory = state.inventory?.equipment || {};
    const inWorld = (entry) => !entry._world || entry._world === world || entry._scope === 'universal' || entry._scope === 'system';
    return _DS().getAllAsArray('items')
      .filter((entry) => entry?.id && inWorld(entry) && equipmentKind(entry) === kind)
      .filter((entry) => {
        if (kind === 'weapon') return memberCanUseWeapon(member, entry);
        if (kind === 'armor') return memberCanUseArmor(member, entry);
        if (kind === 'accessory' && otherAccessoryType && entry.id !== currentId) return accessoryType(entry) !== otherAccessoryType;
        return true;
      })
      .map((entry) => ({
        value: entry.id,
        label: entry.name || entry.id,
        sub: [equipmentType(entry), entry.rarity, `Owned: ${itemInventory[entry.id] || equipmentInventory[entry.id] || 0}`].filter(Boolean).join(' | '),
        description: equipmentDesc(entry),
        change: equipmentChangeDescription(member, slot, entry, true),
        group: slotLabel(slot),
        tags: [entry.id, entry.name, equipmentType(entry), equipmentKind(entry), ...(entry.tags || [])].filter(Boolean)
      }))
      .sort(_sortOptionLabel);
  }

  function equipmentPickerItem(option) {
    return `
      <div class="campaign-picker-option campaign-equipment-option">
        <strong>${_esc(option.label || option.value)}</strong>
        ${option.sub ? `<small>${_esc(option.sub)}</small>` : ''}
        ${option.description ? `<span>${_esc(option.description)}</span>` : ''}
        ${option.change ? `<span class="campaign-picker-change">${_esc(option.change)}</span>` : ''}
      </div>
    `;
  }

  return Object.freeze({
    cleanType,
    inferType,
    weaponType,
    armorType,
    accessoryType,
    allowedTypes,
    memberCanUseWeapon,
    memberCanUseArmor,
    equipmentKind,
    equipmentType,
    weaponSummary,
    effectSummary,
    equipmentDesc,
    delta,
    slotKind,
    slotLabel,
    normalizeEquipmentSlots,
    equipmentChangeDescription,
    equipmentOptions,
    equipmentPickerItem
  });
})();
