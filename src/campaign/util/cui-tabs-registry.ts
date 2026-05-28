// cui-tabs-registry.ts — Phase H.4 TypeScript port of the tab registry.
//
// `js/campaign/ui/tabs/cui-tabs-registry.js` exported a frozen `Tabs`
// namespace on `window.CJS.CampaignUIInternal.Tabs`. The TS port installs
// the same surface, and the existing JS callers (campaign-ui.js's
// `_renderMain` fallback path, cui-react-bridge.js, the still-JS hub /
// party tab modules) continue to use it unchanged.
//
// Each tab module receives a `helpers` object built fresh by the shell
// every render. That object exposes the closure-bound helpers the tab
// needs (member math, equipment loadout, persona pills, etc.) so tab
// modules never reach into campaign-ui.js's private state.

// ── Types ────────────────────────────────────────────────────────────
// Vanilla tab renderer: `(state, helpers) => htmlString`.
export type TabRenderer<TState = unknown, THelpers = unknown> =
  (state: TState, helpers: THelpers) => string;

// Optional `actions` map — most tabs let the shell delegate to
// `_handleAction`, but a few (legacy) register their own dispatchers.
// Today every active registration leaves it null.
export type TabActions = Readonly<Record<string, (data: unknown) => void>>;

export interface TabDefinition {
  readonly id: string;
  readonly render: TabRenderer;
  readonly actions: TabActions | null;
}

export interface TabRegistration {
  readonly render: TabRenderer;
  readonly actions?: TabActions;
}

// ── Registry storage ────────────────────────────────────────────────
const _registry = new Map<string, TabDefinition>();

export function register(id: string, def: TabRegistration): void {
  if (!id || typeof id !== "string") {
    throw new Error("CampaignUIInternal.Tabs.register: id required");
  }
  if (!def || typeof def.render !== "function") {
    throw new Error(`CampaignUIInternal.Tabs.register(${id}): def.render required`);
  }
  _registry.set(id, Object.freeze({
    id,
    render: def.render,
    actions: def.actions || null
  }));
}

export function has(id: string): boolean {
  return _registry.has(id);
}

export function get(id: string): TabDefinition | null {
  return _registry.get(id) || null;
}

export function render(id: string, state: unknown, helpers: unknown): string | null {
  const def = _registry.get(id);
  if (!def) return null;
  return def.render(state, helpers);
}

// Diagnostic — useful from devtools to see what tabs landed.
export function ids(): string[] {
  return Array.from(_registry.keys());
}

// ── Legacy namespace install ─────────────────────────────────────────
export interface CuiTabsRegistry {
  readonly register: typeof register;
  readonly has: typeof has;
  readonly get: typeof get;
  readonly render: typeof render;
  readonly ids: typeof ids;
}

const NAMESPACE: CuiTabsRegistry = Object.freeze({
  register,
  has,
  get,
  render,
  ids
});

interface CuiInternalWindow {
  CJS?: {
    CampaignUIInternal?: { Tabs?: CuiTabsRegistry; [key: string]: unknown };
    [key: string]: unknown;
  };
}
const w = window as unknown as CuiInternalWindow;
w.CJS = w.CJS || {};
w.CJS.CampaignUIInternal = w.CJS.CampaignUIInternal || {};
w.CJS.CampaignUIInternal.Tabs = NAMESPACE;

export default NAMESPACE;
