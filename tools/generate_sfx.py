#!/usr/bin/env python3
"""
Procedurally synthesize the combat SFX set into audio/sfx/.

Output: 44.1 kHz, 16-bit, stereo WAVs. Pure stdlib (math, wave, struct,
random) so it runs on a vanilla Python 3 install.

These are still synthesized (not recorded), but they're a solid step up
from the original ~22 kHz mono blips: layered voices, ADSR envelopes,
1-pole filters, light Schroeder reverb tails, and small stereo width.

Run from repo root:
    python3 tools/generate_sfx.py
"""

import math
import os
import random
import struct
import wave

SR = 44100
TAU = math.tau
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "audio", "sfx")


# ─────────────────────────────────────────────────────────────────────
# Primitives
# ─────────────────────────────────────────────────────────────────────

def n_samples(seconds):
    return max(1, int(seconds * SR))


def osc(wave_type, freq_curve, phase0=0.0):
    """Generate samples for an oscillator. freq_curve is a list of per-sample Hz values."""
    out = [0.0] * len(freq_curve)
    phase = phase0
    if wave_type == "sine":
        for i, f in enumerate(freq_curve):
            out[i] = math.sin(phase)
            phase += TAU * f / SR
    elif wave_type == "square":
        for i, f in enumerate(freq_curve):
            out[i] = 1.0 if math.sin(phase) >= 0 else -1.0
            phase += TAU * f / SR
    elif wave_type == "triangle":
        for i, f in enumerate(freq_curve):
            x = (phase / TAU) % 1.0
            out[i] = 4.0 * abs(x - 0.5) - 1.0
            phase += TAU * f / SR
    elif wave_type == "sawtooth":
        for i, f in enumerate(freq_curve):
            x = (phase / TAU) % 1.0
            out[i] = 2.0 * x - 1.0
            phase += TAU * f / SR
    return out


def freq_sweep(start_hz, end_hz, n, curve="exp"):
    if n <= 1:
        return [start_hz]
    if curve == "exp" and start_hz > 0 and end_hz > 0:
        ratio = end_hz / start_hz
        return [start_hz * (ratio ** (i / (n - 1))) for i in range(n)]
    return [start_hz + (end_hz - start_hz) * (i / (n - 1)) for i in range(n)]


def freq_const(hz, n):
    return [hz] * n


def freq_vibrato(base_hz, n, rate_hz=5.0, depth_cents=20):
    """Constant freq with vibrato."""
    out = [0.0] * n
    semitone = 2 ** (depth_cents / 1200.0)
    for i in range(n):
        lfo = math.sin(TAU * rate_hz * i / SR)
        out[i] = base_hz * (semitone ** lfo)
    return out


def noise(n, seed=None):
    rng = random.Random(seed)
    return [rng.uniform(-1.0, 1.0) for _ in range(n)]


# ─────────────────────────────────────────────────────────────────────
# Envelopes
# ─────────────────────────────────────────────────────────────────────

def env_ad(n, attack_s=0.005, decay_s=0.1, curve="exp"):
    """Attack-decay envelope (no sustain)."""
    a = max(1, int(attack_s * SR))
    d = max(1, n - a)
    out = [0.0] * n
    for i in range(min(a, n)):
        out[i] = i / a
    if curve == "exp":
        tau = max(1.0, decay_s * SR / 4.0)
        for i in range(a, n):
            out[i] = math.exp(-(i - a) / tau)
    else:
        for i in range(a, n):
            out[i] = max(0.0, 1.0 - (i - a) / d)
    return out


def env_adsr(n, attack_s=0.01, decay_s=0.05, sustain=0.6, release_s=0.1):
    a = max(1, int(attack_s * SR))
    d = max(1, int(decay_s * SR))
    r = max(1, int(release_s * SR))
    s = max(0, n - a - d - r)
    out = [0.0] * n
    idx = 0
    for i in range(min(a, n - idx)):
        out[idx + i] = i / a
    idx += a
    for i in range(min(d, n - idx)):
        out[idx + i] = 1.0 - (i / d) * (1.0 - sustain)
    idx += d
    for i in range(min(s, n - idx)):
        out[idx + i] = sustain
    idx += s
    for i in range(min(r, n - idx)):
        out[idx + i] = sustain * max(0.0, 1.0 - i / r)
    return out


def apply_env(samples, env):
    n = min(len(samples), len(env))
    return [samples[i] * env[i] for i in range(n)]


