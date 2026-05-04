// campaign-inventory.js
// Inventory tab renderer and small helpers.

window.CJS = window.CJS || {};

window.CJS.CampaignInventory = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const DS = () => window.CJS.DataStore;

  const BUCKETS = [
    ['items', 'Items'],
    ['materials', 'Materials'],
    ['food', 'Food'],
    ['questItems', 'Quest Items'],
    ['equipment', 'Equipment Refs']
  ];

  function render() {
    const state = CS().getState();
    return `
      <div class="campaign-tab-grid">
        ${BUCKETS.map(([bucket, label]) => _renderBucket(state, bucket, label)).join('')}
      </div>
    `;
  }

  function _renderBucket(state, bucket, label) {
    const entries = Object.entries(state.inventory?.[bucket] || {}).filter(([, qty]) => qty > 0);
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h3>${_esc(label)}</h3>
          <button class="campaign-icon-btn" title="Add ${_esc(label)}" data-campaign-action="quick-add-inventory" data-bucket="${_escAttr(bucket)}">+</button>
        </div>
        ${entries.length ? entries.map(([id, qty]) => `
          <div class="campaign-row">
            <div>
              <strong>${_esc(_nameFor(bucket, id))}</strong>
              <div class="campaign-muted">${_esc(_metaFor(bucket, id))}</div>
              ${_descriptionFor(bucket, id) ? `<div class="campaign-muted">${_esc(_descriptionFor(bucket, id))}</div>` : ''}
            </div>
            <div class="campaign-row-actions">
              <span class="campaign-pill">x${qty}</span>
              <button class="campaign-icon-btn" title="Add one" data-campaign-action="inventory-delta" data-bucket="${_escAttr(bucket)}" data-id="${_escAttr(id)}" data-delta="1">+</button>
              <button class="campaign-icon-btn" title="Remove one" data-campaign-action="inventory-delta" data-bucket="${_escAttr(bucket)}" data-id="${_escAttr(id)}" data-delta="-1">-</button>
            </div>
          </div>
        `).join('') : '<div class="campaign-empty">Empty.</div>'}
      </section>
    `;
  }

  function _nameFor(bucket, id) {
    return _recordFor(bucket, id)?.name || id;
  }

  function _metaFor(bucket, id) {
    const record = _recordFor(bucket, id);
    return [id, _equipmentMeta(record), record?.type, record?.rarity, record?._world].filter(Boolean).join(' | ');
  }

  function _descriptionFor(bucket, id) {
    const record = _recordFor(bucket, id);
    return [
      record?.description || record?.desc || record?.flavor || record?.notes || '',
      record?.characteristic ? `Characteristic: ${record.characteristic}` : '',
      record?.changeNotes ? `Change: ${record.changeNotes}` : ''
    ].filter(Boolean).join(' ');
  }

  function _equipmentMeta(record = {}) {
    const kind = _equipmentKind(record);
    if (!kind) return '';
    const type = kind === 'weapon' ? record.weaponType || record.weaponData?.weaponType
      : kind === 'armor' ? record.armorType
        : record.accessoryType;
    return [kind, type].filter(Boolean).join(': ');
  }

  function _equipmentKind(record = {}) {
    const slot = record?.slot || '';
    if (record?.equipmentCategory) return record.equipmentCategory;
    if (slot === 'weapon' || slot === 'offhand') return 'weapon';
    if (['armor', 'head', 'body', 'legs', 'feet'].includes(slot)) return 'armor';
    if (['accessory', 'accessory1', 'accessory2'].includes(slot)) return 'accessory';
    return '';
  }

  function _recordFor(bucket, id) {
    const type = bucket === 'materials' ? 'materials'
      : bucket === 'food' ? 'food'
        : bucket === 'questItems' ? 'items'
          : 'items';
    return DS().get(type, id);
  }

  function _esc(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function _escAttr(value) { return _esc(value); }

  return Object.freeze({ render });
})();
