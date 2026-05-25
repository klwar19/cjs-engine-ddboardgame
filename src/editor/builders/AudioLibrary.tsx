// React port of js/builders/audio-library.js. Upload audio files to
// GitHub and register them in data/audio-manifest.json. Provides
// preview / remove for existing entries, plus a "Battle Voice Slots"
// list for the sfxSlots manifest section.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  audioManager,
  saveManagerExtended,
  type AudioManifest
} from "./_shared/cjs";
import { confirm } from "./_shared/widgets";

type Category = "sfx" | "bgm";

function entryPreview(entry: unknown): string {
  if (Array.isArray(entry)) {
    if (entry.length <= 2) return entry.join(" | ");
    return `${entry[0]} (+${entry.length - 1} variants)`;
  }
  return String(entry ?? "");
}

export function AudioLibrary() {
  const AM = audioManager();
  const [category, setCategory] = useState<Category>("sfx");
  const [busy, setBusy] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [status, setStatus] = useState<{ msg: string; kind?: "info" | "error" | "success" }>({
    msg: ""
  });
  // Bump on every successful upload / remove so the manifest re-reads.
  const [manifestTick, setManifestTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load manifest on mount.
  useEffect(() => {
    if (AM?.loadManifest) {
      AM.loadManifest()
        .then(() => setManifestTick((n) => n + 1))
        .catch(() => setManifestTick((n) => n + 1));
    }
  }, [AM]);

  const manifest: AudioManifest = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _tick = manifestTick;
    return AM?.getManifest?.() || { sfx: {}, bgm: {} };
  }, [AM, manifestTick]);

  const entries = (manifest[category] as Record<string, unknown> | undefined) || {};
  const slots = category === "sfx" ? manifest.sfxSlots || {} : {};
  const ids = Object.keys(entries).sort();
  const slotIds = Object.keys(slots).sort();

  const setStatusMsg = useCallback(
    (msg: string, kind: "info" | "error" | "success" = "info") => setStatus({ msg, kind }),
    []
  );

  const doPlay = useCallback(
    (id: string) => {
      if (!AM) return;
      if (category === "bgm" && AM.playBgm) AM.playBgm(id);
      else AM.playSfx(id);
    },
    [AM, category]
  );

  const doUpload = useCallback(async () => {
    if (busy) return;
    const id = draftId.trim();
    const file = fileInputRef.current?.files?.[0];

    if (!id || !/^[A-Za-z0-9_]+$/.test(id)) {
      setStatusMsg("Provide an id (letters, digits, underscore).", "error");
      return;
    }
    if (!file) {
      setStatusMsg("Pick an audio file first.", "error");
      return;
    }
    const SM = saveManagerExtended();
    if (!SM?.uploadBinaryFileToGitHub) {
      setStatusMsg("SaveManager not loaded.", "error");
      return;
    }
    if (!SM.hasGitHubToken?.()) {
      setStatusMsg(
        "Configure your GitHub token first (Editor → GitHub).",
        "error"
      );
      return;
    }

    setBusy(true);
    setStatusMsg("Reading file…");
    try {
      const base64 = await SM.fileToBase64(file);
      const extMatch = String(file.name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
      const ext = extMatch ? extMatch[0] : ".mp3";
      const path = `audio/${category}/${id}${ext}`;
      setStatusMsg("Uploading audio to GitHub…");
      await SM.uploadBinaryFileToGitHub(path, base64, {
        message: `audio: upload ${path}`
      });
      setStatusMsg("Updating audio-manifest.json…");
      const cur = AM?.getManifest?.() || { sfx: {}, bgm: {} };
      const next: AudioManifest = { ...cur };
      next[category] = { ...(next[category] as Record<string, unknown> | undefined || {}), [id]: path };
      const json = JSON.stringify(next, null, 2) + "\n";
      await SM.saveTextFileToGitHub("data/audio-manifest.json", json, {
        message: `audio: register ${category}.${id}`
      });
      // Mutate cached manifest in-place so other panels (skill / encounter
      // editors) see the new id without a full reload.
      try {
        const fresh = await fetch("data/audio-manifest.json?t=" + Date.now());
        if (fresh.ok) {
          const obj = (await fresh.json()) as AudioManifest;
          if (AM?.getManifest) {
            const m = AM.getManifest();
            m.sfx = obj.sfx || {};
            m.bgm = obj.bgm || {};
            m.sfxSlots = obj.sfxSlots || m.sfxSlots || {};
          }
        }
      } catch {
        /* ignore */
      }
      setStatusMsg(`Uploaded "${id}" → ${path}`, "success");
      setDraftId("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setManifestTick((n) => n + 1);
    } catch (e) {
      console.error(e);
      setStatusMsg(
        "Upload failed: " + ((e as Error)?.message || String(e)),
        "error"
      );
    } finally {
      setBusy(false);
    }
  }, [busy, draftId, category, AM, setStatusMsg]);

  const doRemove = useCallback(
    (id: string) => {
      confirm(`Remove "${id}" from audio-manifest.json?`, async () => {
        try {
          const SM = saveManagerExtended();
          const cur = AM?.getManifest?.() || { sfx: {}, bgm: {} };
          const next: AudioManifest = { ...cur };
          const map = { ...(next[category] as Record<string, unknown> | undefined || {}) };
          delete map[id];
          next[category] = map;
          const json = JSON.stringify(next, null, 2) + "\n";
          if (SM?.hasGitHubToken?.()) {
            await SM.saveTextFileToGitHub("data/audio-manifest.json", json, {
              message: `audio: remove ${category}.${id}`
            });
            setStatusMsg(
              `Removed "${id}" from manifest. (Audio file in audio/ stays until pruned manually.)`,
              "info"
            );
          } else {
            setStatusMsg(
              "No GitHub token — manifest changed in memory only. Save manually.",
              "info"
            );
          }
          // Mutate in-place
          if (AM?.getManifest) {
            const m = AM.getManifest();
            (m[category] as Record<string, unknown>) = map;
          }
          setManifestTick((n) => n + 1);
        } catch (e) {
          setStatusMsg(
            "Remove failed: " + ((e as Error)?.message || String(e)),
            "error"
          );
        }
      });
    },
    [category, AM, setStatusMsg]
  );

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">🔊 Audio Library</span>
        <div className="btn-group">
          <button
            type="button"
            className={`btn btn-sm ${category === "sfx" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setCategory("sfx")}
          >
            SFX
          </button>
          <button
            type="button"
            className={`btn btn-sm ${category === "bgm" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setCategory("bgm")}
          >
            BGM
          </button>
        </div>
      </div>

      <div className="form-row" style={{ alignItems: "flex-end" }}>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">ID (key in audio-manifest.json)</label>
          <input
            type="text"
            placeholder={category === "sfx" ? "magic_hit" : "battle_default_1"}
            value={draftId}
            onChange={(e) => setDraftId(e.currentTarget.value)}
          />
        </div>
        <div className="form-group" style={{ flex: 2 }}>
          <label className="form-label">Audio file</label>
          <input
            type="file"
            accept="audio/mpeg,audio/mp3,audio/ogg,audio/wav,.mp3,.ogg,.wav"
            ref={fileInputRef}
          />
        </div>
        <div className="form-group" style={{ flex: "0 0 auto" }}>
          <button
            type="button"
            className="btn btn-success"
            disabled={busy}
            onClick={doUpload}
          >
            Upload
          </button>
        </div>
      </div>
      <div className="dim" style={{ fontSize: "0.8rem", marginTop: -4 }}>
        Uploads to <code>audio/{category}/&lt;id&gt;.&lt;ext&gt;</code> on GitHub
        and registers the id in <code>data/audio-manifest.json</code>. Requires
        GitHub token to be configured.
      </div>

      <h3 style={{ marginTop: 14 }}>Library ({ids.length})</h3>
      <div style={{ fontSize: "0.88rem" }}>
        {ids.length === 0 ? (
          <div className="dim" style={{ padding: 10 }}>
            No entries yet. Upload a track to add one.
          </div>
        ) : (
          ids.map((id) => (
            <div
              key={id}
              className="list-row"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: 6,
                borderBottom: "1px solid rgba(255,255,255,0.06)"
              }}
            >
              <span style={{ flex: "0 0 30%", fontWeight: 600 }}>{id}</span>
              <span
                style={{
                  flex: 1,
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  opacity: 0.8
                }}
              >
                {entryPreview(entries[id])}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => doPlay(id)}
              >
                ▶
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => doRemove(id)}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      {category === "sfx" && (
        <>
          <h3 style={{ marginTop: 14 }}>Battle Voice Slots</h3>
          <div style={{ fontSize: "0.88rem" }}>
            {slotIds.length === 0 ? (
              <div className="dim" style={{ padding: 10 }}>
                No reserved slots.
              </div>
            ) : (
              slotIds.map((id) => {
                const slot = slots[id] || {};
                const registered = !!entries[id];
                return (
                  <div
                    key={id}
                    className="list-row"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: 6,
                      borderBottom: "1px solid rgba(255,255,255,0.06)"
                    }}
                  >
                    <span style={{ flex: "0 0 22%", fontWeight: 600 }}>{id}</span>
                    <span
                      style={{
                        flex: "0 0 24%",
                        color: "var(--text-mute, #a0a8b8)"
                      }}
                    >
                      {slot.label || id}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontFamily: "monospace",
                        fontSize: "0.8rem",
                        opacity: 0.8
                      }}
                    >
                      {slot.path || `audio/sfx/${id}.wav`}
                    </span>
                    <span className="badge">{registered ? "registered" : "empty"}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setDraftId(id)}
                    >
                      Use ID
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      <div
        className="dim"
        style={{
          fontSize: "0.82rem",
          marginTop: 10,
          color:
            status.kind === "error"
              ? "var(--danger, #d96f6f)"
              : status.kind === "success"
              ? "var(--success, #6ec97a)"
              : "var(--text-mute, #a0a8b8)"
        }}
      >
        {status.msg}
      </div>
    </div>
  );
}
