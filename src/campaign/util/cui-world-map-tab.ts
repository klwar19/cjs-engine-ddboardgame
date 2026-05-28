// cui-world-map-tab.ts — Phase H.4 TS port of the WorldMapTab namespace.
//
// Both World Map / World Activities tabs are React-owned (Phase K.3):
// the shell renders `CampaignWorldMapTab` / `CampaignWorldActivitiesTab`
// from the typed `getTravelMapData` / `getActivitiesData` bridges on
// `CJS.CampaignWorldMap`, and `cui-react-bridge.js` registers the React
// mount points. This module exists only to establish the `WorldMapTab`
// namespace the bootstrap smoke test still asserts (dropped when the
// test is rewritten in H.5).

export const WorldMapTab: Readonly<Record<string, never>> = Object.freeze({});

interface CuiInternalWindow {
  CJS?: {
    CampaignUIInternal?: { WorldMapTab?: typeof WorldMapTab; [key: string]: unknown };
    [key: string]: unknown;
  };
}
const w = window as unknown as CuiInternalWindow;
w.CJS = w.CJS || {};
w.CJS.CampaignUIInternal = w.CJS.CampaignUIInternal || {};
w.CJS.CampaignUIInternal.WorldMapTab = WorldMapTab;

export default WorldMapTab;
