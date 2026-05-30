// rosterDetail.ts — Phase K.3.2 typed data for the roster detail row
// (skills / passives / statuses / equipment cards).
//
// These four cards were the last icon-heavy HTML island
// (`cui-party-tab.js::_rosterDetailCardsHtml` + its slot / pool / known-row
// / equipment sub-renderers). This builder mirrors that logic exactly but
// returns typed data the JSX `<RosterDetailCards>` (RosterDetail.tsx)
// renders with `<Icon>` + onClick dispatch — no `data-campaign-action`,
// no `dangerouslySetInnerHTML`.
//
// Single source of truth: `test_roster_detail.js` renders the JSX and
// compares it (action-wiring attributes normalized away) to the live
// island's `rosterMemberData().detailCardsHtml` for empty AND rich members,
// so the port is verified for the states the VR fixture can't reach. The
// island stays as that reference until the party-sheet modal migrates to
// React (a later K.3.2 step), at which point its detail renderers drop.

import { label, formatBundleText } from "../../util/cui-utils";
import { desc as recordDesc } from "../../util/cui-modals";
import {
  normalizeEquipmentSlots,
  allowedTypes,
  equipmentType,
  equipmentDesc,
  cleanType,
  slotKind as equipSlotKind,
  slotLabel as equipSlotLabel,
  type EquipmentItem,
  type PartyMember as EquipMember
} from "../../util/cui-equipment";
import type { IconEntitySource } from "../../util/icon";

// ── Engine accessors ────────────────────────────────────────────────────
interface Perk {
  readonly level?: number;
  readonly rank?: number;
  readonly targetRank?: number;
  readonly description?: string;
}

interface FormulasSurface {
  readonly calcEffectiveSkillSlots?: (m: MemberRecord, base: Record<string, unknown>) => number;
  readonly calcEffectivePassiveSlots?: (m: MemberRecord, base: Record<string, unknown>) => number;
  readonly calcEffectiveSkillPoints?: (m: MemberRecord, base: Record<string, unknown>) => number;
  readonly calcEffectivePassivePoints?: (m: MemberRecord, base: Record<string, unknown>) => number;
  readonly calcEquippedSpCost?: (equipped: readonly string[], kind: string) => number;
  readonly calcSpCost?: (thing: unknown) => number;
  readonly getSkillMaxLevel?: (skill: Record<string, unknown>) => number;
  readonly calcSkillApToNextLevel?: (skill: Record<string, unknown>, ap: number, level: number) => number | null;
  readonly getEarnedSkillPerks?: (skill: Record<string, unknown>, level: number) => readonly Perk[];
  readonly getNextSkillPerk?: (skill: Record<string, unknown>, level: number) => Perk | null;
  readonly getPassiveMaxRank?: (passive: Record<string, unknown>) => number;
  readonly calcPassiveRankCost?: (passive: Record<string, unknown>, rank: number) => unknown;
  readonly getEarnedPassiveRankPerks?: (passive: Record<string, unknown>, rank: number) => readonly Perk[];
  readonly getNextPassiveRankPerk?: (passive: Record<string, unknown>, rank: number) => Perk | null;
}

interface DataStoreSurface {
  readonly get: (bucket: string, id: string | null | undefined) => Record<string, unknown> | null;
}

interface CampaignStateSurface {
  readonly getState: () => { party?: Record<string, MemberRecord> } | null;
  readonly skillPoolIds?: (m: MemberRecord, base: Record<string, unknown>) => readonly string[];
  readonly passivePoolIds?: (m: MemberRecord, base: Record<string, unknown>) => readonly string[];
}

interface ConstSurface {
  readonly STATUS_DEFINITIONS?: Record<string, Record<string, unknown>>;
}

interface DetailCjs {
  readonly Formulas?: FormulasSurface;
  readonly DataStore?: DataStoreSurface;
  readonly CampaignState?: CampaignStateSurface;
  readonly CONST?: ConstSurface;
}

function cjs(): DetailCjs {
  return (window as unknown as { CJS?: DetailCjs }).CJS ?? {};
}

