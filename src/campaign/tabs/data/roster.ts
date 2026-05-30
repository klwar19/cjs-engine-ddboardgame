// roster.ts — K.3 bridge for the Roster tab. The member hero + vitals +
// stats + affinities are typed; every hero/action button moves to JSX
// onClick (CampaignRosterTab.tsx). The skills / passives / statuses /
// equipment detail row is a 2-column CSS grid, so its four cards stay one
// HTML island (`detailCardsHtml`) until their own K.3 step ports them.
//
// Phase H.4 — `getRosterData` ported inline. Reads
// `window.CJS.CampaignUIInternal.PartyTab.rosterMemberData` (still-JS
// bridged island), which now owns the member-math helper bundle itself
// (defaulted internally), so no `getTabHelpers` bridge hop is needed.

import type { CampaignStateSnapshot } from "../../store";
import { getRosterDetailData, type RosterDetailData, type MemberRecord } from "./rosterDetail";

export interface RosterPersona {
  readonly icon: string;
  readonly label: string;
  readonly tooltip: string;
  readonly outOfWorld: boolean;
}

export interface RosterRank {
  readonly label: string;
  readonly trialPending: boolean;
  readonly tooltip: string;
}

export interface RosterVitals {
  readonly hpPct: number;
  readonly mpPct: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly mp: number;
  readonly maxMp: number;
}

export interface RosterStat {
  readonly name: string;
  readonly value: number;
}

export interface RosterMemberData {
  readonly id: string;
  readonly name: string;
  readonly baseFrom: string;
  readonly isBench: boolean;
  readonly battleReady: boolean;
  readonly availLabel: string;
  readonly level: number;
  readonly xp: number;
  readonly xpSmall: string;
  readonly charXpMeta: string;
  readonly rank: RosterRank;
  readonly portraitHtml: string;
  readonly persona: RosterPersona | null;
  readonly jobChipHtml: string;
  readonly vitals: RosterVitals;
  readonly stats: readonly RosterStat[];
  readonly resistancesHtml: string;
  // K.3.2 — the skills/passives/statuses/equipment detail row is now typed
  // data rendered as JSX (`<RosterDetailRow>`); `detailCardsHtml` (the old
  // island HTML) is no longer consumed by the React tab. The party-sheet
  // modal still uses the island's own `renderRosterMember` path until it
  // migrates to React (a later K.3.2 step).
  readonly detail: RosterDetailData;
}

export interface RosterData {
  readonly active: readonly RosterMemberData[];
  readonly bench: readonly RosterMemberData[];
}

// PartyTab module (still-JS bridged island in `js/campaign/ui/tabs/cui-party-tab.js`)
// owns the per-member render. The TS data builder threads the typed
// tab-helpers bundle through to it just like the JS original.
interface PartyMemberInput {
  readonly rosterRole?: string;
  readonly [key: string]: unknown;
}

interface PartyTabSurface {
  // Phase H.4 — the helper bundle now lives inside cui-party-tab.js and is
  // the default for the 3rd arg, so callers omit it. The island still
  // returns `detailCardsHtml` at runtime (the modal's `renderRosterMember`
  // uses it); the TS tab reads the typed `detail` instead (K.3.2), so the
  // surface type omits it.
  readonly rosterMemberData?: (id: string, member: PartyMemberInput) => Omit<RosterMemberData, "detail">;
}

interface RosterCjs {
  readonly CampaignUIInternal?: { PartyTab?: PartyTabSurface };
}

function cjs(): RosterCjs {
  return (window as unknown as { CJS?: RosterCjs }).CJS ?? {};
}

interface CampaignStateForRoster {
  readonly party?: Record<string, PartyMemberInput>;
}

export function getRosterData(state: CampaignStateSnapshot): RosterData | null {
  if (!state) return null;
  const c = cjs();
  const partyTab = c.CampaignUIInternal?.PartyTab;
  if (!partyTab?.rosterMemberData) return null;
  const entries = Object.entries((state as CampaignStateForRoster).party || {});
  const toData = ([id, member]: [string, PartyMemberInput]): RosterMemberData => ({
    ...partyTab.rosterMemberData!(id, member),
    detail: getRosterDetailData(id, member as MemberRecord)
  });
  return {
    active: entries.filter(([, m]) => (m.rosterRole || "active") !== "bench").map(toData),
    bench: entries.filter(([, m]) => (m.rosterRole || "active") === "bench").map(toData)
  };
}
