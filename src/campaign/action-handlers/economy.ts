// economy.ts — Phase H.3 inventory / shop / craft / seed / note handlers.
//
// These are pure CampaignOps + accessible-modal handlers: add or remove
// inventory, buy from a shop's stock, craft a recipe, plant a seed, and
// pin campaign / haven notes. Op names, payload keys, modal titles and
// mutation sources mirror the deleted closures (`_inventoryDelta`,
// `_quickAddInventory`, `_shopBuy`/`_shopStock`, `_craftRecipe`,
// `_plantSeed`, `_addPocketNote`, `_addPinnedNote`) exactly.

import { applyOp, cs, ds, mod, toast } from "./context";
import { modals, options } from "./modals";

interface ShopStock {
  id?: string;
  type?: string;
  bucket?: string;
  price?: number;
  currency?: string;
  requires?: Record<string, unknown>;
  costs?: Record<string, unknown>;
  costBundle?: Record<string, unknown>;
  consumeRequires?: boolean;
}

interface ShopRecord {
  stock?: ShopStock[];
}

interface CraftingRecipe {
  id?: string;
  name?: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
}

interface PocketHavenModule {
  plantSeed?: (plotId: string, seedId: string) => void;
}

const BUCKET_TO_OPS: Record<string, [string, string]> = {
  items: ["give_item", "take_item"],
  materials: ["give_material", "take_material"],
  food: ["give_food", "take_food"],
  questItems: ["give_quest_item", "take_quest_item"],
  equipment: ["give_item", "take_item"]
};

// Raw values mirror the dataset / payload the closure read (a missing
// key is `undefined`, not `""`, so `??` fallbacks below behave as before).
type Raw = string | number | undefined;

export interface InventoryDeltaInput {
  bucket?: Raw;
  id?: Raw;
  delta?: Raw;
}

export function inventoryDelta({ bucket, id, delta }: InventoryDeltaInput): void {
  const amount = Number(delta || 0);
  const pair = BUCKET_TO_OPS[String(bucket ?? "")] || BUCKET_TO_OPS.items;
  applyOp({ op: amount >= 0 ? pair[0] : pair[1], id, qty: Math.abs(amount) });
}

export function quickAddInventory(bucket: string): void {
  const key = bucket || "items";
  const opts = options()?.bucketOptions(key) ?? [];
  if (!opts.length) {
    toast(`No ${key} available in this world`, "info");
    return;
  }
  const titleByBucket: Record<string, string> = {
    items: "Add Item",
    materials: "Add Material",
    food: "Add Food",
    equipment: "Add Equipment",
    questItems: "Add Quest Item"
  };
  modals()?.opPickerModal({
    title: titleByBucket[key] || "Add Inventory",
    options: opts,
    withQty: true,
    qtyDefault: 1,
    qtyMin: 1,
    qtyMax: 99,
    primaryLabel: "Add",
    onSubmit: ({ value, qty }) => inventoryDelta({ bucket: key, id: value, delta: qty || 1 })
  });
}

export interface ShopBuyInput {
  shopId?: Raw;
  stockIndex?: Raw;
  id?: Raw;
  type?: Raw;
  price?: Raw;
  currency?: Raw;
}

function shopStock(shopId: Raw, stockIndex: Raw): ShopStock | null {
  const shop = shopId ? (ds()?.get("shops", String(shopId)) as ShopRecord | undefined) : null;
  const index = Number(stockIndex);
  return shop?.stock?.[index] || null;
}

export function shopBuy({ shopId, stockIndex, id, type, price, currency }: ShopBuyInput): void {
  const stock = shopStock(shopId, stockIndex);
  applyOp({
    op: "shop_buy",
    shopId,
    id: id || stock?.id,
    type: type || stock?.type || "item",
    bucket: stock?.bucket,
    price: Number(price ?? stock?.price ?? 0),
    currency: currency || stock?.currency,
    qty: 1,
    requires: stock?.requires || {},
    costs: stock?.costs || stock?.costBundle || {},
    consumeRequires: !!stock?.consumeRequires
  });
}

export function craftRecipe(recipeId: string): void {
  const recipe = ds()?.get("crafting", recipeId) as CraftingRecipe | undefined;
  if (!recipe) return;
  applyOp({
    op: "craft_basic",
    id: recipe.id,
    label: recipe.name,
    inputs: recipe.inputs || {},
    outputs: recipe.outputs || {}
  });
}

export function plantSeed(plotId: string): void {
  const opts = options()?.seedOptions() ?? [];
  if (!opts.length) {
    toast("No seeds available in this world", "info");
    return;
  }
  modals()?.opPickerModal({
    title: "Plant Seed",
    options: opts,
    primaryLabel: "Plant",
    placeholder: "Search seeds…",
    onSubmit: ({ value }) => mod<PocketHavenModule>("PocketHaven")?.plantSeed?.(plotId, value)
  });
}

interface NoteList {
  pocketHaven: { notes: Array<{ at: string; text: string }> };
  pinnedNotes: Array<{ at: string; text: string }>;
}

export function addPocketNote(): void {
  modals()?.textareaModal({
    title: "Activity Note",
    label: "Note",
    placeholder: "A short note about your haven…",
    primaryLabel: "Save Note",
    onSubmit: (text) => {
      if (!text) return false;
      cs().mutate((state) => {
        (state as unknown as NoteList).pocketHaven.notes.unshift({ at: new Date().toISOString(), text });
      }, { source: "note" });
    }
  });
}

export function addPinnedNote(): void {
  modals()?.textareaModal({
    title: "Pinned Note",
    label: "Note",
    placeholder: "Pin a reminder for the campaign…",
    primaryLabel: "Pin",
    onSubmit: (text) => {
      if (!text) return false;
      cs().mutate((state) => {
        (state as unknown as NoteList).pinnedNotes.unshift({ at: new Date().toISOString(), text });
      }, { source: "note" });
    }
  });
}
