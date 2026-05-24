// cui-utils.js — Pure leaf utilities for Campaign UI.
//
// Extracted from the original monolithic campaign-ui.js. These functions
// have no closure-state dependency and only touch `window.CJS.DataStore`
// for name lookups, so they live cleanly in their own module.
//
// The main campaign-ui.js imports this via the entry chain and binds
// short aliases (`_esc`, `_label`, etc.) at the top of its IIFE.

window.CJS = window.CJS || {};
window.CJS.CampaignUIInternal = window.CJS.CampaignUIInternal || {};

window.CJS.CampaignUIInternal.Utils = (function () {
  'use strict';

  function esc(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function escAttr(value) {
    return esc(value);
  }

  function label(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function safe(value) {
    return String(value || 'campaign').toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
  }

  function truncate(value, max = 60) {
    const text = String(value || '').trim();
    return text.length > max ? `${text.slice(0, Math.max(0, max - 3))}...` : text;
  }

  function currencyLabel(id) {
    const value = String(id || '').toLowerCase();
    if (value === 'jp' || value === 'jester_points') return 'Jester Points';
    if (value.endsWith('_gold')) return `${label(value.replace(/_gold$/, ''))} Gold`;
    return label(id);
  }

  function recordName(bucketOrType, id) {
    const bucket = bucketOrType === 'material' ? 'materials'
      : bucketOrType === 'food' ? 'food'
        : bucketOrType === 'questItem' ? 'questItems'
          : bucketOrType || 'items';
    const DS = window.CJS && window.CJS.DataStore;
    return DS?.get?.(bucket, id)?.name || id;
  }

  function lootLine(drop) {
    if (drop.type === 'money') return `${drop.amount || drop.qty || 0} ${currencyLabel(drop.currency || 'gold')}`;
    if (drop.type === 'jp') return `${drop.amount || drop.qty || 0} ${currencyLabel('jp')}`;
    return `${drop.qty || 1}x ${drop.name || recordName(drop.type === 'material' ? 'materials' : 'items', drop.id)}`;
  }

  function formatBundleText(bundle) {
    const parts = [];
    for (const [id, qty] of Object.entries(bundle?.currencies || {})) parts.push(`${qty} ${currencyLabel(id)}`);
    for (const [id, qty] of Object.entries(bundle?.items || {})) parts.push(`${qty} ${recordName('items', id)}`);
    for (const [id, qty] of Object.entries(bundle?.materials || {})) parts.push(`${qty} ${recordName('materials', id)}`);
    for (const [id, qty] of Object.entries(bundle?.food || {})) parts.push(`${qty} ${recordName('food', id)}`);
    for (const [id, qty] of Object.entries(bundle?.questItems || {})) parts.push(`${qty} ${recordName('questItems', id)}`);
    return parts.join(', ');
  }

  return Object.freeze({
    esc,
    escAttr,
    label,
    safe,
    truncate,
    currencyLabel,
    recordName,
    lootLine,
    formatBundleText
  });
})();
