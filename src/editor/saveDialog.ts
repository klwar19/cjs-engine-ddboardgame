// Save dialog — opens the "Save Changes" UI modal. Uses the vanilla
// UI.openModal helper so the modal chrome stays consistent with other
// editor modals (validation, migration report, GitHub sync).

import {
  buildManifestFileMap,
  getDirtyFileMap,
  getGithubConfig,
  getLoadMode,
  migrationState
} from "./saveService";
import { DEFAULT_GITHUB_CONFIG, getEditorCjs } from "./editorTypes";

function escHtml(value: unknown): string {
  return String(value || "").replace(/[&<>"']/g, (ch) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[ch] as string
  );
}

interface SaveDialogCallbacks {
  onLocalSave: () => Promise<void>;
  onExtractFiles: () => Promise<void>;
  onGithubSeparate: () => Promise<void>;
  onGithubSingle: () => Promise<void>;
}

export function openSaveDialog(cb: SaveDialogCallbacks): void {
  const c = getEditorCjs();
  if (!c.UI?.openModal) return;

  const fileMap = getDirtyFileMap();
  const paths = Object.keys(fileMap).sort();
  if (paths.length === 0) {
    c.UI.toast("No changed files to save", "info");
    return;
  }

  const body = document.createElement("div");
  body.innerHTML = `
    <div class="hint-box hint-info">
      <b>Load mode:</b> ${escHtml(getLoadMode())}. Save stays manual: choose how to write the current dirty files.
    </div>
    <div><b>${paths.length}</b> file(s) ready:</div>
    <div class="sync-status-box" style="max-height:260px;overflow:auto;margin-top:8px">${paths
      .map((path) => escHtml(path))
      .join("<br>")}</div>
    <div class="sync-note">For <b>Extract Files</b>, choose your repo root folder: the one that contains <code>editor.html</code>, <code>combat.html</code>, <code>data/</code>, <code>js/</code>, and <code>css/</code>.</div>
    ${migrationState.pendingArtifacts ? '<div class="sync-note">This save also includes the one-time migration artifacts: <code>MIGRATION_REPORT.md</code> and <code>data/_legacy_bundle.json</code>.</div>' : ""}
  `;

  const footer = document.createElement("div");
  const closeBtn = button("btn btn-ghost", "Close");
  const localBtn = button("btn btn-ghost", "Local Only");
  const extractBtn = button("btn btn-ghost", "Extract Files");
  const separateBtn = button("btn btn-ghost", "GitHub: Separate");
  const singleBtn = button("btn btn-primary", "GitHub: One Commit");
  footer.appendChild(closeBtn);
  footer.appendChild(localBtn);
  footer.appendChild(extractBtn);
  footer.appendChild(separateBtn);
  footer.appendChild(singleBtn);

  const overlay = c.UI.openModal({
    title: "Save Changes",
    content: body,
    footer,
    width: "760px"
  });

  closeBtn.onclick = () => c.UI?.closeModal?.(overlay);
  localBtn.onclick = async () => {
    await cb.onLocalSave();
    c.UI?.closeModal?.(overlay);
  };
  extractBtn.onclick = async () => {
    await cb.onExtractFiles();
    c.UI?.closeModal?.(overlay);
  };
  separateBtn.onclick = async () => {
    try {
      await cb.onGithubSeparate();
      c.UI?.closeModal?.(overlay);
    } catch { /* error toasted by caller */ }
  };
  singleBtn.onclick = async () => {
    try {
      await cb.onGithubSingle();
      c.UI?.closeModal?.(overlay);
    } catch { /* error toasted by caller */ }
  };
  // Touch unused-import warning silencer
  void buildManifestFileMap;
  void DEFAULT_GITHUB_CONFIG;
}

function button(className: string, label: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = className;
  b.textContent = label;
  return b;
}

export function openGithubModal(onSaved: () => void): void {
  const c = getEditorCjs();
  const UI = c.UI;
  const Save = c.SaveManager;
  if (!UI?.openModal || !Save) return;
  const cfg = getGithubConfig();
  const hasToken = Save.hasGitHubToken();

  const body = document.createElement("div");
  body.innerHTML = `
    <div class="sync-modal-grid">
      <div>
        <label class="form-label" for="gh-owner">Owner</label>
        <input type="text" id="gh-owner" value="${escHtml(cfg.owner)}" placeholder="klwar19">
      </div>
      <div>
        <label class="form-label" for="gh-repo">Repo</label>
        <input type="text" id="gh-repo" value="${escHtml(cfg.repo)}" placeholder="cjs-engine-ddboardgame">
      </div>
      <div>
        <label class="form-label" for="gh-branch">Branch</label>
        <input type="text" id="gh-branch" value="${escHtml(cfg.branch)}" placeholder="main">
      </div>
      <div>
        <label class="form-label" for="gh-path">Bundle Path</label>
        <input type="text" id="gh-path" value="${escHtml(cfg.path)}" placeholder="data/gamedata.json">
      </div>
      <div class="full">
        <label class="form-label" for="gh-message">Commit Message</label>
        <input type="text" id="gh-message" value="${escHtml(cfg.commitMessage)}" placeholder="Update gamedata from CJS Editor">
      </div>
      <div class="full">
        <label class="form-label" for="gh-token">GitHub Token</label>
        <input type="password" id="gh-token" placeholder="${
          hasToken ? "Stored token will be kept unless you replace it" : "Paste a fine-grained token"
        }">
      </div>
      <label class="form-check full">
        <input type="checkbox" id="gh-autosave" disabled>
        <span>Manual save only (GitHub autosave is disabled for the multi-file workflow)</span>
      </label>
      <label class="form-check full">
        <input type="checkbox" id="gh-remember" ${cfg.rememberToken ? "checked" : ""}>
        <span>Remember token on this browser</span>
      </label>
    </div>
    <div class="sync-note">
      Use a GitHub fine-grained personal access token with Contents read and write permission for this repo.
      The token stays in browser storage only and is never written into your data files.
    </div>
    <div class="sync-status-box" id="gh-sync-status">${
      hasToken
        ? "A token is already stored in this browser."
        : "Enter your GitHub settings, then test or save them."
    }</div>
  `;

  const footer = document.createElement("div");
  const closeBtn = button("btn btn-ghost", "Close");
  const disconnectBtn = button("btn btn-danger", "Disconnect");
  const testBtn = button("btn btn-ghost", "Test");
  const saveBtn = button("btn btn-primary", "Save Settings");
  footer.appendChild(closeBtn);
  footer.appendChild(disconnectBtn);
  footer.appendChild(testBtn);
  footer.appendChild(saveBtn);

  const overlay = UI.openModal({
    title: "GitHub Sync",
    content: body,
    footer,
    width: "720px"
  });

  const get = <T extends HTMLElement>(sel: string) => body.querySelector(sel) as T;
  const ownerInput = get<HTMLInputElement>("#gh-owner");
  const repoInput = get<HTMLInputElement>("#gh-repo");
  const branchInput = get<HTMLInputElement>("#gh-branch");
  const pathInput = get<HTMLInputElement>("#gh-path");
  const messageInput = get<HTMLInputElement>("#gh-message");
  const tokenInput = get<HTMLInputElement>("#gh-token");
  const rememberInput = get<HTMLInputElement>("#gh-remember");
  const syncStatusBox = get<HTMLElement>("#gh-sync-status");

  function collectConfig() {
    const next: Record<string, unknown> = {
      owner: ownerInput.value.trim(),
      repo: repoInput.value.trim(),
      branch: branchInput.value.trim() || "main",
      path: pathInput.value.trim() || "data/gamedata.json",
      commitMessage:
        messageInput.value.trim() || DEFAULT_GITHUB_CONFIG.commitMessage,
      autoSave: false,
      rememberToken: rememberInput.checked
    };
    const newToken = tokenInput.value.trim();
    if (newToken) next.token = newToken;
    else if (!Save?.hasGitHubToken?.()) next.token = "";
    return next;
  }

  closeBtn.onclick = () => UI.closeModal?.(overlay);
  disconnectBtn.onclick = () => {
    Save.clearGitHubConfig();
    UI.closeModal?.(overlay);
    UI.toast?.("GitHub sync removed from this browser", "info");
    onSaved();
  };
  testBtn.onclick = async () => {
    syncStatusBox.textContent = "Testing GitHub connection...";
    try {
      const next = collectConfig();
      const tokenOverride = (next.token as string | undefined) ?? Save.getGitHubToken();
      const result = await Save.testGitHubConnection({
        config: next,
        token: tokenOverride
      });
      syncStatusBox.textContent = result.fileExists
        ? "Connection OK. The configured bundle path exists."
        : "Connection OK. The configured bundle path is missing now, but the first save can create it.";
    } catch (error) {
      syncStatusBox.textContent =
        (error as Error).message || "GitHub test failed";
    }
  };
  saveBtn.onclick = () => {
    Save.saveGitHubConfig(collectConfig());
    UI.closeModal?.(overlay);
    UI.toast?.("GitHub sync settings saved", "success");
    onSaved();
  };
}
