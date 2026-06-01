// actions.ts — Typed wrappers around the vanilla `data-campaign-action`
// dispatch. React tabs that have migrated to direct onClick handlers
// import functions from here instead of stamping `data-campaign-action`
// attributes onto buttons. The legacy bubbling delegate in campaign-ui.js
// still works for any string that hasn't been ported yet, so this file
// is additive — not a replacement.
//
// Each function is a thin wrapper. The wrappers:
//   1. Pull the matching CJS module off `window.CJS` lazily so React
//      doesn't need to wait for module-load ordering.
//   2. Catch missing-module situations and surface a UI toast.
//   3. Defer the actual mutation to `CampaignOps.apply` where applicable
//      so save/undo/log behaviour matches the vanilla path exactly.
//
// When you migrate a tab's button: replace `data-campaign-action="x"`
// with `onClick={() => CampaignActions.x(args)}` and add a wrapper here
// if one doesn't exist yet. The matching case in `_handleAction` in
// `js/campaign/campaign-ui.js` can stay (vanilla still uses it) until
// every consumer has switched over.

import type { CampaignActionName } from "./actionNames";
export type { CampaignActionName } from "./actionNames";

// Minimal CJS surface used by the action wrappers.
interface UiToastModule {
  toast: (message: string, kind?: "info" | "success" | "error", durationMs?: number) => void;
  confirm: (message: string, onConfirm: () => void, onCancel?: () => void) => void;
  openModal?: (opts: { title: string; content: HTMLElement | string; footer?: HTMLElement; width?: string }) => unknown;
  closeModal?: (overlay: unknown) => void;
}

interface CampaignOpsModule {
  apply: (
    op: { op: string; [key: string]: unknown } | Array<{ op: string; [key: string]: unknown }>,
    options?: { source?: string; [key: string]: unknown }
  ) => unknown;
}

interface CampaignSaveModule {
  saveCurrent: () => void;
  forkCurrent: () => unknown;
  exportCurrent: () => void;
  pushCurrentToGitHub: () => Promise<unknown>;
  loadSlot: (slotId: string) => { incompatible?: boolean; reason?: string; slotName?: string; saveId?: string } | null;
  deleteSlot: (slotId: string) => void;
  deleteAllSlots: () => void;
  getSlots: () => Record<string, { saveId: string; slotName?: string }>;
  importFile: (file: File) => Promise<unknown>;
}

interface SaveManagerModule {
  downloadTextFile?: (filename: string, content: string, mime?: string) => void;
}

interface CampaignStateModule {
  getState: () => { campaignId?: string; [key: string]: unknown } | null;
  createNewSave: (campaignId?: string) => void;
  getContent: () => { campaigns?: Record<string, { id: string }>; [key: string]: unknown };
  mutate: (
    recipe: (state: Record<string, unknown>) => void,
    options?: { source?: string }
  ) => void;
}

interface CampaignUIModule {
  render: () => void;
  handleAction?: (name: string, data?: Record<string, string | number | undefined>) => void;
  // Phase H.3 — lets the typed handlers clear the boot-incompatible
  // banner after the user starts a fresh save / loads a slot, matching
  // the vanilla `_newSave`/`_loadSlot`/`_deleteAllSaves` closures which
  // reset `_bootIncompatibleNotice` to null.
  clearBootIncompatibleNotice?: () => void;
}

interface CuiLogModule {
  logKind: (line: { kind?: string; [key: string]: unknown }) => { label: string };
}
interface CuiUtilsModule {
  safe: (value: unknown) => string;
}
interface CampaignUIInternalModule {
  readonly Log?: CuiLogModule;
  readonly Utils?: CuiUtilsModule;
}

