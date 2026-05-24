// editor-controller.js — Editor app coordinator.
//
// Wires the editor.html DOM (sidebar, panels, status bar, save/export
// buttons) to the builder modules registered on `window.CJS` by
// src/entry-editor.js. This file was previously an inline
// <script type="module"> block in editor.html.

(function() {
  'use strict';

  const DS = CJS.DataStore;
  const UI = CJS.UI;
  const Save = CJS.SaveManager;
  const CM = CJS.ContentManager;

  const DEFAULT_GITHUB_CONFIG = {
    owner: 'klwar19',
    repo: 'cjs-engine-ddboardgame',
    branch: 'main',
    path: 'data/gamedata.json',
    commitMessage: 'Update gamedata from CJS Editor',
    autoSave: false,
    rememberToken: false
  };

  const editorMap = {
    effects: CJS.EffectEditor,
    statuses: CJS.StatusEditor,
    passives: CJS.PassiveEditor,
    skills: CJS.SkillEditor,
    jobs: CJS.JobEditor,
    personas: CJS.PersonaEditor,
    items: CJS.ItemEditor,
    food: CJS.SimpleCollectionEditor.food,
    materials: CJS.SimpleCollectionEditor.materials,
    crafting: CJS.SimpleCollectionEditor.crafting,
    characters: CJS.CharEditor,
    monsters: CJS.MonsterEditor,
    encounters: CJS.EncounterEditor,
    campaign: CJS.CampaignEditor,
    browser: CJS.DataBrowser,
    audio: CJS.AudioLibrary
  };

  const sidebar = document.getElementById('sidebar');
  const navItems = Array.from(sidebar.querySelectorAll('.nav-item'));
  const panels = Array.from(document.querySelectorAll('.editor-panel'));
  const statusCounts = document.getElementById('status-counts');
  const statusDirty = document.getElementById('status-dirty');
  const statusFiles = document.getElementById('status-files');
  const statusMsg = document.getElementById('status-msg');
  const statusSync = document.getElementById('status-sync');
  const filterScope = document.getElementById('filter-scope');
  const filterWorld = document.getElementById('filter-world');
  const btnMigrate = document.getElementById('btn-migrate');
  const btnSave = document.getElementById('btn-save');
  const btnGitHub = document.getElementById('btn-github');
  const btnImport = document.getElementById('btn-import');
  const btnExport = document.getElementById('btn-export');
  const btnValidate = document.getElementById('btn-validate');
  const importFile = document.getElementById('import-file');

  let activePanel = 'effects';
  let editorsInitialized = {};

  const syncState = {
    pendingSnapshot: '',
    pendingSince: 0,
    saveInFlight: null,
    lastGitHubSavedJson: '',
    lastGitHubErrorAt: 0
  };

  const migrationState = {
    pendingArtifacts: false,
    legacyBundleJson: '',
    report: ''
  };

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function getGitHubConfig() {
    const stored = Save.getGitHubConfig();
    return {
      owner: stored.owner || DEFAULT_GITHUB_CONFIG.owner,
      repo: stored.repo || DEFAULT_GITHUB_CONFIG.repo,
      branch: stored.branch || DEFAULT_GITHUB_CONFIG.branch,
      path: stored.path || DEFAULT_GITHUB_CONFIG.path,
      commitMessage: stored.commitMessage || DEFAULT_GITHUB_CONFIG.commitMessage,
      autoSave: !!stored.autoSave,
      rememberToken: !!stored.rememberToken
    };
  }

  function formatClock(value) {
    if (!value) return '';
    try {
      return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }

  function formatDateTime(value) {
    if (!value) return '';
    try {
      return new Date(value).toLocaleString();
    } catch (_) {
      return String(value);
    }
  }

  function setStatusMessage(message) {
    statusMsg.textContent = message || 'Ready';
  }

  function setSyncMessage(message, tone = 'info') {
    statusSync.textContent = message || '';
    statusSync.className = tone ? `sync-${tone}` : '';
  }

  function getLoadMode() {
    return CM?.getLoadMode?.() || 'legacy';
  }

  function populateWorldFilters() {
    if (!filterWorld || !CM?.getWorldOptions) return;
    const current = filterWorld.value || 'all';
    const worlds = CM.getWorldOptions();
    filterWorld.innerHTML = '<option value="all">All worlds</option>' +
      worlds.map((world) => `<option value="${escapeHtml(world.id)}">${escapeHtml(world.displayName || world.id)}</option>`).join('');
    filterWorld.value = worlds.some((world) => world.id === current) ? current : 'all';
  }

  function applyFilters() {
    if (!CM?.setFilters) return;
    CM.setFilters({
      scope: filterScope?.value || 'all',
      world: filterWorld?.value || 'all'
    });
    Object.values(editorMap).forEach((editor) => editor?.refresh?.());
    updateCounts();
  }

  function refreshValidationState() {
    if (CM?.getManifest) {
      CM.validateReferencesDetailed();
    }
  }

  function buildManifestFileMap(includeOnlyDirty = true) {
    if (!CM?.getManifest?.()) return {};
    const docs = CM.buildFileMap({ includeOnlyDirty });
    const out = {};
    for (const [path, doc] of Object.entries(docs)) {
      out[path] = `${JSON.stringify(doc, null, 2)}\n`;
    }
    if (migrationState.pendingArtifacts) {
      if (migrationState.report) out['MIGRATION_REPORT.md'] = migrationState.report.endsWith('\n') ? migrationState.report : `${migrationState.report}\n`;
      if (migrationState.legacyBundleJson) out['data/_legacy_bundle.json'] = migrationState.legacyBundleJson.endsWith('\n') ? migrationState.legacyBundleJson : `${migrationState.legacyBundleJson}\n`;
    }
    return out;
  }

  function getDirtyFileMap() {
    if (CM?.getManifest?.()) return buildManifestFileMap(true);
    const cfg = getGitHubConfig();
    return DS.isDirty() ? { [cfg.path || DEFAULT_GITHUB_CONFIG.path]: DS.exportJSON() } : {};
  }

  function refreshSyncBadge() {
    const cfg = getGitHubConfig();
    if (syncState.saveInFlight) {
      setSyncMessage('Syncing GitHub...', 'info');
      return;
    }
    if (Save.isGitHubReady(cfg)) {
      setSyncMessage(`GitHub ready (${cfg.owner}/${cfg.repo})`, 'info');
      return;
    }
    const draft = Save.getDraft();
    if (draft && draft.savedAt) {
      setSyncMessage(`Local draft ${formatClock(draft.savedAt)}`, 'info');
      return;
    }
    setSyncMessage('Local only', 'info');
  }

  function resetEditors() {
    editorsInitialized = {};
  }

  function initEditor(name) {
    if (editorsInitialized[name]) {
      editorMap[name]?.refresh?.();
      return;
    }
    const panel = document.getElementById(`panel-${name}`);
    if (panel && editorMap[name]) {
      editorMap[name].init(panel);
      editorsInitialized[name] = true;
    }
  }

  function refreshActiveEditor() {
    const activeNav = document.querySelector('.nav-item.active');
    const panelName = activeNav?.dataset?.panel || activePanel;
    if (panelName) initEditor(panelName);
  }

  function updateCounts() {
    const counts = DS.getCounts();
    const dirtyFiles = CM?.getDirtyFiles?.() || [];

    for (const [key, value] of Object.entries(counts)) {
      const badge = document.getElementById(`count-${key}`);
      if (badge) badge.textContent = value;
    }

    statusCounts.innerHTML = Object.entries(counts)
      .filter(([key, value]) => ['effects', 'skills', 'jobs', 'items', 'food', 'materials', 'passives', 'characters', 'monsters', 'encounters', 'crafting', 'crops', 'shops', 'zones', 'stories', 'campaigns', 'scenarios', 'scenarioMaps', 'campaignEvents', 'campaignQuests', 'campaignHubs', 'sideContentPacks', 'questChains', 'battleSets', 'mapSeeds', 'oracleTables', 'storyDirectorPacks'].includes(key) && value > 0)
      .map(([key, value]) => `<span>${key}: <b>${value}</b></span>`)
      .join('');

    statusDirty.textContent = dirtyFiles.length
      ? `${dirtyFiles.length} dirty file${dirtyFiles.length === 1 ? '' : 's'}`
      : (DS.isDirty() ? 'Unsaved changes' : '');
    statusDirty.className = (dirtyFiles.length || DS.isDirty()) ? 'dirty' : '';
    statusFiles.textContent = dirtyFiles.length ? dirtyFiles.join(', ') : '';
  }

  function rememberDirtySnapshot(json, source = 'autosave') {
    if (!json || json === syncState.pendingSnapshot) return;
    Save.saveDraft(json, { source });
    syncState.pendingSnapshot = json;
    syncState.pendingSince = Date.now();
    if (source === 'autosave') setStatusMessage('Draft saved locally');
    refreshSyncBadge();
  }

  function clearPendingDraftState(json) {
    syncState.pendingSnapshot = '';
    syncState.pendingSince = 0;
    if (json !== undefined) {
      syncState.lastGitHubSavedJson = json;
    }
    Save.clearDraft();
    refreshSyncBadge();
  }

  async function loadData() {
    try {
      const result = await CM.loadDefaultData();
      const counts = DS.getCounts();
      const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
      populateWorldFilters();
      refreshValidationState();
      console.log(`Loaded ${getLoadMode()} data (${total} entries)`);
      UI.toast(`Loaded ${getLoadMode()} data: ${counts.effects} effects, ${counts.skills} skills, ${counts.characters} chars, ${counts.monsters} mons`, 'success', 4000);
      return result;
    } catch (error) {
      console.warn('Could not load any data:', error.message);
      UI.toast('No data files found. Create content or import a save.', 'info', 5000);
      return null;
    }
  }

  function seedBuiltInStatuses() {
    const UM = window.CJS.UndoManager;
    const CONST = window.CJS.CONST;

    if (UM) UM.disable();
    if (CONST && CONST.STATUS_DEFINITIONS) {
      for (const [id, def] of Object.entries(CONST.STATUS_DEFINITIONS)) {
        if (!DS.exists('statuses', id)) {
          DS.replace('statuses', id, { ...def, id });
        }
      }
    }
    if (UM) {
      UM.enable();
      UM.clear();
    }
    DS.markClean();
  }

  async function downloadCurrentData() {
    if (CM?.getManifest?.()) {
      return extractCurrentFiles(false);
    }
    const json = DS.exportJSON();
    DS.downloadJSON('gamedata.json');
    clearPendingDraftState(json);
    setStatusMessage('Downloaded bundled gamedata snapshot');
    UI.toast('Downloaded bundled gamedata snapshot', 'success');
    updateCounts();
  }

  async function extractCurrentFiles(includeOnlyDirty = true) {
    const fileMap = CM?.getManifest?.()
      ? buildManifestFileMap(includeOnlyDirty)
      : { [getGitHubConfig().path || DEFAULT_GITHUB_CONFIG.path]: `${DS.exportJSON()}\n` };
    const paths = Object.keys(fileMap).sort();

    if (paths.length === 0) {
      UI.toast(includeOnlyDirty ? 'No changed files to extract' : 'No files available to export', 'info');
      return null;
    }

    try {
      const result = await Save.exportFilesToDirectory(fileMap, {
        pickerId: includeOnlyDirty ? 'cjs-dirty-export' : 'cjs-full-export'
      });
      const target = result.directoryName ? ` to ${result.directoryName}` : '';
      const message = includeOnlyDirty
        ? `Extracted ${paths.length} changed file${paths.length === 1 ? '' : 's'}${target}`
        : `Extracted ${paths.length} file${paths.length === 1 ? '' : 's'}${target}`;
      setStatusMessage(message);
      UI.toast(message, 'success', 4500);
      return { mode: 'directory', ...result };
    } catch (error) {
      if (/cancelled/i.test(String(error?.message || ''))) {
        UI.toast('Folder export cancelled', 'info');
        return null;
      }

      const filename = includeOnlyDirty ? 'cjs-dirty-files-export.json' : 'cjs-full-file-export.json';
      Save.downloadFileBundle(fileMap, { filename });
      setStatusMessage('Folder export unavailable; downloaded a file bundle instead');
      UI.toast('Folder export was unavailable, so a file bundle was downloaded instead. Unpack it into your repo root.', 'info', 6000);
      return { mode: 'bundle', filename };
    }
  }

  async function saveCurrentData(mode = 'single') {
    const cfg = getGitHubConfig();
    const json = DS.exportJSON();
    const fileMap = getDirtyFileMap();

    if (mode === 'local') {
      rememberDirtySnapshot(json, 'manual');
      setStatusMessage('Draft saved locally');
      UI.toast('Saved locally in this browser', 'success');
      updateCounts();
      return { mode: 'local' };
    }

    if (Object.keys(fileMap).length === 0) {
      UI.toast('No changed files to save', 'info');
      return null;
    }

    if (!Save.isGitHubReady(cfg)) {
      UI.toast('Configure GitHub first or choose Local only', 'error', 4500);
      return null;
    }

    if (syncState.saveInFlight) {
      UI.toast('A save is already in progress', 'info');
      return syncState.saveInFlight;
    }

    rememberDirtySnapshot(json, 'manual');
    setStatusMessage(mode === 'separate' ? 'Saving changed files separately...' : 'Saving all changed files in one commit...');

    const messageBase = cfg.commitMessage || DEFAULT_GITHUB_CONFIG.commitMessage;
    const runner = mode === 'separate'
      ? Save.saveFilesSeparatelyToGitHub(fileMap, { config: cfg, message: messageBase })
      : Save.saveFilesAsSingleCommit(fileMap, { config: cfg, message: messageBase });

    syncState.saveInFlight = runner
      .then(() => {
        DS.markClean();
        CM?.clearDirtyFiles?.();
        if (migrationState.pendingArtifacts) {
          migrationState.pendingArtifacts = false;
          migrationState.legacyBundleJson = '';
          migrationState.report = '';
        }
        clearPendingDraftState(json);
        refreshValidationState();
        setStatusMessage(mode === 'separate' ? 'Saved changed files as separate commits' : 'Saved changed files in one commit');
        UI.toast(mode === 'separate' ? 'Saved changed files separately' : 'Saved changed files in one commit', 'success');
        updateCounts();
      })
      .catch((error) => {
        syncState.lastGitHubErrorAt = Date.now();
        setStatusMessage('GitHub save failed');
        refreshSyncBadge();
        UI.toast(error.message || 'GitHub save failed', 'error', 5000);
        throw error;
      })
      .finally(() => {
        syncState.saveInFlight = null;
        refreshSyncBadge();
      });

    return syncState.saveInFlight;
  }

  async function maybeAutoSaveToGitHub(json) {
    return json;
  }

  function openSaveDialog() {
    const fileMap = getDirtyFileMap();
    const paths = Object.keys(fileMap).sort();
    if (paths.length === 0) {
      UI.toast('No changed files to save', 'info');
      return;
    }

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="hint-box hint-info">
        <b>Load mode:</b> ${escapeHtml(getLoadMode())}. Save stays manual: choose how to write the current dirty files.
      </div>
      <div><b>${paths.length}</b> file(s) ready:</div>
      <div class="sync-status-box" style="max-height:260px;overflow:auto;margin-top:8px">${paths.map((path) => escapeHtml(path)).join('<br>')}</div>
      <div class="sync-note">For <b>Extract Files</b>, choose your repo root folder: the one that contains <code>editor.html</code>, <code>combat.html</code>, <code>data/</code>, <code>js/</code>, and <code>css/</code>.</div>
      ${migrationState.pendingArtifacts ? '<div class="sync-note">This save also includes the one-time migration artifacts: <code>MIGRATION_REPORT.md</code> and <code>data/_legacy_bundle.json</code>.</div>' : ''}
    `;

    const footer = document.createElement('div');
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-ghost';
    closeBtn.textContent = 'Close';

    const localBtn = document.createElement('button');
    localBtn.className = 'btn btn-ghost';
    localBtn.textContent = 'Local Only';

    const extractBtn = document.createElement('button');
    extractBtn.className = 'btn btn-ghost';
    extractBtn.textContent = 'Extract Files';

    const separateBtn = document.createElement('button');
    separateBtn.className = 'btn btn-ghost';
    separateBtn.textContent = 'GitHub: Separate';

    const singleBtn = document.createElement('button');
    singleBtn.className = 'btn btn-primary';
    singleBtn.textContent = 'GitHub: One Commit';

    footer.appendChild(closeBtn);
    footer.appendChild(localBtn);
    footer.appendChild(extractBtn);
    footer.appendChild(separateBtn);
    footer.appendChild(singleBtn);

    const overlay = UI.openModal({
      title: 'Save Changes',
      content: body,
      footer,
      width: '760px'
    });

    closeBtn.onclick = () => UI.closeModal(overlay);
    localBtn.onclick = async () => {
      await saveCurrentData('local');
      UI.closeModal(overlay);
    };
    extractBtn.onclick = async () => {
      await extractCurrentFiles(true);
      UI.closeModal(overlay);
    };
    separateBtn.onclick = async () => {
      try {
        await saveCurrentData('separate');
        UI.closeModal(overlay);
      } catch (_) {}
    };
    singleBtn.onclick = async () => {
      try {
        await saveCurrentData('single');
        UI.closeModal(overlay);
      } catch (_) {}
    };
  }

  async function runLegacyMigration() {
    if (!CM?.getManifest?.()) {
      UI.toast('Manifest mode is required before running migration', 'error');
      return;
    }
    if (!window.confirm('Migrate legacy data into the multi-file layout now? This will rewrite IDs in-memory, mark many files dirty, and wait for you to save manually.')) {
      return;
    }

    try {
      const legacyResponse = await fetch('data/gamedata.json');
      migrationState.legacyBundleJson = legacyResponse.ok ? await legacyResponse.text() : '';
      const result = await CM.applyLegacyMigration();
      const lastMigration = CM.getLastMigration?.();
      migrationState.pendingArtifacts = true;
      migrationState.report = lastMigration?.report || '';
      refreshValidationState();
      populateWorldFilters();
      resetEditors();
      initEditor(activePanel);
      updateCounts();
      setStatusMessage(`Migration staged in ${result.counts.worlds || 0} worlds; review and save when ready`);
      UI.toast('Legacy bundle migrated into the multi-file layout', 'success', 4500);

      if (migrationState.report) {
        UI.openModal({
          title: 'Migration Report',
          content: `<pre style="white-space:pre-wrap;font-size:0.8rem;max-height:420px;overflow:auto">${escapeHtml(migrationState.report)}</pre>`,
          width: '780px'
        });
      }
    } catch (error) {
      UI.toast(error.message || 'Migration failed', 'error', 5000);
    }
  }

  function openGitHubModal() {
    const cfg = getGitHubConfig();
    const hasToken = Save.hasGitHubToken();

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="sync-modal-grid">
        <div>
          <label class="form-label" for="gh-owner">Owner</label>
          <input type="text" id="gh-owner" value="${escapeHtml(cfg.owner)}" placeholder="klwar19">
        </div>
        <div>
          <label class="form-label" for="gh-repo">Repo</label>
          <input type="text" id="gh-repo" value="${escapeHtml(cfg.repo)}" placeholder="cjs-engine-ddboardgame">
        </div>
        <div>
          <label class="form-label" for="gh-branch">Branch</label>
          <input type="text" id="gh-branch" value="${escapeHtml(cfg.branch)}" placeholder="main">
        </div>
        <div>
          <label class="form-label" for="gh-path">Bundle Path</label>
          <input type="text" id="gh-path" value="${escapeHtml(cfg.path)}" placeholder="data/gamedata.json">
        </div>
        <div class="full">
          <label class="form-label" for="gh-message">Commit Message</label>
          <input type="text" id="gh-message" value="${escapeHtml(cfg.commitMessage)}" placeholder="Update gamedata from CJS Editor">
        </div>
        <div class="full">
          <label class="form-label" for="gh-token">GitHub Token</label>
          <input type="password" id="gh-token" placeholder="${hasToken ? 'Stored token will be kept unless you replace it' : 'Paste a fine-grained token'}">
        </div>
        <label class="form-check full">
          <input type="checkbox" id="gh-autosave" disabled>
          <span>Manual save only (GitHub autosave is disabled for the multi-file workflow)</span>
        </label>
        <label class="form-check full">
          <input type="checkbox" id="gh-remember" ${cfg.rememberToken ? 'checked' : ''}>
          <span>Remember token on this browser</span>
        </label>
      </div>
      <div class="sync-note">
        Use a GitHub fine-grained personal access token with Contents read and write permission for this repo.
        The token stays in browser storage only and is never written into your data files.
      </div>
      <div class="sync-status-box" id="gh-sync-status">${hasToken ? 'A token is already stored in this browser.' : 'Enter your GitHub settings, then test or save them.'}</div>
    `;

    const footer = document.createElement('div');
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-ghost';
    closeBtn.textContent = 'Close';

    const disconnectBtn = document.createElement('button');
    disconnectBtn.className = 'btn btn-danger';
    disconnectBtn.textContent = 'Disconnect';

    const testBtn = document.createElement('button');
    testBtn.className = 'btn btn-ghost';
    testBtn.textContent = 'Test';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Save Settings';

    footer.appendChild(closeBtn);
    footer.appendChild(disconnectBtn);
    footer.appendChild(testBtn);
    footer.appendChild(saveBtn);

    const overlay = UI.openModal({
      title: 'GitHub Sync',
      content: body,
      footer,
      width: '720px'
    });

    const ownerInput = body.querySelector('#gh-owner');
    const repoInput = body.querySelector('#gh-repo');
    const branchInput = body.querySelector('#gh-branch');
    const pathInput = body.querySelector('#gh-path');
    const messageInput = body.querySelector('#gh-message');
    const tokenInput = body.querySelector('#gh-token');
    const autoSaveInput = body.querySelector('#gh-autosave');
    const rememberInput = body.querySelector('#gh-remember');
    const syncStatusBox = body.querySelector('#gh-sync-status');

    function collectConfig() {
      const next = {
        owner: ownerInput.value.trim(),
        repo: repoInput.value.trim(),
        branch: branchInput.value.trim() || 'main',
        path: pathInput.value.trim() || 'data/gamedata.json',
        commitMessage: messageInput.value.trim() || DEFAULT_GITHUB_CONFIG.commitMessage,
        autoSave: false,
        rememberToken: rememberInput.checked
      };
      const newToken = tokenInput.value.trim();
      if (newToken) {
        next.token = newToken;
      } else if (!Save.hasGitHubToken()) {
        next.token = '';
      }
      return next;
    }

    closeBtn.onclick = () => UI.closeModal(overlay);

    disconnectBtn.onclick = () => {
      Save.clearGitHubConfig();
      refreshSyncBadge();
      setStatusMessage('GitHub sync disconnected');
      UI.closeModal(overlay);
      UI.toast('GitHub sync removed from this browser', 'info');
    };

    testBtn.onclick = async () => {
      syncStatusBox.textContent = 'Testing GitHub connection...';
      try {
        const next = collectConfig();
        const result = await Save.testGitHubConnection({
          config: next,
          token: next.token !== undefined ? next.token : Save.getGitHubToken()
        });
        syncStatusBox.textContent = result.fileExists
          ? 'Connection OK. The configured bundle path exists.'
          : 'Connection OK. The configured bundle path is missing now, but the first save can create it.';
      } catch (error) {
        syncStatusBox.textContent = error.message || 'GitHub test failed';
      }
    };

    saveBtn.onclick = () => {
      const next = collectConfig();
      Save.saveGitHubConfig(next);
      refreshSyncBadge();
      setStatusMessage('GitHub sync settings saved');
      UI.closeModal(overlay);
      UI.toast('GitHub sync settings saved', 'success');
    };
  }

  function maybeOfferDraftRestore() {
    const draft = Save.getDraft();
    if (!draft || !draft.json) return Promise.resolve();

    const currentJson = DS.exportJSON();
    if (draft.json === currentJson) {
      Save.clearDraft();
      refreshSyncBadge();
      return Promise.resolve();
    }

    const result = DS.importJSON(draft.json);
    if (result.success) {
      DS.markDirty();
      rememberDirtySnapshot(draft.json, 'restore');
      refreshValidationState();
      resetEditors();
      initEditor(activePanel);
      updateCounts();
      refreshSyncBadge();
      const when = formatDateTime(draft.savedAt);
      setStatusMessage(`Restored local draft from ${when}`);
      UI.toast(`Restored local draft from ${when}`, 'info');
    } else {
      Save.clearDraft();
      refreshSyncBadge();
      setStatusMessage('Local draft was invalid and was discarded');
      UI.toast(`Draft restore failed: ${result.error || 'invalid'}`, 'error');
    }
    return Promise.resolve();
  }

  function bindUndoRedo() {
    const UM = window.CJS.UndoManager;
    if (!UM) return;

    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');

    function refreshAfterUndoRedo() {
      updateCounts();
      refreshActiveEditor();
    }

    UM.subscribe((state) => {
      btnUndo.disabled = !state.canUndo;
      btnRedo.disabled = !state.canRedo;
      btnUndo.title = state.undoLabel ? `Undo: ${state.undoLabel}` : 'Nothing to undo';
      btnRedo.title = state.redoLabel ? `Redo: ${state.redoLabel}` : 'Nothing to redo';
    });

    btnUndo.addEventListener('click', () => {
      const entry = UM.undo();
      if (entry) {
        UI.toast(`Undid: ${entry.label}`, 'info', 3000);
        refreshAfterUndoRedo();
      }
    });

    btnRedo.addEventListener('click', () => {
      const entry = UM.redo();
      if (entry) {
        UI.toast(`Redid: ${entry.label}`, 'info', 3000);
        refreshAfterUndoRedo();
      }
    });

    document.addEventListener('keydown', (event) => {
      const tag = (event.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        const entry = UM.undo();
        if (entry) {
          UI.toast(`Undid: ${entry.label}`, 'info', 2500);
          refreshAfterUndoRedo();
        }
      }

      if ((event.ctrlKey || event.metaKey) && (event.key === 'Z' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault();
        const entry = UM.redo();
        if (entry) {
          UI.toast(`Redid: ${entry.label}`, 'info', 2500);
          refreshAfterUndoRedo();
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
        event.preventDefault();
        const entry = UM.redo();
        if (entry) {
          UI.toast(`Redid: ${entry.label}`, 'info', 2500);
          refreshAfterUndoRedo();
        }
      }
    });
  }

  function backgroundTick() {
    updateCounts();
    refreshSyncBadge();

    if (!DS.isDirty()) return;

    const json = DS.exportJSON();
    rememberDirtySnapshot(json, 'autosave');
    maybeAutoSaveToGitHub(json);
  }

  navItems.forEach((nav) => {
    nav.addEventListener('click', () => {
      const panel = nav.dataset.panel;
      if (!panel || panel === activePanel) return;

      navItems.forEach((item) => item.classList.remove('active'));
      nav.classList.add('active');

      panels.forEach((panelNode) => panelNode.classList.remove('active'));
      document.getElementById(`panel-${panel}`).classList.add('active');
      activePanel = panel;
      initEditor(panel);
    });
  });

  btnSave.addEventListener('click', () => {
    openSaveDialog();
  });
  btnMigrate.addEventListener('click', () => {
    runLegacyMigration();
  });
  btnGitHub.addEventListener('click', openGitHubModal);
  filterScope.addEventListener('change', applyFilters);
  filterWorld.addEventListener('change', applyFilters);

  btnExport.addEventListener('click', () => {
    downloadCurrentData();
  });

  btnImport.addEventListener('click', () => {
    importFile.click();
  });

  importFile.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const result = DS.importJSON(loadEvent.target.result);
      if (result.success) {
        DS.markDirty();
        rememberDirtySnapshot(DS.exportJSON(), 'import');
        refreshValidationState();
        updateCounts();
        resetEditors();
        initEditor(activePanel);
        setStatusMessage('Imported JSON');
        UI.toast(`Imported! ${result.validation.errors.length} errors, ${result.validation.warnings.length} warnings`, result.validation.errors.length > 0 ? 'error' : 'success');
      } else {
        UI.toast(`Import failed: ${result.error}`, 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  });

  btnValidate.addEventListener('click', () => {
    refreshValidationState();
    const storeResult = DS.validate();
    const manifestResult = CM?.getManifest?.()
      ? CM.validateReferencesDetailed()
      : { valid: true, issues: [], byFile: {} };

    if (storeResult.valid && storeResult.warnings.length === 0 && manifestResult.valid && manifestResult.issues.length === 0) {
      UI.toast('All references valid!', 'success');
      return;
    }

    const storeLines = [];
    if (storeResult.errors.length > 0) storeLines.push(`${storeResult.errors.length} store errors:\n${storeResult.errors.join('\n')}`);
    if (storeResult.warnings.length > 0) storeLines.push(`${storeResult.warnings.length} store warnings:\n${storeResult.warnings.join('\n')}`);
    const manifestReport = manifestResult.issues.length > 0
      ? CM.formatValidationReport(manifestResult)
      : 'No manifest/file reference issues found.';
    const message = `${storeLines.join('\n\n')}\n\nManifest/file validation:\n${manifestReport}`.trim();

    UI.openModal({
      title: `Validation: ${storeResult.errors.length + manifestResult.issues.filter((issue) => issue.level === 'error').length} errors`,
      content: `<pre style="white-space:pre-wrap;font-size:0.82rem;max-height:420px;overflow:auto">${escapeHtml(message)}</pre>`,
      width: '760px'
    });
  });

  window.addEventListener('beforeunload', (event) => {
    if (DS.isDirty()) {
      event.preventDefault();
      event.returnValue = 'You have unsaved changes. Save to GitHub or download before leaving.';
    }
  });

  setInterval(backgroundTick, 2000);

  async function boot() {
    await loadData();
    bindUndoRedo();

    if (window.CJS.PortraitPicker) {
      await window.CJS.PortraitPicker.loadManifest().catch(() => {});
    }

    populateWorldFilters();
    applyFilters();
    initEditor('effects');
    updateCounts();
    syncState.lastGitHubSavedJson = DS.exportJSON();
    setStatusMessage(`Ready (${getLoadMode()})`);
    refreshSyncBadge();

    await maybeOfferDraftRestore();
    updateCounts();
    refreshSyncBadge();
  }

  boot();
})();

// Marker export so this file is treated as an ES module (the controller is
// pure side-effects; the empty object is just to satisfy isolatedModules).
export {};
