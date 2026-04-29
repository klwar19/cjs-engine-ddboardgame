// campaign-economy.js
// Shop and rest economy helpers for Campaign Mode.

window.CJS = window.CJS || {};

window.CJS.CampaignEconomy = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const DS = () => window.CJS.DataStore;

  function renderShops() {
    const state = CS().getState();
    const shops = DS().getAllAsArray('shops').filter((shop) => !shop._world || shop._world === state.currentWorld || shop.world === state.currentWorld);
    if (!shops.length) {
      return '<section class="campaign-panel"><h3>Shops</h3><div class="campaign-empty">No shop data for this world yet. Use GM Override for manual buys and sells.</div></section>';
    }
    return `<div class="campaign-tab-grid">${shops.map(_renderShop).join('')}</div>`;
  }

  function _renderShop(shop) {
    const currency = shop.currency || `${shop.world || 'haven'}_gold`;
    const stock = shop.stock || [];
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h3>${_esc(shop.name || shop.id)}</h3>
          <span class="campaign-pill">${_esc(currency)}</span>
        </div>
        <div class="campaign-muted">${_esc(shop.description || '')}</div>
        ${stock.length ? stock.map((item) => `
          <div class="campaign-row">
            <div>
              <strong>${_esc(_recordName(item.type, item.id))}</strong>
              <div class="campaign-muted">${_esc(item.id)} | stock ${item.qty ?? 'manual'}</div>
            </div>
            <div class="campaign-row-actions">
              <span class="campaign-pill">${item.price || 0}</span>
              <button class="campaign-action" data-campaign-action="shop-buy" data-id="${_escAttr(item.id)}" data-type="${_escAttr(item.type || 'item')}" data-price="${Number(item.price || 0)}" data-currency="${_escAttr(currency)}">Buy</button>
              <button class="campaign-action" data-campaign-action="shop-sell" data-id="${_escAttr(item.id)}" data-type="${_escAttr(item.type || 'item')}" data-price="${Math.floor(Number(item.price || 0) / 2)}" data-currency="${_escAttr(currency)}">Sell</button>
            </div>
          </div>
        `).join('') : '<div class="campaign-empty">No stock yet.</div>'}
      </section>
    `;
  }

  function renderRest() {
    const run = CS().getState().activeScenarioRun;
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head"><h3>Rest</h3></div>
        <div class="campaign-action-grid">
          <button class="campaign-action" data-campaign-action="full-rest">Full Rest</button>
          <button class="campaign-action" data-campaign-action="camp-rest" ${run ? '' : 'disabled'}>Camp Rest</button>
        </div>
        <div class="campaign-muted">Camp rest consumes one scenario rest use, restores partial HP/MP, and can increase danger.</div>
      </section>
    `;
  }

  function _recordName(type, id) {
    const bucket = type === 'material' ? 'materials' : type === 'food' ? 'food' : 'items';
    return DS().get(bucket, id)?.name || id;
  }

  function _esc(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function _escAttr(value) { return _esc(value); }

  return Object.freeze({ renderShops, renderRest });
})();
