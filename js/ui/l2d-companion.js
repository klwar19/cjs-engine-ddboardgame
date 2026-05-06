// l2d-companion.js
// Mounts the always-visible Live2D avatar dock and wires it to game events.
// One instance per page (combat or campaign).
//
// Combat: piggybacks on NarratorEngine — the [CJS] editorial layer in
// data/quips.json *is* Peri's voice, so her speech bubble mirrors what the
// narrator says. Expression is picked from the log entry's type+tags.
//
// Campaign: listens to CampaignState changes for move/loot/quest/rest.
//
// Voice (future): the registry can map events / fragment ids to mp3 files
// under assets/live2d/voice/. When set, _playVoice() plays the clip and
// uses its duration to drive lip-sync. Until clips are added it stays
// silent — no missing-file errors in the console.
//
// Used by: combat.html, campaign.html (auto-init via DOMContentLoaded)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.L2DCompanion = (() => {
  'use strict';

  const STATE = {
    avatar: null,
    dock: null,
    bubble: null,
    name: null,
    cfg: null,
    mode: 'combat',
    lastLineKey: null,
    lastLineAt: 0,
    busUnsubs: [],
    voiceAudio: null,
    voiceVolume: 0.85,
    voiceMuted: false,
    bubbleTimer: null,
    endedAnnounced: false
  };

  const CJS_PREFIX = /^\[CJS\]\s*/i;
  const RECENT_QUIP_LIMIT = 8;
  const RECENT_QUIPS = [];
  const COMBAT_LOG_REACTION_TYPES = new Set(['turn_start', 'move', 'defend', 'item_used']);

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
    if (!STATE.bubble || !text) return;
    const ms = Math.max(1500, holdMs || (1200 + (text.length || 0) * 35));
    const el = STATE.bubble.querySelector('.l2d-bubble-text');
    el.textContent = text;
    STATE.bubble.classList.add('is-visible');
    if (STATE.avatar?.speakFor) STATE.avatar.speakFor(ms - 200);
    clearTimeout(STATE.bubbleTimer);
    STATE.bubbleTimer = setTimeout(() => {
      STATE.bubble.classList.remove('is-visible');
    }, ms);
  }

  // Throttle: don't re-fire same key within 1.2 s.
  function _throttle(key) {
    const now = performance.now();
    if (key && key === STATE.lastLineKey && (now - STATE.lastLineAt) < 1200) return false;
    STATE.lastLineKey = key; STATE.lastLineAt = now;
    return true;
  }

  function _reactionTags(key, override = {}) {
    const tags = ['l2d', key, `l2d_mode_${STATE.mode}`];
    if (key && !String(key).startsWith('l2d_')) tags.push(`l2d_${key}`);
    if (override.entry?.tags) tags.push(...override.entry.tags);
    if (override.change?.source) tags.push(`campaign_source_${override.change.source}`);
    if (Array.isArray(override.tags)) tags.push(...override.tags);
    return tags.filter(Boolean).map(String);
  }

  function _getQuipFragments() {
    const DS = window.CJS.DataStore;
    try {
      return DS?.getAllAsArray?.('quips') || [];
    } catch (_) {
      return [];
    }
  }

  function _pickCjsQuip(tags, context = {}) {
    const tagSet = new Set((tags || []).filter(Boolean).map(String));
    const matches = [];

    for (const fragment of _getQuipFragments()) {
      if (!fragment || fragment.layer !== 'cjs_editorial' || !fragment.text) continue;
      const required = fragment.required_tags || [];
      const excluded = fragment.excluded_tags || [];
      if (!required.every((tag) => tagSet.has(tag))) continue;
      if (excluded.some((tag) => tagSet.has(tag))) continue;
      const score = Number(fragment.weight ?? 5) + (required.length * 2);
      matches.push({ fragment, score });
    }

    if (!matches.length) return null;
    matches.sort((a, b) => b.score - a.score);
    const available = matches.filter((match) => !RECENT_QUIPS.includes(match.fragment.id));
    const pool = available.length ? available : matches;
    const topScore = pool[0].score;
    const nearTop = pool.filter((match) => match.score >= topScore - 2);
    const picked = nearTop[Math.floor(Math.random() * nearTop.length)].fragment;
    if (picked.id) {
      RECENT_QUIPS.push(picked.id);
      while (RECENT_QUIPS.length > RECENT_QUIP_LIMIT) RECENT_QUIPS.shift();
    }

    const line = _substituteQuip(picked.text, context).replace(CJS_PREFIX, '').trim();
    return line ? { line, expression: picked.expression, fragmentId: picked.id } : null;
  }

  function _substituteQuip(text, context = {}) {
    const entry = context.entry || context;
    const actor = entry.actor || {};
    const target = entry.target || {};
    const data = entry.data || {};
    const CS = window.CJS.CampaignState;
    const state = CS?.getState?.();
    const campaign = CS?.getCurrentCampaign?.();

    const skillName = () => {
      const skillId = data.skill || data.skillId;
      if (!skillId) return 'basic attack';
      const rec = window.CJS.DataStore?.get?.('skills', skillId);
      return rec?.name || String(skillId).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    };

    const vars = {
      'actor.name': actor.name || actor.baseId || 'Someone',
      'target.name': target.name || target.baseId || 'Something',
      'actor.id': actor.baseId || actor.instanceId || actor.id || 'unknown',
      'target.id': target.baseId || target.instanceId || target.id || 'unknown',
      damage: data.damage ?? data.amount ?? '?',
      amount: data.amount ?? data.damage ?? '?',
      element: data.element || 'Physical',
      skill: data.skill || 'attack',
      'skill.name': skillName(),
      status: data.statusId || 'status',
      item: data.itemId || data.id || 'item',
      'campaign.name': campaign?.name || 'the campaign',
      world: state?.currentWorld || 'haven',
      chapter: state?.currentChapter || 1
    };

    return String(text || '').replace(/\{([a-zA-Z0-9_.]+)\}/g, (match, key) => (
      Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
    ));
  }

  // Pick + show a line for a registry "reactions" key (used outside combat
  // narrator, e.g. campaign + click + turn_start).
  function _react(key, override = {}) {
    if (!_throttle(key)) return;
    const reactions = STATE.cfg?.reactions || {};
    const r = reactions[key];
    const cjs = override.line ? null : _pickCjsQuip(_reactionTags(key, override), override);

    const expr = override.expression || cjs?.expression || r?.expression;
    if (expr && STATE.avatar) STATE.avatar.setExpression(expr);

    let line = override.line || cjs?.line;
    if (!line && r?.lines?.length) {
      line = r.lines[Math.floor(Math.random() * r.lines.length)];
    }
    if (!line) return;
    const ms = override.holdMs;
    _showLine(line, ms);
    _playVoice({ eventKey: key, type: override.entry?.type, fragmentId: cjs?.fragmentId }, line, ms);
  }

  // ── Expression picker from a CombatLog entry (narrator path) ────
  function _pickExpressionFromEntry(entry) {
    if (!entry) return null;
    const tags = new Set(entry.tags || []);
    const type = entry.type;
    const actorPlayer  = entry.actor?.team  === 'player';
    const targetPlayer = entry.target?.team === 'player';

    if (type === 'battle_end') {
      if (tags.has('winner_player')) return 'love';
      if (tags.has('winner_enemy'))  return 'sad';
    }
    if (type === 'battle_start') return 'happy';
    if (type === 'turn_start')    return actorPlayer ? 'neutral' : null;
    if (type === 'move')          return actorPlayer ? 'playful' : null;
    if (type === 'defend')        return actorPlayer ? 'hat' : null;
    if (type === 'item_used')     return actorPlayer ? 'love' : null;
    if (type === 'kill') {
      if (tags.has('comeback') || tags.has('first_blood') || tags.has('revenge_kill')) return 'happy';
      return actorPlayer ? 'happy' : 'sad';
    }
    if (type === 'heal')           return 'love';
    if (type === 'hit') {
      if (tags.has('crit') || tags.has('massive_hit') || tags.has('element_exploit')) return 'happy';
      return actorPlayer ? 'angry' : 'sad';
    }
    if (type === 'miss')           return actorPlayer ? 'sad' : 'playful';
    if (type === 'dodge')          return targetPlayer ? 'happy' : 'angry';
    if (type === 'status_applied') return targetPlayer ? 'sad' : 'angry';
    if (type === 'knockback')      return actorPlayer ? 'happy' : 'angry';
    if (type === 'qte_result') {
      if (tags.has('qte_perfect')) return 'happy';
      if (tags.has('qte_fail'))    return 'sad';
    }

    // Mood overrides — Peri's entertainment meter.
    if (tags.has('peri_excited')) return 'happy';
    if (tags.has('peri_bored'))   return 'playful';

    return null;
  }

  // ── Voice playback (mp3, registry-driven) ───────────────────────
  // Lookup order:
  //   1. registry.voice.byFragmentId[fragmentId]   (most specific)
  //   2. registry.voice.byEventType[entry.type]
  //   3. registry.voice.byEventKey[reactionKey]
  // Any of these may be a string (single file) or array (random pick).
  function _resolveVoiceUrl(entry, eventKey) {
    const v = STATE.cfg?.voice;
    if (!v) return null;
    const dir = v.directory || '';
    const pick = (cand) => {
      if (!cand) return null;
      const arr = Array.isArray(cand) ? cand : [cand];
      const f = arr[Math.floor(Math.random() * arr.length)];
      return f ? dir + f : null;
    };

    if (entry?.fragmentId && v.byFragmentId) {
      const u = pick(v.byFragmentId[entry.fragmentId]);
      if (u) return u;
    }
    if (entry?.type && v.byEventType) {
      const u = pick(v.byEventType[entry.type]);
      if (u) return u;
    }
    if (eventKey && v.byEventKey) {
      const u = pick(v.byEventKey[eventKey]);
      if (u) return u;
    }
    return null;
  }

  function _playVoice(entry, line, holdMs) {
    if (STATE.voiceMuted) return;
    // Respect a global audio mute if AudioManager exposes one.
    const AM = window.CJS.AudioManager;
    if (AM?.isMuted?.()) return;

    const url = _resolveVoiceUrl(entry?.fragmentId ? entry : { type: entry?.type }, entry?.eventKey);
    if (!url) return;
    try {
      // Stop any in-flight clip.
      if (STATE.voiceAudio) {
        try { STATE.voiceAudio.pause(); } catch (_) {}
        STATE.voiceAudio = null;
      }
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.volume = STATE.voiceVolume;
      audio.addEventListener('error', () => { STATE.voiceAudio = null; });
      audio.addEventListener('ended', () => {
        STATE.avatar?.silence?.();
        STATE.voiceAudio = null;
      });
      audio.addEventListener('loadedmetadata', () => {
        const dur = (audio.duration || 0) * 1000;
        if (dur > 0) STATE.avatar?.speakFor?.(dur);
      });
      STATE.voiceAudio = audio;
      audio.play().catch(() => { /* autoplay blocked; bubble alone is fine */ });
    } catch (_) { /* never throw from audio */ }
  }

  // ── Combat wiring (NarratorEngine-driven) ───────────────────────
  function _wireCombat() {
    // PRIMARY: NarratorEngine.subscribe gives us (text, logEntry). The
    // [CJS]-prefixed line is Peri's editorial commentary — that's her
    // bubble line. If there is no [CJS] line we fall back to the first
    // narrative line so something sensible still appears.
    const NE = window.CJS.NarratorEngine;
    // subscribePersistent keeps us attached across CombatUI's per-battle
    // destroy/init cycle. Falls back to plain subscribe on older builds.
    const sub = NE?.subscribePersistent || NE?.subscribe;
    if (sub) {
      const u = sub.call(NE, (text, entry) => _onNarration(text, entry));
      STATE.busUnsubs.push(u);
    }

    // SECONDARY: CombatLog events that NarratorEngine intentionally keeps
    // out of the battle report still deserve Peri/CJS bubble commentary.
    const Log = window.CJS.CombatLog;
    if (Log?.subscribe) STATE.busUnsubs.push(Log.subscribe(_onCombatLogReaction));
  }

  function _onCombatLogReaction(entry) {
    if (!entry || !COMBAT_LOG_REACTION_TYPES.has(entry.type)) return;
    if (entry.actor?.team !== 'player') return;
    const key = entry.type === 'item_used' ? 'item_used' : entry.type;
    _react(key, {
      entry,
      expression: _pickExpressionFromEntry(entry),
      tags: [`l2d_${key}`]
    });
  }

  function _onNarration(narrationText, entry) {
    if (!narrationText) return;
    const lines = String(narrationText).split('\n').map(l => l.trim()).filter(Boolean);
    let cjs = lines.find(l => l.startsWith('[CJS]'));
    let bubbleLine;
    if (cjs) {
      bubbleLine = cjs.replace(/^\[CJS\]\s*/, '').trim();
    } else {
      // No editorial layer this turn — use the first non-empty line so
      // Peri still narrates something rather than going mute.
      bubbleLine = lines[0];
    }
    if (!bubbleLine) return;

    const expr = _pickExpressionFromEntry(entry);
    if (expr) STATE.avatar?.setExpression(expr);
    _showLine(bubbleLine);
    _playVoice(entry, bubbleLine);

    // Reset the battle-end "say victory once" guard at battle start.
    if (entry?.type === 'battle_start') STATE.endedAnnounced = false;
  }

  // ── Campaign wiring ─────────────────────────────────────────────
  // Maps the actual CampaignState change.source strings (see grep of
  // js/campaign/*.js for the real set) to a registry reaction key. Returns
  // null for sources we want to stay silent on (raw state replays, plain
  // UI toggles, log clears).
  function _classifyCampaignChange(change) {
    if (!change) return null;
    const src    = String(change.source || '').toLowerCase();
    const type   = String(change.type   || '').toLowerCase();
    const ops    = Array.isArray(change.detail) ? change.detail.filter(Boolean) : [];
    const opText = ops.map((op) => String(op.op || '')).join(' ').toLowerCase();
    const detail = `${String(change.detail || '').toLowerCase()} ${opText}`;

    if (src === 'load_slot' || src === 'fork' || src === 'import' || src === 'new_save') return 'campaign_load';
    if (type === 'replace') return null;             // bulk reload, quiet
    if (src === 'state' || src === 'clear_log') return null;
    if (src === 'ui' && !ops.length) return null;    // pure tab/panel UI

    // Battle preparation / aftermath — pendingBattle, etc.
    if (src === 'run_pick_battle' || src === 'run_set_battle' ||
        src === 'beat_battle'      || src === 'manual_battle' ||
        src === 'random_battle'    || detail.includes('start_battle') ||
        detail.includes('manual_battle_result')) return 'campaign_battle';
    if (src === 'combat_bridge'    || src === 'battle_set_reward') return 'campaign_loot';
    if (src === 'battle_setback'   || detail.includes('damage_character')) return 'campaign_setback';

    // Scenario/map movement and reveal beats.
    if (src === 'map_move' || src === 'grid_move' || src === 'travel_step' ||
        src === 'travel_branch' || src === 'travel_branch_grid' ||
        detail.includes('goto_node') || detail.includes('reveal_node')) return 'campaign_move';

    // Mystic / oracle / plot seed
    if (src.includes('oracle')) return 'campaign_oracle';

    // Story event / hook / trap
    if (src === 'trap'        || src === 'event'       || src === 'event_pick' ||
        src === 'event_custom'|| src === 'beat_event'  || src === 'solo_hook' ||
        src.includes('travel_surprise') || detail.includes('roll_event') ||
        detail.includes('roll_check')) return 'campaign_event';

    // Quests
    if (src.includes('quest') || detail.includes('quest')) return 'campaign_quest';

    // Pocket haven / cozy / notes
    if (src === 'pocket_haven' || src === 'note' || src.includes('haven') ||
        detail.includes('full_rest') || detail.includes('camp_rest') ||
        detail.includes('heal_character')) return 'campaign_rest';

    // Inventory hint via detail (CampaignOps emits `detail: applied`)
    if (detail.includes('item') || detail.includes('loot') ||
        detail.includes('gold') || detail.includes('inventory') ||
        detail.includes('money') || detail.includes('craft') ||
        detail.includes('shop') || detail.includes('farm')) return 'campaign_loot';

    // Generic action — covers `ops`, `campaign_ops`, `manual`, `check`,
    // `side_content`. Use a debounced chatter line so spam stays human.
    if (src === 'ops' || src === 'campaign_ops' || src === 'manual' ||
        src === 'check' || src === 'side_content' || src === 'ui') return 'campaign_action';

    // Final catch-all: any other mutate (anything that actually changed
    // game state) gets a generic chatter line. The 1.2 s throttle on the
    // 'campaign_action' key keeps batched ops from spamming the bubble.
    if (type === 'mutate') return 'campaign_action';

    return null;
  }

  function _wireCampaign() {
    const CS = window.CJS.CampaignState;
    if (!CS?.subscribe) return;

    let idleTimer = null;
    const armIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => _react('campaign_idle'), 45000);
    };
    armIdle();

    const u = CS.subscribe((_state, change) => {
      armIdle();
      const key = _classifyCampaignChange(change);
      if (key) _react(key, { change });
    });
    STATE.busUnsubs.push(u);
  }

  // ── Click on the avatar gives a playful response ────────────────
  function _wireClick(stage) {
    const onClick = () => _react('click');
    window.addEventListener('l2d:click', onClick);
    STATE.busUnsubs.push(() => window.removeEventListener('l2d:click', onClick));
    if (stage) {
      stage.addEventListener('click', onClick);
      STATE.busUnsubs.push(() => stage.removeEventListener('click', onClick));
    }
  }

  // ── Init ────────────────────────────────────────────────────────
  async function init(opts = {}) {
    if (STATE.avatar) return STATE.avatar;
    STATE.mode = opts.mode || 'combat';
    STATE.dock = _buildDock({ mode: STATE.mode });
    STATE.bubble = STATE.dock.querySelector('#l2d-bubble');
    STATE.name = STATE.dock.querySelector('#l2d-name');

    const stage = STATE.dock.querySelector('#l2d-stage');

    STATE.dock.querySelector('#l2d-mute').addEventListener('click', () => {
      const collapsed = STATE.dock.classList.toggle('is-collapsed');
      document.body.classList.toggle('has-l2d-companion', !collapsed);
      setTimeout(() => STATE.avatar?.relayout?.(), 250);
    });

    _wireClick(stage);
    if (STATE.mode === 'combat')   _wireCombat();
    if (STATE.mode === 'campaign') _wireCampaign();

    try {
      const av = await window.CJS.L2DAvatar.create(stage, { model: opts.model });
      STATE.avatar = av;
      STATE.cfg = av.cfg;
      if (STATE.name && av.cfg?.name) STATE.name.textContent = av.cfg.name;
      // Greeting: campaign only — combat's first quip will arrive from
      // the narrator's battle_start fragment. Bypass the throttle by
      // passing an explicit line so a startup race can't suppress it.
      if (STATE.mode === 'campaign') {
        setTimeout(() => {
          STATE.lastLineKey = null; // force-clear so throttle never blocks the greeting
          _react('campaign_idle');
        }, 600);
      }
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
    if (STATE.voiceAudio) { try { STATE.voiceAudio.pause(); } catch (_) {} STATE.voiceAudio = null; }
    try { STATE.avatar?.dispose?.(); } catch (_) {}
    STATE.avatar = null;
    if (STATE.dock) { STATE.dock.remove(); STATE.dock = null; }
    document.body.classList.remove('has-l2d-companion');
  }

  // External API for other modules to push a custom line.
  function say(text, opts = {}) {
    if (!_throttle('_custom')) return;
    if (opts.expression && STATE.avatar) STATE.avatar.setExpression(opts.expression);
    _showLine(text, opts.holdMs);
    _playVoice({ eventKey: opts.eventKey || '_custom', type: opts.eventType }, text, opts.holdMs);
  }

  function setVoiceVolume(v) { STATE.voiceVolume = Math.max(0, Math.min(1, Number(v) || 0)); }
  function setVoiceMuted(m)  { STATE.voiceMuted = !!m; }

  return Object.freeze({ init, dispose, say, setVoiceVolume, setVoiceMuted });
})();
