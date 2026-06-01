// roster.ts - typed roster/member data for the roster tab, party sheet,
// drawer party panel, and roster-driven picker helpers.
//
// This replaces the final cui-party-tab.js data island. The legacy
// CampaignUIInternal.PartyTab namespace is still installed by
// util/cui-party-tab.ts for older callers, but React components and TS
// action handlers import these functions directly.

import type { CampaignStateSnapshot } from "../../store";
import { getRosterDetailData, type RosterDetailData, type MemberRecord } from "./rosterDetail";
import { label, formatBundleText } from "../../util/cui-utils";
import { desc, sortOptionLabel } from "../../util/cui-modals";
import { cleanType } from "../../util/cui-equipment";
import {
  memberPortrait,
  memberPortraitFocus,
  focusAttrStyle,
  type PartyMember as PortraitPartyMember
} from "../../util/cui-portraits";
import type { IconEntitySource } from "../../util/icon";

export interface RosterPersona {
  readonly icon: string;
  readonly label: string;
  readonly tooltip: string;
  readonly outOfWorld: boolean;
}

export interface RosterPortraitData {
  readonly src: string;
  readonly focusStyle: string;
  readonly fallback: string;
  readonly alt: string;
}

export interface RosterRank {
  readonly label: string;
  readonly trialPending: boolean;
  readonly tooltip: string;
}

