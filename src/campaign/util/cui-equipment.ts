// cui-equipment.ts — Phase H.4 TypeScript port of the Equipment helpers.
//
// `js/campaign/ui/cui-equipment.js` exported a frozen `Equipment`
// namespace on `window.CJS.CampaignUIInternal.Equipment`. The TS port
// installs the same surface. Resolves slot kinds, allowed weapon/armor
// types, picker options for the equip-item modal, and the human-readable
// summary string a card uses to describe a swap.
//
// All reads go through `window.CJS.DataStore` and `CampaignState`; no
// closure-scoped state from the main IIFE.

import { esc, label } from "./cui-utils";
import { desc, sortOptionLabel, type PickerOption } from "./cui-modals";

// ── Types ────────────────────────────────────────────────────────────
export interface EquipmentItem {
  readonly id?: string;
  readonly name?: string;
  readonly slot?: string;
  readonly type?: string;
  readonly rarity?: string;
  readonly equipmentCategory?: string;
  readonly weaponType?: string;
  readonly armorType?: string;
  readonly accessoryType?: string;
  readonly weaponData?: WeaponData;
  readonly effects?: readonly EffectInstance[];
  readonly characteristic?: string;
  readonly changeNotes?: string;
  readonly tags?: readonly string[];
  readonly _world?: string;
  readonly _scope?: string;
  readonly [key: string]: unknown;
}

export interface WeaponData {
  readonly baseDamage?: number;
  readonly range?: number;
  readonly damageType?: string;
  readonly element?: string;
  readonly weaponType?: string;
}

export interface EffectInstance {
  readonly effectId?: string;
  readonly id?: string;
  readonly value?: number;
  readonly overrides?: { readonly value?: number };
}

export interface PartyMember {
  readonly baseCharacterId?: string;
  readonly equipmentSlots?: EquipmentSlots;
  readonly equipment?: readonly string[];
  readonly allowedWeaponTypes?: readonly string[];
  readonly allowedArmorTypes?: readonly string[];
  readonly [key: string]: unknown;
}

export interface EquipmentSlots {
  weapon?: string | null;
  armor?: string | null;
  accessory1?: string | null;
  accessory2?: string | null;
}

export type EquipmentSlot = "weapon" | "armor" | "accessory1" | "accessory2";
export type EquipmentKind = "weapon" | "armor" | "accessory" | "";

interface BaseCharacterRecord {
  readonly allowedWeaponTypes?: readonly string[];
  readonly allowedArmorTypes?: readonly string[];
  readonly [key: string]: unknown;
}

interface EffectRecord {
  readonly name?: string;
  readonly value?: number;
}

interface DataStoreSurface {
  readonly get: (bucket: string, id: string | null | undefined) => Record<string, unknown> | undefined;
  readonly getAllAsArray: (bucket: string) => readonly Record<string, unknown>[];
}

interface CampaignStateSurface {
  readonly getState: () => {
    currentWorld?: string;
    inventory?: {
      items?: Record<string, number>;
      equipment?: Record<string, number>;
    };
  } | null;
}

interface ConstSurface {
  readonly WEAPON_TYPES?: readonly string[];
  readonly ARMOR_TYPES?: readonly string[];
  readonly ACCESSORY_TYPES?: readonly string[];
}

interface CjsSurface {
  readonly DataStore?: DataStoreSurface;
  readonly CampaignState?: CampaignStateSurface;
  readonly CONST?: ConstSurface;
}

function cjs(): CjsSurface {
  return (window as unknown as { CJS?: CjsSurface }).CJS ?? {};
}

function ds(): DataStoreSurface {
  const m = cjs().DataStore;
  if (!m) throw new Error("DataStore not loaded");
  return m;
}

function cs(): CampaignStateSurface | undefined {
  return cjs().CampaignState;
}

function constants(): ConstSurface | undefined {
  return cjs().CONST;
}

// ── Type normalization ───────────────────────────────────────────────
export function cleanType(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ -]+/g, "")
    .replace(/\s+/g, "_");
}

