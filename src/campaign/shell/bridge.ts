// bridge.ts — Phase F chrome bridge to the legacy CampaignUI module.
//
// Wraps the typed surface React chrome components consume:
//   • read chrome data  — `getChromeData(state)`
//   • change active mode/tab/panel — `setActiveMode/Tab/Panel`
//
// These all delegate to `window.CJS.CampaignUI`. Keeping the wrappers
// in one file means a single import in the chrome components, and a
// single edit site once the bridge moves entirely into TypeScript.

import type { ChromeData } from "./types";
import type { CampaignStateSnapshot } from "../store";

interface CampaignUIBridge {
  readonly getChromeData: (state?: CampaignStateSnapshot) => ChromeData | null;
  readonly setActiveMode: (mode: string, opts?: { keepTab?: boolean }) => void;
  readonly setActiveTab: (tab: string, opts?: { keepMode?: boolean }) => void;
  readonly setActivePanel: (panelId: string | null) => void;
}

interface Cjs {
  readonly CampaignUI?: CampaignUIBridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

function ui(): CampaignUIBridge | null {
  return cjs().CampaignUI ?? null;
}

export function getChromeData(state: CampaignStateSnapshot): ChromeData | null {
  return ui()?.getChromeData(state) ?? null;
}

export function setActiveMode(mode: string): void {
  ui()?.setActiveMode(mode);
}

export function setActiveTab(tab: string): void {
  ui()?.setActiveTab(tab);
}

export function setActivePanel(panelId: string | null): void {
  ui()?.setActivePanel(panelId);
}