def gain(samples, g):
    return [s * g for s in samples]


# ─────────────────────────────────────────────────────────────────────
# Filters (1-pole IIR)
# ─────────────────────────────────────────────────────────────────────

def lowpass(samples, cutoff_hz):
    if cutoff_hz <= 0:
        return list(samples)
    rc = 1.0 / (TAU * cutoff_hz)
    dt = 1.0 / SR
    alpha = dt / (rc + dt)
    out = [0.0] * len(samples)
    y = 0.0
    for i, x in enumerate(samples):
        y = y + alpha * (x - y)
        out[i] = y
    return out


def highpass(samples, cutoff_hz):
    if cutoff_hz <= 0:
        return list(samples)
    rc = 1.0 / (TAU * cutoff_hz)
    dt = 1.0 / SR
    alpha = rc / (rc + dt)
    out = [0.0] * len(samples)
    y = 0.0
    prev_x = 0.0
    for i, x in enumerate(samples):
        y = alpha * (y + x - prev_x)
        prev_x = x
        out[i] = y
    return out


def bandpass(samples, lo_hz, hi_hz):
    return lowpass(highpass(samples, lo_hz), hi_hz)


# ─────────────────────────────────────────────────────────────────────
# Stereo buffer + reverb
# ─────────────────────────────────────────────────────────────────────

class Buf:
    """Stereo float buffer for mixing layers."""

    def __init__(self, duration_s):
        self.n = n_samples(duration_s)
        self.l = [0.0] * self.n
        self.r = [0.0] * self.n

    def add(self, mono, start_s=0.0, gain_db=0.0, pan=0.0):
        """Mix mono samples in. pan in -1 (L) .. 1 (R), equal-power."""
        start = int(start_s * SR)
        g = 10.0 ** (gain_db / 20.0)
        # equal-power pan
        theta = (pan + 1.0) * math.pi / 4.0
        gl = math.cos(theta) * g
        gr = math.sin(theta) * g
        end = min(self.n, start + len(mono))
        for i in range(max(0, start), end):
            s = mono[i - start]
            self.l[i] += s * gl
            self.r[i] += s * gr

    def add_stereo(self, mono, start_s=0.0, gain_db=0.0, width=0.0):
        """Mix mono in but with a slight L/R offset for width (samples)."""
        start = int(start_s * SR)
        g = 10.0 ** (gain_db / 20.0)
        offset = max(0, int(width * SR))  # width in seconds (small, e.g. 0.0008)
        end = min(self.n, start + len(mono))
        for i in range(max(0, start), end):
            self.l[i] += mono[i - start] * g
            j = i + offset
            if 0 <= j < self.n:
                self.r[j] += mono[i - start] * g


def schroeder_reverb(samples, mix=0.18, decay=0.5, comb_ms=(29.7, 37.1, 41.1, 43.7)):
    """Tiny parallel-comb reverb. Returns wet+dry mono."""
    n = len(samples)
    wet = [0.0] * n
    for d_ms in comb_ms:
        d = max(1, int(d_ms * SR / 1000.0))
        buf = [0.0] * d
        idx = 0
        for i in range(n):
            v = buf[idx]
            buf[idx] = samples[i] + v * decay
            wet[i] += v
            idx = (idx + 1) % d
    # gentle lowpass on wet so the tail is darker than dry
    wet = lowpass(wet, 4500)
    return [samples[i] + wet[i] * mix / len(comb_ms) for i in range(n)]


def soft_clip(x):
    # tanh clipper, slightly cheaper than calling math.tanh in a tight loop
    return math.tanh(x)


def normalize_buf(buf, peak=0.88):
    pk = max(
        max((abs(s) for s in buf.l), default=0.0),
        max((abs(s) for s in buf.r), default=0.0),
        1e-9,
    )
    g = peak / pk
    buf.l = [soft_clip(s * g) for s in buf.l]
    buf.r = [soft_clip(s * g) for s in buf.r]


def write_wav(path, buf):
    samples = []
    for i in range(buf.n):
        l = max(-1.0, min(1.0, buf.l[i]))
        r = max(-1.0, min(1.0, buf.r[i]))
        samples.append(int(l * 32767))
        samples.append(int(r * 32767))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(struct.pack("<" + "h" * len(samples), *samples))


# ─────────────────────────────────────────────────────────────────────
# SFX builders
# ─────────────────────────────────────────────────────────────────────

