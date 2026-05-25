// Thin typings for the vanilla CJS modules the editor talks to. The
// editor only needs a slice of each module's surface, so we declare
// what we use here rather than typing the whole engine.

export interface DataStoreApi {
  getCounts: () => Record<string, number>;
  isDirty: () => boolean;
  markDirty: () => void;
  markClean: () => void;
  exportJSON: () => string;
  downloadJSON: (filename: string) => void;
  importJSON: (json: string) => {
    success: boolean;
    error?: string;
    validation: { errors: string[]; warnings: string[] };
  };
  validate: () => { valid: boolean; errors: string[]; warnings: string[] };
  exists: (type: string, id: string) => boolean;
  replace: (type: string, id: string, value: unknown) => void;
}

export interface UiHelpersApi {
  toast: (msg: string, kind?: string, ms?: number) => void;
  openModal: (opts: {
    title: string;
    content: string | HTMLElement;
    footer?: HTMLElement;
    width?: string;
  }) => HTMLElement;
  closeModal: (overlay: HTMLElement) => void;
}

export type SaveManagerConfig = Record<string, unknown>;

export interface SaveManagerApi {
  getGitHubConfig: () => SaveManagerConfig;
  hasGitHubToken: () => boolean;
  getGitHubToken: () => string;
  saveGitHubConfig: (config: SaveManagerConfig) => void;
  clearGitHubConfig: () => void;
  isGitHubReady: (config: SaveManagerConfig) => boolean;
  saveDraft: (json: string, meta?: { source?: string }) => void;
  getDraft: () => { json?: string; savedAt?: number } | null;
  clearDraft: () => void;
  testGitHubConnection: (opts: {
    config: SaveManagerConfig;
    token: string;
  }) => Promise<{ fileExists: boolean }>;
  saveFilesAsSingleCommit: (
    fileMap: Record<string, string>,
    opts: { config: SaveManagerConfig; message: string }
  ) => Promise<unknown>;
  saveFilesSeparatelyToGitHub: (
    fileMap: Record<string, string>,
    opts: { config: SaveManagerConfig; message: string }
  ) => Promise<unknown>;
  exportFilesToDirectory: (
    fileMap: Record<string, string>,
    opts: { pickerId?: string }
  ) => Promise<{ directoryName?: string }>;
  downloadFileBundle: (
    fileMap: Record<string, string>,
    opts: { filename: string }
  ) => void;
}

export interface ContentManagerApi {
  loadDefaultData: () => Promise<{ mode?: string }>;
  getLoadMode?: () => string;
  getWorldOptions?: () => Array<{ id: string; displayName?: string }>;
  setFilters?: (filters: { scope: string; world: string }) => void;
  getManifest?: () => unknown;
  buildFileMap?: (opts: { includeOnlyDirty: boolean }) => Record<string, unknown>;
  getDirtyFiles?: () => string[];
  clearDirtyFiles?: () => void;
  validateReferencesDetailed?: () => {
    valid: boolean;
    issues: Array<{ level: string }>;
    byFile?: Record<string, unknown>;
  };
  applyLegacyMigration?: () => Promise<{ counts?: { worlds?: number } }>;
  getLastMigration?: () => { report?: string } | null;
  formatValidationReport?: (
    result: { valid: boolean; issues: Array<{ level: string }> }
  ) => string;
}

export interface UndoManagerApi {
  subscribe: (
    cb: (state: { canUndo: boolean; canRedo: boolean; undoLabel?: string; redoLabel?: string }) => void
  ) => () => void;
  undo: () => { label: string } | null;
  redo: () => { label: string } | null;
  disable?: () => void;
  enable?: () => void;
  clear?: () => void;
}

export interface BuilderApi {
  init: (panel: HTMLElement) => void;
  refresh?: () => void;
}

export interface CjsEditor {
  DataStore?: DataStoreApi;
  SaveManager?: SaveManagerApi;
  ContentManager?: ContentManagerApi;
  UI?: UiHelpersApi;
  UndoManager?: UndoManagerApi;
  ItemEditor?: BuilderApi;
  SimpleCollectionEditor?: {
    food: BuilderApi;
    materials: BuilderApi;
    crafting: BuilderApi;
  };
  CharEditor?: BuilderApi;
  MonsterEditor?: BuilderApi;
  EncounterEditor?: BuilderApi;
  CampaignEditor?: BuilderApi;
  DataBrowser?: BuilderApi;
  AudioLibrary?: BuilderApi;
  PortraitPicker?: { loadManifest?: () => Promise<unknown> };
  CONST?: { STATUS_DEFINITIONS?: Record<string, Record<string, unknown>> };
}

export function getEditorCjs(): CjsEditor {
  return (window as unknown as { CJS?: CjsEditor }).CJS ?? {};
}

export const DEFAULT_GITHUB_CONFIG = {
  owner: "klwar19",
  repo: "cjs-engine-ddboardgame",
  branch: "main",
  path: "data/gamedata.json",
  commitMessage: "Update gamedata from CJS Editor",
  autoSave: false,
  rememberToken: false
} as const;

export type PanelId =
  | "effects"
  | "statuses"
  | "passives"
  | "skills"
  | "jobs"
  | "personas"
  | "items"
  | "food"
  | "materials"
  | "crafting"
  | "characters"
  | "monsters"
  | "encounters"
  | "campaign"
  | "browser"
  | "audio";

export function builderFor(panel: PanelId): BuilderApi | undefined {
  const c = getEditorCjs();
  switch (panel) {
    case "items":
      return c.ItemEditor;
    case "food":
      return c.SimpleCollectionEditor?.food;
    case "materials":
      return c.SimpleCollectionEditor?.materials;
    case "crafting":
      return c.SimpleCollectionEditor?.crafting;
    case "characters":
      return c.CharEditor;
    case "monsters":
      return c.MonsterEditor;
    case "encounters":
      return c.EncounterEditor;
    case "campaign":
      return c.CampaignEditor;
    case "browser":
      return c.DataBrowser;
    case "audio":
      return c.AudioLibrary;
    default:
      return undefined;
  }
}
