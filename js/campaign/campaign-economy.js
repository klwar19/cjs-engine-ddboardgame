// campaign-economy.js
// Shop and rest economy helpers for Campaign Mode.

window.CJS = window.CJS || {};

window.CJS.CampaignEconomy = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const DS = () => window.CJS.DataStore;

  function renderShops() {
    const state = CS().getState();
    const shops = DS().getAllAsArray('shops')
      .filter((shop) => !shop._world || shop._world === state.currentWorld || shop.world === state.currentWorld)
      .filter((shop) => _shopOpen(shop, state));
    if (!shops.length) {
      return '<section class="campaign-panel"><h3>Shops</h3><div class="campaign-empty">No shop is open for this world and phase. Use GM Override for manual buys and sells.</div></section>';
    }
    return `<div class="campaign-tab-grid">${shops.map((shop) => _renderShop(shop, state)).join('')}</div>`;
  }

  function _renderShop(shop, state) {
    const currency = shop.currency || `${shop.world || 'haven'}_gold`;
    const stock = shop.stock || [];
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h3>${_esc(shop.name || shop.id)}</h3>
          <span class="campaign-pill">${_esc(_currencyLabel(currency))}</span>
        </div>
        <div class="campaign-muted">${_esc(shop.description || '')}</div>
        ${stock.length ? stock.map((item, index) => {
          const itemCurrency = item.currency || currency;
          const canBuy = _canBuy(state, item, itemCurrency);
          const farmStock = item.type === 'seed' || item.type === 'farmFertilizer';
          return `
          <div class="campaign-row">
            <div>
              <strong>${_esc(_recordName(item.type, item.id))}</strong>
              <div class="campaign-muted">${_esc(item.id)} | stock ${item.qty ?? 'manual'}</div>
              ${_formatBundle(item.requires, 'Needs')}
              ${_formatBundle(item.costs || item.costBundle, 'Consumes')}
            </div>
            <div class="campaign-row-actions">
              <span class="campaign-pill">${Number(item.price || 0)} ${_esc(_currencyLabel(itemCurrency))}</span>
              <button class="campaign-action" data-shop-buy="1" data-shop-id="${_escAttr(shop.id)}" data-stock-index="${index}" data-id="${_escAttr(item.id)}" data-type="${_escAttr(item.type || 'item')}" data-price="${Number(item.price || 0)}" data-currency="${_escAttr(itemCurrency)}" ${canBuy ? '' : 'disabled'}>Buy</button>
              ${farmStock ? '' : `<button class="campaign-action" data-shop-sell="1" data-id="${_escAttr(item.id)}" data-type="${_escAttr(item.type || 'item')}" data-price="${Math.floor(Number(item.price || 0) / 2)}" data-currency="${_escAttr(itemCurrency)}">Sell</button>`}
            </div>
          </div>
        `; }).join('') : '<div class="campaign-empty">No stock yet.</div>'}
      </section>
    `;
  }

  function renderRest() {
    const run = CS().getState().activeScenarioRun;
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head"><h3>Rest</h3></div>
        <div class="campaign-action-grid">
          <button class="campaign-action" data-full-rest="1">Full Rest</button>
          <button class="campaign-action" data-camp-rest="1" ${run ? '' : 'disabled'}>Camp Rest</button>
        </div>
        <div class="campaign-muted">Camp rest consumes one scenario rest use, restores partial HP/MP, and can increase danger.</div>
      </section>
    `;
  }

  function _recordName(type, id) {
    if (type === 'seed') return DS().get('crops', id)?.name || id;
    if (type === 'farmFertilizer') return DS().get('materials', id)?.name || id;
    const bucket = type === 'material' ? 'materials' : type === 'food' ? 'food' : 'items';
    return DS().get(bucket, id)?.name || id;
  }

  function _shopOpen(shop, state) {
    const phaseType = state?.phase?.type || '';
    const phases = shop.phaseTypes || shop.allowedPhases || shop.phases || shop.openPhaseTypes;
    if (Array.isArray(phases) && phases.length) return phases.includes(phaseType);
    if (shop.phaseType || shop.allowedPhase || shop.openPhase) {
      return [shop.phaseType, shop.allowedPhase, shop.openPhase].filter(Boolean).includes(phaseType);
    }
    return true;
  }

  function _canBuy(state, item, currency) {
    if ((state.currencies?.[currency] || 0) < Number(item.price || 0)) return false;
    return _hasBundle(state, item.requires || {}) && _hasBundle(state, item.costs || item.costBundle || {});
  }

  function _hasBundle(state, bundle) {
    for (const [id, qty] of Object.entries(bundle?.currencies || {})) {
      if ((state.currencies?.[id] || 0) < Number(qty || 0)) return false;
    }
    for (const [bucket, records] of Object.entries({
      items: bundle?.items || {},
      materials: bundle?.materials || {},
      food: bundle?.food || {},
      questItems: bundle?.questItems || {}
    })) {
      for (const [id, qty] of Object.entries(records)) {
        if ((state.inventory?.[bucket]?.[id] || 0) < Number(qty || 0)) return false;
      }
    }
    return true;
  }

  function _formatBundle(bundle, label) {
    const parts = [];
    for (const [id, qty] of Object.entries(bundle?.currencies || {})) parts.push(`${qty} ${_currencyLabel(id)}`);
    for (const [id, qty] of Object.entries(bundle?.items || {})) parts.push(`${qty} ${_recordName('item', id)}`);
    for (const [id, qty] of Object.entries(bundle?.materials || {})) parts.push(`${qty} ${_recordName('material', id)}`);
    for (const [id, qty] of Object.entries(bundle?.food || {})) parts.push(`${qty} ${_recordName('food', id)}`);
    for (const [id, qty] of Object.entries(bundle?.questItems || {})) parts.push(`${qty} ${id}`);
    return parts.length ? `<div class="campaign-muted">${_esc(label)}: ${_esc(parts.join(', '))}</div>` : '';
  }

  function _currencyLabel(id) {
    const value = String(id || '').toLowerCase();
    if (value === 'jp' || value === 'jester_points') return 'Jester Points';
    if (value.endsWith('_gold')) return `${_label(value.replace(/_gold$/, ''))} Gold`;
    return _label(id);
  }

  function _label(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function _esc(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function _escAttr(value) { return _esc(value); }

  return Object.freeze({ renderShops, renderRest });
})();