def voice(wave_type, start_hz, end_hz, dur_s, attack_s=0.004, decay_curve="exp",
          freq_curve="exp", vibrato=None):
    n = n_samples(dur_s)
    if vibrato:
        base = freq_sweep(start_hz, end_hz, n, freq_curve)
        rate, depth = vibrato
        out = [0.0] * n
        phase = 0.0
        semitone = 2 ** (depth / 1200.0)
        for i in range(n):
            lfo = math.sin(TAU * rate * i / SR)
            f = base[i] * (semitone ** lfo)
            phase += TAU * f / SR
            if wave_type == "sine":
                out[i] = math.sin(phase)
            elif wave_type == "square":
                out[i] = 1.0 if math.sin(phase) >= 0 else -1.0
            elif wave_type == "triangle":
                x = (phase / TAU) % 1.0
                out[i] = 4.0 * abs(x - 0.5) - 1.0
            elif wave_type == "sawtooth":
                x = (phase / TAU) % 1.0
                out[i] = 2.0 * x - 1.0
        env = env_ad(n, attack_s, dur_s - attack_s, decay_curve)
        return apply_env(out, env)
    samples = osc(wave_type, freq_sweep(start_hz, end_hz, n, freq_curve))
    env = env_ad(n, attack_s, dur_s - attack_s, decay_curve)
    return apply_env(samples, env)


def noise_burst(dur_s, hp=None, lp=None, attack_s=0.001, decay_s=None, seed=None):
    n = n_samples(dur_s)
    samples = noise(n, seed=seed)
    if hp:
        samples = highpass(samples, hp)
    if lp:
        samples = lowpass(samples, lp)
    env = env_ad(n, attack_s, decay_s if decay_s else dur_s - attack_s)
    return apply_env(samples, env)


# ── Individual SFX ───────────────────────────────────────────────────

def sfx_ui_click(seed=1, alt=False):
    base = 1200 if not alt else 1380
    end = 1700 if not alt else 1980
    dur = 0.08
    buf = Buf(dur + 0.06)
    body = voice("sine", base, end, dur, attack_s=0.001)
    spark = voice("triangle", base * 1.5, end * 1.6, dur * 0.7, attack_s=0.0008)
    tap = noise_burst(0.012, hp=4500, decay_s=0.012, seed=seed)
    buf.add_stereo(body, 0, gain_db=-6, width=0.0006)
    buf.add_stereo(spark, 0, gain_db=-12, width=-0.0005)
    buf.add(tap, 0, gain_db=-8)
    normalize_buf(buf, peak=0.85)
    return buf


def sfx_move_step(seed=2, alt=False):
    base = 230 if not alt else 280
    end = 110 if not alt else 130
    dur = 0.10
    buf = Buf(dur + 0.06)
    thud = voice("triangle", base, end, dur, attack_s=0.002)
    sub = voice("sine", base * 0.5, end * 0.5, dur * 1.1, attack_s=0.001)
    scuff = noise_burst(0.06, lp=900, hp=120, decay_s=0.06, seed=seed)
    buf.add_stereo(thud, 0, gain_db=-4, width=0.0008)
    buf.add(sub, 0, gain_db=-10)
    buf.add(scuff, 0.005, gain_db=-12)
    normalize_buf(buf, peak=0.78)
    return buf


def sfx_defend_guard():
    dur = 0.42
    buf = Buf(dur + 0.2)
    # metallic clang via inharmonic partials
    p1 = voice("triangle", 380, 360, 0.30, attack_s=0.001)
    p2 = voice("sine",     760, 720, 0.32, attack_s=0.001)
    p3 = voice("triangle", 1180, 1100, 0.25, attack_s=0.0015)
    p4 = voice("sine",     1750, 1640, 0.20, attack_s=0.002)
    p5 = voice("square",   2400, 2240, 0.14, attack_s=0.001)
    transient = noise_burst(0.022, hp=2200, decay_s=0.022)
    buf.add_stereo(p1, 0, gain_db=-7, width=0.0010)
    buf.add_stereo(p2, 0, gain_db=-9, width=-0.0010)
    buf.add_stereo(p3, 0, gain_db=-11, width=0.0014)
    buf.add_stereo(p4, 0, gain_db=-13, width=-0.0014)
    buf.add(p5, 0, gain_db=-16)
    buf.add(transient, 0, gain_db=-6)
    # reverb tail
    tail = schroeder_reverb([(buf.l[i] + buf.r[i]) * 0.5 for i in range(buf.n)],
                            mix=0.20, decay=0.55)
    for i in range(buf.n):
        buf.l[i] += tail[i] * 0.20
        buf.r[i] += tail[i] * 0.20
    normalize_buf(buf, peak=0.82)
    return buf


