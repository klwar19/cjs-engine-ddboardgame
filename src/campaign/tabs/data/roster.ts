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
import { esc, escAttr } from "../../util/cui-utils";
import {
  memberPortrait,
  memberPortraitFocus,
  focusAttrStyle,
  type PartyMember as PortraitPartyMember
} from "../../util/cui-portraits";

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
  // K.3.2 — the skills/passives/statuses/equipment detail row is typed data
  // rendered as JSX (`<RosterDetailRow>`). The roster tab AND the party-sheet
  // modal both render the shared `<RosterMemberCard>` from this data; the
  // island no longer emits `detailCardsHtml`.
  readonly detail: RosterDetailData;
}

export interface RosterData {
  readonly active: readonly RosterMemberData[];
  readonly bench: readonly RosterMemberData[];
}

// Portrait-hero header for the party-sheet modal (mirrors the island's
// `_renderPortraitHero`). The portrait img/fallback carries an inline
// focus-style string, so it stays a tiny HTML bridge; the meta is JSX.
export interface PortraitHeroData {
  readonly portraitHtml: string;
  readonly name: string;
  readonly sub: string;
  readonly tags: readonly string[];
}

export interface PartySheetData {
  readonly hero: PortraitHeroData;
  readonly member: RosterMemberData;
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
  // the default for the 3rd arg, so callers omit it. The island computes the
  // hero/vitals/persona/job-chip/affinities scalar + HTML-bridge fields; the
  // typed `detail` is supplied by `getRosterDetailData` (K.3.2), so the
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

// Single-member typed data: the island's hero/vitals/etc. + the typed
// detail row. Shared by the roster tab and the party-sheet modal.
export function getRosterMemberData(id: string, member: MemberRecord): RosterMemberData | null {
  const partyTab = cjs().CampaignUIInternal?.PartyTab;
  if (!partyTab?.rosterMemberData) return null;
  return {
    ...partyTab.rosterMemberData(id, member as PartyMemberInput),
    detail: getRosterDetailData(id, member)
  };
}

export function getRosterData(state: CampaignStateSnapshot): RosterData | null {
  if (!state) return null;
  const c = cjs();
  const partyTab = c.CampaignUIInternal?.PartyTab;
  if (!partyTab?.rosterMemberData) return null;
  const entries = Object.entries((state as CampaignStateForRoster).party || {});
  const toData = ([id, member]: [string, PartyMemberInput]): RosterMemberData =>
    getRosterMemberData(id, member as MemberRecord)!;
  return {
    active: entries.filter(([, m]) => (m.rosterRole || "active") !== "bench").map(toData),
    bench: entries.filter(([, m]) => (m.rosterRole || "active") === "bench").map(toData)
  };
}

// Portrait-hero data for the party-sheet modal (mirrors `_renderPortraitHero`).
export function getPortraitHeroData(id: string, member: MemberRecord): PortraitHeroData {
  const m = member as Record<string, unknown>;
  const name = String((m.name as string) || id);
  const initial = String(name || id || "?").trim().charAt(0).toUpperCase() || "?";
  const pm = member as unknown as PortraitPartyMember;
  const portraitSrc = memberPortrait(pm, id);
  const portraitFocus = memberPortraitFocus(pm, id);
  const portraitHtml = portraitSrc
    ? `<img src="${escAttr(portraitSrc)}" alt="${escAttr(name)}" style="${escAttr(focusAttrStyle(portraitFocus))}">`
    : `<div class="fallback">${esc(initial)}</div>`;
  const lvl = (m.level as number) || 1;
  const rank = (m.rank as string) || "F";
  const klass = (m.class as string) || (m.archetype as string) || "";
  return {
    portraitHtml,
    name,
    sub: `${klass || "Adventurer"} · Lv ${lvl} · Rank ${rank}`,
    tags: ((m.tags as string[]) || []).slice(0, 6)
  };
}

// Full party-sheet data (portrait hero + member card) for the modal.
export function getPartySheetData(id: string, member: MemberRecord): PartySheetData | null {
  const memberData = getRosterMemberData(id, member);
  if (!memberData) return null;
  return { hero: getPortraitHeroData(id, member), member: memberData };
}