interface Cjs {
  readonly CampaignOps?: CampaignOpsModule;
  readonly CampaignSave?: CampaignSaveModule;
  readonly CampaignState?: CampaignStateModule;
  readonly CampaignUI?: CampaignUIModule;
  readonly CampaignUIInternal?: CampaignUIInternalModule;
  readonly SaveManager?: SaveManagerModule;
  readonly UI?: UiToastModule;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

function ops(): CampaignOpsModule {
  const m = cjs().CampaignOps;
  if (!m) throw new Error("CampaignOps not loaded");
  return m;
}

function save(): CampaignSaveModule {
  const m = cjs().CampaignSave;
  if (!m) throw new Error("CampaignSave not loaded");
  return m;
}

function state(): CampaignStateModule {
  const m = cjs().CampaignState;
  if (!m) throw new Error("CampaignState not loaded");
  return m;
}

function ui(): UiToastModule | null {
  return cjs().UI ?? null;
}

// Render hint: vanilla `_handleAction` always calls `render()` after a
// mutation that doesn't already trigger a state subscriber. We mirror
// that for symmetry — no-op when CampaignUI isn't loaded yet.
function rerender(): void {
  cjs().CampaignUI?.render?.();
}

function toast(message: string, kind: "info" | "success" | "error" = "info", durationMs?: number): void {
  ui()?.toast?.(message, kind, durationMs);
}

// Clears the boot-incompatible banner so it disappears once the user
// starts a fresh save / loads a slot (parity with the vanilla closures).
function clearBootNotice(): void {
  cjs().CampaignUI?.clearBootIncompatibleNotice?.();
}

// ── Save management ────────────────────────────────────────────────
export function quickSave(): void {
  try {
    save().saveCurrent();
    toast("Campaign saved", "success");
  } catch (error) {
    toast((error as Error).message || "Save failed", "error");
  }
}

export function newSave(): void {
  const message = "Create a fresh campaign save? Your current campaign will keep its own slot — the new save starts empty in a different slot.";
  const proceed = () => {
    const cs = state();
    const sv = save();
    const campaign = Object.values(cs.getContent().campaigns || {})[0];
    cs.createNewSave(campaign?.id);
    sv.saveCurrent();
    clearBootNotice();
    toast("New campaign save started", "success");
    rerender();
  };
  const u = ui();
  if (u?.confirm) {
    u.confirm(message, proceed);
  } else {
    proceed();
  }
}

export function forkSave(): void {
  try {
    save().forkCurrent();
    toast("Campaign forked", "success");
    rerender();
  } catch (error) {
    toast((error as Error).message || "Fork failed", "error");
  }
}

export function exportSave(): void {
  try {
    save().exportCurrent();
  } catch (error) {
    toast((error as Error).message || "Export failed", "error");
  }
}

export function importSavePicker(): void {
  // The hidden <input type="file" id="campaign-import-file"> is rendered
  // by the vanilla shell. When the React shell takes over we'll move it
  // into JSX, but `getElementById` still works either way.
  const input = document.getElementById("campaign-import-file") as HTMLInputElement | null;
  if (input) {
    input.click();
    return;
  }
  // Fall back to creating an ephemeral picker so React-only paths still
  // work before the vanilla shell's file input is mounted.
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = ".json";
  picker.style.display = "none";
  picker.addEventListener("change", () => {
    const file = picker.files?.[0];
    if (file) {
      save().importFile(file)
        .then(() => { toast("Campaign save imported", "success"); rerender(); })
        .catch((error: Error) => toast(error.message || "Import failed", "error"));
    }
    picker.remove();
  });
  document.body.appendChild(picker);
  picker.click();
}

// Import handler for the shell's hidden <input id="campaign-import-file">.
// The `import-save` action clicks that input; this runs on its change.
// (Replaces the change branch of the removed `_bindEvents` listener.)
export function importSaveFile(file: File | undefined | null): void {
  if (!file) return;
  save().importFile(file)
    .then(() => { toast("Campaign save imported", "success"); rerender(); })
    .catch((error: Error) => toast(error.message || "Import failed", "error"));
}

export function pushToGitHub(): void {
  save().pushCurrentToGitHub()
    .then(() => toast("Campaign save pushed to GitHub", "success"))
    .catch((error: Error) => toast(error.message || "GitHub save failed", "error", 5000));
}

export function loadSlot(slotId: string): void {
  if (!slotId) return;
  const result = save().loadSlot(slotId);
  if (result && result.incompatible) {
    toast(result.reason || "That save is from an older build and cannot be loaded.", "error", 5500);
    return;
  }
  if (!result) {
    toast("Save slot not found", "error");
    return;
  }
  clearBootNotice();
  toast(`Loaded ${result.slotName || result.saveId || "save"}`, "success");
  rerender();
}

export function deleteSlot(slotId: string): void {
  if (!slotId) return;
  const proceed = () => {
    save().deleteSlot(slotId);
    toast("Save slot deleted", "info");
    rerender();
  };
  const u = ui();
  if (u?.confirm) {
    u.confirm("Delete this save slot? This cannot be undone.", proceed);
  } else if (window.confirm("Delete this save slot? This cannot be undone.")) {
    proceed();
  }
}

export function deleteAllSaves(): void {
  const proceed = () => {
    const cs = state();
    const sv = save();
    sv.deleteAllSlots();
    const campaign = Object.values(cs.getContent().campaigns || {})[0];
    cs.createNewSave(campaign?.id);
    sv.saveCurrent();
    clearBootNotice();
    toast("All save slots cleared. Started a fresh campaign.", "success");
    rerender();
  };
  const u = ui();
  if (u?.confirm) {
    u.confirm("Delete ALL local campaign saves? This cannot be undone.", proceed);
  } else if (window.confirm("Delete ALL local campaign saves? This cannot be undone.")) {
    proceed();
  }
}

export function exportSlot(slotId: string): void {
  const slot = save().getSlots()[slotId];
  if (!slot) { toast("Save slot not found", "error"); return; }
  const SaveMgr = cjs().SaveManager;
  if (!SaveMgr?.downloadTextFile) { toast("Save export unavailable", "error"); return; }
  const file = `${(slot.slotName || slot.saveId || "campaign_save").replace(/[^a-z0-9._-]+/gi, "_").toLowerCase()}.save.json`;
  SaveMgr.downloadTextFile(file, `${JSON.stringify(slot, null, 2)}\n`, "application/json");
  toast(`Exported ${file}`, "success");
}

// ── Log management ────────────────────────────────────────────────
export function clearLog(): void {
  const proceed = () => {
    state().mutate((s) => { s.log = []; }, { source: "ui" });
    toast("Campaign log cleared", "info");
  };
  const u = ui();
  if (u?.confirm) {
    u.confirm("Clear the campaign session log? This cannot be undone.", proceed);
  } else if (window.confirm("Clear the campaign session log? This cannot be undone.")) {
    proceed();
  }
}

export function exportLog(): void {
  const SaveMgr = cjs().SaveManager;
  const s = state().getState();
  if (!s) return;
  const log = (s.log as unknown[]) || [];
  if (!SaveMgr?.downloadTextFile) { toast("Log export unavailable", "error"); return; }
  const name = `campaign_log_${new Date().toISOString().slice(0, 10)}.json`;
  SaveMgr.downloadTextFile(name, JSON.stringify(log, null, 2) + "\n", "application/json");
  toast(`Exported ${name}`, "success");
}

// Event-log entry shape — only the fields the export reads.
interface EventLogEntry {
  readonly at?: string;
  readonly phase?: number | string;
  readonly world?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly tags?: readonly string[];
  readonly consequences?: readonly string[];
}

function safe(value: unknown): string {
  const fn = cjs().CampaignUIInternal?.Utils?.safe;
  return fn ? fn(value) : String(value ?? "");
}

// Matches the vanilla `_exportEventLog`: plain-text export, one block per
// entry, filename `<slotName>-event-log.txt`. No toast (the file dialog
// is the feedback), same as the closure it replaces.
export function exportEventLog(): void {
  const SaveMgr = cjs().SaveManager;
  const s = state().getState() as { slotName?: string; eventLog?: { entries?: EventLogEntry[] } } | null;
  if (!s) return;
  if (!SaveMgr?.downloadTextFile) { toast("Event log export unavailable", "error"); return; }
  const entries = s.eventLog?.entries || [];
  const text = entries
    .map((entry) =>
      [
        `[${entry.at || ""}] Phase ${entry.phase || "?"} ${entry.world || ""}`,
        entry.title || "Event",
        entry.summary || "",
        entry.tags?.length ? `Tags: ${entry.tags.join(", ")}` : "",
        entry.consequences?.length ? `Consequences: ${entry.consequences.join("; ")}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
  SaveMgr.downloadTextFile(`${safe(s.slotName)}-event-log.txt`, `${text}\n`, "text/plain");
}

// Matches the vanilla `_clearEventLog`: confirm, then empty
// `eventLog.entries` with the same `clear_event_log` mutation source.
export function clearEventLog(): void {
  const proceed = () => {
    state().mutate((st) => {
      const slot = st as { eventLog?: { entries?: unknown[] } };
      slot.eventLog = slot.eventLog || {};
      slot.eventLog.entries = [];
    }, { source: "clear_event_log" });
    toast("Event log cleared", "info");
  };
  const u = ui();
  if (u?.confirm) {
    u.confirm("Clear the event log?", proceed);
  } else if (window.confirm("Clear the event log?")) {
    proceed();
  }
}

// ── Roster management ─────────────────────────────────────────────
export function benchCharacter(target: string): void {
  ops().apply({ op: "bench_character", target }, { source: "ui" });
}

export function activateCharacter(target: string): void {
  ops().apply({ op: "activate_character", target }, { source: "ui" });
}

// ── Phase / scenario ──────────────────────────────────────────────
export function passPhase(): void {
  ops().apply({ op: "pass_phase" }, { source: "ui" });
}

// ── Typed bridge to the vanilla action dispatcher (Phase H.1) ──────
// React tabs that haven't been given a dedicated typed wrapper above
// dispatch by name. This routes directly to `CampaignUI.handleAction`
// (the public boundary over the `_handleAction` switch) — no synthetic
// DOM-button click. The legacy delegated listener in campaign-ui.js
// still feeds `_handleAction` for buttons inside the remaining
// HTML-bridge tabs (HubTab / WorldMapTab, ported in K.3).
//
// `data` keys must be camelCase — they mirror the dataset names each
// `_handleAction` case reads (id, choice, worldId, targetTab, tab,
// mode, table, bucket, dir, tool, x, y, ...).
export function dispatchCampaignAction(
  campaignAction: CampaignActionName,
  data: Record<string, string | number | undefined> = {}
): void {
  const ui = cjs().CampaignUI;
  if (!ui?.handleAction) {
    toast(`Action "${campaignAction}" not deliverable: CampaignUI not loaded`, "error");
    return;
  }
  ui.handleAction(campaignAction, data);
}
