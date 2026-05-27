// nav.ts — Phase H.3 navigation handlers (mode/tab switches).
//
// These were the `_goto(mode, tab)` cases: jump to a mode + tab and
// render. `goto` is the exact TS port of the closure-private `_goto`
// (assign both dimensions when provided, no partner-derivation, render
// once) built on the render-free chrome setters exposed by campaign-ui.js
// (`_goto` itself stays in JS — many unported closures still call it).

import { setActiveModeRaw, setActiveTabRaw, modeForTab, rerender } from "./context";

export function goto(mode: string | null, tab: string | null): void {
  setActiveModeRaw(mode);
  setActiveTabRaw(tab);
  rerender();
}

// open-world-content: `_goto(data.mode || _modeForTab(data.tab), data.tab
// || 'worldGate')`. Empty strings are falsy, matching the `||` fallbacks
// the switch used for absent dataset keys.
export function openWorldContent(mode: string, tab: string): void {
  goto(mode || modeForTab(tab || ""), tab || "worldGate");
}