export interface MemberRankInfo {
  readonly rank: string;
  readonly effective: string;
  readonly capped: boolean;
  readonly ceiling: string | null;
  readonly label: string;
  readonly next: string | null;
  readonly threshold: number;
  readonly rp: number;
  readonly pct: number;
  readonly atMax: boolean;
  readonly trialPending: boolean;
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

export interface RosterJobChipData {
  readonly state: "none" | "unknown" | "known";
  readonly unknownId?: string;
  readonly job?: IconEntitySource & { id?: string; name?: string };
  readonly level?: number;
  readonly cap?: number;
  readonly xp?: number;
  readonly meta?: string;
  readonly persona?: RosterPersona | null;
}

export type RosterAffinityState = "neutral" | "immune" | "resist" | "weak";

export interface RosterAffinityPill {
  readonly element: string;
  readonly slug: string;
  readonly state: RosterAffinityState;
  readonly code: string;
  readonly title: string;
}

export interface RosterDamageReduction {
  readonly physical: number;
  readonly magic: number;
  readonly chaos: number;
}

export interface RosterAffinities {
  readonly elements: readonly RosterAffinityPill[];
  readonly damageReduction: RosterDamageReduction;
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
  readonly portrait: RosterPortraitData;
  readonly persona: RosterPersona | null;
  readonly job: RosterJobChipData;
  readonly vitals: RosterVitals;
  readonly stats: readonly RosterStat[];
  readonly affinities: RosterAffinities;
  readonly detail: RosterDetailData;
}

export interface RosterData {
  readonly active: readonly RosterMemberData[];
  readonly bench: readonly RosterMemberData[];
}

export interface RosterPickerOption {
  readonly value: string;
  readonly label: string;
  readonly sub?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly [key: string]: unknown;
}

export interface PortraitHeroData {
  readonly portrait: RosterPortraitData;
  readonly name: string;
  readonly sub: string;
  readonly tags: readonly string[];
}

export interface PartySheetData {
  readonly hero: PortraitHeroData;
  readonly member: RosterMemberData;
}

export interface PartyDrawerStatus {
  readonly label: string;
}

export interface PartyDrawerMemberData {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly isBench: boolean;
  readonly battleReady: boolean;
  readonly availability: string;
  readonly portrait: RosterPortraitData;
  readonly iconEntity: IconEntitySource;
  readonly rank: MemberRankInfo;
  readonly vitals: RosterVitals;
  readonly statuses: readonly PartyDrawerStatus[];
}

export interface PartyDrawerData {
  readonly active: readonly PartyDrawerMemberData[];
  readonly bench: readonly PartyDrawerMemberData[];
}

type SkillEntry = string | { skillId?: string; source?: string; level?: number };

interface BaseRecord {
  readonly id?: string;
  readonly name?: string;
  readonly stats?: Record<string, number>;
  readonly skills?: readonly SkillEntry[];
  readonly innatePassives?: readonly string[];
  readonly weak?: readonly string[];
  readonly resist?: readonly string[];
  readonly immune?: readonly string[];
  readonly [key: string]: unknown;
}

interface CampaignStateForRoster {
  readonly currentWorld?: string;
  readonly party?: Record<string, MemberRecord>;
}

interface DataStoreSurface {
  readonly get?: (bucket: string, id: string | null | undefined) => Record<string, unknown> | null | undefined;
  readonly getAllAsArray?: (bucket: string) => Array<Record<string, unknown>>;
}

interface ContentManagerSurface {
  readonly getVisibleItems?: (bucket: string) => Array<Record<string, unknown>>;
}

interface CampaignStateSurface {
  readonly getState?: () => CampaignStateForRoster | null;
  readonly skillPoolIds?: (member: MemberRecord, base: Record<string, unknown>) => readonly string[];
  readonly passivePoolIds?: (member: MemberRecord, base: Record<string, unknown>) => readonly string[];
}

interface ConstSurface {
  readonly STATS?: readonly string[];
  readonly STAT_NAMES?: Record<string, string>;
  readonly ELEMENTS?: readonly string[];
}

interface FormulasSurface {
  readonly effectiveRank?: (rank: string, ceiling: string | null) => string;
  readonly nextRank?: (rank: string) => string | null;
  readonly rpThresholdFor?: (rank: string) => number;
  readonly calcCharXpToNextLevel?: (xp: number, level: number) => number | null;
  readonly getJobMaxLevel?: (job: Record<string, unknown>) => number;
  readonly calcJobXpToNextLevel?: (job: Record<string, unknown>, xp: number, level: number) => number | null;
  readonly calcPhysicalDR?: (stats: Record<string, number>) => number;
  readonly calcMagicDR?: (stats: Record<string, number>) => number;
  readonly calcChaosDR?: (stats: Record<string, number>) => number;
  readonly calcSpCost?: (thing: unknown) => number;
  readonly getPassiveMaxRank?: (passive: Record<string, unknown>) => number;
  readonly calcPassiveRankCost?: (passive: Record<string, unknown>, rank: number) => unknown;
}

interface CombatBridgeSurface {
  readonly isMemberBattleReady?: (member: MemberRecord) => boolean;
  readonly availabilityLabel?: (member: MemberRecord) => string;
}

interface RosterCjs {
  readonly DataStore?: DataStoreSurface;
  readonly ContentManager?: ContentManagerSurface;
  readonly CampaignState?: CampaignStateSurface;
  readonly CONST?: ConstSurface;
  readonly Formulas?: FormulasSurface;
  readonly CampaignCombatBridge?: CombatBridgeSurface;
}

function cjs(): RosterCjs {
  return (window as unknown as { CJS?: RosterCjs }).CJS ?? {};
}

function ds(): DataStoreSurface | undefined {
  return cjs().DataStore;
}

function formulas(): FormulasSurface | undefined {
  return cjs().Formulas;
}

function constants(): ConstSurface | undefined {
  return cjs().CONST;
}

function state(): CampaignStateForRoster | null {
  return cjs().CampaignState?.getState?.() ?? null;
}

export function memberBase(id: string, member: MemberRecord = {}): BaseRecord {
  return (ds()?.get?.("characters", member.baseCharacterId || id) as BaseRecord | null | undefined) || {};
}

export function memberRankInfo(member: Record<string, unknown> = {}): MemberRankInfo {
  const F = formulas();
  const adv =
    (member.adventurer as { rank?: string; rankPoints?: number; trialPending?: boolean } | undefined) ||
    { rank: (member.rank as string) || "F", rankPoints: 0, trialPending: false };
  const rank = adv.rank || (member.rank as string) || "F";
  const world = (ds()?.get?.("worlds", state()?.currentWorld || "") as { ceiling?: string } | null | undefined) || {};
  const ceiling = world.ceiling || null;
  const effective = F?.effectiveRank ? F.effectiveRank(rank, ceiling) : rank;
  const capped = !!ceiling && effective !== rank;
  const next = F?.nextRank ? F.nextRank(rank) : null;
  const threshold = next && F?.rpThresholdFor ? F.rpThresholdFor(next) : 0;
  const rp = Math.max(0, Number(adv.rankPoints || 0));
  const pct = threshold > 0 ? Math.max(0, Math.min(100, Math.round((rp / threshold) * 100))) : 0;
  return {
    rank,
    effective,
    capped,
    ceiling,
    label: capped ? `${rank} (eff ${effective})` : rank,
    next,
    threshold,
    rp,
    pct,
    atMax: !next,
    trialPending: !!adv.trialPending
  };
}

export function memberStats(id: string, member: MemberRecord = {}): Record<string, number> {
  const base = memberBase(id, member);
  const stats: Record<string, number> = { ...(base.stats || {}) };
  for (const [stat, amount] of Object.entries((member.statOverrides as Record<string, number> | undefined) || {})) {
    stats[stat] = Number(stats[stat] || 0) + Number(amount || 0);
  }
  const ordered: Record<string, number> = {};
  const order = constants()?.STATS || Object.keys(stats);
  for (const stat of order) ordered[stat] = stats[stat] || 0;
  return ordered;
}

export function statName(stat: string): string {
  return constants()?.STAT_NAMES?.[stat] || stat;
}

export function resistanceData(
  base: BaseRecord,
  member: MemberRecord,
  stats: Record<string, number>
): RosterAffinities {
  const weak = [...(base.weak || []), ...((member.weak as string[] | undefined) || [])].filter((v, i, a) => a.indexOf(v) === i);
  const resist = [...(base.resist || []), ...((member.resist as string[] | undefined) || [])].filter((v, i, a) => a.indexOf(v) === i);
  const immune = [...(base.immune || []), ...((member.immune as string[] | undefined) || [])].filter((v, i, a) => a.indexOf(v) === i);
  const elements = constants()?.ELEMENTS || [
    "Physical", "Fire", "Water", "Lightning", "Earth", "Wind", "Nature", "Light", "Dark", "Chaos"
  ];

  const pills = elements.map((el) => {
    const slug = String(el).toLowerCase();
    let stateName: RosterAffinityState = "neutral";
    let code = "--";
    if (immune.includes(el)) {
      stateName = "immune";
      code = "Nu";
    } else if (resist.includes(el)) {
      stateName = "resist";
      code = "Rs";
    } else if (weak.includes(el)) {
      stateName = "weak";
      code = "Wk";
    }
    const stateLabel =
      stateName === "immune" ? "Immune (Nu)"
        : stateName === "resist" ? "Resists (Rs)"
          : stateName === "weak" ? "Weak (Wk)"
            : "Neutral";
    return {
      element: String(el),
      slug,
      state: stateName,
      code,
      title: `${el}: ${stateLabel}`
    };
  });

  const F = formulas();
  return {
    elements: pills,
    damageReduction: {
      physical: F?.calcPhysicalDR ? F.calcPhysicalDR(stats) : 0,
      magic: F?.calcMagicDR ? F.calcMagicDR(stats) : 0,
      chaos: F?.calcChaosDR ? F.calcChaosDR(stats) : 0
    }
  };
}

function skillEntryId(entry: SkillEntry): string | null {
  return typeof entry === "string" ? entry : entry?.skillId || null;
}

export function memberSkillEntries(id: string, member: MemberRecord = state()?.party?.[id] || {}): SkillEntry[] {
  const base = memberBase(id, member);
  const out: SkillEntry[] = [];
  const seen = new Set<string>();
  for (const entry of [...(base.skills || []), ...((member.learnedSkills as SkillEntry[] | undefined) || [])]) {
    const skillId = skillEntryId(entry);
    if (!skillId || seen.has(skillId)) continue;
    seen.add(skillId);
    out.push(typeof entry === "string" ? { skillId } : entry);
  }
  return out;
}

export function memberPassives(id: string, member: MemberRecord = {}): string[] {
  const base = memberBase(id, member);
  return Array.from(
    new Set([...(base.innatePassives || []), ...((member.learnedPassives as string[] | undefined) || [])].filter(Boolean))
  );
}

function visibleOrAll(bucket: string): Array<Record<string, unknown>> {
  return cjs().ContentManager?.getVisibleItems?.(bucket) || ds()?.getAllAsArray?.(bucket) || [];
}

export function characterOptions(): RosterPickerOption[] {
  const current = new Set(Object.keys(state()?.party || {}));
  return visibleOrAll("characters")
    .filter((entry) => entry?.id && !current.has(String(entry.id)) && (entry.team || "player") !== "enemy")
    .map((entry) => ({
      value: String(entry.id),
      label: String(entry.name || entry.id),
      sub: `${entry.rank || "F"} | ${((entry.skills as unknown[]) || []).length} skills`,
      description: desc(entry),
      tags: (entry.tags as string[]) || []
    }))
    .sort(sortOptionLabel);
}

export function skillOptions(memberId: string): RosterPickerOption[] {
  const known = new Set(memberSkillEntries(memberId).map(skillEntryId));
  return visibleOrAll("skills")
    .filter((entry) => entry?.id && !known.has(String(entry.id)))
    .map((entry) => ({
      value: String(entry.id),
      label: String(entry.name || entry.id),
      sub: skillMetaText(entry),
      description: desc(entry),
      tags: (entry.tags as string[]) || []
    }))
    .sort(sortOptionLabel);
}

export function passiveOptions(memberId: string): RosterPickerOption[] {
  const member = state()?.party?.[memberId] || {};
  const known = new Set(memberPassives(memberId, member));
  const passiveOptionsRaw = visibleOrAll("passives").map((entry) => ({
    value: String(entry.id || ""),
    label: String(entry.name || entry.id || ""),
    sub: "Passive",
    description: desc(entry),
    tags: (entry.tags as string[]) || []
  }));
  const passiveTriggers = new Set([
    "stat_mod", "dr_mod", "element_mod", "crit_mod", "evasion_mod", "accuracy_mod",
    "ap_mod", "movement_mod", "range_mod", "cost_mod", "cooldown_mod", "damage_mod",
    "hp_mod", "mp_mod", "status_resist_mod", "double_action", "triple_action"
  ]);
  const effectOptions = (ds()?.getAllAsArray?.("effects") || [])
    .filter((entry) => passiveTriggers.has(String(entry.trigger || "")))
    .map((entry) => ({
      value: String(entry.id || ""),
      label: String(entry.name || entry.id || ""),
      sub: `Effect | ${entry.trigger || ""}`,
      description: desc(entry),
      tags: (entry.tags as string[]) || []
    }));
  return [...passiveOptionsRaw, ...effectOptions]
    .filter((entry) => entry.value && !known.has(entry.value))
    .sort(sortOptionLabel);
}

export function skillWeaponTypes(skill: Record<string, unknown> = {}): string[] {
  const raw = skill.requiredWeaponTypes || skill.requiredWeaponType || skill.weaponTypeRequired || [];
  return (Array.isArray(raw) ? raw : [raw]).map(cleanType).filter(Boolean);
}

export function skillMetaText(skill: Record<string, unknown> = {}, entry: { level?: number } = {}): string {
  const parts: string[] = [];
  if (skill.ap != null) parts.push(`${skill.ap} AP`);
  if (skill.mp != null) parts.push(`${skill.mp} MP`);
  if (skill.range != null) parts.push(`Range ${skill.range}`);
  if (skill.power != null) parts.push(`Power ${skill.power}`);
  const requiredWeapons = skillWeaponTypes(skill);
  if (requiredWeapons.length) parts.push(`Weapon ${requiredWeapons.map(label).join("/")}`);
  if (entry.level) parts.push(`Lv ${entry.level}`);
  return parts.join(" | ") || String(skill.category || skill.type || "");
}

export function passivePerkRank(perk: { rank?: number; level?: number; targetRank?: number } = {}): number | string {
  return Number(perk.rank ?? perk.level ?? perk.targetRank ?? 0) || "?";
}

export interface PassiveRankInfo {
  readonly rank: number;
  readonly max: number;
  readonly isMax: boolean;
}

export function passiveRankInfo(
  memberId: string,
  passiveId: string,
  passive: Record<string, unknown> | null = null
): PassiveRankInfo {
  const member = state()?.party?.[memberId] || {};
  const rank = Math.max(1, Number(member.passiveProgress?.[passiveId]?.rank || 1));
  const F = formulas();
  const max = F?.getPassiveMaxRank
    ? F.getPassiveMaxRank(passive || ds()?.get?.("passives", passiveId) || {})
    : 5;
  return { rank, max, isMax: rank >= max };
}

export function passiveRankCostText(passive: Record<string, unknown> | null, currentRank: number): string {
  const F = formulas();
  const cost = passive && F?.calcPassiveRankCost ? F.calcPassiveRankCost(passive, currentRank) : null;
  return formatBundleText(cost as never);
}

function portraitData(id: string, member: MemberRecord, fallbackClass = false): RosterPortraitData {
  const m = member as Record<string, unknown>;
  const name = String((m.name as string) || id);
  const fallback = String((m.icon as string) || name.trim().charAt(0) || "?").trim().charAt(0).toUpperCase() || "?";
  const pm = member as unknown as PortraitPartyMember;
  const src = memberPortrait(pm, id);
  const focus = memberPortraitFocus(pm, id);
  void fallbackClass;
  return {
    src,
    focusStyle: focusAttrStyle(focus),
    fallback,
    alt: name
  };
}

function personaPillData(memberId: string, member: MemberRecord = {}): RosterPersona | null {
  const personaId = (member.activePersona as string | undefined) || null;
  if (!personaId) return null;
  const persona = ds()?.get?.("personas", personaId) as Record<string, unknown> | null | undefined;
  if (!persona) return null;
  const currentWorld = state()?.currentWorld || "";
  const personaWorld = String(persona.world || "");
  const outOfWorld = !!(personaWorld && currentWorld && personaWorld !== currentWorld);
  const worldName = personaWorld
    ? String((ds()?.get?.("worlds", personaWorld) as { displayName?: string } | null | undefined)?.displayName || personaWorld)
    : "";
  const jobShort = member.currentJob
    ? String((ds()?.get?.("jobs", member.currentJob as string) as { name?: string } | null | undefined)?.name || member.currentJob)
    : "";
  const personaName = String(persona.name || personaId);
  return {
    icon: String(persona.icon || ""),
    label: jobShort ? `${personaName} / ${jobShort}` : personaName,
    tooltip: outOfWorld ? `${personaName} (${worldName}) - out of world.` : `${personaName}${worldName ? ` (${worldName})` : ""}`,
    outOfWorld
  };
}

function jobPersonaData(member: MemberRecord = {}): RosterPersona | null {
  const personaId = (member.activePersona as string | undefined) || null;
  if (!personaId) return null;
  const persona = ds()?.get?.("personas", personaId) as Record<string, unknown> | null | undefined;
  if (!persona) {
    return {
      icon: "",
      label: personaId,
      tooltip: "Unknown persona",
      outOfWorld: false
    };
  }
  const currentWorld = state()?.currentWorld || "";
  const personaWorld = String(persona.world || "");
  const outOfWorld = !!(personaWorld && currentWorld && personaWorld !== currentWorld);
  const worldName = personaWorld
    ? String((ds()?.get?.("worlds", personaWorld) as { displayName?: string } | null | undefined)?.displayName || personaWorld)
    : "";
  const personaName = String(persona.name || personaId);
  return {
    icon: String(persona.icon || ""),
    label: personaName,
    tooltip: outOfWorld ? `${personaName} (${worldName}) - out of world.` : `${personaName}${worldName ? ` (${worldName})` : ""}`,
    outOfWorld
  };
}

function jobChipData(memberId: string, member: MemberRecord = {}): RosterJobChipData {
  const jobId = (member.currentJob as string | undefined) || null;
  if (!jobId) return { state: "none" };
  const job = ds()?.get?.("jobs", jobId) as (IconEntitySource & { id?: string; name?: string }) | null | undefined;
  if (!job) return { state: "unknown", unknownId: jobId };
  const progress = (member.jobProgress?.[jobId] as { xp?: number; level?: number } | undefined) || { xp: 0, level: 1 };
  const F = formulas();
  const cap = F?.getJobMaxLevel ? F.getJobMaxLevel(job as Record<string, unknown>) : 10;
  const level = Math.max(1, Number(progress.level || 1));
  const xp = Number(progress.xp || 0);
  const xpToNext = F?.calcJobXpToNextLevel ? F.calcJobXpToNextLevel(job as Record<string, unknown>, xp, level) : null;
  const meta = level >= cap ? "(max)" : xpToNext != null ? `(${xpToNext} XP to next)` : "";
  void memberId;
  return {
    state: "known",
    job,
    level,
    cap,
    xp,
    meta,
    persona: jobPersonaData(member)
  };
}

function vitalsData(member: MemberRecord): RosterVitals {
  const hp = Number(member.currentHp || 0);
  const maxHp = Number(member.maxHp || 0);
  const mp = Number(member.currentMp || 0);
  const maxMp = Number(member.maxMp || 0);
  return {
    hpPct: Math.round((hp / (maxHp || 1)) * 100),
    mpPct: Math.round((mp / (maxMp || 1)) * 100),
    hp,
    maxHp,
    mp,
    maxMp
  };
}

export function getRosterMemberData(id: string, member: MemberRecord): RosterMemberData {
  const base = memberBase(id, member);
  const stats = memberStats(id, member);
  const isBench = (member.rosterRole || "active") === "bench";
  const F = formulas();
  const charLevel = Number(member.level || 1);
  const charXp = Number(member.xp || 0);
  const xpToNext = F?.calcCharXpToNextLevel ? F.calcCharXpToNextLevel(charXp, charLevel) : null;
  const bridge = cjs().CampaignCombatBridge;
  const battleReady = bridge?.isMemberBattleReady ? bridge.isMemberBattleReady(member) : true;
  const availLabel = battleReady ? "Ready" : bridge?.availabilityLabel?.(member) || "Unavailable";
  const rankInfo = memberRankInfo(member);
  return {
    id: String(id),
    name: String(member.name || base?.name || id),
    baseFrom: base?.id && base.id !== id ? String(base.id) : "",
    isBench,
    battleReady,
    availLabel: String(availLabel),
    level: charLevel,
    xp: charXp,
    xpSmall: xpToNext != null ? `(${xpToNext} to next)` : "(max)",
    charXpMeta: xpToNext != null ? `XP ${charXp} (${xpToNext} to next)` : `XP ${charXp} (max)`,
    rank: {
      label: String(rankInfo.label),
      trialPending: !!rankInfo.trialPending,
      tooltip: rankInfo.atMax ? "Max rank" : `RP ${rankInfo.rp}/${rankInfo.threshold} -> ${rankInfo.next || "-"}`
    },
    portrait: portraitData(id, member),
    persona: personaPillData(id, member),
    job: jobChipData(id, member),
    vitals: vitalsData(member),
    stats: Object.entries(stats).map(([stat, value]) => ({
      name: statName(stat),
      value: Number(value || 0)
    })),
    affinities: resistanceData(base, member, stats),
    detail: getRosterDetailData(id, member)
  };
}

export function getRosterData(stateSnapshot: CampaignStateSnapshot): RosterData | null {
  if (!stateSnapshot) return null;
  const entries = Object.entries(((stateSnapshot as CampaignStateForRoster).party || {}) as Record<string, MemberRecord>);
  return {
    active: entries
      .filter(([, member]) => (member.rosterRole || "active") !== "bench")
      .map(([id, member]) => getRosterMemberData(id, member)),
    bench: entries
      .filter(([, member]) => (member.rosterRole || "active") === "bench")
      .map(([id, member]) => getRosterMemberData(id, member))
  };
}

export function getPortraitHeroData(id: string, member: MemberRecord): PortraitHeroData {
  const m = member as Record<string, unknown>;
  const name = String((m.name as string) || id);
  const lvl = (m.level as number) || 1;
  const rank = (m.rank as string) || "F";
  const klass = (m.class as string) || (m.archetype as string) || "";
  return {
    portrait: portraitData(id, member),
    name,
    sub: `${klass || "Adventurer"} / Lv ${lvl} / Rank ${rank}`,
    tags: ((m.tags as string[]) || []).slice(0, 6)
  };
}

export function getPartySheetData(id: string, member: MemberRecord): PartySheetData {
  return { hero: getPortraitHeroData(id, member), member: getRosterMemberData(id, member) };
}

function partyDrawerMemberData(id: string, member: MemberRecord): PartyDrawerMemberData {
  const bridge = cjs().CampaignCombatBridge;
  const battleReady = bridge?.isMemberBattleReady ? bridge.isMemberBattleReady(member) : true;
  const availability = battleReady ? "Ready" : bridge?.availabilityLabel?.(member) || "Unavailable";
  return {
    id,
    name: String(member.name || id),
    level: Number(member.level || 1),
    isBench: (member.rosterRole || "active") === "bench",
    battleReady,
    availability,
    portrait: portraitData(id, member),
    iconEntity: member as IconEntitySource,
    rank: memberRankInfo(member),
    vitals: vitalsData(member),
    statuses: ((member.statuses as Array<{ label?: string; id?: string }> | undefined) || []).map((status) => ({
      label: String(status.label || status.id || "")
    }))
  };
}

export function getPartyDrawerData(stateSnapshot: CampaignStateSnapshot): PartyDrawerData {
  const entries = Object.entries(((stateSnapshot as CampaignStateForRoster).party || {}) as Record<string, MemberRecord>);
  return {
    active: entries
      .filter(([, member]) => (member.rosterRole || "active") !== "bench")
      .map(([id, member]) => partyDrawerMemberData(id, member)),
    bench: entries
      .filter(([, member]) => (member.rosterRole || "active") === "bench")
      .map(([id, member]) => partyDrawerMemberData(id, member))
  };
}
