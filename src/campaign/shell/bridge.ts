// bridge.ts — Phase F chrome bridge.
//
// Re-exports the typed TS chrome data builder (`getChromeData` from
// `./chromeData.ts`, Phase H.4 port) and the chrome state setters.
// React chrome components import from here so the surface stays in
// one place; the bridge module is the seam if either side ever moves
// again.

import { setActiveMode as setActiveModeRaw, setActiveTab as setActiveTabRaw, setActivePanel as setActivePanelRaw } from "../chrome-state";

export { getChromeData } from "./chromeData";

interface CampaignUiSurface {
  readonly render?: () => void;
}

interface Cjs {
  readonly CampaignUI?: CampaignUiSurface;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

function rerender(): void {
  cjs().CampaignUI?.render?.();
}

// The Phase H.3 chrome wrappers in `campaign-ui.js` called
// `setActiveMode/Tab/Panel` then `render()` to repaint. The TS chrome
// state's `_emit` already notifies any React subscriber via
// chrome-state.ts, but the still-JS vanilla render path observes the
// CampaignUI.render() call — so we keep the explicit re-render to
// preserve parity with the legacy click handlers.
export function setActiveMode(mode: string): void {
  setActiveModeRaw(mode);
  rerender();
}

export function setActiveTab(tab: string): void {
  setActiveTabRaw(tab);
  rerender();
}

export function setActivePanel(panelId: string | null): void {
  setActivePanelRaw(panelId);
  rerender();
}