// Walks the item's id / name / slot / tags for substring matches against
// the world's WEAPON_TYPES / ARMOR_TYPES / ACCESSORY_TYPES list. A small
// alias table catches the common renames (longsword → sword, etc.) the
// old hand-tagged content uses.
const TYPE_ALIASES: Readonly<Record<string, string>> = {
  blade: "sword", longsword: "sword", shortsword: "sword", katana: "sword",
  fang: "dagger", knife: "dagger",
  longbow: "bow", shortbow: "bow",
  fist: "knuckles", claw: "knuckles", gauntlet: "knuckles",
  rod: "staff", tome: "staff",
  leather: "light", cloak: "light", boots: "light", cloth: "robe", mail: "heavy", plate: "heavy",
  pendant: "amulet", necklace: "amulet", coin: "charm", core: "trinket"
};

export function inferType(item: EquipmentItem | null | undefined, types: readonly string[] | undefined): string {
  if (!item) return "";
  const text = [item.id, item.name, item.slot, ...(item.tags || [])].join(" ").toLowerCase();
  const list = types || [];
  for (const [alias, type] of Object.entries(TYPE_ALIASES)) {
    if (list.includes(type) && text.includes(alias)) return type;
  }
  return list.find((type) => text.includes(type)) || "";
}

export function weaponType(item: EquipmentItem = {}): string {
  return cleanType(
    item.weaponType
    || item.weaponData?.weaponType
    || item.type
    || inferType(item, constants()?.WEAPON_TYPES)
  );
}

export function armorType(item: EquipmentItem = {}): string {
  return cleanType(
    item.armorType
    || item.type
    || inferType(item, constants()?.ARMOR_TYPES)
  );
}

export function accessoryType(item: EquipmentItem = {}): string {
  return cleanType(
    item.accessoryType
    || item.type
    || inferType(item, constants()?.ACCESSORY_TYPES)
  );
}

// ── Allowed types (character + persona override) ─────────────────────
export function allowedTypes(member: PartyMember = {}, key: "allowedWeaponTypes" | "allowedArmorTypes"): string[] {
  const base = (ds().get("characters", member.baseCharacterId) || {}) as BaseCharacterRecord;
  const baseValues = (base[key] || []) as readonly string[];
  const memberValues = (member[key] || []) as readonly string[];
  const values = [...baseValues, ...memberValues].map(cleanType).filter(Boolean);
  return Array.from(new Set(values));
}

export function memberCanUseWeapon(member: PartyMember, item: EquipmentItem): boolean {
  const allowed = allowedTypes(member, "allowedWeaponTypes");
  return !allowed.length || allowed.includes(weaponType(item));
}

export function memberCanUseArmor(member: PartyMember, item: EquipmentItem): boolean {
  const allowed = allowedTypes(member, "allowedArmorTypes");
  return !allowed.length || allowed.includes(armorType(item));
}

// ── Kind / type / summary ────────────────────────────────────────────
export function equipmentKind(item: EquipmentItem = {}): EquipmentKind {
  const slot = item.slot || "";
  if (item.equipmentCategory) return item.equipmentCategory as EquipmentKind;
  if (slot === "weapon" || slot === "offhand") return "weapon";
  if (["armor", "head", "body", "legs", "feet"].includes(slot)) return "armor";
  if (["accessory", "accessory1", "accessory2"].includes(slot)) return "accessory";
  return "";
}

export function equipmentType(item: EquipmentItem = {}): string {
  const kind = equipmentKind(item);
  if (kind === "weapon") return label(weaponType(item) || "weapon");
  if (kind === "armor") return label(armorType(item) || "armor");
  if (kind === "accessory") return label(accessoryType(item) || "accessory");
  return "";
}

export function weaponSummary(item: EquipmentItem = {}): string {
  const data = item.weaponData || {};
  if (equipmentKind(item) !== "weapon" || !Object.keys(data).length) return "";
  return [
    data.baseDamage != null ? `Damage ${data.baseDamage}` : "",
    data.range != null ? `Range ${data.range}` : "",
    data.damageType || "",
    data.element ? `${data.element} element` : ""
  ].filter(Boolean).join(", ");
}

export function effectSummary(item: EquipmentItem = {}): string {
  const effects = item.effects || [];
  if (!effects.length) return "";
  const head = effects.slice(0, 3).map((effect) => {
    const def = (ds().get("effects", effect.effectId || effect.id) || {}) as EffectRecord;
    const value = effect.overrides?.value ?? effect.value ?? def.value;
    return `${def.name || effect.effectId || effect.id}${value != null ? ` ${Number(value) >= 0 ? "+" : ""}${value}` : ""}`;
  }).join(", ");
  return head + (effects.length > 3 ? `, +${effects.length - 3} more` : "");
}

