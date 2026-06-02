// cui-utils.ts — Phase H.4 TypeScript port of the leaf Utils helpers.
//
// `js/campaign/ui/cui-utils.js` exported a frozen `Utils` namespace on
// `window.CJS.CampaignUIInternal.Utils` used by both campaign-ui.js and
// the action-handler modules. This module exports the same functions,
// fully typed, AND installs the same namespace on the legacy global so
// the existing JS callers don't need to change. The JS file is removed
// in the same commit; both sides now read the TS implementation.
//
// Pure functions only — no closure state, no DOM, no engine module
// dependencies except `window.CJS.DataStore` for the record-name lookup
// (which is a one-line `?.get?.()` for legacy save compatibility).

// ── HTML escaping ────────────────────────────────────────────────────
const ESC_MAP: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESC_MAP[ch] || ch);
}

export function escAttr(value: unknown): string {
  return esc(value);
}

// ── Display formatting ───────────────────────────────────────────────
export function label(value: unknown): string {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function safe(value: unknown): string {
  return String(value ?? "campaign")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_");
}

export function truncate(value: unknown, max = 60): string {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

// ── Currency / record names ──────────────────────────────────────────
export function currencyLabel(id: unknown): string {
  const value = String(id ?? "").toLowerCase();
  if (value === "jp" || value === "jester_points") return "Jester Points";
  if (value.endsWith("_gold")) return `${label(value.replace(/_gold$/, ""))} Gold`;
  return label(id);
}

interface DataStoreSurface {
  readonly get?: (bucket: string, id: string) => { name?: string } | null | undefined;
}

function dataStore(): DataStoreSurface | undefined {
  const cjs = (window as unknown as { CJS?: { DataStore?: DataStoreSurface } }).CJS;
  return cjs?.DataStore;
}

export function recordName(bucketOrType: string | undefined, id: string): string {
  const bucket =
    bucketOrType === "material" ? "materials"
      : bucketOrType === "food" ? "food"
        : bucketOrType === "questItem" ? "questItems"
          : bucketOrType || "items";
  return dataStore()?.get?.(bucket, id)?.name || id;
}

// ── Loot / bundle formatting ─────────────────────────────────────────
export interface LootDrop {
  readonly type?: string;
  readonly id?: string;
  readonly name?: string;
  readonly amount?: number;
  readonly qty?: number;
  readonly currency?: string;
}

export function lootLine(drop: LootDrop): string {
  if (drop.type === "money") return `${drop.amount || drop.qty || 0} ${currencyLabel(drop.currency || "gold")}`;
  if (drop.type === "jp") return `${drop.amount || drop.qty || 0} ${currencyLabel("jp")}`;
  const bucket = drop.type === "material" ? "materials" : "items";
  return `${drop.qty || 1}x ${drop.name || recordName(bucket, drop.id || "")}`;
}

export interface RewardBundle {
  readonly currencies?: Readonly<Record<string, number>>;
  readonly items?: Readonly<Record<string, number>>;
  readonly materials?: Readonly<Record<string, number>>;
  readonly food?: Readonly<Record<string, number>>;
  readonly questItems?: Readonly<Record<string, number>>;
}

export function formatBundleText(bundle: RewardBundle | null | undefined): string {
  if (!bundle) return "";
  const parts: string[] = [];
  for (const [id, qty] of Object.entries(bundle.currencies || {})) parts.push(`${qty} ${currencyLabel(id)}`);
  for (const [id, qty] of Object.entries(bundle.items || {})) parts.push(`${qty} ${recordName("items", id)}`);
  for (const [id, qty] of Object.entries(bundle.materials || {})) parts.push(`${qty} ${recordName("materials", id)}`);
  for (const [id, qty] of Object.entries(bundle.food || {})) parts.push(`${qty} ${recordName("food", id)}`);
  for (const [id, qty] of Object.entries(bundle.questItems || {})) parts.push(`${qty} ${recordName("questItems", id)}`);
  return parts.join(", ");
}

// ── Asset path resolution ────────────────────────────────────────────
// Asset paths in `data/*.json` are stored relative to the project root.
// Resolve them against the current app document instead of relying on CSS or
// DOM relative-path quirks; GitHub Pages serves the app under a repo subpath.
// URLs, absolute paths, and data/blob URLs pass through untouched.
export function cssVarAssetUrl(path: unknown): string {
  const value = String(path || "").trim();
  if (!value) return "";
  if (/^(data:|blob:|https?:|\/)/i.test(value)) return value;

  const normalized = value.replace(/^(?:\.\.?\/)+(?=(?:assets|images|audio|data)\/)/i, "");
  try {
    return new URL(normalized, window.location.href).href;
  } catch {
    return normalized;
  }
}

// ── Legacy namespace install ─────────────────────────────────────────
// `js/campaign/campaign-ui.js` reads these via
// `window.CJS.CampaignUIInternal.Utils` and binds short aliases (`_esc`,
// `_label`, …) at the top of its IIFE. We keep that surface alive so
// the IIFE doesn't need to change while the rest of H.4 lands.
export interface CuiUtils {
  readonly esc: typeof esc;
  readonly escAttr: typeof escAttr;
  readonly label: typeof label;
  readonly safe: typeof safe;
  readonly truncate: typeof truncate;
  readonly currencyLabel: typeof currencyLabel;
  readonly recordName: typeof recordName;
  readonly lootLine: typeof lootLine;
  readonly formatBundleText: typeof formatBundleText;
  readonly cssVarAssetUrl: typeof cssVarAssetUrl;
}

const NAMESPACE: CuiUtils = Object.freeze({
  esc,
  escAttr,
  label,
  safe,
  truncate,
  currencyLabel,
  recordName,
  lootLine,
  formatBundleText,
  cssVarAssetUrl
});

interface CuiInternalWindow {
  CJS?: {
    CampaignUIInternal?: { Utils?: CuiUtils; [key: string]: unknown };
    [key: string]: unknown;
  };
}

const w = window as unknown as CuiInternalWindow;
w.CJS = w.CJS || {};
w.CJS.CampaignUIInternal = w.CJS.CampaignUIInternal || {};
w.CJS.CampaignUIInternal.Utils = NAMESPACE;

export default NAMESPACE;
