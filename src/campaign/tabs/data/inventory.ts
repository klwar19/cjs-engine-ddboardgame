// inventory.ts — typed data builder for the Inventory tab JSX port.
//
// Replaces the record-lookup logic that lived in the vanilla
// `js/campaign/campaign-inventory.js` island (`_nameFor` / `_metaFor` /
// `_descriptionFor` / `_equipmentMeta` / `_equipmentKind` / `_recordFor`).
// Pure derivation from the CampaignState snapshot + `window.CJS.DataStore`;
// no DOM, no markers — the JSX consumer renders typed onClick handlers.

import type { CampaignStateSnapshot } from "../../store";

export interface InventoryEntry {
  readonly bucket: string;
  readonly id: string;
  readonly qty: number;
  readonly name: string;
  readonly meta: string;
  readonly description: string;
}

export interface InventoryBucket {
  readonly bucket: string;
  readonly label: string;
  readonly entries: readonly InventoryEntry[];
}

// Bucket id → display label. Order + labels mirror the vanilla island.
const BUCKETS: ReadonlyArray<readonly [string, string]> = [
  ["items", "Items"],
  ["materials", "Materials"],
  ["food", "Food"],
  ["questItems", "Quest Items"],
  ["equipment", "Equipment Refs"]
];

// The fields the meta / description lines read off a DataStore record.
interface InventoryRecord {
  readonly name?: string;
  readonly type?: string;
  readonly rarity?: string;
  readonly _world?: string;
  readonly description?: string;
  readonly desc?: string;
  readonly flavor?: string;
  readonly notes?: string;
  readonly characteristic?: string;
  readonly changeNotes?: string;
  readonly slot?: string;
  readonly equipmentCategory?: string;
  readonly weaponType?: string;
  readonly weaponData?: { readonly weaponType?: string };
  readonly armorType?: string;
  readonly accessoryType?: string;
}

interface DataStoreSurface {
  readonly get?: (bucket: string, id: string) => InventoryRecord | null | undefined;
}

function ds(): DataStoreSurface | undefined {
  return (window as unknown as { CJS?: { DataStore?: DataStoreSurface } }).CJS?.DataStore;
}

// questItems resolve against the `items` bucket, materials/food against their
// own — identical to the vanilla `_recordFor` mapping.
function recordFor(bucket: string, id: string): InventoryRecord {
  const type =
    bucket === "materials" ? "materials"
      : bucket === "food" ? "food"
        : bucket === "questItems" ? "items"
          : "items";
  return ds()?.get?.(type, id) || {};
}

function equipmentKind(record: InventoryRecord): string {
  const slot = record.slot || "";
  if (record.equipmentCategory) return record.equipmentCategory;
  if (slot === "weapon" || slot === "offhand") return "weapon";
  if (["armor", "head", "body", "legs", "feet"].includes(slot)) return "armor";
  if (["accessory", "accessory1", "accessory2"].includes(slot)) return "accessory";
  return "";
}

function equipmentMeta(record: InventoryRecord): string {
  const kind = equipmentKind(record);
  if (!kind) return "";
  const type =
    kind === "weapon" ? record.weaponType || record.weaponData?.weaponType
      : kind === "armor" ? record.armorType
        : record.accessoryType;
  return [kind, type].filter(Boolean).join(": ");
}

function metaFor(bucket: string, id: string): string {
  const record = recordFor(bucket, id);
  return [id, equipmentMeta(record), record.type, record.rarity, record._world]
    .filter(Boolean)
    .join(" | ");
}

function descriptionFor(bucket: string, id: string): string {
  const record = recordFor(bucket, id);
  return [
    record.description || record.desc || record.flavor || record.notes || "",
    record.characteristic ? `Characteristic: ${record.characteristic}` : "",
    record.changeNotes ? `Change: ${record.changeNotes}` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function nameFor(bucket: string, id: string): string {
  return recordFor(bucket, id).name || id;
}

export function getInventoryData(state: CampaignStateSnapshot | null): readonly InventoryBucket[] {
  const inventory = (state?.inventory as Record<string, Record<string, number>> | undefined) || {};
  return BUCKETS.map(([bucket, label]) => {
    const entries: InventoryEntry[] = Object.entries(inventory[bucket] || {})
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({
        bucket,
        id,
        qty,
        name: nameFor(bucket, id),
        meta: metaFor(bucket, id),
        description: descriptionFor(bucket, id)
      }));
    return { bucket, label, entries };
  });
}