export function equipmentDesc(item: EquipmentItem = {}): string {
  return [
    desc(item),
    item.characteristic ? `Characteristic: ${item.characteristic}` : "",
    item.changeNotes ? `Change: ${item.changeNotes}` : "",
    weaponSummary(item),
    effectSummary(item)
  ].filter(Boolean).join(" ");
}

// `next` and `prior` are stat numbers; the formatter shows the next
// value with a `(+N)` or `(-N)` delta in parens.
export function delta(next: number | null | undefined, prior: number | null | undefined): string {
  const a = Number(next || 0);
  const b = Number(prior || 0);
  const diff = a - b;
  return `${a} (${diff >= 0 ? "+" : ""}${diff})`;
}

// ── Slots ────────────────────────────────────────────────────────────
export function slotKind(slot: string): "weapon" | "armor" | "accessory" {
  if (slot === "weapon") return "weapon";
  if (slot === "armor") return "armor";
  return "accessory";
}

export function slotLabel(slot: string): string {
  if (slot === "accessory1") return "Accessory 1";
  if (slot === "accessory2") return "Accessory 2";
  return label(slot);
}

// Normalize a member's equipped items into the canonical 4-slot shape.
// `rawSlots` is the persistent record (may be undefined on old saves);
// `equipment` is the flat fallback array. The function fills empty
// canonical slots from the array without double-equipping.
export function normalizeEquipmentSlots(
  rawSlots: EquipmentSlots | null | undefined,
  equipment: readonly (string | null)[] = []
): EquipmentSlots {
  const slots: EquipmentSlots = {
    weapon: rawSlots?.weapon || null,
    armor: rawSlots?.armor || null,
    accessory1: rawSlots?.accessory1 || null,
    accessory2: rawSlots?.accessory2 || null
  };
  const used = new Set(Object.values(slots).filter(Boolean));
  for (const itemId of equipment || []) {
    if (!itemId || used.has(itemId)) continue;
    const item = ds().get("items", itemId) as EquipmentItem | undefined;
    const kind = equipmentKind(item || {});
    if (kind === "weapon" && !slots.weapon) slots.weapon = itemId;
    else if (kind === "armor" && !slots.armor) slots.armor = itemId;
    else if (kind === "accessory" && !slots.accessory1) slots.accessory1 = itemId;
    else if (kind === "accessory" && !slots.accessory2) slots.accessory2 = itemId;
    used.add(itemId);
  }
  return slots;
}

// Multi-line human description of what changes when `item` is moved
// into `slot` for `member`. Used by the equip-item modal's picker rows.
export function equipmentChangeDescription(
  member: PartyMember,
  slot: EquipmentSlot,
  item: EquipmentItem,
  includeCurrent = true
): string {
  const slots = normalizeEquipmentSlots(member.equipmentSlots, member.equipment);
  const current = ds().get("items", slots[slot]) as EquipmentItem | undefined;
  const parts: string[] = [];
  if (includeCurrent) parts.push(current ? `Replaces ${current.name || slots[slot]}` : "Fills empty slot");
  if (equipmentKind(item) === "weapon") {
    const next = item.weaponData || {};
    const prior = current?.weaponData || {};
    if (next.baseDamage != null || prior.baseDamage != null) parts.push(`Damage ${delta(next.baseDamage, prior.baseDamage)}`);
    if (next.range != null || prior.range != null) parts.push(`Range ${delta(next.range, prior.range)}`);
    if (next.element || prior.element) parts.push(`Element ${next.element || "None"}`);
  }
  if ((item.effects || []).length || (current?.effects || []).length) {
    parts.push(`Effects ${(current?.effects || []).length} -> ${(item.effects || []).length}`);
  }
  if (item.changeNotes) parts.push(item.changeNotes);
  return parts.filter(Boolean).join(" | ");
}

// ── Picker options ───────────────────────────────────────────────────
export interface EquipmentPickerOption extends PickerOption {
  readonly change?: string;
  readonly group?: string;
}

