// save-manager.js
// Browser-side save helpers: local draft recovery plus GitHub Contents API sync.
// Stores editor draft data and GitHub sync settings in browser storage.

window.CJS = window.CJS || {};

window.CJS.SaveManager = (() => {
  'use strict';

  const STORAGE_KEYS = {
    draft: 'cjs.editor.localDraft',
    githubConfig: 'cjs.editor.github.config',
    githubToken: 'cjs.editor.github.token',
    githubTokenSession: 'cjs.editor.github.token.session'
  };

  const DEFAULT_GITHUB_CONFIG = {
    owner: '',
    repo: '',
    branch: 'main',
    path: 'data/gamedata.json',
    commitMessage: 'Update gamedata from CJS Editor',
    autoSave: false,
    rememberToken: false
  };

  function _localStorage() {
    try { return window.localStorage; }
    catch (_) { return null; }
  }

  function _sessionStorage() {
    try { return window.sessionStorage; }
    catch (_) { return null; }
  }

  function _readJSON(storage, key, fallback) {
    if (!storage) return fallback;
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function _writeJSON(storage, key, value) {
    if (!storage) return false;
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function _normalizeConfig(config) {
    const next = { ...DEFAULT_GITHUB_CONFIG, ...(config || {}) };
    next.owner = String(next.owner || '').trim();
    next.repo = String(next.repo || '').trim();
    next.branch = String(next.branch || 'main').trim() || 'main';
    next.path = String(next.path || 'data/gamedata.json').trim().replace(/^\/+/, '');
    next.commitMessage = String(next.commitMessage || DEFAULT_GITHUB_CONFIG.commitMessage).trim() || DEFAULT_GITHUB_CONFIG.commitMessage;
    next.autoSave = !!next.autoSave;
    next.rememberToken = !!next.rememberToken;
    return next;
  }

  function getGitHubConfig() {
    const stored = _readJSON(_localStorage(), STORAGE_KEYS.githubConfig, {});
    return _normalizeConfig(stored);
  }

  function getGitHubToken() {
    const session = _sessionStorage();
    const local = _localStorage();
    return (session && session.getItem(STORAGE_KEYS.githubTokenSession)) ||
           (local && local.getItem(STORAGE_KEYS.githubToken)) ||
           '';
  }

  function hasGitHubToken() {
    return !!getGitHubToken();
  }

  function setGitHubToken(token, rememberToken = false) {
    const trimmed = String(token || '').trim();
    const session = _sessionStorage();
    const local = _localStorage();

    if (session) session.removeItem(STORAGE_KEYS.githubTokenSession);
    if (local) local.removeItem(STORAGE_KEYS.githubToken);

    if (!trimmed) return;

    if (rememberToken) {
      if (local) local.setItem(STORAGE_KEYS.githubToken, trimmed);
    } else if (session) {
      session.setItem(STORAGE_KEYS.githubTokenSession, trimmed);
    }
  }

  function saveGitHubConfig(config) {
    const local = _localStorage();
    const current = getGitHubConfig();
    const token = Object.prototype.hasOwnProperty.call(config || {}, 'token') ? config.token : undefined;
    const next = _normalizeConfig({ ...current, ...(config || {}) });

    if (local) {
      _writeJSON(local, STORAGE_KEYS.githubConfig, {
        owner: next.owner,
        repo: next.repo,
        branch: next.branch,
        path: next.path,
        commitMessage: next.commitMessage,
        autoSave: next.autoSave,
        rememberToken: next.rememberToken
      });
    }

    if (token !== undefined) {
      setGitHubToken(token, next.rememberToken);
    } else {
      const existingToken = getGitHubToken();
      if (existingToken) setGitHubToken(existingToken, next.rememberToken);
    }

    return next;
  }

  function clearGitHubConfig() {
    const local = _localStorage();
    const session = _sessionStorage();
    if (local) {
      local.removeItem(STORAGE_KEYS.githubConfig);
      local.removeItem(STORAGE_KEYS.githubToken);
    }
    if (session) {
      session.removeItem(STORAGE_KEYS.githubTokenSession);
    }
  }

  function isGitHubReady(config) {
    const cfg = _normalizeConfig(config || getGitHubConfig());
    return !!(cfg.owner && cfg.repo && cfg.branch && cfg.path && getGitHubToken());
  }

  function saveDraft(json, meta = {}) {
    const payload = {
      json: String(json || ''),
      savedAt: new Date().toISOString(),
      source: meta.source || 'autosave'
    };
    _writeJSON(_localStorage(), STORAGE_KEYS.draft, payload);
    return payload;
  }

  function getDraft() {
    return _readJSON(_localStorage(), STORAGE_KEYS.draft, null);
  }

  function clearDraft() {
    const local = _localStorage();
    if (local) local.removeItem(STORAGE_KEYS.draft);
  }

  function _encodePath(path) {
    return String(path || '')
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
  }

  function _buildContentsUrl(config) {
    return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${_encodePath(config.path)}`;
  }

  function _buildBranchUrl(config) {
    return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/branches/${encodeURIComponent(config.branch)}`;
  }

  function _buildGitRefUrl(config) {
    return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/refs/heads/${encodeURIComponent(config.branch)}`;
  }

  function _buildGitCommitUrl(config, sha) {
    return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/commits/${encodeURIComponent(sha)}`;
  }

  function _buildGitTreesUrl(config) {
    return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/trees`;
  }

  function _buildGitCommitsUrl(config) {
    return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/commits`;
  }

  function _buildHeaders(token, write = false) {
    const headers = {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`
    };
    if (write) headers['Content-Type'] = 'application/json';
    return headers;
  }

  async function _parseApiError(response, fallback) {
    let message = fallback;
    try {
      const data = await response.json();
      if (data && data.message) message = `${fallback}: ${data.message}`;
    } catch (_) {
      // keep fallback
    }
    return new Error(message);
  }

  async function _getBranch(config, token) {
    const response = await fetch(_buildBranchUrl(config), {
      headers: _buildHeaders(token)
    });
    if (!response.ok) {
      throw await _parseApiError(response, 'GitHub branch lookup failed');
    }
    return response.json();
  }

  async function _getCommit(config, token, sha) {
    const response = await fetch(_buildGitCommitUrl(config, sha), {
      headers: _buildHeaders(token)
    });
    if (!response.ok) {
      throw await _parseApiError(response, 'GitHub commit lookup failed');
    }
    return response.json();
  }

  async function _getRemoteFile(config, token) {
    const url = `${_buildContentsUrl(config)}?ref=${encodeURIComponent(config.branch)}`;
    const response = await fetch(url, {
      headers: _buildHeaders(token)
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw await _parseApiError(response, 'GitHub file lookup failed');
    }
    return response.json();
  }

  function _toBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }

    return btoa(binary);
  }

  function _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename || 'cjs-export.txt';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function _normalizeFileMap(fileMap) {
    const entries = Object.entries(fileMap || {})
      .filter(([path]) => !!String(path || '').trim())
      .map(([path, content]) => [String(path).trim().replace(/^\/+/, ''), String(content ?? '')]);
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    return entries;
  }

  async function testGitHubConnection(overrides = {}) {
    const config = _normalizeConfig({ ...getGitHubConfig(), ...(overrides.config || overrides) });
    const token = String(overrides.token !== undefined ? overrides.token : getGitHubToken()).trim();

    if (!config.owner || !config.repo) {
      throw new Error('GitHub owner and repo are required');
    }
    if (!token) {
      throw new Error('GitHub token is required');
    }

    await _getBranch(config, token);
    const file = await _getRemoteFile(config, token);
    return {
      ok: true,
      fileExists: !!file,
      config
    };
  }

  async function saveJSONToGitHub(json, options = {}) {
    return saveTextFileToGitHub(options.path || (options.config && options.config.path) || getGitHubConfig().path, json, options);
  }

  async function saveTextFileToGitHub(path, text, options = {}) {
    const config = _normalizeConfig({ ...getGitHubConfig(), ...(options.config || {}) });
    const token = String(options.token !== undefined ? options.token : getGitHubToken()).trim();
    config.path = String(path || config.path || DEFAULT_GITHUB_CONFIG.path).trim().replace(/^\/+/, '');

    if (!config.owner || !config.repo) {
      throw new Error('GitHub owner and repo are required');
    }
    if (!token) {
      throw new Error('GitHub token is required');
    }

    const saveOnce = async () => {
      const existing = await _getRemoteFile(config, token);
      const payload = {
        message: options.message || config.commitMessage || DEFAULT_GITHUB_CONFIG.commitMessage,
        branch: config.branch,
        content: _toBase64(String(text || ''))
      };
      if (existing && existing.sha) payload.sha = existing.sha;

      const response = await fetch(_buildContentsUrl(config), {
        method: 'PUT',
        headers: _buildHeaders(token, true),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw await _parseApiError(response, 'GitHub save failed');
      }

      return response.json();
    };

    try {
      return await saveOnce();
    } catch (error) {
      if (/sha|conflict|409/i.test(String(error.message || ''))) {
        return saveOnce();
      }
      throw error;
    }
  }

  async function saveFilesSeparatelyToGitHub(fileMap, options = {}) {
    const config = _normalizeConfig({ ...getGitHubConfig(), ...(options.config || {}) });
    const token = String(options.token !== undefined ? options.token : getGitHubToken()).trim();
    const entries = _normalizeFileMap(fileMap);

    if (!config.owner || !config.repo) {
      throw new Error('GitHub owner and repo are required');
    }
    if (!token) {
      throw new Error('GitHub token is required');
    }
    if (entries.length === 0) {
      return { saved: [], skipped: true };
    }

    const saved = [];
    for (const [path, content] of entries) {
      const result = await saveTextFileToGitHub(path, content, {
        config,
        token,
        message: options.message ? `${options.message}: ${path}` : `${config.commitMessage}: ${path}`
      });
      saved.push({ path, result });
    }
    return { saved };
  }

  async function saveFilesAsSingleCommit(fileMap, options = {}) {
    const config = _normalizeConfig({ ...getGitHubConfig(), ...(options.config || {}) });
    const token = String(options.token !== undefined ? options.token : getGitHubToken()).trim();
    const entries = _normalizeFileMap(fileMap);

    if (!config.owner || !config.repo) {
      throw new Error('GitHub owner and repo are required');
    }
    if (!token) {
      throw new Error('GitHub token is required');
    }
    if (entries.length === 0) {
      return { saved: [], skipped: true };
    }

    const branch = await _getBranch(config, token);
    const branchHeadSha = branch?.commit?.sha;
    if (!branchHeadSha) {
      throw new Error('Could not resolve the branch head SHA');
    }

    const headCommit = await _getCommit(config, token, branchHeadSha);
    const baseTreeSha = headCommit?.tree?.sha;
    if (!baseTreeSha) {
      throw new Error('Could not resolve the base tree SHA');
    }

    const treeResponse = await fetch(_buildGitTreesUrl(config), {
      method: 'POST',
      headers: _buildHeaders(token, true),
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: entries.map(([path, content]) => ({
          path,
          mode: '100644',
          type: 'blob',
          content
        }))
      })
    });
    if (!treeResponse.ok) {
      throw await _parseApiError(treeResponse, 'GitHub tree creation failed');
    }
    const tree = await treeResponse.json();

    const commitResponse = await fetch(_buildGitCommitsUrl(config), {
      method: 'POST',
      headers: _buildHeaders(token, true),
      body: JSON.stringify({
        message: options.message || config.commitMessage || DEFAULT_GITHUB_CONFIG.commitMessage,
        tree: tree.sha,
        parents: [branchHeadSha]
      })
    });
    if (!commitResponse.ok) {
      throw await _parseApiError(commitResponse, 'GitHub commit creation failed');
    }
    const commit = await commitResponse.json();

    const refResponse = await fetch(_buildGitRefUrl(config), {
      method: 'PATCH',
      headers: _buildHeaders(token, true),
      body: JSON.stringify({
        sha: commit.sha,
        force: false
      })
    });
    if (!refResponse.ok) {
      throw await _parseApiError(refResponse, 'GitHub ref update failed');
    }

    return {
      commit,
      saved: entries.map(([path]) => ({ path }))
    };
  }

  async function exportFilesToDirectory(fileMap, options = {}) {
    const entries = _normalizeFileMap(fileMap);
    if (entries.length === 0) {
      return { skipped: true, written: [] };
    }
    if (typeof window.showDirectoryPicker !== 'function') {
      throw new Error('Folder export is not available in this browser context');
    }

    let rootHandle;
    try {
      rootHandle = await window.showDirectoryPicker({
        id: options.pickerId || 'cjs-export',
        mode: 'readwrite'
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('Folder export cancelled');
      }
      throw error;
    }

    const written = [];
    for (const [path, content] of entries) {
      const parts = path.split('/').filter(Boolean);
      const fileName = parts.pop();
      if (!fileName) continue;

      let dirHandle = rootHandle;
      for (const part of parts) {
        dirHandle = await dirHandle.getDirectoryHandle(part, { create: true });
      }

      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(String(content ?? ''));
      await writable.close();
      written.push(path);
    }

    return {
      written,
      directoryName: rootHandle.name || ''
    };
  }

  function downloadTextFile(filename, text, mimeType = 'text/plain;charset=utf-8') {
    const blob = new Blob([String(text ?? '')], { type: mimeType });
    _downloadBlob(blob, filename);
    return { filename };
  }

  function downloadFileBundle(fileMap, options = {}) {
    const entries = _normalizeFileMap(fileMap);
    const payload = {
      kind: 'cjs-file-export',
      generatedAt: new Date().toISOString(),
      fileCount: entries.length,
      files: Object.fromEntries(entries)
    };
    const filename = options.filename || 'cjs-file-export.json';
    downloadTextFile(filename, `${JSON.stringify(payload, null, 2)}\n`, 'application/json');
    return payload;
  }

  return Object.freeze({
    getGitHubConfig,
    getGitHubToken,
    hasGitHubToken,
    saveGitHubConfig,
    clearGitHubConfig,
    isGitHubReady,
    saveDraft,
    getDraft,
    clearDraft,
    testGitHubConnection,
    saveJSONToGitHub,
    saveTextFileToGitHub,
    saveFilesSeparatelyToGitHub,
    saveFilesAsSingleCommit,
    exportFilesToDirectory,
    downloadTextFile,
    downloadFileBundle
  });
})();