// ── Member record + small helpers (mirror cui-party-tab.js) ──────────────
export interface MemberRecord {
  readonly baseCharacterId?: string;
  readonly equipmentSlots?: Record<string, string | null>;
  readonly equipment?: unknown;
  readonly equippedSkills?: readonly string[];
  readonly equippedPassives?: readonly string[];
  readonly learnedSkills?: ReadonlyArray<string | { skillId?: string; source?: string; level?: number }>;
  readonly learnedPassives?: readonly string[];
  readonly skillProgress?: Record<string, { ap?: number; level?: number }>;
  readonly passiveProgress?: Record<string, { rank?: number }>;
  readonly skillSlots?: number;
  readonly passiveSlots?: number;
  readonly skillPoints?: number;
  readonly passivePoints?: number;
  readonly statuses?: ReadonlyArray<StatusInstance>;
  readonly [key: string]: unknown;
}

interface StatusInstance {
  readonly id?: string;
  readonly label?: string;
  readonly duration?: string | number;
  readonly stacks?: number;
  readonly notes?: string;
}

type SkillEntry = string | { skillId?: string; source?: string; level?: number };

function skillEntryId(entry: SkillEntry): string | null {
  return typeof entry === "string" ? entry : entry?.skillId || null;
}

function memberBase(id: string, member: MemberRecord): Record<string, unknown> {
  return cjs().DataStore?.get("characters", member.baseCharacterId || id) || {};
}

function memberSkillEntries(id: string, member: MemberRecord): SkillEntry[] {
  const base = memberBase(id, member);
  const out: SkillEntry[] = [];
  const seen = new Set<string>();
  const baseSkills = (base.skills as SkillEntry[] | undefined) || [];
  for (const entry of [...baseSkills, ...(member.learnedSkills || [])]) {
    const sid = skillEntryId(entry);
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    out.push(typeof entry === "string" ? { skillId: sid } : entry);
  }
  return out;
}

function memberLearnedSkillIds(member: MemberRecord): string[] {
  return (member.learnedSkills || []).map(skillEntryId).filter((v): v is string => !!v);
}

function statusDef(statusId: string | undefined): Record<string, unknown> | null {
  if (!statusId) return null;
  const custom = cjs().DataStore?.get("statuses", statusId);
  if (custom) return custom;
  const builtins = cjs().CONST?.STATUS_DEFINITIONS || {};
  return builtins[statusId] ? { id: statusId, ...builtins[statusId] } : null;
}

function skillWeaponTypes(skill: Record<string, unknown>): string[] {
  const raw =
    (skill.requiredWeaponTypes as unknown) ||
    (skill.requiredWeaponType as unknown) ||
    (skill.weaponTypeRequired as unknown) ||
    [];
  const arr = Array.isArray(raw) ? raw : [raw];
  // Use the Equipment util's cleanType (lowercase + strip + underscore) so the
  // "Weapon …" meta string matches the island byte-for-byte.
  return arr.map((v) => cleanType(v)).filter(Boolean);
}

