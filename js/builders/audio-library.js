// audio-library.js
// Editor panel for managing the audio asset library:
//   - upload audio files to GitHub (audio/sfx/<id>.<ext> or audio/bgm/<id>.<ext>)
//   - register the new entry in data/audio-manifest.json
//   - delete entries (manifest only — files in audio/ stay until pruned by hand)
//
// Reads: AudioManager (manifest), SaveManager (GitHub binary upload + JSON save)
// Used by: editor.html (panel-audio)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.AudioLibrary = (() => {
  'use strict';

  const AM = () => window.CJS.AudioManager;
  const SM = () => window.CJS.SaveManager;
  const UI = () => window.CJS.UI;

  let _container = null;
  let _category = 'sfx';   // 'sfx' | 'bgm'
  let _busy = false;

  function init(containerEl) {
    _container = containerEl;
    _render();
    if (AM()) AM().loadManifest().then(_render).catch(_render);
  }

  function refresh() { if (_container) _render(); }

  function _render() {
    if (!_container) return;
    const manifest = (AM()?.getManifest && AM().getManifest()) || { sfx: {}, bgm: {} };
    const entries = manifest[_category] || {};
    const ids = Object.keys(entries).sort();

    _container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">🔊 Audio Library</span>
          <div class="btn-group">
            <button class="btn btn-sm ${_category==='sfx'?'btn-primary':'btn-ghost'}" id="aud-tab-sfx">SFX</button>
            <button class="btn btn-sm ${_category==='bgm'?'btn-primary':'btn-ghost'}" id="aud-tab-bgm">BGM</button>
          </div>
        </div>

        <div class="form-row" style="align-items:flex-end">
          <div class="form-group" style="flex:1">
            <label class="form-label">ID (key in audio-manifest.json)</label>
            <input type="text" id="aud-id" placeholder="${_category==='sfx'?'magic_hit':'battle_default_1'}">
          </div>
          <div class="form-group" style="flex:2">
            <label class="form-label">Audio file</label>
            <input type="file" id="aud-file" accept="audio/mpeg,audio/mp3,audio/ogg,audio/wav,.mp3,.ogg,.wav">
          </div>
          <div class="form-group" style="flex:0 0 auto">
            <button class="btn btn-success" id="aud-upload">Upload</button>
          </div>
        </div>
        <div class="dim" style="font-size:0.8rem;margin-top:-4px">
          Uploads to <code>audio/${_category}/&lt;id&gt;.&lt;ext&gt;</code> on GitHub and registers the id in <code>data/audio-manifest.json</code>.
          Requires GitHub token to be configured.
        </div>

        <h3 style="margin-top:14px">Library (${ids.length})</h3>
        <div id="aud-list" style="font-size:0.88rem"></div>

        <div id="aud-status" class="dim" style="font-size:0.82rem;margin-top:10px"></div>
      </div>
    `;

    _container.querySelector('#aud-tab-sfx').onclick = () => { _category = 'sfx'; _render(); };
    _container.querySelector('#aud-tab-bgm').onclick = () => { _category = 'bgm'; _render(); };
    _container.querySelector('#aud-upload').onclick = _doUpload;

    _renderList(ids, entries);
  }

  function _renderList(ids, entries) {
    const list = _container.querySelector('#aud-list');
    if (!list) return;
    if (!ids.length) {
      list.innerHTML = '<div class="dim" style="padding:10px">No entries yet. Upload a track to add one.</div>';
      return;
    }
    list.innerHTML = ids.map(id => `
      <div class="list-row" style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <span style="flex:0 0 30%;font-weight:600">${_esc(id)}</span>
        <span style="flex:1;font-family:monospace;font-size:0.8rem;opacity:0.8">${_esc(entries[id])}</span>
        <button class="btn btn-ghost btn-sm" data-id="${_esc(id)}" data-act="play">▶</button>
        <button class="btn btn-danger btn-sm" data-id="${_esc(id)}" data-act="del">Remove</button>
      </div>
    `).join('');

    list.querySelectorAll('button[data-act="play"]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.id;
        if (_category === 'bgm') AM()?.playBgm(id);
        else AM()?.playSfx(id);
      };
    });
    list.querySelectorAll('button[data-act="del"]').forEach(b => {
      b.onclick = () => _doRemove(b.dataset.id);
    });
  }

  async function _doUpload() {
    if (_busy) return;
    const idEl = _container.querySelector('#aud-id');
    const fileEl = _container.querySelector('#aud-file');
    const id = String(idEl.value || '').trim();
    const file = fileEl.files && fileEl.files[0];

    if (!id || !/^[A-Za-z0-9_]+$/.test(id)) {
      _setStatus('Provide an id (letters, digits, underscore).', 'error');
      return;
    }
    if (!file) {
      _setStatus('Pick an audio file first.', 'error');
      return;
    }
    if (!SM() || !SM().uploadBinaryFileToGitHub) {
      _setStatus('SaveManager not loaded.', 'error');
      return;
    }
    if (!SM().hasGitHubToken || !SM().hasGitHubToken()) {
      _setStatus('Configure your GitHub token first (Editor → GitHub).', 'error');
      return;
    }

    _busy = true;
    _setStatus('Reading file…', 'info');
    try {
      const base64 = await SM().fileToBase64(file);
      const extMatch = String(file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
      const ext = extMatch ? extMatch[0] : '.mp3';
      const path = `audio/${_category}/${id}${ext}`;

      _setStatus('Uploading audio to GitHub…', 'info');
      await SM().uploadBinaryFileToGitHub(path, base64, {
        message: `audio: upload ${path}`
      });

      // Update manifest
      _setStatus('Updating audio-manifest.json…', 'info');
      const manifest = (AM()?.getManifest && AM().getManifest()) || { sfx: {}, bgm: {} };
      manifest[_category] = manifest[_category] || {};
      manifest[_category][id] = path;

      const json = JSON.stringify(manifest, null, 2) + '\n';
      await SM().saveTextFileToGitHub('data/audio-manifest.json', json, {
        message: `audio: register ${_category}.${id}`
      });

      // Re-fetch so AM cache picks up the new entry
      try { window.CJS.AudioManager && (window.CJS.AudioManager._reloadOnNext = true); } catch (e) {}

      _setStatus(`Uploaded "${id}" → ${path}`, 'success');
      idEl.value = ''; fileEl.value = '';
      // Force AudioManager to reload manifest by re-fetching directly.
      try {
        const fresh = await fetch('data/audio-manifest.json?t=' + Date.now());
        if (fresh.ok) {
          const obj = await fresh.json();
          if (AM().getManifest) {
            // overwrite cached manifest in-place
            const m = AM().getManifest();
            m.sfx = obj.sfx || {};
            m.bgm = obj.bgm || {};
          }
        }
      } catch (e) { /* ignore */ }
      _render();
    } catch (e) {
      console.error(e);
      _setStatus('Upload failed: ' + (e.message || e), 'error');
    } finally {
      _busy = false;
    }
  }

  async function _doRemove(id) {
    if (!UI()?.confirm) {
      if (!confirm(`Remove "${id}" from manifest?`)) return;
    }
    const proceed = (cb) => {
      if (UI()?.confirm) UI().confirm(`Remove "${id}" from audio-manifest.json?`, cb);
      else cb();
    };
    proceed(async () => {
      try {
        const manifest = (AM()?.getManifest && AM().getManifest()) || { sfx: {}, bgm: {} };
        if (manifest[_category]) delete manifest[_category][id];
        const json = JSON.stringify(manifest, null, 2) + '\n';
        if (SM() && SM().hasGitHubToken && SM().hasGitHubToken()) {
          await SM().saveTextFileToGitHub('data/audio-manifest.json', json, {
            message: `audio: remove ${_category}.${id}`
          });
          _setStatus(`Removed "${id}" from manifest. (Audio file in audio/ stays until pruned manually.)`, 'info');
        } else {
          _setStatus('No GitHub token — manifest changed in memory only. Save manually.', 'info');
        }
        _render();
      } catch (e) {
        _setStatus('Remove failed: ' + (e.message || e), 'error');
      }
    });
  }

  function _setStatus(msg, kind) {
    const el = _container?.querySelector('#aud-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = kind === 'error' ? 'var(--danger,#d96f6f)'
                   : kind === 'success' ? 'var(--success,#6ec97a)'
                   : 'var(--text-mute,#a0a8b8)';
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  return Object.freeze({ init, refresh });
})();