def sfx_miss(seed=3, alt=False):
    dur = 0.22 if not alt else 0.20
    buf = Buf(dur + 0.05)
    n = n_samples(dur)
    # swoosh = noise filtered by a moving bandpass
    raw = noise(n, seed=seed)
    # implement a sweeping bandpass by chunked filtering
    chunk = 256
    out = [0.0] * n
    lo_start = 220 if not alt else 280
    lo_end = 1500 if not alt else 1900
    hi_start = 800
    hi_end = 4500
    pos = 0
    while pos < n:
        end = min(pos + chunk, n)
        t = pos / max(1, n - 1)
        lo = lo_start + (lo_end - lo_start) * t
        hi = hi_start + (hi_end - hi_start) * t
        seg = highpass(raw[pos:end], lo)
        seg = lowpass(seg, hi)
        out[pos:end] = seg
        pos = end
    env = env_adsr(n, attack_s=0.04, decay_s=0.06, sustain=0.7, release_s=dur - 0.10)
    swoosh = apply_env(out, env)
    buf.add_stereo(swoosh, 0, gain_db=-3, width=0.0012)
    normalize_buf(buf, peak=0.7)
    return buf


def sfx_heal(seed=4, alt=False):
    dur = 0.55 if not alt else 0.60
    buf = Buf(dur + 0.25)
    # rising arpeggio of pure tones, layered shimmer
    notes = [(560, 760, 0.35, 0.00),
             (760, 1050, 0.32, 0.05),
             (1050, 1420, 0.28, 0.10),
             (1420, 1900, 0.24, 0.16)]
    if alt:
        notes = [(620, 840, 0.34, 0.00),
                 (840, 1180, 0.30, 0.06),
                 (1180, 1640, 0.26, 0.12),
                 (1640, 2200, 0.22, 0.18)]
    for idx, (s, e, d, t) in enumerate(notes):
        sine = voice("sine", s, e, d, attack_s=0.012, vibrato=(5.5, 12))
        tri = voice("triangle", s * 2, e * 2, d * 0.7, attack_s=0.014)
        buf.add_stereo(sine, t, gain_db=-6 - idx * 1.5, width=0.0010 if idx % 2 == 0 else -0.0010)
        buf.add_stereo(tri, t + 0.015, gain_db=-14 - idx, width=-0.0012 if idx % 2 == 0 else 0.0012)
    # sparkle
    spark = noise_burst(0.05, hp=5000, decay_s=0.05, seed=seed)
    buf.add(spark, 0, gain_db=-14)
    # reverb
    tail = schroeder_reverb([(buf.l[i] + buf.r[i]) * 0.5 for i in range(buf.n)],
                            mix=0.32, decay=0.62)
    for i in range(buf.n):
        buf.l[i] += tail[i] * 0.25
        buf.r[i] += tail[i] * 0.25
    normalize_buf(buf, peak=0.8)
    return buf


def sfx_crit_sting(seed=5):
    dur = 0.30
    buf = Buf(dur + 0.18)
    # three stacked square stabs rising in pitch
    s1 = voice("square", 1100, 1700, 0.10, attack_s=0.001)
    s2 = voice("square", 1700, 2400, 0.09, attack_s=0.001)
    s3 = voice("square", 2400, 3300, 0.08, attack_s=0.001)
    body = voice("triangle", 220, 110, 0.16, attack_s=0.001)
    crack = noise_burst(0.04, hp=3500, decay_s=0.04, seed=seed)
    buf.add_stereo(s1, 0.000, gain_db=-7, width=0.0009)
    buf.add_stereo(s2, 0.025, gain_db=-9, width=-0.0009)
    buf.add_stereo(s3, 0.050, gain_db=-12, width=0.0009)
    buf.add(body, 0, gain_db=-5)
    buf.add(crack, 0, gain_db=-7)
    tail = schroeder_reverb([(buf.l[i] + buf.r[i]) * 0.5 for i in range(buf.n)],
                            mix=0.22, decay=0.58)
    for i in range(buf.n):
        buf.l[i] += tail[i] * 0.18
        buf.r[i] += tail[i] * 0.18
    normalize_buf(buf, peak=0.88)
    return buf


