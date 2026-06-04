// shops.ts — typed data builder for the Shops/Rest tab JSX port.
//
// Replaces the render-time logic in the vanilla `js/campaign/campaign-economy.js`
// island (`renderShops` / `renderRest` / `_renderShop` + the `_shopOpen` /
// `_canBuy` / `_hasBundle` / `_formatBundle` / `_recordName` helpers). Pure
// derivation from the CampaignState snapshot + `window.CJS.DataStore`; the JSX
// consumer renders typed onClick (`shop-buy` / `shop-sell` / `full-rest` /
// `camp-rest`) instead of the old data-* island markers.

import type { CampaignStateSnapshot } from "../../store";
import { currencyLabel } from "../../util/cui-utils";

interface Bundle {
  readonly currencies?: Record<string, number>;
  readonly items?: Record<string, number>;
  readonly materials?: Record<string, number>;
  readonly food?: Record<string, number>;
  readonly questItems?: Record<string, number>;
}

interface ShopStockRecord {
  readonly id?: string;
  readonly type?: string;
  readonly qty?: number;
  readonly price?: number;
  readonly currency?: string;
  readonly requires?: Bundle;
  readonly costs?: Bundle;
  readonly costBundle?: Bundle;
}

interface ShopRecord {
  readonly id?: string;
  readonly name?: string;
  readonly description?: string;
  readonly currency?: string;
  readonly world?: string;
  readonly _world?: string;
  readonly stock?: ShopStockRecord[];
  readonly phaseTypes?: string[];
  readonly allowedPhases?: string[];
  readonly phases?: string[];
  readonly openPhaseTypes?: string[];
  readonly phaseType?: string;
  readonly allowedPhase?: string;
  readonly openPhase?: string;
}

interface DataStoreSurface {
  readonly get?: (bucket: string, id: string) => { name?: string } | null | undefined;
  readonly getAllAsArray?: (bucket: string) => ShopRecord[];
}

function ds(): DataStoreSurface | undefined {
  return (window as unknown as { CJS?: { DataStore?: DataStoreSurface } }).CJS?.DataStore;
}

// Mirrors campaign-economy.js `_recordName` (note the seed / farmFertilizer
// special cases that the generic cui-utils.recordName does not have).
function recordName(type: string | undefined, id: string): string {
  if (type === "seed") return ds()?.get?.("crops", id)?.name || id;
  if (type === "farmFertilizer") return ds()?.get?.("materials", id)?.name || id;
  const bucket = type === "material" ? "materials" : type === "food" ? "food" : "items";
  return ds()?.get?.(bucket, id)?.name || id;
}

// "<label>: a, b, c" or "" — the text the consumer wraps in a muted line.
function formatBundle(bundle: Bundle | undefined, label: string): string {
  const parts: string[] = [];
  for (const [id, qty] of Object.entries(bundle?.currencies || {})) parts.push(`${qty} ${currencyLabel(id)}`);
  for (const [id, qty] of Object.entries(bundle?.items || {})) parts.push(`${qty} ${recordName("item", id)}`);
  for (const [id, qty] of Object.entries(bundle?.materials || {})) parts.push(`${qty} ${recordName("material", id)}`);
  for (const [id, qty] of Object.entries(bundle?.food || {})) parts.push(`${qty} ${recordName("food", id)}`);
  for (const [id, qty] of Object.entries(bundle?.questItems || {})) parts.push(`${qty} ${id}`);
  return parts.length ? `${label}: ${parts.join(", ")}` : "";
}

interface EconomyState {
  readonly currentWorld?: string;
  readonly phase?: { type?: string };
  readonly currencies?: Record<string, number>;
  readonly inventory?: Record<string, Record<string, number>>;
  readonly activeScenarioRun?: unknown;
}

function shopOpen(shop: ShopRecord, state: EconomyState): boolean {
  const phaseType = state?.phase?.type || "";
  const phases = shop.phaseTypes || shop.allowedPhases || shop.phases || shop.openPhaseTypes;
  if (Array.isArray(phases) && phases.length) return phases.includes(phaseType);
  if (shop.phaseType || shop.allowedPhase || shop.openPhase) {
    return [shop.phaseType, shop.allowedPhase, shop.openPhase].filter(Boolean).includes(phaseType);
  }
  return true;
}

function hasBundle(state: EconomyState, bundle: Bundle | undefined): boolean {
  for (const [id, qty] of Object.entries(bundle?.currencies || {})) {
    if ((state.currencies?.[id] || 0) < Number(qty || 0)) return false;
  }
  const byBucket: Record<string, Record<string, number>> = {
    items: bundle?.items || {},
    materials: bundle?.materials || {},
    food: bundle?.food || {},
    questItems: bundle?.questItems || {}
  };
  for (const [bucket, records] of Object.entries(byBucket)) {
    for (const [id, qty] of Object.entries(records)) {
      if ((state.inventory?.[bucket]?.[id] || 0) < Number(qty || 0)) return false;
    }
  }
  return true;
}

function canBuy(state: EconomyState, item: ShopStockRecord, currency: string): boolean {
  if ((state.currencies?.[currency] || 0) < Number(item.price || 0)) return false;
  return hasBundle(state, item.requires || {}) && hasBundle(state, item.costs || item.costBundle || {});
}

export interface ShopStockEntry {
  readonly index: number;
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly subline: string;
  readonly requiresText: string;
  readonly consumesText: string;
  readonly priceLabel: string;
  readonly buyPrice: number;
  readonly sellPrice: number;
  readonly currency: string;
  readonly canBuy: boolean;
  readonly sellable: boolean;
}

export interface ShopCard {
  readonly id: string;
  readonly name: string;
  readonly currencyLabel: string;
  readonly description: string;
  readonly stock: readonly ShopStockEntry[];
}

export interface ShopsData {
  readonly hasRun: boolean;
  readonly shops: readonly ShopCard[];
}

function buildStockEntry(item: ShopStockRecord, index: number, shopCurrency: string, state: EconomyState): ShopStockEntry {
  const itemCurrency = item.currency || shopCurrency;
  const type = item.type || "item";
  const price = Number(item.price || 0);
  const farmStock = item.type === "seed" || item.type === "farmFertilizer";
  return {
    index,
    id: item.id || "",
    type,
    name: recordName(item.type, item.id || ""),
    subline: `${item.id} | stock ${item.qty ?? "manual"}`,
    requiresText: formatBundle(item.requires, "Needs"),
    consumesText: formatBundle(item.costs || item.costBundle, "Consumes"),
    priceLabel: `${price} ${currencyLabel(itemCurrency)}`,
    buyPrice: price,
    sellPrice: Math.floor(price / 2),
    currency: itemCurrency,
    canBuy: canBuy(state, item, itemCurrency),
    sellable: !farmStock
  };
}

export function getShopsData(state: CampaignStateSnapshot | null): ShopsData {
  const s = (state || {}) as EconomyState;
  const all = ds()?.getAllAsArray?.("shops") || [];
  const shops: ShopCard[] = all
    .filter((shop) => !shop._world || shop._world === s.currentWorld || shop.world === s.currentWorld)
    .filter((shop) => shopOpen(shop, s))
    .map((shop) => {
      const shopCurrency = shop.currency || `${shop.world || "haven"}_gold`;
      const stock = shop.stock || [];
      return {
        id: shop.id || "",
        name: shop.name || shop.id || "",
        currencyLabel: currencyLabel(shopCurrency),
        description: shop.description || "",
        stock: stock.map((item, index) => buildStockEntry(item, index, shopCurrency, s))
      };
    });
  return { hasRun: !!s.activeScenarioRun, shops };
}
