// cui-party-tab.ts - compatibility namespace for roster/party helpers.
//
// The old js/campaign/ui/tabs/cui-party-tab.js island is retired. TS callers
// import from tabs/data/roster directly; this namespace keeps the small
// CampaignUIInternal.PartyTab surface alive for older bridge-style callers.

import {
  characterOptions,
  skillOptions,
  passiveOptions,
  skillMetaText,
  memberRankInfo,
  passivePerkRank,
  passiveRankInfo,
  passiveRankCostText
} from "../tabs/data/roster";

export interface CuiPartyTab {
  readonly characterOptions: typeof characterOptions;
  readonly skillOptions: typeof skillOptions;
  readonly passiveOptions: typeof passiveOptions;
  readonly skillMetaText: typeof skillMetaText;
  readonly memberRankInfo: typeof memberRankInfo;
  readonly passivePerkRank: typeof passivePerkRank;
  readonly passiveRankInfo: typeof passiveRankInfo;
  readonly passiveRankCostText: typeof passiveRankCostText;
}

const NAMESPACE: CuiPartyTab = Object.freeze({
  characterOptions,
  skillOptions,
  passiveOptions,
  skillMetaText,
  memberRankInfo,
  passivePerkRank,
  passiveRankInfo,
  passiveRankCostText
});

interface CuiInternalWindow {
  CJS?: {
    CampaignUIInternal?: { PartyTab?: CuiPartyTab; [key: string]: unknown };
    [key: string]: unknown;
  };
}

const w = window as unknown as CuiInternalWindow;
w.CJS = w.CJS || {};
w.CJS.CampaignUIInternal = w.CJS.CampaignUIInternal || {};
w.CJS.CampaignUIInternal.PartyTab = NAMESPACE;

export default NAMESPACE;