def sfx_absorb_guard(seed=6):
    dur = 0.35
    buf = Buf(dur + 0.18)
    # rising warm pad with bell harmonic
    pad1 = voice("triangle", 280, 520, 0.30, attack_s=0.025, vibrato=(6.0, 18))
    pad2 = voice("sine",     560, 980, 0.28, attack_s=0.030, vibrato=(6.0, 14))
    bell = voice("sine",     1400, 2000, 0.18, attack_s=0.015)
    fizz = noise_burst(0.06, hp=2800, lp=6500, decay_s=0.06, seed=seed)
    buf.add_stereo(pad1, 0, gain_db=-6, width=0.0014)
    buf.add_stereo(pad2, 0.005, gain_db=-9, width=-0.0014)
    buf.add(bell, 0.020, gain_db=-13)
    buf.add(fizz, 0, gain_db=-14)
    tail = schroeder_reverb([(buf.l[i] + buf.r[i]) * 0.5 for i in range(buf.n)],
                            mix=0.30, decay=0.6)
    for i in range(buf.n):
        buf.l[i] += tail[i] * 0.22
        buf.r[i] += tail[i] * 0.22
    normalize_buf(buf, peak=0.82)
    return buf


def sfx_weapon_hit_physical(seed=7, alt=False):
    dur = 0.18 if not alt else 0.16
    buf = Buf(dur + 0.12)
    body = voice("triangle", 165 if not alt else 180, 75 if not alt else 80, dur * 0.9, attack_s=0.001)
    sub = voice("sine", 80, 50, dur, attack_s=0.001)
    transient = voice("square", 720 if not alt else 820, 240, 0.045, attack_s=0.0005)
    crunch = noise_burst(0.05, hp=1400, lp=5000, decay_s=0.05, seed=seed)
    buf.add_stereo(body, 0, gain_db=-3, width=0.0008)
    buf.add(sub, 0, gain_db=-7)
    buf.add(transient, 0, gain_db=-7)
    buf.add(crunch, 0, gain_db=-6)
    tail = schroeder_reverb([(buf.l[i] + buf.r[i]) * 0.5 for i in range(buf.n)],
                            mix=0.10, decay=0.4)
    for i in range(buf.n):
        buf.l[i] += tail[i] * 0.10
        buf.r[i] += tail[i] * 0.10
    normalize_buf(buf, peak=0.9)
    return buf


def sfx_weapon_hit_fire(seed=8, alt=False):
    dur = 0.30 if not alt else 0.34
    buf = Buf(dur + 0.18)
    body = voice("sawtooth", 280 if not alt else 300, 460 if not alt else 520, 0.20, attack_s=0.005, vibrato=(7, 35))
    glow = voice("triangle", 640, 880, 0.18, attack_s=0.02, vibrato=(6, 25))
    transient = voice("square", 920, 360, 0.04, attack_s=0.001)
    crackle = noise_burst(0.22, hp=1500, lp=4500, decay_s=0.22, seed=seed)
    buf.add_stereo(body, 0, gain_db=-4, width=0.0012)
    buf.add_stereo(glow, 0.012, gain_db=-9, width=-0.0012)
    buf.add(transient, 0, gain_db=-6)
    buf.add(crackle, 0, gain_db=-9)
    tail = schroeder_reverb([(buf.l[i] + buf.r[i]) * 0.5 for i in range(buf.n)],
                            mix=0.20, decay=0.55)
    for i in range(buf.n):
        buf.l[i] += tail[i] * 0.18
        buf.r[i] += tail[i] * 0.18
    normalize_buf(buf, peak=0.85)
    return buf


def sfx_weapon_hit_ice(seed=9, alt=False):
    dur = 0.28 if not alt else 0.32
    buf = Buf(dur + 0.25)
    transient = voice("triangle", 1100 if not alt else 1240, 780, 0.20, attack_s=0.0008)
    harmonic = voice("sine", 1900, 1380, 0.14, attack_s=0.002)
    bell = voice("sine", 2700, 1950, 0.10, attack_s=0.002)
    shatter = noise_burst(0.05, hp=6000, decay_s=0.05, seed=seed)
    buf.add_stereo(transient, 0, gain_db=-4, width=0.0010)
    buf.add_stereo(harmonic, 0.012, gain_db=-9, width=-0.0010)
    buf.add_stereo(bell, 0.025, gain_db=-12, width=0.0014)
    buf.add(shatter, 0, gain_db=-7)
    tail = schroeder_reverb([(buf.l[i] + buf.r[i]) * 0.5 for i in range(buf.n)],
                            mix=0.32, decay=0.66)
    for i in range(buf.n):
        buf.l[i] += tail[i] * 0.28
        buf.r[i] += tail[i] * 0.28
    normalize_buf(buf, peak=0.86)
    return buf


