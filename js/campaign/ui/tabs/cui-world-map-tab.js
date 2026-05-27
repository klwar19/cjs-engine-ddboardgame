// cui-world-map-tab.js — World Map / World Activities tabs.
//
// Both tabs are React-owned (Phase K.3): the shell renders
// `CampaignWorldMapTab` / `CampaignWorldActivitiesTab` from the typed
// `getTravelMapData` / `getActivitiesData` bridges on
// `CJS.CampaignWorldMap`, and `cui-react-bridge.js` registers the React
// mount points. This module no longer renders or registers anything; it
// only establishes the `WorldMapTab` namespace that the bootstrap smoke
// test still asserts (dropped when that test is rewritten in H.5).

window.CJS = window.CJS || {};
window.CJS.CampaignUIInternal = window.CJS.CampaignUIInternal || {};

window.CJS.CampaignUIInternal.WorldMapTab = Object.freeze({});
