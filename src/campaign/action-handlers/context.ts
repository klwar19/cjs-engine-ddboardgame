// context.ts — Shared typed accessors for the H.3 action handler
// modules. Every ported domain (roster, combat, farm, …) reaches the
// engine through these instead of touching `window.CJS` directly, so the
// cross-language boundary stays in one place.
//
// `src/campaign/actions.ts` predates this file and keeps its own private
// accessors for the already-migrated save/log wrappers; H.4 folds that
// file's contents into domain modules and the small overlap collapses.

type ToastKind = "info" | "success" | "error" | "warning";

interface OpInput {
  op: string;
  [key: string]: unknown;
}

interface CampaignOpsModule {
  apply: (op: OpInput | OpInput[], options?: { source?: string; [key: string]: unknown }) => unknown;
  describe: (ops: OpInput[] | unknown[]) => string[];
}

interface CampaignStateModule {
  getState: () => Record<string, unknown> | null;
  getContent: () => Record<string, unknown>;
  getHubState: (hubId: string) => { rumors?: Array<{ id?: string; [key: string]: unknown }> } | null | undefined;
  getActiveScenario: () => Record<string, unknown> | null | undefined;
  getActiveMap: () => Record<string, unknown> | null | undefined;
  getCurrentCampaign: () => { eventTables?: string[]; [key: string]: unknown } | null | undefined;
  getScenarioById: (scenarioId: string) => Record<string, unknown> | null | undefined;
  getScenarioMapById: (mapId: string) => Record<string, unknown> | null | undefined;
  clone: <T>(value: T) => T;
  mutate: (recipe: (state: Record<string, unknown>) => void, options?: { source?: string }) => void;
}

interface UiModule {
  toast: (message: string, kind?: ToastKind, durationMs?: number) => void;
  confirm: (message: string, onConfirm: () => void, onCancel?: () => void) => void;
}

interface CampaignUIModule {
  render: () => void;
  // The Phase H.3 render-free chrome setters (`setActiveModeRaw` /
  // `setActiveTabRaw` / `modeForTab`) moved off this surface in H.4
  // — TS handlers reach the slice directly via `src/campaign/chrome-state.ts`.
}

interface ContextCjs {
  readonly CampaignOps?: CampaignOpsModule;
  readonly CampaignState?: CampaignStateModule;
  readonly CampaignUI?: CampaignUIModule;
  readonly UI?: UiModule;
  readonly [key: string]: unknown;
}

export function cjs(): ContextCjs {
  return (window as unknown as { CJS?: ContextCjs }).CJS ?? {};
}

// Typed accessor for a sibling feature module on `window.CJS`. Returns
// `undefined` when the module isn't loaded; callers use `?.` on the
// result, so a missing module no-ops instead of throwing (the loaded
// modules are unconditional in main.tsx, so this only hardens edge
// cases — it never changes behaviour for a booted campaign).
export function mod<T>(name: string): T | undefined {
  return cjs()[name] as T | undefined;
}

export function ops(): CampaignOpsModule {
  const m = cjs().CampaignOps;
  if (!m) throw new Error("CampaignOps not loaded");
  return m;
}

interface DataStoreModule {
  get: (type: string, id: string) => Record<string, unknown> | undefined;
  getAllAsArray: (type: string) => Array<Record<string, unknown>>;
}

export function ds(): DataStoreModule | undefined {
  return mod<DataStoreModule>("DataStore");
}

export function cs(): CampaignStateModule {
  const m = cjs().CampaignState;
  if (!m) throw new Error("CampaignState not loaded");
  return m;
}

export function ui(): UiModule | null {
  return cjs().UI ?? null;
}

export function toast(message: string, kind: ToastKind = "info", durationMs?: number): void {
  ui()?.toast?.(message, kind, durationMs);
}

// Confirm dialog parity: use the engine's modal confirm when present,
// otherwise the native one (matches the fallback the save/log wrappers
// already use so non-DOM test contexts don't wedge).
export function confirmDialog(message: string, onConfirm: () => void, onCancel?: () => void): void {
  const u = ui();
  if (u?.confirm) {
    u.confirm(message, onConfirm, onCancel);
  } else if (window.confirm(message)) {
    onConfirm();
  } else {
    onCancel?.();
  }
}

// Vanilla handlers call render() after a change that doesn't already fire
// a CampaignState subscriber (e.g. a slot load). Most Ops/mutate paths
// already trigger a re-render through the subscription in CampaignUI.init.
export function rerender(): void {
  cjs().CampaignUI?.render?.();
}

// Convenience: apply a single op with the conventional `ui` source.
export function applyOp(op: OpInput, source = "ui"): unknown {
  return ops().apply(op, { source });
}

// ── Render-free chrome setters (Phase H.4) ────────────────────────
// Originally these went through `CampaignUI.setActiveModeRaw` etc. so
// the JS closure owned mode/tab state. Phase H.4 moved that state to
// `src/campaign/chrome-state.ts`; the JS bridge wrappers now delegate
// to the same slice. Bypass the JS roundtrip and call the TS slice
// directly — both paths reach the same setter, but skipping the hop
// keeps the TS action handlers honest about who owns chrome state.
// Ported handlers still call render()/rerender() themselves at the
// point the original closure did.
import * as Chrome from "../chrome-state";

export function setActiveModeRaw(mode: string | null | undefined): void {
  Chrome.setActiveModeRaw(mode);
}

export function setActiveTabRaw(tab: string | null | undefined): void {
  Chrome.setActiveTabRaw(tab);
}

export function modeForTab(tab: string): string {
  return Chrome.modeForTab(tab);
}