def sfx_weapon_hit_lightning(seed=10, alt=False):
    dur = 0.18 if not alt else 0.20
    buf = Buf(dur + 0.10)
    zap = voice("square", 1600 if not alt else 1820, 380, 0.10, attack_s=0.0004)
    buzz = voice("sawtooth", 2200, 920, 0.07, attack_s=0.0004)
    sub = voice("triangle", 220, 100, 0.08, attack_s=0.0008)
    crack = noise_burst(0.04, hp=3500, decay_s=0.04, seed=seed)
    buf.add_stereo(zap, 0, gain_db=-5, width=0.0007)
    buf.add_stereo(buzz, 0.005, gain_db=-9, width=-0.0007)
    buf.add(sub, 0, gain_db=-9)
    buf.add(crack, 0, gain_db=-6)
    tail = schroeder_reverb([(buf.l[i] + buf.r[i]) * 0.5 for i in range(buf.n)],
                            mix=0.14, decay=0.4)
    for i in range(buf.n):
        buf.l[i] += tail[i] * 0.12
        buf.r[i] += tail[i] * 0.12
    normalize_buf(buf, peak=0.9)
    return buf


def sfx_weapon_hit_water(seed=11, alt=False):
    dur = 0.32 if not alt else 0.30
    buf = Buf(dur + 0.20)
    body = voice("sine", 420 if not alt else 380, 280, 0.25, attack_s=0.003)
    bubble = voice("triangle", 720 if not alt else 800, 420, 0.18, attack_s=0.005)
    splash = noise_burst(0.30, hp=400, lp=3500, decay_s=0.30, seed=seed)
    drop = voice("sine", 920, 500, 0.05, attack_s=0.001)
    buf.add_stereo(body, 0, gain_db=-5, width=0.0010)
    buf.add_stereo(bubble, 0.020, gain_db=-9, width=-0.0010)
    buf.add(splash, 0, gain_db=-8)
    buf.add(drop, 0.06, gain_db=-12)
    tail = schroeder_reverb([(buf.l[i] + buf.r[i]) * 0.5 for i in range(buf.n)],
                            mix=0.20, decay=0.55)
    for i in range(buf.n):
        buf.l[i] += tail[i] * 0.18
        buf.r[i] += tail[i] * 0.18
    normalize_buf(buf, peak=0.84)
    return buf


def sfx_magic_cast(seed=12, alt=False):
    dur = 0.55 if not alt else 0.50
    buf = Buf(dur + 0.25)
    # rising hum + sparkle stack
    rise1 = voice("triangle", 380 if not alt else 320, 880 if not alt else 720, 0.42, attack_s=0.04, vibrato=(5.5, 18))
    rise2 = voice("sine",     580 if not alt else 520, 1240 if not alt else 1100, 0.40, attack_s=0.05, vibrato=(5.0, 14))
    rise3 = voice("sine",     1140, 2100, 0.32, attack_s=0.06)
    glitter = noise_burst(0.15, hp=5500, decay_s=0.15, seed=seed)
    buf.add_stereo(rise1, 0, gain_db=-6, width=0.0014)
    buf.add_stereo(rise2, 0.010, gain_db=-9, width=-0.0014)
    buf.add_stereo(rise3, 0.040, gain_db=-13, width=0.0010)
    buf.add(glitter, 0.20, gain_db=-13)
    tail = schroeder_reverb([(buf.l[i] + buf.r[i]) * 0.5 for i in range(buf.n)],
                            mix=0.32, decay=0.66)
    for i in range(buf.n):
        buf.l[i] += tail[i] * 0.26
        buf.r[i] += tail[i] * 0.26
    normalize_buf(buf, peak=0.82)
    return buf


