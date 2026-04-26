// audio-manager.js
// Singleton audio layer for combat SFX + BGM. Mirrors PortraitPicker:
// loads a manifest, caches assets, exposes play/stop/volume helpers.
// Audio is presentation-only — combat math never depends on it, and a
// missing file or unsupported browser must never break gameplay.
//
// Reads: data/audio-manifest.json
// Used by: combat-ui.js, action-handler.js, damage-calc.js,
//          combat-manager.js, status-manager.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.AudioManager = (() => {
  'use strict';

  const SFX_POOL_SIZE = 12;
  const LS_SFX_VOL = 'cjs.audio.sfxVol';
  const LS_BGM_VOL = 'cjs.audio.bgmVol';
  const LS_MUTED   = 'cjs.audio.muted';

  let _manifest = { sfx: {}, bgm: {} };
  let _loaded = false;

  let _sfxPool = [];
  let _sfxIdx  = 0;
  let _bgmEl   = null;
  let _bgmCurrentId = null;
  let _bgmCurrentPath = null;

  let _sfxVolume = _readVol(LS_SFX_VOL, 0.7);
  let _bgmVolume = _readVol(LS_BGM_VOL, 0.5);
  let _muted     = _readBool(LS_MUTED, false);

  // WebAudio fallback: when the manifest has no MP3 for a key, synthesize
  // a short tone instead so the system is audible out of the box.
  let _audioCtx = null;
  let _noiseBuffer = null;
  let _emptyManifestNoticeShown = false;
  let _bgmFadeRaf = 0;
  let _bgmStopTimer = 0;
  let _lastBgmError = null;

  const _subs = new Set();
  const SFX_VARIATION = {
    default:               { min: 0.985, max: 1.015 },
    ui_click:              { min: 0.99,  max: 1.03  },
    move_step:             { min: 0.94,  max: 1.02  },
    defend_guard:          { min: 0.98,  max: 1.02  },
    defend:                { min: 0.98,  max: 1.02  },
    miss:                  { min: 0.96,  max: 1.04  },
    heal:                  { min: 0.97,  max: 1.03  },
    crit_sting:            { min: 0.99,  max: 1.01  },
    critical:              { min: 0.99,  max: 1.01  },
    absorb_guard:          { min: 0.97,  max: 1.02  },
    status_apply:          { min: 0.96,  max: 1.04  },
    turn_start_player:     { min: 0.99,  max: 1.01  },
    turn_start_enemy:      { min: 0.985, max: 1.015 },
    weapon_slash:          { min: 0.98,  max: 1.02  },
    weapon_pierce:         { min: 0.98,  max: 1.04  },
    weapon_blunt:          { min: 0.94,  max: 0.99  },
    weapon_hit_physical:   { min: 0.94,  max: 1.06  },
    weapon_hit_fire:       { min: 0.95,  max: 1.05  },
    weapon_hit_ice:        { min: 0.97,  max: 1.04  },
    weapon_hit_lightning:  { min: 0.98,  max: 1.06  },
    weapon_hit_water:      { min: 0.95,  max: 1.03  },
    magic_cast:            { min: 0.97,  max: 1.03  },
    magic_hit:             { min: 0.96,  max: 1.05  },
    item_use:              { min: 0.98,  max: 1.03  },
    ko:                    { min: 0.985, max: 1.015 }
  };

  const SFX_KEY_ALIASES = {
    weapon_slash: ['weapon_hit_physical'],
    weapon_pierce: ['weapon_hit_physical'],
    weapon_blunt: ['weapon_hit_physical'],
    weapon_hit_wind: ['weapon_hit_physical'],
    weapon_hit_earth: ['weapon_hit_physical'],
    weapon_hit_holy: ['magic_hit'],
    weapon_hit_dark: ['magic_hit'],
    magic_fire: ['magic_hit'],
    magic_ice: ['magic_hit'],
    magic_lightning: ['magic_hit'],
    magic_holy: ['magic_hit'],
    magic_dark: ['magic_hit'],
    critical: ['crit_sting'],
    defend: ['defend_guard'],
    dodge: ['miss'],
    victory: ['ui_click'],
    defeat: ['ko'],
    level_up: ['ui_click'],
    item_potion: ['item_use'],
    item_buff: ['item_use'],
    item_throw: ['item_use'],
    status_buff: ['status_apply'],
    status_debuff: ['status_apply'],
    ui_cursor: ['ui_click'],
    ui_confirm: ['ui_click'],
    ui_cancel: ['ui_click'],
    ui_error: ['ui_click']
  };

  // Built-in synthesized fallback presets. These still intentionally sound
  // lightweight, but they are layered enough to feel closer to game UI SFX
  // than the original single-oscillator beeps.
  const FALLBACK_TONES = {
    weapon_slash: {
      noise: { duration: 0.055, gain: 0.08, highpass: 2100 }
    },
    weapon_pierce: {
      voices: [
        { type: 'square', startHz: 1420, endHz: 760, duration: 0.075, gain: 0.10 },
        { type: 'triangle', startHz: 1960, endHz: 1020, duration: 0.055, gain: 0.05, delay: 0.008 }
      ]
    },
    weapon_blunt: {
      voices: [
        { type: 'sine', startHz: 104, endHz: 72, duration: 0.15, gain: 0.22 },
        { type: 'triangle', startHz: 170, endHz: 90, duration: 0.11, gain: 0.08, delay: 0.012 }
      ]
    },
    weapon_hit_physical: {
      voices: [
        { type: 'triangle', startHz: 150, endHz: 82, duration: 0.10, gain: 0.28 },
        { type: 'square', startHz: 880, endHz: 260, duration: 0.05, gain: 0.08, delay: 0.006 }
      ],
      noise: { duration: 0.045, gain: 0.10, highpass: 1400 }
    },
    weapon_hit_fire: {
      voices: [
        { type: 'sawtooth', startHz: 320, endHz: 520, duration: 0.12, gain: 0.18 },
        { type: 'triangle', startHz: 740, endHz: 440, duration: 0.08, gain: 0.10, delay: 0.012 }
      ],
      noise: { duration: 0.060, gain: 0.09, bandpass: 2000 }
    },
    weapon_hit_ice: {
      voices: [
        { type: 'triangle', startHz: 1120, endHz: 780, duration: 0.11, gain: 0.17 },
        { type: 'sine', startHz: 1760, endHz: 1280, duration: 0.05, gain: 0.07, delay: 0.016 }
      ]
    },
    weapon_hit_lightning: {
      voices: [
        { type: 'square', startHz: 1600, endHz: 420, duration: 0.07, gain: 0.16 },
        { type: 'sawtooth', startHz: 2200, endHz: 980, duration: 0.05, gain: 0.10, delay: 0.008 }
      ],
      noise: { duration: 0.030, gain: 0.08, highpass: 3200 }
    },
    weapon_hit_water: {
      voices: [
        { type: 'sine', startHz: 420, endHz: 300, duration: 0.14, gain: 0.18 },
        { type: 'triangle', startHz: 760, endHz: 430, duration: 0.09, gain: 0.07, delay: 0.018 }
      ]
    },
    weapon_hit_wind: {
      voices: [
        { type: 'triangle', startHz: 540, endHz: 340, duration: 0.12, gain: 0.08 }
      ],
      noise: { duration: 0.070, gain: 0.07, highpass: 2400 }
    },
    weapon_hit_earth: {
      voices: [
        { type: 'square', startHz: 112, endHz: 70, duration: 0.16, gain: 0.22 },
        { type: 'triangle', startHz: 260, endHz: 140, duration: 0.08, gain: 0.06, delay: 0.01 }
      ]
    },
    weapon_hit_holy: {
      voices: [
        { type: 'sine', startHz: 900, endHz: 1240, duration: 0.20, gain: 0.12 },
        { type: 'sine', startHz: 1320, endHz: 1760, duration: 0.16, gain: 0.07, delay: 0.03 }
      ]
    },
    weapon_hit_dark: {
      voices: [
        { type: 'sawtooth', startHz: 260, endHz: 150, duration: 0.18, gain: 0.14 },
        { type: 'triangle', startHz: 180, endHz: 96, duration: 0.15, gain: 0.08, delay: 0.018 }
      ]
    },
    magic_cast: {
      voices: [
        { type: 'triangle', startHz: 420, endHz: 780, duration: 0.22, gain: 0.18 },
        { type: 'sine', startHz: 690, endHz: 1180, duration: 0.18, gain: 0.07, delay: 0.018 }
      ]
    },
    magic_hit: {
      voices: [
        { type: 'triangle', startHz: 980, endHz: 520, duration: 0.17, gain: 0.20 },
        { type: 'square', startHz: 1520, endHz: 760, duration: 0.09, gain: 0.08, delay: 0.012 }
      ],
      noise: { duration: 0.035, gain: 0.05, bandpass: 1800 }
    },
    move_step: {
      voices: [
        { type: 'triangle', startHz: 290, endHz: 210, duration: 0.065, gain: 0.09 },
        { type: 'sine', startHz: 620, endHz: 420, duration: 0.030, gain: 0.04, delay: 0.01 }
      ]
    },
    defend_guard: {
      voices: [
        { type: 'square', startHz: 320, endHz: 420, duration: 0.10, gain: 0.11 },
        { type: 'sine', startHz: 760, endHz: 920, duration: 0.08, gain: 0.06, delay: 0.01 }
      ]
    },
    miss: {
      voices: [
        { type: 'sine', startHz: 620, endHz: 430, duration: 0.09, gain: 0.09 },
        { type: 'triangle', startHz: 840, endHz: 520, duration: 0.06, gain: 0.04, delay: 0.008 }
      ]
    },
    heal: {
      voices: [
        { type: 'sine', startHz: 540, endHz: 780, duration: 0.18, gain: 0.16 },
        { type: 'triangle', startHz: 780, endHz: 1160, duration: 0.13, gain: 0.08, delay: 0.03 }
      ]
    },
    crit_sting: {
      voices: [
        { type: 'square', startHz: 1220, endHz: 1680, duration: 0.085, gain: 0.11 },
        { type: 'square', startHz: 1660, endHz: 2360, duration: 0.070, gain: 0.07, delay: 0.016 }
      ]
    },
    absorb_guard: {
      voices: [
        { type: 'triangle', startHz: 430, endHz: 560, duration: 0.11, gain: 0.11 },
        { type: 'square', startHz: 960, endHz: 720, duration: 0.07, gain: 0.04, delay: 0.012 }
      ],
      noise: { duration: 0.022, gain: 0.03, highpass: 2800 }
    },
    item_use: {
      voices: [
        { type: 'sine', startHz: 580, endHz: 840, duration: 0.18, gain: 0.16 },
        { type: 'triangle', startHz: 880, endHz: 1280, duration: 0.11, gain: 0.07, delay: 0.012 }
      ]
    },
    ko: {
      voices: [
        { type: 'sawtooth', startHz: 180, endHz: 72, duration: 0.30, gain: 0.25 },
        { type: 'triangle', startHz: 120, endHz: 52, duration: 0.26, gain: 0.14, delay: 0.015 }
      ],
      noise: { duration: 0.080, gain: 0.06, lowpass: 700 }
    },
    status_apply: {
      voices: [
        { type: 'square', startHz: 520, endHz: 640, duration: 0.11, gain: 0.12 },
        { type: 'triangle', startHz: 880, endHz: 1040, duration: 0.08, gain: 0.07, delay: 0.012 }
      ]
    },
    ui_click: {
      voices: [
        { type: 'sine', startHz: 980, endHz: 1160, duration: 0.05, gain: 0.10 }
      ]
    }
  };

  function _ensureAudioCtx() {
    if (_audioCtx) return _audioCtx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try { _audioCtx = new Ctor(); } catch (e) { _audioCtx = null; }
    return _audioCtx;
  }

  function _ensureNoiseBuffer(ctx) {
    if (_noiseBuffer) return _noiseBuffer;
    try {
      const length = Math.max(1, Math.floor(ctx.sampleRate * 0.4));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      _noiseBuffer = buffer;
    } catch (e) {
      _noiseBuffer = null;
    }
    return _noiseBuffer;
  }

  function _playOscVoice(ctx, when, voice, gainScale) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = when + (voice.delay || 0);
    const end = start + Math.max(0.01, voice.duration || 0.08);
    const peak = _clamp01((gainScale || 1) * (voice.gain || 0.1)) * 0.22;
    const attack = Math.min(0.01, (voice.duration || 0.08) * 0.18);

    osc.type = voice.type || 'sine';
    osc.frequency.setValueAtTime(voice.startHz || voice.endHz || 440, start);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(18, voice.endHz || voice.startHz || 440),
      end
    );

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, peak), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }

  function _playNoiseBurst(ctx, when, noise, gainScale) {
    const buffer = _ensureNoiseBuffer(ctx);
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    let node = source;
    if (noise.lowpass || noise.highpass || noise.bandpass) {
      const filter = ctx.createBiquadFilter();
      if (noise.bandpass) {
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(noise.bandpass, when);
        filter.Q.setValueAtTime(1.2, when);
      } else if (noise.highpass) {
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(noise.highpass, when);
      } else if (noise.lowpass) {
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(noise.lowpass, when);
      }
      source.connect(filter);
      node = filter;
    }

    const gain = ctx.createGain();
    const start = when + (noise.delay || 0);
    const end = start + Math.max(0.01, noise.duration || 0.04);
    const peak = _clamp01((gainScale || 1) * (noise.gain || 0.05)) * 0.22;
    gain.gain.setValueAtTime(Math.max(0.0001, peak), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    node.connect(gain);
    gain.connect(ctx.destination);
    source.start(start);
    source.stop(end + 0.02);
  }

  function _playFallbackTone(key, gainScale) {
    const tone = FALLBACK_TONES[key];
    if (!tone) return;
    const ctx = _ensureAudioCtx();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime + 0.002;
      const gain = _sfxVolume * (gainScale || 1);
      for (const voice of (tone.voices || [])) {
        _playOscVoice(ctx, now, voice, gain);
      }
      if (tone.noise) {
        _playNoiseBurst(ctx, now, tone.noise, gain);
      }
    } catch (e) { /* swallow */ }
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    _subs.add(fn);
    return () => _subs.delete(fn);
  }

  function _notify() {
    const snapshot = getBgmState();
    for (const fn of Array.from(_subs)) {
      try { fn(snapshot); } catch (e) { /* swallow */ }
    }
  }

  // ── INIT ──────────────────────────────────────────────────────────
  async function loadManifest() {
    if (_loaded) return _manifest;
    try {
      const response = await fetch(`data/audio-manifest.json?ts=${Date.now()}`, {
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      _manifest = _normalize(await response.json());
    } catch (error) {
      console.warn('Audio manifest unavailable (non-fatal):', error.message);
      _manifest = _normalize();
    }
    _loaded = true;
    _notify();
    return _manifest;
  }

  function getManifest() { return _manifest; }

  function _normalize(value) {
    return {
      sfx: _normalizeBucket(value?.sfx),
      bgm: _normalizeBucket(value?.bgm)
    };
  }

  function _normalizeBucket(bucket) {
    const out = {};
    if (!bucket || typeof bucket !== 'object') return out;
    for (const [id, raw] of Object.entries(bucket)) {
      const entry = _normalizeEntry(raw);
      if (entry) out[id] = entry;
    }
    return out;
  }

  function _normalizeEntry(raw) {
    if (typeof raw === 'string') {
      const s = raw.trim();
      return s ? s : null;
    }
    if (Array.isArray(raw)) {
      const arr = raw
        .map((item) => String(item || '').trim())
        .filter(Boolean);
      return arr.length ? arr : null;
    }
    return null;
  }

  function _ensureSfxPool() {
    if (_sfxPool.length) return;
    if (typeof Audio === 'undefined') return;
    for (let i = 0; i < SFX_POOL_SIZE; i++) {
      const a = new Audio();
      a.preload = 'auto';
      _sfxPool.push(a);
    }
  }

  function _ensureBgmEl() {
    if (_bgmEl) return _bgmEl;
    if (typeof Audio === 'undefined') return null;
    _bgmEl = new Audio();
    _bgmEl.loop = true;
    _bgmEl.preload = 'auto';
    _bgmEl.addEventListener('play', () => {
      _lastBgmError = null;
      _notify();
    });
    _bgmEl.addEventListener('pause', _notify);
    _bgmEl.addEventListener('ended', _notify);
    _bgmEl.addEventListener('loadeddata', () => {
      _lastBgmError = null;
      _notify();
    });
    _bgmEl.addEventListener('error', () => {
      _lastBgmError = 'load_error';
      _notify();
    });
    return _bgmEl;
  }

  function _resolveManifestEntry(kind, candidates) {
    if (!Array.isArray(candidates)) return null;
    for (const key of candidates) {
      if (!key) continue;
      const entry = _manifest?.[kind]?.[key];
      const path = _pickEntryPath(entry);
      if (path) return { key, path, entry };
    }
    return null;
  }

  function _pickEntryPath(entry) {
    if (Array.isArray(entry)) {
      const paths = entry.map((item) => String(item || '').trim()).filter(Boolean);
      if (!paths.length) return null;
      return paths[Math.floor(Math.random() * paths.length)];
    }
    if (typeof entry === 'string') {
      const s = entry.trim();
      return s || null;
    }
    return null;
  }

  function _pickPlaybackRate(key, override) {
    if (override != null && isFinite(Number(override))) {
      return Math.max(0.5, Math.min(2, Number(override)));
    }
    const range = SFX_VARIATION[key] || SFX_VARIATION.default;
    const min = Number(range?.min) || 1;
    const max = Number(range?.max) || min;
    return min + ((max - min) * Math.random());
  }

  function _expandSfxCandidates(key, fallbacks) {
    const direct = [key, ...(Array.isArray(fallbacks) ? fallbacks : [])]
      .map((item) => String(item || '').trim())
      .filter(Boolean);

    const out = [];
    const seen = new Set();
    const push = (candidate) => {
      if (!candidate || seen.has(candidate)) return;
      seen.add(candidate);
      out.push(candidate);
    };

    direct.forEach(push);
    const queue = direct.slice();
    while (queue.length) {
      const candidate = queue.shift();
      const aliases = Array.isArray(SFX_KEY_ALIASES[candidate]) ? SFX_KEY_ALIASES[candidate] : [];
      for (const alias of aliases) {
        const id = String(alias || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
        queue.push(id);
      }
    }
    return out;
  }

  // ── SFX ───────────────────────────────────────────────────────────
  // playSfx(key) → tries the explicit key, then any caller-supplied
  // fallback chain. If no audio file is registered, plays a synthesized
  // WebAudio tone so the system is audible without uploaded files.
  function playSfx(key, opts) {
    if (_muted) return;
    const candidates = _expandSfxCandidates(key, opts?.fallbacks);
    const resolved = _resolveManifestEntry('sfx', candidates);
    if (resolved && typeof Audio !== 'undefined') {
      _ensureSfxPool();
      const slot = _sfxPool[_sfxIdx];
      _sfxIdx = (_sfxIdx + 1) % _sfxPool.length;
      try {
        slot.src = resolved.path;
        slot.volume = _clamp01(_sfxVolume * (opts?.volume ?? 1));
        slot.playbackRate = _pickPlaybackRate(resolved.key, opts?.playbackRate);
        slot.defaultPlaybackRate = slot.playbackRate;
        if ('preservesPitch' in slot) slot.preservesPitch = false;
        if ('mozPreservesPitch' in slot) slot.mozPreservesPitch = false;
        if ('webkitPreservesPitch' in slot) slot.webkitPreservesPitch = false;
        slot.currentTime = 0;
        const p = slot.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) { /* never throw from audio */ }
      return;
    }
    // Fallback: synthesize a tone for the first candidate that has one.
    _showEmptyManifestNoticeOnce();
    for (const k of candidates) {
      if (FALLBACK_TONES[k]) { _playFallbackTone(k, opts?.volume ?? 1); return; }
    }
  }

  function _showEmptyManifestNoticeOnce() {
    if (_emptyManifestNoticeShown) return;
    const sfxCount = Object.keys(_manifest.sfx || {}).length;
    const bgmCount = Object.keys(_manifest.bgm || {}).length;
    if (sfxCount === 0 && bgmCount === 0) {
      _emptyManifestNoticeShown = true;
      console.info(
        '[CJS Audio] No audio files registered in data/audio-manifest.json — '
        + 'using synthesized fallback tones. Upload your own tracks via '
        + 'Editor → Audio Library to replace them.'
      );
    }
  }

  // ── BGM ───────────────────────────────────────────────────────────
  // playBgm(idOrPool, { fadeMs, volume })
  //   idOrPool: string id, or array — array picks one entry at random.
  function _cancelBgmFade() {
    if (_bgmFadeRaf) {
      cancelAnimationFrame(_bgmFadeRaf);
      _bgmFadeRaf = 0;
    }
  }

  function _cancelBgmStop() {
    if (_bgmStopTimer) {
      clearTimeout(_bgmStopTimer);
      _bgmStopTimer = 0;
    }
  }

  function _fadeBgmVolume(target, ms) {
    if (!_bgmEl) return;
    _cancelBgmFade();

    const end = _muted ? 0 : _clamp01(target);
    const duration = Math.max(0, Number(ms) || 0);
    if (!duration || typeof requestAnimationFrame !== 'function') {
      _bgmEl.volume = end;
      _notify();
      return;
    }

    const startVolume = Number(_bgmEl.volume) || 0;
    const startedAt = Date.now();
    const tick = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      _bgmEl.volume = startVolume + ((end - startVolume) * eased);
      if (progress < 1) {
        _bgmFadeRaf = requestAnimationFrame(tick);
      } else {
        _bgmFadeRaf = 0;
        _notify();
      }
    };
    _bgmFadeRaf = requestAnimationFrame(tick);
  }

  function playBgm(idOrPool, opts) {
    if (typeof Audio === 'undefined') return;
    opts = opts || {};
    const id = _pickBgmId(idOrPool);
    if (!id) { stopBgm(opts); return; }
    const path = _pickEntryPath(_manifest.bgm?.[id]);
    if (!path) {
      console.warn('AudioManager: bgm id not found in manifest:', id);
      return;
    }
    if (id === _bgmCurrentId && _bgmEl && !_bgmEl.paused) return;
    const el = _ensureBgmEl();
    if (!el) return;
    _cancelBgmStop();
    _cancelBgmFade();
    _bgmCurrentId = id;
    _bgmCurrentPath = path;
    _lastBgmError = null;
    const targetVolume = _muted ? 0 : _clamp01(_bgmVolume * (opts.volume ?? 1));
    const fadeMs = Math.max(0, Number(opts.fadeMs ?? 320) || 0);
    try {
      el.src = path;
      el.volume = fadeMs > 0 && !_muted ? 0 : targetVolume;
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.then(() => {
          _lastBgmError = null;
          _fadeBgmVolume(targetVolume, fadeMs);
          _notify();
        }).catch(() => {
          _lastBgmError = 'autoplay_blocked';
          _notify();
        });
      } else {
        _fadeBgmVolume(targetVolume, fadeMs);
      }
    } catch (e) { /* swallow */ }
    _notify();
  }

  function _pickBgmId(idOrPool) {
    if (!idOrPool) return null;
    if (Array.isArray(idOrPool)) {
      if (!idOrPool.length) return null;
      return idOrPool[Math.floor(Math.random() * idOrPool.length)];
    }
    return String(idOrPool);
  }

  function stopBgm(opts) {
    if (!_bgmEl) return;
    const fadeMs = Math.max(0, Number(opts?.fadeMs ?? 180) || 0);
    const finish = () => {
      _cancelBgmFade();
      _cancelBgmStop();
      try {
        _bgmEl.pause();
        _bgmEl.currentTime = 0;
      } catch (e) { /* swallow */ }
      _bgmCurrentId = null;
      _bgmCurrentPath = null;
      _lastBgmError = null;
      _notify();
    };

    _cancelBgmStop();
    if (fadeMs > 0 && !_bgmEl.paused) {
      _fadeBgmVolume(0, fadeMs);
      _bgmStopTimer = setTimeout(finish, fadeMs + 30);
      return;
    }
    finish();
  }

  function getCurrentBgmId() { return _bgmCurrentId; }
  function isBgmPlaying() {
    return !!(_bgmEl && !_bgmEl.paused && !_bgmEl.ended && _bgmCurrentId);
  }

  function getBgmState() {
    return {
      currentId: _bgmCurrentId,
      path: _bgmCurrentPath,
      playing: !!(_bgmEl && !_bgmEl.paused && !_bgmEl.ended && _bgmCurrentId),
      paused: !!(_bgmEl && _bgmEl.paused),
      readyState: _bgmEl?.readyState || 0,
      muted: _muted,
      sfxVolume: _sfxVolume,
      bgmVolume: _bgmVolume,
      error: _lastBgmError
    };
  }

  // ── VOLUME / MUTE ─────────────────────────────────────────────────
  function setVolume(channel, value) {
    const v = _clamp01(value);
    if (channel === 'sfx') {
      _sfxVolume = v;
      _writeNum(LS_SFX_VOL, v);
    } else if (channel === 'bgm') {
      _bgmVolume = v;
      _writeNum(LS_BGM_VOL, v);
      if (_bgmEl) _fadeBgmVolume(v, 120);
    }
    _notify();
  }

  function getVolume(channel) {
    return channel === 'sfx' ? _sfxVolume : _bgmVolume;
  }

  function mute(flag) {
    _muted = !!flag;
    _writeBool(LS_MUTED, _muted);
    if (_bgmEl) _fadeBgmVolume(_bgmVolume, 120);
    _notify();
  }

  function isMuted() { return _muted; }

  // ── HELPERS ───────────────────────────────────────────────────────
  function _clamp01(v) {
    const n = Number(v);
    if (!isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function _readVol(key, fallback) {
    try {
      const raw = window.localStorage?.getItem(key);
      if (raw == null) return fallback;
      const n = parseFloat(raw);
      return isFinite(n) ? _clamp01(n) : fallback;
    } catch (e) { return fallback; }
  }

  function _readBool(key, fallback) {
    try {
      const raw = window.localStorage?.getItem(key);
      if (raw == null) return fallback;
      return raw === '1' || raw === 'true';
    } catch (e) { return fallback; }
  }

  function _writeNum(key, value) {
    try { window.localStorage?.setItem(key, String(value)); } catch (e) { /* private mode */ }
  }

  function _writeBool(key, value) {
    try { window.localStorage?.setItem(key, value ? '1' : '0'); } catch (e) { /* private mode */ }
  }

  return Object.freeze({
    loadManifest,
    getManifest,
    subscribe,
    playSfx,
    playBgm,
    stopBgm,
    getCurrentBgmId,
    getBgmState,
    isBgmPlaying,
    setVolume,
    getVolume,
    mute,
    isMuted
  });
})();
