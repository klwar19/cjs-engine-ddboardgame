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
  let _noiseBuffer = null;
  let _emptyManifestNoticeShown = false;
  let _bgmFadeRaf = 0;
  let _bgmStopTimer = 0;
  let _lastBgmError = null;

  const _subs = new Set();

  // Built-in synthesized fallback presets. These still intentionally sound
  // lightweight, but they are layered enough to feel closer to game UI SFX
  // than the original single-oscillator beeps.
  const FALLBACK_TONES = {
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

  // ── SFX ───────────────────────────────────────────────────────────
  // playSfx(key) → tries the explicit key, then any caller-supplied
  // fallback chain. If no audio file is registered, plays a synthesized
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
    const path = _manifest.bgm?.[id];
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
      path: _bgmCurrentId ? (_manifest.bgm?.[_bgmCurrentId] || null) : null,
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
