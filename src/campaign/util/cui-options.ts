// cui-options.ts — Phase H.4 TypeScript port of the Options builders.
//
// `js/campaign/ui/cui-options.js` exported a frozen `Options` namespace
// on `window.CJS.CampaignUIInternal.Options`. The TS port installs the
// same surface. Each builder returns a `PickerOption[]` array suitable
// for `UI.createSearchableSelect`. The shape matches what cui-modals.ts
// expects.
//
// Reads:
//   • content via `window.CJS.DataStore`
//   • world/campaign info from `window.CJS.CampaignState`
//   • status definitions from `window.CJS.CONST`
//   • record description from cui-modals.ts (`Modals.desc`)

import { desc, type PickerOption } from "./cui-modals";

// ── Types ────────────────────────────────────────────────────────────
export type { PickerOption };

interface DataStoreSurface {
  readonly getAllAsArray: (bucket: string) => readonly Record<string, unknown>[];
}

interface CampaignStateSurface {
  readonly getState?: () => { currentWorld?: string; inventory?: { items?: Record<string, number> } } | null;
  readonly getCurrentCampaign?: () => { allowedWorlds?: readonly string[] } | null | undefined;
  readonly getContent?: () => { worlds?: Record<string, { displayName?: string }> };
}

interface StatusDefinition {
  readonly name?: string;
  readonly category?: string;
  readonly tags?: readonly string[];
  readonly description?: string;
  readonly desc?: string;
  readonly flavor?: string;
  readonly notes?: string;
  readonly effectText?: string;
  readonly summary?: string;
  readonly [key: string]: unknown;
}

interface ConstSurface {
  readonly STATUS_DEFINITIONS?: Readonly<Record<string, StatusDefinition>>;
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

// ── Generic content-entry shape (every bucket returns at least these) ──
interface ContentEntry {
  readonly id: string;
  readonly name?: string;
  readonly _world?: string;
  readonly _scope?: "universal" | "system" | string;
  readonly tags?: readonly string[];
  readonly [key: string]: unknown;
}

function entryInWorld(entry: ContentEntry, world: string | undefined): boolean {
  return !entry._world || entry._world === world || entry._scope === "universal" || entry._scope === "system";
}

const sortByLabel = (a: PickerOption, b: PickerOption): number =>
  String(a.label || "").localeCompare(String(b.label || ""));

// ── Buckets ──────────────────────────────────────────────────────────
export function bucketOptions(bucket: "materials" | "food" | "items" | string): PickerOption[] {
  const world = cs()?.getState?.()?.currentWorld;
  const D = ds();
  if (bucket === "materials") {
    return (D.getAllAsArray("materials") as readonly ContentEntry[])
      .filter((entry) => entryInWorld(entry, world))
      .map((entry) => ({
        value: entry.id,
        label: entry.name || entry.id,
        sub: entry._world || (entry as { rarity?: string }).rarity || "",
        description: desc(entry),
        tags: entry.tags || []
      }))
      .sort(sortByLabel);
  }
  if (bucket === "food") {
    return (D.getAllAsArray("food") as readonly ContentEntry[])
      .filter((entry) => entryInWorld(entry, world))
      .map((entry) => ({
        value: entry.id,
        label: entry.name || entry.id,
        sub: entry._world || (entry as { type?: string }).type || "",
        description: desc(entry),
        tags: entry.tags || []
      }))
      .sort(sortByLabel);
  }
  return (D.getAllAsArray("items") as readonly ContentEntry[])
    .filter((entry) => entryInWorld(entry, world))
    .map((entry) => ({
      value: entry.id,
      label: entry.name || entry.id,
      sub: [
        (entry as { type?: string }).type,
        (entry as { rarity?: string }).rarity,
        entry._world
      ]
        .filter(Boolean)
        .join(" | "),
      description: desc(entry),
      tags: entry.tags || []
    }))
    .sort(sortByLabel);
}

// ── Statuses (DataStore + built-in CONST.STATUS_DEFINITIONS) ─────────
export function statusOptions(): PickerOption[] {
  const D = ds();
  const customIds = new Set<string>();
  const opts: PickerOption[] = (D.getAllAsArray("statuses") as readonly ContentEntry[]).map((entry) => {
    customIds.add(entry.id);
    return {
      value: entry.id,
      label: entry.name || entry.id,
      sub: (entry as { kind?: string }).kind || (entry as { category?: string }).category || "",
      description: desc(entry),
      tags: entry.tags || []
    };
  });
  const defs = cjs().CONST?.STATUS_DEFINITIONS || {};
  for (const [id, def] of Object.entries(defs)) {
    if (customIds.has(id)) continue;
    opts.push({
      value: id,
      label: def.name || id,
      sub: def.category || "Built-in",
      description: desc(def),
      tags: def.tags || []
    });
  }
  return opts.sort(sortByLabel);
}

// ── Seeds (crops bucket) ─────────────────────────────────────────────
export function seedOptions(): PickerOption[] {
  const world = cs()?.getState?.()?.currentWorld;
  return (ds().getAllAsArray("crops") as readonly ContentEntry[])
    .filter((crop) => !crop._world || crop._world === world)
    .map((crop) => ({
      value: crop.id,
      label: crop.name || crop.id,
      sub: (crop as { growTime?: number }).growTime ? `${(crop as { growTime?: number }).growTime}t` : ""
    }))
    .sort(sortByLabel);
}

// ── Worlds (campaign-allowed only) ───────────────────────────────────
export function worldOptions(): PickerOption[] {
  const CS = cs();
  const campaign = CS?.getCurrentCampaign?.();
  const worlds = CS?.getContent?.()?.worlds || {};
  const allowed = campaign?.allowedWorlds || Object.keys(worlds);
  return allowed.map((id) => ({
    value: id,
    label: worlds[id]?.displayName || id,
    sub: id
  }));
}

// ── Tents (owned items + tag-matching items) ─────────────────────────
export function tentOptions(): PickerOption[] {
  const D = ds();
  const inv = cs()?.getState?.()?.inventory?.items || {};
  const owned = Object.keys(inv).filter((id) => (inv[id] || 0) > 0);
  const items = D.getAllAsArray("items") as readonly ContentEntry[];
  const tagged = items.filter((entry) => {
    const tags = entry.tags || [];
    return tags.includes("tent") || tags.includes("camp") || /tent|camp/i.test(entry.id || "");
  });
  const tentIds = new Set(tagged.map((entry) => entry.id));
  const all = new Set([...owned, ...tentIds]);
  return Array.from(all).map((id) => {
    const entry = items.find((e) => e.id === id);
    return { value: id, label: entry?.name || id, sub: `Owned: ${inv[id] || 0}` };
  });
}

// ── Legacy namespace install ─────────────────────────────────────────
export interface CuiOptions {
  readonly bucketOptions: typeof bucketOptions;
  readonly statusOptions: typeof statusOptions;
  readonly seedOptions: typeof seedOptions;
  readonly worldOptions: typeof worldOptions;
  readonly tentOptions: typeof tentOptions;
}

const NAMESPACE: CuiOptions = Object.freeze({
  bucketOptions,
  statusOptions,
  seedOptions,
  worldOptions,
  tentOptions
});

interface CuiInternalWindow {
  CJS?: {
    CampaignUIInternal?: { Options?: CuiOptions; [key: string]: unknown };
    [key: string]: unknown;
  };
}
const w = window as unknown as CuiInternalWindow;
w.CJS = w.CJS || {};
w.CJS.CampaignUIInternal = w.CJS.CampaignUIInternal || {};
w.CJS.CampaignUIInternal.Options = NAMESPACE;

export default NAMESPACE;