def sfx_magic_hit(seed=13, alt=False):
    dur = 0.30 if not alt else 0.34
    buf = Buf(dur + 0.20)
    body = voice("triangle", 980 if not alt else 1100, 480, 0.22, attack_s=0.001)
    transient = voice("square", 1500, 700, 0.10, attack_s=0.0005)
    halo = voice("sine", 2100, 1180, 0.20, attack_s=0.005, vibrato=(6, 20))
    sparks = noise_burst(0.08, hp=2500, lp=7000, decay_s=0.08, seed=seed)
    buf.add_stereo(body, 0, gain_db=-4, width=0.0010)
    buf.add(transient, 0, gain_db=-8)
    buf.add_stereo(halo, 0.020, gain_db=-11, width=-0.0010)
    buf.add(sparks, 0, gain_db=-9)
    tail = schroeder_reverb([(buf.l[i] + buf.r[i]) * 0.5 for i in range(buf.n)],
                            mix=0.26, decay=0.6)
    for i in range(buf.n):
        buf.l[i] += tail[i] * 0.22
        buf.r[i] += tail[i] * 0.22
    normalize_buf(buf, peak=0.86)
    return buf


def sfx_item_use(seed=14, alt=False):
    dur = 0.40 if not alt else 0.45
    buf = Buf(dur + 0.18)
    notes = [(560, 760, 0.20, 0.00),
             (760, 1100, 0.18, 0.06),
             (1100, 1500, 0.16, 0.12)]
    if alt:
        notes = [(620, 880, 0.20, 0.00),
                 (880, 1240, 0.18, 0.07),
                 (1240, 1780, 0.16, 0.14)]
    for idx, (s, e, d, t) in enumerate(notes):
        sine = voice("sine", s, e, d, attack_s=0.005)
        tri = voice("triangle", s * 1.5, e * 1.5, d * 0.6, attack_s=0.005)
        buf.add_stereo(sine, t, gain_db=-7 - idx, width=0.0010 if idx % 2 == 0 else -0.0010)
        buf.add(tri, t + 0.005, gain_db=-13 - idx)
    pop = noise_burst(0.018, hp=3500, decay_s=0.018, seed=seed)
    buf.add(pop, 0, gain_db=-12)
    tail = schroeder_reverb([(buf.l[i] + buf.r[i]) * 0.5 for i in range(buf.n)],
                            mix=0.22, decay=0.55)
    for i in range(buf.n):
        buf.l[i] += tail[i] * 0.18
        buf.r[i] += tail[i] * 0.18
    normalize_buf(buf, peak=0.83)
    return buf


def sfx_status_apply(seed=15, alt=False):
    dur = 0.28 if not alt else 0.32
    buf = Buf(dur + 0.15)
    body = voice("square", 520 if not alt else 560, 700 if not alt else 760, 0.18, attack_s=0.005, vibrato=(7, 25))
    halo = voice("triangle", 880, 1200, 0.16, attack_s=0.008)
    glint = voice("sine", 1500, 1900, 0.10, attack_s=0.005)
    fizz = noise_burst(0.04, hp=4000, decay_s=0.04, seed=seed)
    buf.add_stereo(body, 0, gain_db=-7, width=0.0009)
    buf.add_stereo(halo, 0.010, gain_db=-10, width=-0.0009)
    buf.add(glint, 0.020, gain_db=-12)
    buf.add(fizz, 0, gain_db=-12)
    tail = schroeder_reverb([(buf.l[i] + buf.r[i]) * 0.5 for i in range(buf.n)],
                            mix=0.22, decay=0.55)
    for i in range(buf.n):
        buf.l[i] += tail[i] * 0.18
        buf.r[i] += tail[i] * 0.18
    normalize_buf(buf, peak=0.84)
    return buf


def sfx_ko(seed=16):
    dur = 0.70
    buf = Buf(dur + 0.45)
    body = voice("sawtooth", 220, 60, 0.55, attack_s=0.003)
    sub = voice("triangle", 130, 45, 0.50, attack_s=0.003)
    init = voice("square", 460, 90, 0.18, attack_s=0.0008)
    fall = voice("sine", 320, 70, 0.40, attack_s=0.005, vibrato=(3.5, 30))
    impact = noise_burst(0.10, lp=900, decay_s=0.10, seed=seed)
    air = noise_burst(0.40, hp=180, lp=1800, decay_s=0.40, seed=seed + 99)
    buf.add_stereo(body, 0, gain_db=-3, width=0.0014)
    buf.add(sub, 0, gain_db=-5)
    buf.add(init, 0, gain_db=-6)
    buf.add_stereo(fall, 0.04, gain_db=-8, width=-0.0014)
    buf.add(impact, 0, gain_db=-5)
    buf.add(air, 0, gain_db=-12)
    tail = schroeder_reverb([(buf.l[i] + buf.r[i]) * 0.5 for i in range(buf.n)],
                            mix=0.26, decay=0.62)
    for i in range(buf.n):
        buf.l[i] += tail[i] * 0.22
        buf.r[i] += tail[i] * 0.22
    normalize_buf(buf, peak=0.92)
    return buf