function skillMeta(skill: Record<string, unknown>, entry: { level?: number } = {}): string {
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

function passivePerkRank(perk: Perk = {}): number | string {
  return Number(perk.rank ?? perk.level ?? perk.targetRank ?? 0) || "?";
}

interface PassiveRankInfo {
  readonly rank: number;
  readonly max: number;
  readonly isMax: boolean;
}

function passiveRankInfo(
  memberId: string,
  passiveId: string,
  passive: Record<string, unknown> | null
): PassiveRankInfo {
  const member = cjs().CampaignState?.getState()?.party?.[memberId] || {};
  const rank = Math.max(1, Number(member.passiveProgress?.[passiveId]?.rank || 1));
  const F = cjs().Formulas;
  const max = F?.getPassiveMaxRank
    ? F.getPassiveMaxRank(passive || cjs().DataStore?.get("passives", passiveId) || {})
    : 5;
  return { rank, max, isMax: rank >= max };
}

function passiveRankCostText(passive: Record<string, unknown> | null, currentRank: number): string {
  const F = cjs().Formulas;
  const cost = passive && F?.calcPassiveRankCost ? F.calcPassiveRankCost(passive, currentRank) : null;
  return formatBundleText(cost as never);
}

// ── Typed output shapes ─────────────────────────────────────────────────
export type EquipState = "equipped" | "unequipped" | "none";

export interface KnownRecordData {
  readonly key: string;
  readonly title: string;
  readonly meta: string;
  readonly description: string;
  readonly earnedText: string;
  readonly nextText: string;
}

export interface KnownSkillData extends KnownRecordData {
  readonly memberId: string;
  readonly skillId: string;
  readonly equip: EquipState;
  readonly spCost: number;
  readonly showAp: boolean;
  readonly showLevel: boolean;
  readonly showDetail: boolean;
  readonly learned: boolean;
}

export interface KnownPassiveData extends KnownRecordData {
  readonly memberId: string;
  readonly passiveId: string;
  readonly equip: EquipState;
  readonly showRankUp: boolean;
  readonly rankCostText: string;
  readonly learned: boolean;
}

export interface KnownStatusData {
  readonly key: string;
  readonly title: string;
  readonly meta: string;
  readonly description: string;
}

export interface SkillSlot {
  readonly filled: boolean;
  readonly skillId: string;
  readonly name: string;
  readonly title: string;
  readonly entity: IconEntitySource | null;
}

export interface PassiveSlot {
  readonly filled: boolean;
  readonly passiveId: string;
  readonly name: string;
  readonly rankLabel: string;
  readonly title: string;
  readonly entity: IconEntitySource | null;
}

export interface SkillsSection {
  readonly budgetBadge: string;
  readonly slots: readonly SkillSlot[];
  readonly poolCount: number;
  readonly pool: readonly KnownSkillData[];
}

export interface PassivesSection {
  readonly budgetBadge: string;
  readonly slots: readonly PassiveSlot[];
  readonly poolCount: number;
  readonly pool: readonly KnownPassiveData[];
}

export interface EquipmentRow {
  readonly slot: string;
  readonly slotLabel: string;
  readonly slotKind: string;
  readonly filled: boolean;
  readonly entity: IconEntitySource | null;
  readonly itemName: string;
  readonly meta: string;
  readonly description: string;
}

export interface EquipmentSection {
  readonly proficiency: string;
  readonly rows: readonly EquipmentRow[];
}

export interface RosterDetailData {
  readonly id: string;
  readonly skills: SkillsSection;
  readonly passives: PassivesSection;
  readonly statuses: readonly KnownStatusData[];
  readonly equipment: EquipmentSection;
}

// ── Section builders (mirror cui-party-tab.js) ───────────────────────────
function selectionBudgetBadge(memberId: string, member: MemberRecord, kind: "skill" | "passive"): string {
  const F = cjs().Formulas;
  if (!F) return "";
  const base = cjs().DataStore?.get("characters", member.baseCharacterId || memberId) || {};
  const eqField = kind === "skill" ? "equippedSkills" : "equippedPassives";
  const slotCap =
    kind === "skill"
      ? F.calcEffectiveSkillSlots
        ? F.calcEffectiveSkillSlots(member, base)
        : member.skillSlots || 0
      : F.calcEffectivePassiveSlots
        ? F.calcEffectivePassiveSlots(member, base)
        : member.passiveSlots || 0;
  const spCap =
    kind === "skill"
      ? F.calcEffectiveSkillPoints
        ? F.calcEffectiveSkillPoints(member, base)
        : member.skillPoints || 0
      : F.calcEffectivePassivePoints
        ? F.calcEffectivePassivePoints(member, base)
        : member.passivePoints || 0;
  const equipped = (member[eqField] as string[] | undefined) || [];
  const used = F.calcEquippedSpCost
    ? F.calcEquippedSpCost(equipped, kind === "skill" ? "skills" : "passives")
    : equipped.length;
  return `${equipped.length}/${slotCap} slots · ${used}/${spCap} SP`;
}

function knownSkillData(
  memberId: string,
  entry: SkillEntry,
  isEquipped: boolean | null,
  member: MemberRecord
): KnownSkillData {
  const F = cjs().Formulas;
  const DS = cjs().DataStore;
  const skillId = skillEntryId(entry) || "";
  const skill = DS?.get("skills", skillId) || null;
  const entryObj = typeof entry === "string" ? {} : entry;
  const learned =
    entryObj.source === "campaign" || memberLearnedSkillIds(member).includes(skillId);
  const prog = member.skillProgress?.[skillId] || { ap: 0, level: 1 };
  const cap = skill && F?.getSkillMaxLevel ? F.getSkillMaxLevel(skill) : 5;
  const apTotal = Number(prog.ap || 0);
  const level = Math.max(1, Number(prog.level || 1));
  const apToNext = skill && F?.calcSkillApToNextLevel ? F.calcSkillApToNextLevel(skill, apTotal, level) : null;
  const apMeta =
    level >= cap
      ? `Lv ${level}/${cap} (max)`
      : apToNext != null
        ? `Lv ${level}/${cap} | ${apToNext} AbP to next`
        : `Lv ${level}/${cap}`;
  const baseMeta = skill ? skillMeta(skill, entryObj) : skillMeta({}, entryObj);
  const meta = [baseMeta, apMeta].filter(Boolean).join(" | ");
  const spCost = skill && F?.calcSpCost ? F.calcSpCost(skill) : 1;

  const earned = skill && F?.getEarnedSkillPerks ? F.getEarnedSkillPerks(skill, level) : [];
  const next = skill && F?.getNextSkillPerk ? F.getNextSkillPerk(skill, level) : null;
  const earnedText = earned.length
    ? earned.map((p) => `Lv${p.level} — ${p.description || "..."}`).join(" • ")
    : "";
  const nextText = next ? `Next at Lv${next.level}: ${next.description || "..."}` : "";

  const titlePrefix = isEquipped === true ? "✓ " : isEquipped === false ? "☐ " : "";
  const equip: EquipState = isEquipped == null ? "none" : isEquipped ? "equipped" : "unequipped";
  return {
    key: skillId,
    memberId,
    skillId,
    title: `${titlePrefix}${(skill?.name as string) || skillId}`,
    meta: `SP ${spCost} | ${meta}`,
    description: recordDesc(skill || {}) || "",
    earnedText,
    nextText,
    equip,
    spCost,
    showAp: !!(skill && level < cap),
    showLevel: !!(skill && level < cap),
    showDetail: !!skill,
    learned
  };
}

function knownPassiveData(
  memberId: string,
  passiveId: string,
  isEquipped: boolean | null,
  member: MemberRecord
): KnownPassiveData {
  const F = cjs().Formulas;
  const DS = cjs().DataStore;
  const passiveRecord = DS?.get("passives", passiveId) || null;
  const passive = passiveRecord || DS?.get("effects", passiveId) || null;
  const learned = (member.learnedPassives || []).includes(passiveId);
  const spCost = passive && F?.calcSpCost ? F.calcSpCost(passive) : 1;
  const rankInfo = passiveRankInfo(memberId, passiveId, passive);
  const rankCostText = passiveRankCostText(passive, rankInfo.rank);

  const earned = passiveRecord && F?.getEarnedPassiveRankPerks ? F.getEarnedPassiveRankPerks(passiveRecord, rankInfo.rank) : [];
  const next = passiveRecord && F?.getNextPassiveRankPerk ? F.getNextPassiveRankPerk(passiveRecord, rankInfo.rank) : null;
  const earnedText = earned.length
    ? earned.map((p) => `R${passivePerkRank(p)} — ${p.description || "..."}`).join(" | ")
    : "";
  const nextText = next ? `Next at R${passivePerkRank(next)}: ${next.description || "..."}` : "";

  const titlePrefix = isEquipped === true ? "✓ " : isEquipped === false ? "☐ " : "";
  const equip: EquipState = isEquipped == null ? "none" : isEquipped ? "equipped" : "unequipped";
  const trigger = (passive?.trigger as string) || (passive?.category as string) || passiveId;
  return {
    key: passiveId,
    memberId,
    passiveId,
    title: `${titlePrefix}${(passive?.name as string) || passiveId}`,
    meta: `SP ${spCost} | Rank ${rankInfo.rank}/${rankInfo.max}${rankInfo.isMax ? " (max)" : ""} | ${trigger}`,
    description: recordDesc(passive || {}) || "",
    earnedText,
    nextText,
    equip,
    showRankUp: !!(passiveRecord && !rankInfo.isMax),
    rankCostText,
    learned
  };
}

function skillsSection(id: string, member: MemberRecord): SkillsSection {
  const F = cjs().Formulas;
  const DS = cjs().DataStore;
  const CS = cjs().CampaignState;
  const base = DS?.get("characters", member.baseCharacterId || id) || {};
  const equipped = member.equippedSkills || [];
  const slots: SkillSlot[] = [];
  if (F) {
    const slotCap = F.calcEffectiveSkillSlots ? F.calcEffectiveSkillSlots(member, base) : member.skillSlots || 4;
    for (let i = 0; i < slotCap; i++) {
      if (i < equipped.length) {
        const sid = equipped[i];
        const skill = DS?.get("skills", sid) || null;
        const spCost = F.calcSpCost ? F.calcSpCost(skill) : 1;
        const name = (skill?.name as string) || sid;
        slots.push({ filled: true, skillId: sid, name, title: `${name} (SP ${spCost})`, entity: skill });
      } else {
        slots.push({ filled: false, skillId: "", name: "", title: "Equip a skill from pool", entity: null });
      }
    }
  }
  const pool = CS?.skillPoolIds ? CS.skillPoolIds(member, base) : [];
  const equippedSet = new Set(equipped);
  const authored = memberSkillEntries(id, member);
  const entryById = new Map<string, SkillEntry>();
  for (const e of authored) {
    const sid = skillEntryId(e);
    if (sid) entryById.set(sid, e);
  }
  const poolRows = pool.map((sid) => knownSkillData(id, entryById.get(sid) || { skillId: sid }, equippedSet.has(sid), member));
  return {
    budgetBadge: selectionBudgetBadge(id, member, "skill"),
    slots,
    poolCount: pool.length,
    pool: poolRows
  };
}

function passivesSection(id: string, member: MemberRecord): PassivesSection {
  const F = cjs().Formulas;
  const DS = cjs().DataStore;
  const CS = cjs().CampaignState;
  const base = DS?.get("characters", member.baseCharacterId || id) || {};
  const equipped = member.equippedPassives || [];
  const slots: PassiveSlot[] = [];
  if (F) {
    const slotCap = F.calcEffectivePassiveSlots ? F.calcEffectivePassiveSlots(member, base) : member.passiveSlots || 3;
    for (let i = 0; i < slotCap; i++) {
      if (i < equipped.length) {
        const pid = equipped[i];
        const passive = DS?.get("passives", pid) || DS?.get("effects", pid) || null;
        const spCost = F.calcSpCost ? F.calcSpCost(passive) : 1;
        const rankInfo = passiveRankInfo(id, pid, passive);
        const name = (passive?.name as string) || pid;
        slots.push({
          filled: true,
          passiveId: pid,
          name,
          rankLabel: `R ${rankInfo.rank}/${rankInfo.max}`,
          title: `${name} (SP ${spCost}, Rank ${rankInfo.rank}/${rankInfo.max})`,
          entity: passive
        });
      } else {
        slots.push({ filled: false, passiveId: "", name: "", rankLabel: "", title: "Equip a passive from pool", entity: null });
      }
    }
  }
  const pool = CS?.passivePoolIds ? CS.passivePoolIds(member, base) : [];
  const equippedSet = new Set(equipped);
  const poolRows = pool.map((pid) => knownPassiveData(id, pid, equippedSet.has(pid), member));
  return {
    budgetBadge: selectionBudgetBadge(id, member, "passive"),
    slots,
    poolCount: pool.length,
    pool: poolRows
  };
}

function statusesSection(member: MemberRecord): KnownStatusData[] {
  const statuses = member.statuses || [];
  return statuses.map((status, i) => {
    const def = statusDef(status.id);
    return {
      key: `${status.id || "status"}-${i}`,
      title: (def?.name as string) || status.label || status.id || "",
      meta: `${status.duration || "manual"} | stacks ${status.stacks || 1}`,
      description: status.notes || recordDesc(def || {})
    };
  });
}

function equipmentSection(memberId: string, member: MemberRecord): EquipmentSection {
  const DS = cjs().DataStore;
  const slots = normalizeEquipmentSlots(
    member.equipmentSlots,
    member.equipment as EquipMember["equipment"]
  );
  const weaponTypes = allowedTypes(member as EquipMember, "allowedWeaponTypes").map(label).join(", ") || "Any";
  const armorTypes = allowedTypes(member as EquipMember, "allowedArmorTypes").map(label).join(", ") || "Any";
  const rows: EquipmentRow[] = (["weapon", "armor", "accessory1", "accessory2"] as const).map((slot) => {
    const itemId = slots[slot];
    const item = (DS?.get("items", itemId) as EquipmentItem | null) || null;
    const itemName = (item?.name as string) || itemId || "Empty";
    const type = item ? equipmentType(item) : "";
    const meta = item ? [type, item.rarity].filter(Boolean).join(" | ") : "Empty";
    const kind = equipSlotKind(slot) || "item";
    return {
      slot,
      slotLabel: equipSlotLabel(slot),
      slotKind: kind,
      filled: !!item,
      entity: (item as IconEntitySource | null) ?? null,
      itemName,
      meta,
      description: item ? equipmentDesc(item) : ""
    };
  });
  return {
    proficiency: `Weapons: ${weaponTypes} | Armor: ${armorTypes} | Accessories: any two different types`,
    rows
  };
}

// ── Public builder ──────────────────────────────────────────────────────
export function getRosterDetailData(id: string, member: MemberRecord): RosterDetailData {
  return {
    id: String(id),
    skills: skillsSection(id, member),
    passives: passivesSection(id, member),
    statuses: statusesSection(member),
    equipment: equipmentSection(id, member)
  };
}
