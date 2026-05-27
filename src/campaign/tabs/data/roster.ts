// roster.ts — K.3 bridge for the Roster tab. The member hero + vitals +
// stats + affinities are typed; every hero/action button moves to JSX
// onClick (CampaignRosterTab.tsx). The skills / passives / statuses /
// equipment detail row is a 2-column CSS grid, so its four cards stay one
// HTML island (`detailCardsHtml`) until their own K.3 step ports them.

import type { CampaignStateSnapshot } from "../../store";

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
  readonly detailCardsHtml: string;
}

export interface RosterData {
  readonly active: readonly RosterMemberData[];
  readonly bench: readonly RosterMemberData[];
}

interface Bridge {
  readonly getRosterData: (state?: CampaignStateSnapshot) => RosterData | null;
}

interface Cjs {
  readonly CampaignUI?: Bridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getRosterData(state: CampaignStateSnapshot): RosterData | null {
  return cjs().CampaignUI?.getRosterData(state) ?? null;
}