# ─────────────────────────────────────────────────────────────────────
# Driver
# ─────────────────────────────────────────────────────────────────────

SFX_TABLE = [
    ("ui-click.wav",                   lambda: sfx_ui_click(seed=101, alt=False)),
    ("ui-click-alt.wav",               lambda: sfx_ui_click(seed=102, alt=True)),
    ("move-step.wav",                  lambda: sfx_move_step(seed=201, alt=False)),
    ("move-step-alt.wav",              lambda: sfx_move_step(seed=202, alt=True)),
    ("defend-guard.wav",               lambda: sfx_defend_guard()),
    ("miss.wav",                       lambda: sfx_miss(seed=301, alt=False)),
    ("miss-alt.wav",                   lambda: sfx_miss(seed=302, alt=True)),
    ("heal.wav",                       lambda: sfx_heal(seed=401, alt=False)),
    ("heal-alt.wav",                   lambda: sfx_heal(seed=402, alt=True)),
    ("crit-sting.wav",                 lambda: sfx_crit_sting(seed=501)),
    ("absorb-guard.wav",               lambda: sfx_absorb_guard(seed=601)),
    ("weapon-hit-physical.wav",        lambda: sfx_weapon_hit_physical(seed=701, alt=False)),
    ("weapon-hit-physical-alt.wav",    lambda: sfx_weapon_hit_physical(seed=702, alt=True)),
    ("weapon-hit-fire.wav",            lambda: sfx_weapon_hit_fire(seed=801, alt=False)),
    ("weapon-hit-fire-alt.wav",        lambda: sfx_weapon_hit_fire(seed=802, alt=True)),
    ("weapon-hit-ice.wav",             lambda: sfx_weapon_hit_ice(seed=901, alt=False)),
    ("weapon-hit-ice-alt.wav",         lambda: sfx_weapon_hit_ice(seed=902, alt=True)),
    ("weapon-hit-lightning.wav",       lambda: sfx_weapon_hit_lightning(seed=1001, alt=False)),
    ("weapon-hit-lightning-alt.wav",   lambda: sfx_weapon_hit_lightning(seed=1002, alt=True)),
    ("weapon-hit-water.wav",           lambda: sfx_weapon_hit_water(seed=1101, alt=False)),
    ("weapon-hit-water-alt.wav",       lambda: sfx_weapon_hit_water(seed=1102, alt=True)),
    ("magic-cast.wav",                 lambda: sfx_magic_cast(seed=1201, alt=False)),
    ("magic-cast-alt.wav",             lambda: sfx_magic_cast(seed=1202, alt=True)),
    ("magic-hit.wav",                  lambda: sfx_magic_hit(seed=1301, alt=False)),
    ("magic-hit-alt.wav",              lambda: sfx_magic_hit(seed=1302, alt=True)),
    ("item-use.wav",                   lambda: sfx_item_use(seed=1401, alt=False)),
    ("item-use-alt.wav",               lambda: sfx_item_use(seed=1402, alt=True)),
    ("status-apply.wav",               lambda: sfx_status_apply(seed=1501, alt=False)),
    ("status-apply-alt.wav",           lambda: sfx_status_apply(seed=1502, alt=True)),
    ("ko.wav",                         lambda: sfx_ko(seed=1601)),
]


def main():
    out_dir = os.path.abspath(OUT_DIR)
    os.makedirs(out_dir, exist_ok=True)
    print(f"Writing {len(SFX_TABLE)} SFX to {out_dir} (44.1 kHz / 16-bit / stereo)")
    for name, builder in SFX_TABLE:
        path = os.path.join(out_dir, name)
        buf = builder()
        write_wav(path, buf)
        size_kb = os.path.getsize(path) / 1024.0
        print(f"  {name:36s} {buf.n / SR * 1000:6.1f} ms  {size_kb:7.1f} KB")


if __name__ == "__main__":
    main()
