// context.ts — Shared typed accessors for the H.3 action handler
// modules. Every ported domain (roster, combat, farm, …) reaches the
// engine through these instead of touching `window.CJS` directly, so the
// cross-language boundary stays in one place.
//
// `src/campaign/actions.ts` predates this file and keeps its own private
// accessors for the already-migrated save/log wrappers; H.4 folds that
// file's contents into domain modules and the small overlap collapses.

type ToastKind = "info" | "success" | "error";

interface OpInput {
  op: string;
  [key: string]: unknown;
}

interface CampaignOpsModule {
  apply: (op: OpInput | OpInput[], options?: { source?: string; [key: string]: unknown }) => unknown;
}

interface CampaignStateModule {
  getState: () => Record<string, unknown> | null;
  mutate: (recipe: (state: Record<string, unknown>) => void, options?: { source?: string }) => void;
}

interface UiModule {
  toast: (message: string, kind?: ToastKind, durationMs?: number) => void;
  confirm: (message: string, onConfirm: () => void, onCancel?: () => void) => void;
}

interface CampaignUIModule {
  render: () => void;
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
