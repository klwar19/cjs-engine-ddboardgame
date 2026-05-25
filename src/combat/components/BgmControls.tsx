// BgmControls — collapsible audio + animations panel. Mirrors the
// <details>/<summary> markup the original combat-ui created so audio CSS
// keeps working unchanged.

import { useCallback, useEffect, useState } from "react";
import { useBgmVersion } from "../store";

interface CjsAny {
  AudioManager?: {
    loadManifest: () => Promise<unknown>;
    getManifest: () => { bgm?: Record<string, unknown>; sfx?: Record<string, unknown> };
    getBgmState: () => {
      playing?: boolean;
      currentId?: string | null;
      error?: string | null;
    };
    getVolume: (channel: "bgm" | "sfx") => number;
    setVolume: (channel: "bgm" | "sfx", value: number) => void;
    isMuted: () => boolean;
    mute: (flag: boolean) => void;
    isBgmPlaying: () => boolean;
    playBgm: (id: string, opts?: { fadeMs?: number }) => void;
    stopBgm: (opts?: { fadeMs?: number }) => void;
    getCurrentBgmId: () => string | null;
  };
  CombatSettings?: {
    getAnimationsEnabled?: () => boolean;
    setAnimationsEnabled?: (flag: boolean) => void;
  };
}

function cjs(): CjsAny {
  return (window as unknown as { CJS?: CjsAny }).CJS ?? {};
}

export function BgmControls() {
  useBgmVersion();
  const am = cjs().AudioManager;
  const cs = cjs().CombatSettings;
  const [tracks, setTracks] = useState<string[]>([]);
  const [bgmVol, setBgmVol] = useState(() =>
    Math.round((am?.getVolume("bgm") ?? 0.5) * 100)
  );
  const [sfxVol, setSfxVol] = useState(() =>
    Math.round((am?.getVolume("sfx") ?? 0.7) * 100)
  );
  const [animOn, setAnimOn] = useState(() => cs?.getAnimationsEnabled?.() ?? true);

  // Populate track list once the manifest finishes loading.
  useEffect(() => {
    let cancelled = false;
    void am?.loadManifest().then(() => {
      if (cancelled) return;
      const manifest = am?.getManifest?.() ?? {};
      const ids = Object.keys(manifest.bgm || {});
      setTracks(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [am]);

  // Reflect the animation pref onto the document body so CSS rules can
  // disable transitions globally.
  useEffect(() => {
    document.body.classList.toggle("no-anim", !animOn);
  }, [animOn]);

  const bgmState = am?.getBgmState?.();
  const muted = am?.isMuted?.() ?? false;
  const currentId = bgmState?.currentId || "";
  const playing = !!bgmState?.playing;

  const status = (() => {
    if (bgmState?.error === "autoplay_blocked" && bgmState.currentId) {
      return `Ready: ${bgmState.currentId} (click play)`;
    }
    if (bgmState?.error === "load_error" && bgmState.currentId) {
      return `Could not load: ${bgmState.currentId}`;
    }
    if (bgmState?.playing && bgmState.currentId) {
      return `Now playing: ${bgmState.currentId}`;
    }
    if (bgmState?.currentId) return `Loaded: ${bgmState.currentId}`;
    return "No BGM loaded";
  })();

  const summary = (() => {
    if (muted) return "muted";
    if (playing) return "playing";
    if (currentId) return "paused";
    return "silent";
  })();

  const onTrackChange = useCallback(
    (id: string) => {
      const a = cjs().AudioManager;
      if (!a) return;
      if (!id) a.stopBgm({ fadeMs: 180 });
      else a.playBgm(id, { fadeMs: 260 });
    },
    []
  );

  const onToggle = useCallback(() => {
    const a = cjs().AudioManager;
    if (!a) return;
    if (a.isBgmPlaying()) {
      a.stopBgm({ fadeMs: 180 });
    } else {
      const next = currentId || a.getCurrentBgmId();
      if (next) a.playBgm(next, { fadeMs: 260 });
    }
  }, [currentId]);

  const onMute = useCallback(() => {
    const a = cjs().AudioManager;
    if (!a) return;
    a.mute(!a.isMuted());
  }, []);

  return (
    <details id="cbt-bgm-controls" className="bgm-controls">
      <summary className="bgm-summary">
        <span className="bgm-summary-icon">🎵</span>
        <span className="bgm-summary-label">Audio &amp; Anim</span>
        <span id="bgm-summary-status" className="bgm-summary-status">
          {summary}
        </span>
      </summary>
      <div className="bgm-row">
        <span className="bgm-label">BGM</span>
        <select
          id="bgm-track-select"
          value={currentId}
          onChange={(e) => onTrackChange(e.currentTarget.value)}
        >
          <option value="">-- none --</option>
          {tracks.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <button
          id="btn-bgm-toggle"
          className="btn btn-sm bgm-btn"
          title="Play/Pause BGM"
          onClick={onToggle}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          id="btn-bgm-mute"
          className={`btn btn-sm bgm-btn${muted ? " active" : ""}`}
          title="Mute all"
          onClick={onMute}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </div>
      <div className="bgm-row">
        <span className="bgm-label">Music</span>
        <input
          type="range"
          id="bgm-volume"
          min={0}
          max={100}
          value={bgmVol}
          onChange={(e) => {
            const v = parseInt(e.currentTarget.value, 10) || 0;
            setBgmVol(v);
            cjs().AudioManager?.setVolume("bgm", v / 100);
          }}
        />
      </div>
      <div className="bgm-row">
        <span className="bgm-label">SFX</span>
        <input
          type="range"
          id="sfx-volume"
          min={0}
          max={100}
          value={sfxVol}
          onChange={(e) => {
            const v = parseInt(e.currentTarget.value, 10) || 0;
            setSfxVol(v);
            cjs().AudioManager?.setVolume("sfx", v / 100);
          }}
        />
      </div>
      <div className="bgm-row">
        <label
          className="bgm-label"
          style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            id="anim-toggle"
            checked={animOn}
            onChange={(e) => {
              const flag = e.currentTarget.checked;
              setAnimOn(flag);
              cjs().CombatSettings?.setAnimationsEnabled?.(flag);
            }}
          />
          <span>Animations</span>
        </label>
      </div>
      <div className="bgm-row bgm-status-row">
        <span id="bgm-status" className="bgm-status">
          {status}
        </span>
      </div>
    </details>
  );
}
