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

  const SFX_POOL_SIZE = 6;
  const LS_SFX_VOL = 'cjs.audio.sfxVol';
  const LS_BGM_VOL = 'cjs.audio.bgmVol';
  const LS_MUTED   = 'cjs.audio.muted';

  let _manifest = { sfx: {}, bgm: {} };
  let _loaded = false;

  let _sfxPool = [];
  let _sfxIdx  = 0;
  let _bgmEl   = null;
  let _bgmCurrentId = null;

  let _sfxVolume = _readVol(LS_SFX_VOL, 0.7);
  let _bgmVolume = _readVol(LS_BGM_VOL, 0.5);
  let _muted     = _readBool(LS_MUTED, false);

  // WebAudio fallback: when the manifest has no MP3 for a key, synthesize
  // a short tone instead so the system is audible out of the box.
  let _audioCtx = null;
  let _emptyManifestNoticeShown = false;

  // Built-in fallback tones (frequency Hz, duration ms, type).
  // Keys match the SFX keys playSfx() resolves, plus per-element variants.
  const FALLBACK_TONES = {
    weapon_hit_physical: { f: 220, d: 90,  t: 'square'   },
    weapon_hit_fire:     { f: 380, d: 110, t: 'sawtooth' },
    weapon_hit_ice:      { f: 880, d: 100, t: 'triangle' },
    weapon_hit_lightning:{ f: 1320,d: 70,  t: 'sawtooth' },
    weapon_hit_water:    { f: 520, d: 110, t: 'sine'     },
    magic_cast:          { f: 660, d: 200, t: 'triangle' },
    magic_hit:           { f: 990, d: 160, t: 'triangle' },
    item_use:            { f: 740, d: 140, t: 'sine'     },
    ko:                  { f: 110, d: 280, t: 'sawtooth' },
    status_apply:        { f: 540, d: 120, t: 'square'   },
    ui_click:            { f: 1200,d: 40,  t: 'sine'     }
  };

  function _ensureAudioCtx() {
    if (_audioCtx) return _audioCtx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try { _audioCtx = new Ctor(); } catch (e) { _audioCtx = null; }
    return _audioCtx;
  }

  function _playFallbackTone(key, gainScale) {
    const tone = FALLBACK_TONES[key];
    if (!tone) return;
    const ctx = _ensureAudioCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const peak = _clamp01(_sfxVolume * (gainScale || 1)) * 0.18;
      osc.type = tone.t;
      osc.frequency.setValueAtTime(tone.f, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.d / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + tone.d / 1000 + 0.05);
    } catch (e) { /* swallow */ }
  }

  // ── INIT ──────────────────────────────────────────────────────────
  async function loadManifest() {
    if (_loaded) return _manifest;
    try {
      const response = await fetch('data/audio-manifest.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      _manifest = _normalize(await response.json());
    } catch (error) {
      console.warn('Audio manifest unavailable (non-fatal):', error.message);
      _manifest = _normalize();
    }
    _loaded = true;
    return _manifest;
  }

  function getManifest() { return _manifest; }

  function _normalize(value) {
    return {
      sfx: (value && typeof value.sfx === 'object' && value.sfx) ? { ...value.sfx } : {},
      bgm: (value && typeof value.bgm === 'object' && value.bgm) ? { ...value.bgm } : {}
    };
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
    return _bgmEl;
  }

  // ── SFX ───────────────────────────────────────────────────────────
  // playSfx(key) → tries the explicit key, then any caller-supplied
  // fallback chain. If no MP3 is registered, plays a synthesized
  // WebAudio tone so the system is audible without uploaded files.
  function playSfx(key, opts) {
    if (_muted) return;
    const candidates = [key, ...(Array.isArray(opts?.fallbacks) ? opts.fallbacks : [])];
    const path = _resolveSfxPath(candidates);
    if (path && typeof Audio !== 'undefined') {
      _ensureSfxPool();
      const slot = _sfxPool[_sfxIdx];
      _sfxIdx = (_sfxIdx + 1) % _sfxPool.length;
      try {
        slot.src = path;
        slot.volume = _clamp01(_sfxVolume * (opts?.volume ?? 1));
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

  function _resolveSfxPath(candidates) {
    if (!candidates) return null;
    for (const k of candidates) {
      if (!k) continue;
      const p = _manifest.sfx?.[k];
      if (p) return p;
    }
    return null;
  }

  function _showEmptyManifestNoticeOnce() {
    if (_emptyManifestNoticeShown) return;
    const sfxCount = Object.keys(_manifest.sfx || {}).length;
    const bgmCount = Object.keys(_manifest.bgm || {}).length;
    if (sfxCount === 0 && bgmCount === 0) {
      _emptyManifestNoticeShown = true;
      console.info(
        '[CJS Audio] No MP3s registered in data/audio-manifest.json — '
        + 'using synthesized fallback tones. Upload your own MP3s via '
        + 'Editor → Audio Library to replace them.'
      );
    }
  }

  // ── BGM ───────────────────────────────────────────────────────────
  // playBgm(idOrPool, { fadeMs, volume })
  //   idOrPool: string id, or array — array picks one entry at random.
  function playBgm(idOrPool, opts) {
    if (typeof Audio === 'undefined') return;
    opts = opts || {};
    const id = _pickBgmId(idOrPool);
    if (!id) { stopBgm(opts); return; }
    const path = _manifest.bgm?.[id];
    if (!path) {
      console.warn('AudioManager: bgm id not found in manifest:', id);
      return;
    }
    if (id === _bgmCurrentId && _bgmEl && !_bgmEl.paused) return;
    const el = _ensureBgmEl();
    if (!el) return;
    _bgmCurrentId = id;
    try {
      el.src = path;
      el.volume = _muted ? 0 : _clamp01(_bgmVolume * (opts.volume ?? 1));
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => { /* autoplay policy: needs user gesture; will retry on next gesture */ });
      }
    } catch (e) { /* swallow */ }
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
    try {
      _bgmEl.pause();
      _bgmEl.currentTime = 0;
    } catch (e) { /* swallow */ }
    _bgmCurrentId = null;
  }

  function getCurrentBgmId() { return _bgmCurrentId; }
  function isBgmPlaying() {
    return !!(_bgmEl && !_bgmEl.paused && !_bgmEl.ended && _bgmCurrentId);
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
      if (_bgmEl) _bgmEl.volume = _muted ? 0 : v;
    }
  }

  function getVolume(channel) {
    return channel === 'sfx' ? _sfxVolume : _bgmVolume;
  }

  function mute(flag) {
    _muted = !!flag;
    _writeBool(LS_MUTED, _muted);
    if (_bgmEl) _bgmEl.volume = _muted ? 0 : _bgmVolume;
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
    playSfx,
    playBgm,
    stopBgm,
    getCurrentBgmId,
    isBgmPlaying,
    setVolume,
    getVolume,
    mute,
    isMuted
  });
})();
