// campaign-combat-popup.js
// Pre-battle popup that shakes onto the screen, pauses the campaign,
// and confirms before handing off to combat.html. Replaces the silent
// "writeRequest then navigate" handoff for queued battles.

window.CJS = window.CJS || {};

window.CJS.CampaignCombatPopup = (() => {
  'use strict';

  const Bridge = () => window.CJS.CampaignCombatBridge;
  const DS = () => window.CJS.DataStore;

  let _activeOverlay = null;
  let _pendingNav = null;

  function show(pendingBattle, opts = {}) {
    if (typeof document === 'undefined' || !document.body) return false;
    close({ silent: true });

    const monsters = _resolveMonsters(pendingBattle);
    const overlay = document.createElement('div');
    overlay.className = 'combat-popup-shell';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Battle incoming');
    overlay.innerHTML = `
      <div class="combat-popup-card combat-popup-shake" tabindex="-1">
        <p class="combat-popup-eyebrow">Encounter!</p>
        <h2 class="combat-popup-title">${_esc(pendingBattle?.label || 'Battle Engaged')}</h2>
        <p class="combat-popup-sub">${_esc(pendingBattle?.subtitle || _defaultSubtitle(pendingBattle))}</p>
        ${monsters.length ? `
          <div class="combat-popup-monsters" aria-hidden="true">
            ${monsters.map((m) => `<div class="combat-popup-monster" ${m.portrait ? `style="background-image:url('${_escAttr(m.portrait)}')"` : ''}>${m.portrait ? '' : _esc(m.icon || '👹')}</div>`).join('')}
          </div>` : ''}
        <div class="combat-popup-actions">
          <button type="button" data-combat-popup-cancel>Hold</button>
          <button type="button" class="is-primary" data-combat-popup-engage autofocus>Engage</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.classList.add('combat-popup-open');
    _activeOverlay = overlay;
    _pendingNav = { pendingBattle, opts };

    try { window.CJS.AudioManager?.play?.('combat_start'); } catch (_) {}

    overlay.querySelector('[data-combat-popup-engage]').addEventListener('click', () => engage());
    overlay.querySelector('[data-combat-popup-cancel]').addEventListener('click', () => close({ reason: 'cancel' }));
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close({ reason: 'cancel' });
      if (event.key === 'Enter') engage();
    });

    // Briefly shake the underlying page too for impact, then settle.
    const root = document.querySelector('.campaign-root') || document.body;
    root.classList.add('combat-popup-shake');
    setTimeout(() => root.classList.remove('combat-popup-shake'), 600);

    // Focus the engage button so Enter works immediately.
    setTimeout(() => overlay.querySelector('[data-combat-popup-engage]')?.focus(), 50);
    return true;
  }

  function engage() {
    if (!_pendingNav) return;
    const { pendingBattle, opts } = _pendingNav;
    _pendingNav = null;
    close({ silent: true });
    if (typeof opts.onEngage === 'function') {
      try { opts.onEngage(pendingBattle); } catch (err) { console.error('combat popup onEngage failed', err); }
      return;
    }
    Bridge()?.openBattle?.(pendingBattle);
  }

  function close(opts = {}) {
    if (!_activeOverlay) return;
    const overlay = _activeOverlay;
    _activeOverlay = null;
    if (!opts.silent && _pendingNav && typeof _pendingNav.opts?.onCancel === 'function') {
      try { _pendingNav.opts.onCancel(_pendingNav.pendingBattle, opts.reason || 'cancel'); }
      catch (err) { console.error('combat popup onCancel failed', err); }
    }
    overlay.classList.add('is-closing');
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (!_activeOverlay) document.body.classList.remove('combat-popup-open');
    }, 200);
    if (opts.reason === 'cancel') _pendingNav = null;
  }

  function _defaultSubtitle(p = {}) {
    if (p.source === 'moving_threat') return 'A roaming shadow closes in.';
    if (p.source === 'node') return 'The path ahead bristles with hostile shapes.';
    if (p.source === 'random') return 'Unexpected enemies strike from the dark.';
    return 'Prepare yourselves.';
  }

  function _resolveMonsters(pending = {}) {
    const ids = new Set();
    (pending.monsterIds || []).forEach((id) => id && ids.add(id));
    if (pending.battleSetCard?.monsterIds) {
      pending.battleSetCard.monsterIds.forEach((id) => id && ids.add(id));
    }
    if (pending.encounterId) {
      const enc = DS()?.get?.('encounters', pending.encounterId);
      (enc?.units || []).forEach((u) => {
        const id = u?.id || u?.monsterId || u?.baseId;
        if (id) ids.add(id);
      });
    }
    const out = [];
    for (const id of ids) {
      const rec = DS()?.get?.('monsters', id);
      out.push({
        id,
        icon: rec?.icon || '👹',
        portrait: rec?.portrait || rec?.sprite || ''
      });
      if (out.length >= 6) break;
    }
    return out;
  }

  function _esc(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function _escAttr(value) { return _esc(value); }

  return Object.freeze({ show, engage, close });
})();
