// Save service — extracts the file-map / GitHub / extract-files logic
// from the legacy editor-controller into pure functions the React shell
// composes from. Keeps SaveManager + ContentManager + DataStore wiring
// in one place.

import { DEFAULT_GITHUB_CONFIG, getEditorCjs } from "./editorTypes";

export interface GithubConfig {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  commitMessage: string;
  autoSave: boolean;
  rememberToken: boolean;
  // Index signature: SaveManager accepts arbitrary additional keys
  // (e.g. token); declaring it here keeps GithubConfig assignable to the
  // SaveManagerConfig record type without per-call casts.
  [key: string]: unknown;
}

interface MigrationState {
  pendingArtifacts: boolean;
  legacyBundleJson: string;
  report: string;
}

export const migrationState: MigrationState = {
  pendingArtifacts: false,
  legacyBundleJson: "",
  report: ""
};

export function getGithubConfig(): GithubConfig {
  const stored = (getEditorCjs().SaveManager?.getGitHubConfig() ?? {}) as Partial<GithubConfig>;
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

export function buildManifestFileMap(includeOnlyDirty = true): Record<string, string> {
  const CM = getEditorCjs().ContentManager;
  if (!CM?.getManifest?.()) return {};
  const docs = CM.buildFileMap?.({ includeOnlyDirty }) ?? {};
  const out: Record<string, string> = {};
  for (const [path, doc] of Object.entries(docs)) {
    out[path] = `${JSON.stringify(doc, null, 2)}\n`;
  }
  if (migrationState.pendingArtifacts) {
    if (migrationState.report) {
      out["MIGRATION_REPORT.md"] = migrationState.report.endsWith("\n")
        ? migrationState.report
        : `${migrationState.report}\n`;
    }
    if (migrationState.legacyBundleJson) {
      out["data/_legacy_bundle.json"] = migrationState.legacyBundleJson.endsWith("\n")
        ? migrationState.legacyBundleJson
        : `${migrationState.legacyBundleJson}\n`;
    }
  }
  return out;
}

export function getDirtyFileMap(): Record<string, string> {
  const c = getEditorCjs();
  const DS = c.DataStore;
  if (!DS) return {};
  if (c.ContentManager?.getManifest?.()) return buildManifestFileMap(true);
  const cfg = getGithubConfig();
  return DS.isDirty()
    ? { [cfg.path || DEFAULT_GITHUB_CONFIG.path]: DS.exportJSON() }
    : {};
}

export function getLoadMode(): string {
  return getEditorCjs().ContentManager?.getLoadMode?.() ?? "legacy";
}

export function refreshValidationState(): void {
  const CM = getEditorCjs().ContentManager;
  if (CM?.getManifest?.()) CM.validateReferencesDetailed?.();
}
