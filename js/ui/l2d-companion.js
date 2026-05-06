// l2d-companion.js
// Mounts the always-visible Live2D avatar dock and wires it to game events.
// One instance per page (combat or campaign). Picks a context-appropriate
// dialogue line + expression and pipes it to the viewer.
//
// Reads:  registry.json (via L2DAvatar)
// Used by: combat.html, campaign.html (auto-init via DOMContentLoaded)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.L2DCompanion = (() => {
  'use strict';

  const STATE = {
    avatar: null,
    dock: null,
    bubble: null,
    portrait: null,
    name: null,
    cfg: null,
    mode: 'combat',
    lastLineKey: null,
    lastLineAt: 0,
    busy: false,
    queue: [],
    busUnsubs: []
  };

  // ── DOM ─────────────────────────────────────────────────────────
  function _buildDock(opts) {
    const dock = document.createElement('aside');
    dock.id = 'l2d-companion-dock';
    dock.className = `l2d-dock l2d-mode-${opts.mode}`;
    dock.innerHTML = `
      <div class="l2d-stage" id="l2d-stage" aria-label="Companion avatar"></div>
      <div class="l2d-meta">
        <span class="l2d-name" id="l2d-name">Companion</span>
        <button class="l2d-mute" id="l2d-mute" type="button" title="Hide companion">×</button>
      </div>
      <div class="l2d-bubble" id="l2d-bubble" aria-live="polite">
        <div class="l2d-bubble-text" id="l2d-bubble-text">…</div>
      </div>
    `;
    document.body.appendChild(dock);
    document.body.classList.add('has-l2d-companion');
    return dock;
  }

  // ── Speech bubble ───────────────────────────────────────────────
  function _showLine(text, holdMs) {
    if (!STATE.bubble) return;
    const ms = Math.max(1500, holdMs || (1200 + (text?.length || 0) * 35));
    const el = STATE.bubble.querySelector('.l2d-bubble-text');
    el.textContent = text;
    STATE.bubble.classList.add('is-visible');
    if (STATE.avatar?.speakFor) STATE.avatar.speakFor(ms - 200);
    clearTimeout(STATE._bubbleTimer);
    STATE._bubbleTimer = setTimeout(() => {
      STATE.bubble.classList.remove('is-visible');
    }, ms);
  }

  function _react(key, override = {}) {
    const reactions = STATE.cfg?.reactions || {};
    const r = reactions[key];
    if (!r && !override.line) return;
    // Throttle: don't re-fire same key within 1.2s.
    const now = performance.now();
    if (key === STATE.lastLineKey && (now - STATE.lastLineAt) < 1200) return;
    STATE.lastLineKey = key; STATE.lastLineAt = now;

    const expr = override.expression || r?.expression;
    if (expr && STATE.avatar) STATE.avatar.setExpression(expr);

    let line = override.line;
    if (!line && r?.lines?.length) {
      line = r.lines[Math.floor(Math.random() * r.lines.length)];
    }
    if (line) _showLine(line, override.holdMs);
  }

  // ── Combat wiring ───────────────────────────────────────────────
  function _wireCombat() {
    const Bus = window.CJS.AnimationBus;
    if (!Bus) return;
    const sub = (name, fn) => STATE.busUnsubs.push(Bus.on(name, fn));

    sub('battle_start',  () => _react('battle_start'));
    sub('turn_start',    (p) => {
      // Only chime in on player turns; AI turns get less chatter.
      const team = p?.unit?.team;
      if (team === 'player') _react('turn_start');
    });
    sub('skill_cast',    (p) => {
      if (p?.unit?.team === 'player') _react('skill_cast');
    });
    sub('hit',           (p) => {
      if (p?.attacker?.team === 'player') _react('hit');
      else _react('damage_taken');
    });
    sub('miss',          (p) => {
      if (p?.attacker?.team === 'player') _react('miss');
    });
    sub('damage',        (p) => {
      // damage events fire often; only react if it lands on player team.
      const tgt = p?.target?.team;
      if (tgt === 'player' && p?.amount > 0) _react('damage_taken');
    });
    sub('heal',          () => _react('heal'));
    sub('unit_ko',       (p) => {
      if (p?.unit?.team === 'enemy')  _react('ko_enemy');
      if (p?.unit?.team === 'player') _react('ko_player');
    });

    // Battle end: subscribe to CombatManager's state events.
    const CM = window.CJS.CombatManager;
    if (CM?.subscribe) {
      const u = CM.subscribe((state) => {
        if (state?.phase === 'battle_end' && !STATE._endedAnnounced) {
          STATE._endedAnnounced = true;
          // Heuristic: if any player still alive => victory.
          const units = state.units || [];
          const playerAlive = units.some(u => u?.team === 'player' && (u.hp ?? 1) > 0);
          _react(playerAlive ? 'victory' : 'defeat');
          setTimeout(() => { STATE._endedAnnounced = false; }, 8000);
        }
      });
      STATE.busUnsubs.push(u);
    }
  }

  // ── Campaign wiring ─────────────────────────────────────────────
  function _wireCampaign() {
    // CampaignState exposes subscribe(fn(change)). We sniff at the change
    // type/source to pick a flavour. We also debounce idle chatter.
    const CS = window.CJS.CampaignState;
    if (!CS?.subscribe) return;

    let idleTimer = null;
    const armIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => _react('campaign_idle'), 45000);
    };
    armIdle();

    const u = CS.subscribe((change) => {
      armIdle();
      const src = (change?.source || '').toLowerCase();
      const type = (change?.type || '').toLowerCase();
      const detail = (change?.detail || '').toString().toLowerCase();

      if (src.includes('move') || detail.includes('move') || src.includes('travel')) {
        _react('campaign_move');
      } else if (src.includes('loot') || src.includes('inventory') || detail.includes('loot')) {
        _react('campaign_loot');
      } else if (src.includes('quest') || detail.includes('quest')) {
        _react('campaign_quest');
      } else if (src.includes('rest') || src.includes('haven') || detail.includes('rest')) {
        _react('campaign_rest');
      } else if (type === 'replace') {
        // initial load — quiet
      }
    });
    STATE.busUnsubs.push(u);
  }

  // ── Click on the avatar gives a playful response ────────────────
  function _wireClick() {
    window.addEventListener('l2d:click', () => _react('click'));
  }

  // ── Init ────────────────────────────────────────────────────────
  async function init(opts = {}) {
    if (STATE.avatar) return STATE.avatar;
    STATE.mode = opts.mode || 'combat';
    STATE.dock = _buildDock({ mode: STATE.mode });
    STATE.bubble = STATE.dock.querySelector('#l2d-bubble');
    STATE.name = STATE.dock.querySelector('#l2d-name');

    const stage = STATE.dock.querySelector('#l2d-stage');

    // Hide button — collapse the dock and free the layout reservation.
    STATE.dock.querySelector('#l2d-mute').addEventListener('click', () => {
      const collapsed = STATE.dock.classList.toggle('is-collapsed');
      document.body.classList.toggle('has-l2d-companion', !collapsed);
      // Re-layout pixi when shown again.
      setTimeout(() => STATE.avatar?.relayout?.(), 250);
    });

    try {
      const av = await window.CJS.L2DAvatar.create(stage, { model: opts.model });
      STATE.avatar = av;
      STATE.cfg = av.cfg;
      if (STATE.name && av.cfg?.name) STATE.name.textContent = av.cfg.name;
      _wireClick();
      if (STATE.mode === 'combat')  _wireCombat();
      if (STATE.mode === 'campaign') _wireCampaign();
      // First hello
      setTimeout(() => _react(STATE.mode === 'combat' ? 'battle_start' : 'campaign_idle'), 600);
    } catch (err) {
      console.warn('[L2DCompanion] avatar init failed, showing fallback:', err);
      _showFallback(stage);
      _showLine('Hi! (Live2D failed to load — using static portrait.)', 4500);
    }

    return STATE.avatar;
  }

  function _showFallback(stage) {
    stage.innerHTML = '';
    const img = document.createElement('img');
    img.className = 'l2d-fallback-img';
    img.alt = 'Companion';
    img.src = 'assets/live2d/peri/mianyin.png';
    img.onerror = () => { img.style.display = 'none'; };
    stage.appendChild(img);
  }

  function dispose() {
    for (const u of STATE.busUnsubs) { try { u(); } catch (_) {} }
    STATE.busUnsubs = [];
    try { STATE.avatar?.dispose?.(); } catch (_) {}
    STATE.avatar = null;
    if (STATE.dock) { STATE.dock.remove(); STATE.dock = null; }
    document.body.classList.remove('has-l2d-companion');
  }

  // External imperative API for code that wants to push a custom line
  function say(text, opts = {}) {
    _react('_custom', { line: text, expression: opts.expression, holdMs: opts.holdMs });
  }

  return Object.freeze({ init, dispose, say });
})();
