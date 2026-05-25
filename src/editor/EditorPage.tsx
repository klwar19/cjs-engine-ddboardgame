import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { BuilderPanel } from "./BuilderPanel";
import { getReactBuilder } from "./builders";
import {
  editorStore,
  useEditorBoot,
  useEditorStore
} from "./editorStore";
import {
  DEFAULT_GITHUB_CONFIG,
  getEditorCjs,
  type PanelId
} from "./editorTypes";
import {
  buildManifestFileMap,
  getDirtyFileMap,
  getGithubConfig,
  getLoadMode,
  migrationState,
  refreshValidationState
} from "./saveService";
import { openGithubModal, openSaveDialog } from "./saveDialog";

interface NavItemConfig {
  readonly panel: PanelId;
  readonly label: string;
  readonly hasBadge?: boolean;
  readonly badgeKey?: string;
}

interface NavSection {
  readonly title: string;
  readonly items: readonly NavItemConfig[];
}

const NAV_SECTIONS: readonly NavSection[] = [
  {
    title: "Content",
    items: [
      { panel: "effects", label: "Effects", hasBadge: true, badgeKey: "effects" },
      { panel: "statuses", label: "Status Defs" },
      { panel: "passives", label: "Passives", hasBadge: true, badgeKey: "passives" },
      { panel: "skills", label: "Skills", hasBadge: true, badgeKey: "skills" },
      { panel: "jobs", label: "Jobs", hasBadge: true, badgeKey: "jobs" },
      { panel: "personas", label: "Personas", hasBadge: true, badgeKey: "personas" },
      { panel: "items", label: "Items", hasBadge: true, badgeKey: "items" },
      { panel: "food", label: "Food", hasBadge: true, badgeKey: "food" },
      { panel: "materials", label: "Materials", hasBadge: true, badgeKey: "materials" },
      { panel: "crafting", label: "Crafting", hasBadge: true, badgeKey: "crafting" }
    ]
  },
  {
    title: "Units",
    items: [
      { panel: "characters", label: "Characters", hasBadge: true, badgeKey: "characters" },
      { panel: "monsters", label: "Monsters", hasBadge: true, badgeKey: "monsters" }
    ]
  },
  {
    title: "World",
    items: [
      { panel: "encounters", label: "Encounters", hasBadge: true, badgeKey: "encounters" }
    ]
  },
  {
    title: "Campaign",
    items: [
      { panel: "campaign", label: "Campaign Data", hasBadge: true, badgeKey: "campaigns" }
    ]
  },
  {
    title: "Tools",
    items: [
      { panel: "browser", label: "Data Browser" },
      { panel: "audio", label: "Audio Library" }
    ]
  }
];

const COUNT_KEYS = [
  "effects",
  "skills",
  "jobs",
  "items",
  "food",
  "materials",
  "passives",
  "characters",
  "monsters",
  "encounters",
  "crafting",
  "crops",
  "shops",
  "zones",
  "stories",
  "campaigns",
  "scenarios",
  "scenarioMaps",
  "campaignEvents",
  "campaignQuests",
  "campaignHubs",
  "sideContentPacks",
  "questChains",
  "battleSets",
  "mapSeeds",
  "oracleTables",
  "storyDirectorPacks"
] as const;

function formatDateTime(value: number | undefined): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function formatClock(value: number | undefined): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

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

