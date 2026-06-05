// campaign-objective-banner.js
// Shows a brief banner whenever the active scenario's objective flips
// from hidden to visible (e.g. once the player passes the 60% reveal
// threshold). Also surfaces force_reveal_objective triggers.

// Tier 3 TS port of js/campaign/campaign-objective-banner.js (engine cluster:
// campaign). Brief banner shown when an active scenario's objective flips
// hidden→visible. Exports `CampaignObjectiveBanner` and installs
// window.CJS.CampaignObjectiveBanner. Body verbatim from the legacy IIFE.
window.CJS = window.CJS || {};

export const CampaignObjectiveBanner = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;

  let _lastVisibleKey = null;
  let _activeEl = null;
  let _hideTimer = 0;
  let _unsub = null;

  function init() {
    if (_unsub) return;
    if (typeof document === 'undefined' || !document.body) return;
    const state = CS()?.getState?.();
    _lastVisibleKey = _visibleKey(state);
    _unsub = CS()?.subscribe?.(_onState) || null;
  }

  function dispose() {
    if (_unsub) { _unsub(); _unsub = null; }
  }

  function show(objective: any = {}, opts: any = {}) {
    if (!objective?.label) return;
    if (typeof document === 'undefined' || !document.body) return;
    _clear();
    const banner = document.createElement('div');
    banner.className = 'campaign-objective-banner';
    banner.innerHTML = `
      <div class="campaign-objective-banner-icon" aria-hidden="true"></div>
      <div class="campaign-objective-banner-text">
        <strong>${_esc(opts.eyebrow || 'Objective Revealed')}</strong>
        <span>${_esc(objective.label)}</span>
      </div>
    `;
    document.body.appendChild(banner);
    _activeEl = banner;
    // force reflow then add class so the transition fires
    void banner.offsetHeight;
    banner.classList.add('is-shown');
    _hideTimer = setTimeout(() => _hideAndRemove(), opts.duration || 5200);
    try { window.CJS.AudioManager?.play?.('quest_update'); } catch (_) {}
  }

  function _onState() {
    const state = CS()?.getState?.();
    const next = _visibleKey(state);
    if (next === _lastVisibleKey) return;
    // Only fire when an objective becomes visible, not on every nav.
    const obj = state?.activeScenarioRun?.objectiveState;
    if (obj?.visible && next && next !== _lastVisibleKey) {
      show(obj, {
        eyebrow: obj.revealSource === 'progress' ? 'Objective Revealed — 60% Explored'
               : obj.revealSource === 'force'    ? 'Objective Revealed'
               : 'Objective Revealed'
      });
    }
    _lastVisibleKey = next;
  }

  function _visibleKey(state) {
    const obj = state?.activeScenarioRun?.objectiveState;
    if (!obj || !obj.visible) return null;
    return `${obj.questId || ''}:${obj.id || obj.label || ''}:${obj.revealedAt || ''}`;
  }

  function _hideAndRemove() {
    if (!_activeEl) return;
    _activeEl.classList.remove('is-shown');
    const el = _activeEl;
    _activeEl = null;
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = 0; }
  }

  function _clear() {
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = 0; }
    if (_activeEl && _activeEl.parentNode) _activeEl.parentNode.removeChild(_activeEl);
    _activeEl = null;
  }

  function _esc(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  return Object.freeze({ init, dispose, show });
})();

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS.CampaignObjectiveBanner = CampaignObjectiveBanner;