export function equipmentOptions(member: PartyMember, slot: EquipmentSlot): EquipmentPickerOption[] {
  const kind = slotKind(slot);
  const slots = normalizeEquipmentSlots(member.equipmentSlots, member.equipment);
  const currentId = slots[slot];
  const otherAccessorySlot: EquipmentSlot = slot === "accessory1" ? "accessory2" : "accessory1";
  const otherAccessory = kind === "accessory"
    ? (ds().get("items", slots[otherAccessorySlot]) as EquipmentItem | undefined)
    : null;
  const otherAccessoryType = otherAccessory ? accessoryType(otherAccessory) : "";
  const state = cs()?.getState() || {};
  const world = state.currentWorld;
  const itemInventory: Record<string, number> = state.inventory?.items || {};
  const equipmentInventory: Record<string, number> = state.inventory?.equipment || {};
  const inWorld = (entry: EquipmentItem): boolean =>
    !entry._world || entry._world === world || entry._scope === "universal" || entry._scope === "system";
  return (ds().getAllAsArray("items") as readonly EquipmentItem[])
    .filter((entry) => entry?.id && inWorld(entry) && equipmentKind(entry) === kind)
    .filter((entry) => {
      if (kind === "weapon") return memberCanUseWeapon(member, entry);
      if (kind === "armor") return memberCanUseArmor(member, entry);
      if (kind === "accessory" && otherAccessoryType && entry.id !== currentId) {
        return accessoryType(entry) !== otherAccessoryType;
      }
      return true;
    })
    .map((entry): EquipmentPickerOption => ({
      value: entry.id!,
      label: entry.name || entry.id!,
      sub: [
        equipmentType(entry),
        entry.rarity,
        `Owned: ${itemInventory[entry.id!] || equipmentInventory[entry.id!] || 0}`
      ].filter(Boolean).join(" | "),
      description: equipmentDesc(entry),
      change: equipmentChangeDescription(member, slot, entry, true),
      group: slotLabel(slot),
      tags: [entry.id, entry.name, equipmentType(entry), equipmentKind(entry), ...(entry.tags || [])]
        .filter(Boolean) as string[]
    }))
    .sort(sortOptionLabel);
}

export function equipmentPickerItem(option: EquipmentPickerOption): string {
  return `
      <div class="campaign-picker-option campaign-equipment-option">
        <strong>${esc(option.label || option.value)}</strong>
        ${option.sub ? `<small>${esc(option.sub)}</small>` : ""}
        ${option.description ? `<span>${esc(option.description)}</span>` : ""}
        ${option.change ? `<span class="campaign-picker-change">${esc(option.change)}</span>` : ""}
      </div>
    `;
}

// ── Legacy namespace install ─────────────────────────────────────────
export interface CuiEquipment {
  readonly cleanType: typeof cleanType;
  readonly inferType: typeof inferType;
  readonly weaponType: typeof weaponType;
  readonly armorType: typeof armorType;
  readonly accessoryType: typeof accessoryType;
  readonly allowedTypes: typeof allowedTypes;
  readonly memberCanUseWeapon: typeof memberCanUseWeapon;
  readonly memberCanUseArmor: typeof memberCanUseArmor;
  readonly equipmentKind: typeof equipmentKind;
  readonly equipmentType: typeof equipmentType;
  readonly weaponSummary: typeof weaponSummary;
  readonly effectSummary: typeof effectSummary;
  readonly equipmentDesc: typeof equipmentDesc;
  readonly delta: typeof delta;
  readonly slotKind: typeof slotKind;
  readonly slotLabel: typeof slotLabel;
  readonly normalizeEquipmentSlots: typeof normalizeEquipmentSlots;
  readonly equipmentChangeDescription: typeof equipmentChangeDescription;
  readonly equipmentOptions: typeof equipmentOptions;
  readonly equipmentPickerItem: typeof equipmentPickerItem;
}

const NAMESPACE: CuiEquipment = Object.freeze({
  cleanType,
  inferType,
  weaponType,
  armorType,
  accessoryType,
  allowedTypes,
  memberCanUseWeapon,
  memberCanUseArmor,
  equipmentKind,
  equipmentType,
  weaponSummary,
  effectSummary,
  equipmentDesc,
  delta,
  slotKind,
  slotLabel,
  normalizeEquipmentSlots,
  equipmentChangeDescription,
  equipmentOptions,
  equipmentPickerItem
});

interface CuiInternalWindow {
  CJS?: {
    CampaignUIInternal?: { Equipment?: CuiEquipment; [key: string]: unknown };
    [key: string]: unknown;
  };
}
const w = window as unknown as CuiInternalWindow;
w.CJS = w.CJS || {};
w.CJS.CampaignUIInternal = w.CJS.CampaignUIInternal || {};
w.CJS.CampaignUIInternal.Equipment = NAMESPACE;

export default NAMESPACE;