export function EditorPage() {
  useEditorBoot();

  const [activePanel, setActivePanel] = useState<PanelId>("effects");
  // Each panel-switch (or migration / import) bumps the panel epoch so the
  // BuilderPanel for that ID re-inits the underlying vanilla builder.
  const [panelEpoch, setPanelEpoch] = useState<Record<PanelId, number>>({
    effects: 0,
    statuses: 0,
    passives: 0,
    skills: 0,
    jobs: 0,
    personas: 0,
    items: 0,
    food: 0,
    materials: 0,
    crafting: 0,
    characters: 0,
    monsters: 0,
    encounters: 0,
    campaign: 0,
    browser: 0,
    audio: 0
  });
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [worldFilter, setWorldFilter] = useState<string>("all");
  const [worldOptions, setWorldOptions] = useState<
    Array<{ id: string; displayName?: string }>
  >([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [dirtyFiles, setDirtyFiles] = useState<string[]>([]);
  const [dsDirty, setDsDirty] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const syncState = useRef({
    pendingSnapshot: "",
    pendingSince: 0,
    lastGitHubSavedJson: ""
  });

  const tick = useEditorStore((s) => s.tick);
  const undo = useEditorStore((s) => s.undo);
  const saveInFlight = useEditorStore((s) => s.saveInFlight);
  const syncMessage = useEditorStore((s) => s.syncMessage);
  const syncTone = useEditorStore((s) => s.syncTone);
  const statusMessage = useEditorStore((s) => s.statusMessage);

  const setStatusMessage = useCallback(
    (msg: string) => editorStore.setStatusMessage(msg),
    []
  );
  const setSyncMessage = useCallback(
    (msg: string, tone: "info" | "success" | "error" = "info") =>
      editorStore.setSyncMessage(msg, tone),
    []
  );

  // ── COUNTS / DIRTY REFRESH ─────────────────────────────────────────
  useEffect(() => {
    const DS = getEditorCjs().DataStore;
    const CM = getEditorCjs().ContentManager;
    if (!DS) return;
    const c = DS.getCounts?.() ?? {};
    setCounts(c);
    setDirtyFiles(CM?.getDirtyFiles?.() ?? []);
    setDsDirty(DS.isDirty?.() ?? false);
  }, [tick]);

  const refreshSyncBadge = useCallback(() => {
    const Save = getEditorCjs().SaveManager;
    if (!Save) return;
    const cfg = getGithubConfig();
    if (saveInFlight) {
      setSyncMessage("Syncing GitHub...", "info");
      return;
    }
    if (Save.isGitHubReady(cfg)) {
      setSyncMessage(`GitHub ready (${cfg.owner}/${cfg.repo})`, "info");
      return;
    }
    const draft = Save.getDraft?.();
    if (draft && draft.savedAt) {
      setSyncMessage(`Local draft ${formatClock(draft.savedAt)}`, "info");
      return;
    }
    setSyncMessage("Local only", "info");
  }, [saveInFlight, setSyncMessage]);

  useEffect(() => {
    refreshSyncBadge();
  }, [tick, refreshSyncBadge]);

  // ── KEYBOARD: UNDO / REDO ──────────────────────────────────────────
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = ((event.target as HTMLElement | null)?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      const UM = getEditorCjs().UndoManager;
      if (!UM) return;
      if ((event.ctrlKey || event.metaKey) && event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        const entry = UM.undo();
        if (entry) {
          getEditorCjs().UI?.toast?.(`Undid: ${entry.label}`, "info", 2500);
          refreshActivePanel();
        }
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key === "Z" || (event.key === "z" && event.shiftKey))
      ) {
        event.preventDefault();
        const entry = UM.redo();
        if (entry) {
          getEditorCjs().UI?.toast?.(`Redid: ${entry.label}`, "info", 2500);
          refreshActivePanel();
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "y") {
        event.preventDefault();
        const entry = UM.redo();
        if (entry) {
          getEditorCjs().UI?.toast?.(`Redid: ${entry.label}`, "info", 2500);
          refreshActivePanel();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshActivePanel = useCallback(() => {
    setPanelEpoch((prev) => ({ ...prev, [activePanel]: prev[activePanel] + 1 }));
    editorStore.bump();
  }, [activePanel]);

  const resetAllPanels = useCallback(() => {
    setPanelEpoch((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next) as PanelId[]) next[key] = next[key] + 1;
      return next;
    });
  }, []);

  // ── BEFOREUNLOAD GUARD ─────────────────────────────────────────────
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (getEditorCjs().DataStore?.isDirty?.()) {
        event.preventDefault();
        event.returnValue =
          "You have unsaved changes. Save to GitHub or download before leaving.";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // ── FILTERS ────────────────────────────────────────────────────────
  const populateWorldFilters = useCallback(() => {
    const CM = getEditorCjs().ContentManager;
    if (!CM?.getWorldOptions) return;
    setWorldOptions(CM.getWorldOptions());
  }, []);

  const applyFilters = useCallback(() => {
    const CM = getEditorCjs().ContentManager;
    if (!CM?.setFilters) return;
    CM.setFilters({ scope: scopeFilter, world: worldFilter });
    resetAllPanels();
    editorStore.bump();
  }, [scopeFilter, worldFilter, resetAllPanels]);

  useEffect(() => {
    if (!bootDone) return;
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeFilter, worldFilter, bootDone]);

  // ── DRAFT / SNAPSHOT TRACKING ─────────────────────────────────────
  const rememberDirtySnapshot = useCallback(
    (json: string, source: "autosave" | "manual" | "import" | "restore" = "autosave") => {
      if (!json || json === syncState.current.pendingSnapshot) return;
      getEditorCjs().SaveManager?.saveDraft?.(json, { source });
      syncState.current.pendingSnapshot = json;
      syncState.current.pendingSince = Date.now();
      if (source === "autosave") setStatusMessage("Draft saved locally");
      refreshSyncBadge();
    },
    [refreshSyncBadge, setStatusMessage]
  );

  const clearPendingDraftState = useCallback(
    (json?: string) => {
      syncState.current.pendingSnapshot = "";
      syncState.current.pendingSince = 0;
      if (json !== undefined) syncState.current.lastGitHubSavedJson = json;
      getEditorCjs().SaveManager?.clearDraft?.();
      refreshSyncBadge();
    },
    [refreshSyncBadge]
  );

  // Autosave-style draft retention every 2s tick.
  useEffect(() => {
    if (!bootDone) return;
    const DS = getEditorCjs().DataStore;
    if (!DS) return;
    if (!DS.isDirty?.()) return;
    const json = DS.exportJSON();
    rememberDirtySnapshot(json, "autosave");
  }, [tick, bootDone, rememberDirtySnapshot]);

  // ── SAVE / EXPORT / IMPORT ─────────────────────────────────────────
  const downloadCurrentData = useCallback(async () => {
    const c = getEditorCjs();
    const DS = c.DataStore;
    const CM = c.ContentManager;
    const UI = c.UI;
    if (!DS) return;
    if (CM?.getManifest?.()) {
      await extractCurrentFiles(false);
      return;
    }
    const json = DS.exportJSON();
    DS.downloadJSON("gamedata.json");
    clearPendingDraftState(json);
    setStatusMessage("Downloaded bundled gamedata snapshot");
    UI?.toast?.("Downloaded bundled gamedata snapshot", "success");
    editorStore.bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearPendingDraftState, setStatusMessage]);

  const extractCurrentFiles = useCallback(
    async (includeOnlyDirty = true) => {
      const c = getEditorCjs();
      const CM = c.ContentManager;
      const Save = c.SaveManager;
      const UI = c.UI;
      if (!Save || !UI) return null;
      const fileMap = CM?.getManifest?.()
        ? buildManifestFileMap(includeOnlyDirty)
        : {
            [getGithubConfig().path || DEFAULT_GITHUB_CONFIG.path]: `${c.DataStore?.exportJSON?.() ?? ""}\n`
          };
      const paths = Object.keys(fileMap).sort();
      if (paths.length === 0) {
        UI.toast(
          includeOnlyDirty ? "No changed files to extract" : "No files available to export",
          "info"
        );
        return null;
      }
      try {
        const result = await Save.exportFilesToDirectory(fileMap, {
          pickerId: includeOnlyDirty ? "cjs-dirty-export" : "cjs-full-export"
        });
        const target = result.directoryName ? ` to ${result.directoryName}` : "";
        const message = includeOnlyDirty
          ? `Extracted ${paths.length} changed file${paths.length === 1 ? "" : "s"}${target}`
          : `Extracted ${paths.length} file${paths.length === 1 ? "" : "s"}${target}`;
        setStatusMessage(message);
        UI.toast(message, "success", 4500);
        return { mode: "directory", ...result };
      } catch (error) {
        if (/cancelled/i.test(String((error as Error)?.message || ""))) {
          UI.toast("Folder export cancelled", "info");
          return null;
        }
        const filename = includeOnlyDirty
          ? "cjs-dirty-files-export.json"
          : "cjs-full-file-export.json";
        Save.downloadFileBundle(fileMap, { filename });
        setStatusMessage("Folder export unavailable; downloaded a file bundle instead");
        UI.toast(
          "Folder export was unavailable, so a file bundle was downloaded instead. Unpack it into your repo root.",
          "info",
          6000
        );
        return { mode: "bundle", filename };
      }
    },
    [setStatusMessage]
  );

  const saveCurrentData = useCallback(
    async (mode: "single" | "separate" | "local") => {
      const c = getEditorCjs();
      const DS = c.DataStore;
      const CM = c.ContentManager;
      const Save = c.SaveManager;
      const UI = c.UI;
      if (!DS || !Save || !UI) return null;
      const cfg = getGithubConfig();
      const json = DS.exportJSON();
      const fileMap = getDirtyFileMap();

      if (mode === "local") {
        rememberDirtySnapshot(json, "manual");
        setStatusMessage("Draft saved locally");
        UI.toast("Saved locally in this browser", "success");
        editorStore.bump();
        return { mode: "local" };
      }

      if (Object.keys(fileMap).length === 0) {
        UI.toast("No changed files to save", "info");
        return null;
      }

      if (!Save.isGitHubReady(cfg)) {
        UI.toast("Configure GitHub first or choose Local only", "error", 4500);
        return null;
      }

      if (saveInFlight) {
        UI.toast("A save is already in progress", "info");
        return null;
      }

      rememberDirtySnapshot(json, "manual");
      setStatusMessage(
        mode === "separate"
          ? "Saving changed files separately..."
          : "Saving all changed files in one commit..."
      );

      const messageBase = cfg.commitMessage || DEFAULT_GITHUB_CONFIG.commitMessage;
      editorStore.setSaveInFlight(true);
      try {
        if (mode === "separate") {
          await Save.saveFilesSeparatelyToGitHub(fileMap, { config: cfg, message: messageBase });
        } else {
          await Save.saveFilesAsSingleCommit(fileMap, { config: cfg, message: messageBase });
        }
        DS.markClean();
        CM?.clearDirtyFiles?.();
        if (migrationState.pendingArtifacts) {
          migrationState.pendingArtifacts = false;
          migrationState.legacyBundleJson = "";
          migrationState.report = "";
        }
        clearPendingDraftState(json);
        refreshValidationState();
        setStatusMessage(
          mode === "separate"
            ? "Saved changed files as separate commits"
            : "Saved changed files in one commit"
        );
        UI.toast(
          mode === "separate"
            ? "Saved changed files separately"
            : "Saved changed files in one commit",
          "success"
        );
        editorStore.bump();
      } catch (error) {
        setStatusMessage("GitHub save failed");
        UI.toast((error as Error).message || "GitHub save failed", "error", 5000);
        throw error;
      } finally {
        editorStore.setSaveInFlight(false);
        refreshSyncBadge();
      }

      return { mode };
    },
    [
      clearPendingDraftState,
      refreshSyncBadge,
      rememberDirtySnapshot,
      saveInFlight,
      setStatusMessage
    ]
  );

  const handleSaveClick = useCallback(() => {
    openSaveDialog({
      onLocalSave: async () => {
        await saveCurrentData("local");
      },
      onExtractFiles: async () => {
        await extractCurrentFiles(true);
      },
      onGithubSeparate: async () => {
        await saveCurrentData("separate");
      },
      onGithubSingle: async () => {
        await saveCurrentData("single");
      }
    });
  }, [extractCurrentFiles, saveCurrentData]);

  const handleGithubClick = useCallback(() => {
    openGithubModal(() => {
      refreshSyncBadge();
      setStatusMessage("GitHub sync settings saved");
    });
  }, [refreshSyncBadge, setStatusMessage]);

  const handleImportClick = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;
      const c = getEditorCjs();
      const DS = c.DataStore;
      const UI = c.UI;
      if (!DS) return;
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const text = String(loadEvent.target?.result || "");
        const result = DS.importJSON(text);
        if (result.success) {
          DS.markDirty();
          rememberDirtySnapshot(DS.exportJSON(), "import");
          refreshValidationState();
          resetAllPanels();
          setStatusMessage("Imported JSON");
          UI?.toast?.(
            `Imported! ${result.validation.errors.length} errors, ${result.validation.warnings.length} warnings`,
            result.validation.errors.length > 0 ? "error" : "success"
          );
        } else {
          UI?.toast?.(`Import failed: ${result.error || "invalid"}`, "error");
        }
        editorStore.bump();
      };
      reader.readAsText(file);
      input.value = "";
    },
    [rememberDirtySnapshot, resetAllPanels, setStatusMessage]
  );

  const handleValidateClick = useCallback(() => {
    const c = getEditorCjs();
    const DS = c.DataStore;
    const CM = c.ContentManager;
    const UI = c.UI;
    if (!DS || !UI) return;
    refreshValidationState();
    const storeResult = DS.validate();
    const manifestResult =
      CM?.getManifest?.()
        ? CM.validateReferencesDetailed?.() ?? { valid: true, issues: [] }
        : { valid: true, issues: [] };
    if (
      storeResult.valid &&
      storeResult.warnings.length === 0 &&
      manifestResult.valid &&
      manifestResult.issues.length === 0
    ) {
      UI.toast("All references valid!", "success");
      return;
    }
    const storeLines: string[] = [];
    if (storeResult.errors.length > 0) {
      storeLines.push(
        `${storeResult.errors.length} store errors:\n${storeResult.errors.join("\n")}`
      );
    }
    if (storeResult.warnings.length > 0) {
      storeLines.push(
        `${storeResult.warnings.length} store warnings:\n${storeResult.warnings.join("\n")}`
      );
    }
    const manifestReport =
      manifestResult.issues.length > 0
        ? CM?.formatValidationReport?.({
            valid: manifestResult.valid,
            issues: manifestResult.issues
          }) ?? ""
        : "No manifest/file reference issues found.";
    const message =
      `${storeLines.join("\n\n")}\n\nManifest/file validation:\n${manifestReport}`.trim();
    const errorCount =
      storeResult.errors.length +
      manifestResult.issues.filter((issue) => issue.level === "error").length;
    UI.openModal({
      title: `Validation: ${errorCount} errors`,
      content: `<pre style="white-space:pre-wrap;font-size:0.82rem;max-height:420px;overflow:auto">${escHtml(
        message
      )}</pre>`,
      width: "760px"
    });
  }, []);

  const handleMigrateClick = useCallback(async () => {
    const c = getEditorCjs();
    const CM = c.ContentManager;
    const UI = c.UI;
    if (!UI || !CM?.getManifest?.()) {
      UI?.toast?.("Manifest mode is required before running migration", "error");
      return;
    }
    if (
      !window.confirm(
        "Migrate legacy data into the multi-file layout now? This will rewrite IDs in-memory, mark many files dirty, and wait for you to save manually."
      )
    ) {
      return;
    }
    try {
      const legacyResponse = await fetch("data/gamedata.json");
      migrationState.legacyBundleJson = legacyResponse.ok
        ? await legacyResponse.text()
        : "";
      const result = await CM.applyLegacyMigration?.();
      const lastMigration = CM.getLastMigration?.();
      migrationState.pendingArtifacts = true;
      migrationState.report = lastMigration?.report || "";
      refreshValidationState();
      populateWorldFilters();
      resetAllPanels();
      setStatusMessage(
        `Migration staged in ${result?.counts?.worlds ?? 0} worlds; review and save when ready`
      );
      UI.toast("Legacy bundle migrated into the multi-file layout", "success", 4500);
      if (migrationState.report) {
        UI.openModal({
          title: "Migration Report",
          content: `<pre style="white-space:pre-wrap;font-size:0.8rem;max-height:420px;overflow:auto">${escHtml(
            migrationState.report
          )}</pre>`,
          width: "780px"
        });
      }
    } catch (error) {
      UI.toast((error as Error).message || "Migration failed", "error", 5000);
    }
  }, [populateWorldFilters, resetAllPanels, setStatusMessage]);

  const handleUndo = useCallback(() => {
    const entry = getEditorCjs().UndoManager?.undo();
    if (entry) {
      getEditorCjs().UI?.toast?.(`Undid: ${entry.label}`, "info", 3000);
      refreshActivePanel();
    }
  }, [refreshActivePanel]);

  const handleRedo = useCallback(() => {
    const entry = getEditorCjs().UndoManager?.redo();
    if (entry) {
      getEditorCjs().UI?.toast?.(`Redid: ${entry.label}`, "info", 3000);
      refreshActivePanel();
    }
  }, [refreshActivePanel]);

  // ── BOOT ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const c = getEditorCjs();
      const CM = c.ContentManager;
      const DS = c.DataStore;
      const UI = c.UI;
      const Save = c.SaveManager;
      if (!CM || !DS || !UI || !Save) return;

      try {
        const result = await CM.loadDefaultData();
        const counts = DS.getCounts();
        const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
        populateWorldFilters();
        refreshValidationState();
        console.log(`Loaded ${getLoadMode()} data (${total} entries)`);
        UI.toast(
          `Loaded ${getLoadMode()} data: ${counts.effects ?? 0} effects, ${counts.skills ?? 0} skills, ${counts.characters ?? 0} chars, ${counts.monsters ?? 0} mons`,
          "success",
          4000
        );
        void result;
      } catch (error) {
        console.warn("Could not load any data:", (error as Error).message);
        UI.toast("No data files found. Create content or import a save.", "info", 5000);
      }

      if (c.PortraitPicker?.loadManifest) {
        await c.PortraitPicker.loadManifest().catch(() => undefined);
      }
      if (cancelled) return;
      populateWorldFilters();
      // Apply initial filters
      try {
        CM.setFilters?.({ scope: "all", world: "all" });
      } catch { /* ignore */ }
      resetAllPanels();
      syncState.current.lastGitHubSavedJson = DS.exportJSON();
      setStatusMessage(`Ready (${getLoadMode()})`);
      refreshSyncBadge();

      // Offer draft restore
      const draft = Save.getDraft?.();
      if (draft && draft.json) {
        const currentJson = DS.exportJSON();
        if (draft.json !== currentJson) {
          const result = DS.importJSON(draft.json);
          if (result.success) {
            DS.markDirty();
            rememberDirtySnapshot(draft.json, "restore");
            refreshValidationState();
            resetAllPanels();
            const when = formatDateTime(draft.savedAt);
            setStatusMessage(`Restored local draft from ${when}`);
            UI.toast(`Restored local draft from ${when}`, "info");
          } else {
            Save.clearDraft();
            refreshSyncBadge();
            setStatusMessage("Local draft was invalid and was discarded");
            UI.toast(`Draft restore failed: ${result.error || "invalid"}`, "error");
          }
        } else {
          Save.clearDraft();
          refreshSyncBadge();
        }
      }

      setBootDone(true);
      editorStore.bump();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navSections = useMemo(() => NAV_SECTIONS, []);

  // Show count badges from DataStore counts. Only render if value > 0
  // for keys we track (mirrors the original status-counts behaviour).
  const visibleCountEntries = useMemo(
    () => Object.entries(counts).filter(([k, v]) => COUNT_KEYS.includes(k as (typeof COUNT_KEYS)[number]) && v > 0),
    [counts]
  );

  const dirtyText =
    dirtyFiles.length > 0
      ? `${dirtyFiles.length} dirty file${dirtyFiles.length === 1 ? "" : "s"}`
      : dsDirty
      ? "Unsaved changes"
      : "";

  return (
    <div className="app-shell">
      <div className="app-header">
        <h1>CJS Editor</h1>
        <div className="btn-group" style={{ marginLeft: "auto" }}>
          <button
            className="btn btn-ghost btn-sm"
            id="btn-undo"
            title={undo.undoLabel ? `Undo: ${undo.undoLabel}` : "Nothing to undo"}
            disabled={!undo.canUndo}
            onClick={handleUndo}
          >
            Undo
          </button>
          <button
            className="btn btn-ghost btn-sm"
            id="btn-redo"
            title={undo.redoLabel ? `Redo: ${undo.redoLabel}` : "Nothing to redo"}
            disabled={!undo.canRedo}
            onClick={handleRedo}
          >
            Redo
          </button>
          <span
            style={{
              borderLeft: "1px solid rgba(255,255,255,0.1)",
              margin: "0 4px"
            }}
          />
          <button
            className="btn btn-ghost btn-sm"
            id="btn-migrate"
            title="Migrate legacy bundle into the multi-file layout"
            onClick={handleMigrateClick}
          >
            Migrate
          </button>
          <button
            className="btn btn-primary btn-sm"
            id="btn-save"
            title="Review save options for the multi-file layout"
            onClick={handleSaveClick}
          >
            Save
          </button>
          <button
            className="btn btn-ghost btn-sm"
            id="btn-github"
            title="Configure GitHub sync"
            onClick={handleGithubClick}
          >
            GitHub
          </button>
          <button
            className="btn btn-ghost btn-sm"
            id="btn-import"
            title="Import JSON"
            onClick={handleImportClick}
          >
            Import
          </button>
          <button
            className="btn btn-ghost btn-sm"
            id="btn-export"
            title="Extract split files or download a bundle backup"
            onClick={() => void downloadCurrentData()}
          >
            Export
          </button>
          <button
            className="btn btn-ghost btn-sm"
            id="btn-validate"
            title="Validate all references"
            onClick={handleValidateClick}
          >
            Validate
          </button>
          <a
            href="tests.html"
            className="btn btn-ghost btn-sm cjs-embed-hide"
            style={{ textDecoration: "none" }}
          >
            Tests
          </a>
          <a
            href="campaign.html"
            className="btn btn-ghost btn-sm cjs-embed-hide"
            style={{ textDecoration: "none", color: "#bfdbfe" }}
          >
            Campaign
          </a>
          <a
            href="combat.html"
            className="btn btn-ghost btn-sm cjs-embed-hide"
            style={{ textDecoration: "none", color: "#fca5a5" }}
          >
            Combat
          </a>
        </div>
        <input
          ref={importInputRef}
          type="file"
          id="import-file"
          accept=".json"
          style={{ display: "none" }}
          onChange={handleImportChange}
        />
      </div>

      <div className="app-body">
        <div className="app-sidebar" id="sidebar">
          {navSections.map((section) => (
            <SectionGroup
              key={section.title}
              section={section}
              activePanel={activePanel}
              counts={counts}
              onSelect={(panel) => {
                if (panel === activePanel) return;
                setActivePanel(panel);
                // Note: we do NOT bump panelEpoch on simple switches.
                // The BuilderPanel useEffect calls refresh() when its
                // `active` prop flips back to true, and we only force a
                // full re-init when data shape changes (import, migrate,
                // filter change) via resetAllPanels().
              }}
            />
          ))}
        </div>

        <div className="app-content" id="main-content">
          {(
            [
              "effects",
              "statuses",
              "passives",
              "skills",
              "jobs",
              "personas",
              "items",
              "food",
              "materials",
              "crafting",
              "characters",
              "monsters",
              "encounters",
              "campaign",
              "browser",
              "audio"
            ] as PanelId[]
          ).map((panel) => {
            const ReactBuilder = getReactBuilder(panel);
            if (ReactBuilder) {
              return (
                <div
                  key={`${panel}:${panelEpoch[panel]}`}
                  className={`editor-panel${panel === activePanel ? " active" : ""}`}
                  id={`panel-${panel}`}
                >
                  {panel === activePanel ? <ReactBuilder /> : null}
                </div>
              );
            }
            return (
              <BuilderPanel
                key={`${panel}:${panelEpoch[panel]}`}
                panel={panel}
                active={panel === activePanel}
              />
            );
          })}
        </div>
      </div>

      <div className="status-bar">
        <div className="counts" id="status-counts">
          {visibleCountEntries.map(([key, value]) => (
            <span key={key}>
              {key}: <b>{value}</b>
            </span>
          ))}
        </div>
        <div className="sync-meta">
          <div className="status-filters">
            <label className="status-filter">
              Scope
              <select
                id="filter-scope"
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.currentTarget.value)}
              >
                <option value="all">All scopes</option>
                <option value="system">System</option>
                <option value="universal">Universal</option>
                <option value="world">World only</option>
              </select>
            </label>
            <label className="status-filter">
              World
              <select
                id="filter-world"
                value={worldFilter}
                onChange={(e) => setWorldFilter(e.currentTarget.value)}
              >
                <option value="all">All worlds</option>
                {worldOptions.map((world) => (
                  <option key={world.id} value={world.id}>
                    {world.displayName || world.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <span id="status-dirty" className={dirtyText && dirtyFiles.length > 0 ? "dirty" : dirtyText ? "dirty" : ""}>
            {dirtyText}
          </span>
          <span id="status-files">
            {dirtyFiles.length > 0 ? dirtyFiles.join(", ") : ""}
          </span>
          <span id="status-msg">{statusMessage}</span>
          <span id="status-sync" className={syncTone ? `sync-${syncTone}` : ""}>
            {syncMessage}
          </span>
        </div>
      </div>
    </div>
  );
}

function SectionGroup({
  section,
  activePanel,
  counts,
  onSelect
}: {
  section: NavSection;
  activePanel: PanelId;
  counts: Record<string, number>;
  onSelect: (panel: PanelId) => void;
}) {
  return (
    <>
      <div className="nav-section">{section.title}</div>
      {section.items.map((item) => {
        const active = item.panel === activePanel;
        const badge = item.hasBadge
          ? counts[item.badgeKey ?? item.panel] ?? 0
          : null;
        return (
          <div
            key={item.panel}
            className={`nav-item${active ? " active" : ""}`}
            data-panel={item.panel}
            onClick={() => onSelect(item.panel)}
          >
            <span>{item.label}</span>
            {badge !== null ? (
              <span className="badge" id={`count-${item.badgeKey ?? item.panel}`}>
                {badge}
              </span>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
