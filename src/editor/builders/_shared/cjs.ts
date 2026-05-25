// Typed accessors for the global CJS namespace used by the editor
// builders. The vanilla CJS modules attach themselves to window.CJS at
// import time; this file lets the React-side builders talk to those
// modules with TypeScript types instead of `any`.

import type { CjsEditor } from "../../editorTypes";
import { getEditorCjs } from "../../editorTypes";

// ── ENTITY SHAPE COMMON TO ALL DATASTORE COLLECTIONS ─────────────────
export interface BaseEntity {
  id: string;
  name?: string;
  icon?: string;
  description?: string;
  tags?: string[];
  _scope?: string;
  _world?: string;
  _origin?: string;
}

// ── EFFECT SHAPE (a slice of what effect-registry.js produces) ───────
export interface Effect extends BaseEntity {
  trigger?: string;
  target?: string;
  action?: string;
  value?: number;
  source?: string;
  conditions?: string[];
  duration?: number | null;
  stacks?: boolean;
  maxStacks?: number;
  children?: Effect[];
  element?: string | null;
  damageType?: string | null;
  stat?: string | null;
  drType?: string | null;
  statusId?: string | null;
  terrainType?: string | null;
  summonId?: string | null;
  aoeShape?: string | null;
  aoeSize?: number | null;
  threshold?: number | null;
  cleansedBy?: string[];
  chance?: number;
  category?: string;
  overridable?: string[];
  color?: string | null;
  interaction?: string;
  critDamageBonus?: number | null;
  knockbackDistance?: number | null;
  weatherId?: string;
  environmentId?: string;
  storeResult?: string | null;
}

// ── DATASTORE FULL API (extends what editorTypes.ts exposes) ─────────
export interface DataStoreFull {
  getAll: (type: string) => Record<string, unknown>;
  getAllAsArray: <T = BaseEntity>(type: string) => T[];
  get: <T = BaseEntity>(type: string, id: string) => T | null;
  snapshot: <T = BaseEntity>(type: string, id: string) => T | null;
  exists: (type: string, id: string) => boolean;
  create: <T = BaseEntity>(type: string, obj: Partial<T>) => string;
  update: <T = BaseEntity>(type: string, id: string, changes: Partial<T>) => boolean;
  replace: <T = BaseEntity>(type: string, id: string, obj: T) => boolean;
  remove: (type: string, id: string) => boolean;
  duplicate: (type: string, id: string) => string;
  search: <T = BaseEntity>(type: string, query?: string) => T[];
  filterByTags: <T = BaseEntity>(type: string, tags: string[]) => T[];
  filterByCategory: <T = BaseEntity>(type: string, category: string) => T[];
  resolveEffectRefs: (refs: unknown[]) => unknown[];
  resolveSkillRefs: (ids: string[]) => unknown[];
  resolveItemRefs: (ids: string[]) => unknown[];
  validate: () => { valid: boolean; errors: string[]; warnings: string[] };
  exportJSON: () => string;
  exportBlob: () => Blob;
  downloadJSON: (filename: string) => void;
  importJSON: (text: string) => {
    success: boolean;
    error?: string;
    validation: { errors: string[]; warnings: string[] };
  };
  loadData: (obj: Record<string, unknown>) => void;
  reset: () => void;
  isDirty: () => boolean;
  markDirty: () => void;
  markClean: () => void;
  getCounts: () => Record<string, number>;
  subscribe: (
    listener: (change: { type: string; action: string; id?: string }) => void
  ) => () => void;
}

// ── EFFECT REGISTRY API ──────────────────────────────────────────────
export interface EffectRegistryApi {
  createBlankEffect: () => Effect;
  createEffect: (data: Partial<Effect>) => string;
  getEffect: (id: string) => Effect | null;
  updateEffect: (id: string, changes: Partial<Effect>) => boolean;
  deleteEffect: (id: string) => boolean;
  duplicateEffect: (id: string) => string;
  getAllEffects: () => Effect[];
  searchEffects: (query: string) => Effect[];
  mergeWithOverrides: (master: Effect, overrides: Record<string, unknown>) => Effect;
  resolveRef: (ref: { effectId: string; overrides?: Record<string, unknown> }) => Effect | null;
  resolveRefs: (refs: Array<{ effectId: string; overrides?: Record<string, unknown> }>) => Effect[];
  autoDescribe: (effect: Effect) => string;
  getEffectsGroupedByCategory: () => Record<string, Effect[]>;
  getEffectsGroupedByAction: () => Record<string, Effect[]>;
  validateEffect: (effect: Effect) => { valid: boolean; errors: string[] };
}

// ── CONSTANTS ────────────────────────────────────────────────────────
export interface ConditionDef {
  v: string;
  l: string;
  g: string;
  hasParam?: boolean;
  hasStat?: boolean;
  hasStatus?: boolean;
  hasTerrain?: boolean;
  hasUnitType?: boolean;
  paramDefault?: string;
}

export interface CleanseLabel {
  icon: string;
  label: string;
}

export interface StatusDef {
  icon: string;
  name: string;
  desc: string;
  [key: string]: unknown;
}

export interface TerrainDef {
  [key: string]: unknown;
}

export interface CjsConstants {
  STATS: string[];
  STAT_NAMES: Record<string, string>;
  ELEMENTS: string[];
  DAMAGE_TYPES: string[];
  UNIT_TYPES: string[];
  TERRAIN_TYPES: Record<string, TerrainDef>;
  EFFECT_TRIGGERS: { passive: string[]; event: string[] };
  EFFECT_ACTIONS: string[];
  EFFECT_TARGETS: string[];
  VALUE_SOURCES: string[];
  STATUS_DEFINITIONS: Record<string, StatusDef>;
  STATUS_CATEGORIES?: Record<string, { name: string; color: string }>;
  QTE_TYPES?: string[];
  QTE_DIFFICULTIES?: string[];
  RARITIES?: string[];
  RARITY_COLORS?: Record<string, string>;
  PROGRESSION?: {
    skillApThresholds?: number[];
    charXpThresholds?: number[];
    jobXpThresholds?: number[];
    skillMaxLevelDefault?: number;
    skillMaxLevelCap?: number;
    passiveMaxRankDefault?: number;
    passiveMaxRankCap?: number;
    passiveRankValuePerRank?: number;
    passiveRankMaterialDefault?: string;
    charMaxLevel?: number;
    jobMaxLevelDefault?: number;
    [k: string]: unknown;
  };
  CONDITION_DEFS: ConditionDef[];
  CLEANSE_LABELS: Record<string, CleanseLabel>;
  RANKS?: string[];
  RANK_DATA?: Record<string, unknown>;
  EQUIPMENT_SLOTS?: string[];
  WEAPON_TYPES?: string[];
  ARMOR_TYPES?: string[];
  ACCESSORY_TYPES?: string[];
  UNIT_SIZES?: string[];
  MOVEMENT_DEFAULTS?: Record<string, unknown>;
  COLLISION?: Record<string, unknown>;
  LINE_OF_SIGHT?: Record<string, unknown>;
  ELEMENT_COLORS?: Record<string, string>;
  ELEMENT_CHART?: Record<string, unknown>;
  ELEMENT_MULTIPLIERS?: Record<string, number>;
}

// ── CONTENT MANAGER FULL API ─────────────────────────────────────────
export interface ContentManagerFull {
  loadDefaultData: () => Promise<{ mode?: string }>;
  getLoadMode?: () => string;
  getWorldOptions?: () => Array<{ id: string; displayName?: string }>;
  setFilters?: (filters: { scope: string; world: string }) => void;
  getFilters?: () => { scope?: string; world?: string };
  getManifest?: () => unknown;
  getVisibleItems?: <T = BaseEntity>(type: string, query?: string) => T[];
  createEntry: (
    type: string,
    defaults: Record<string, unknown>,
    callback?: (id: string) => void
  ) => void;
  prepareRecord: <T = BaseEntity>(type: string, id: string, record: T) => T;
  renderScopeChip?: (item: BaseEntity) => string;
  getEntityIssueCount?: (type: string, id: string) => number;
  getDirtyFiles?: () => string[];
  clearDirtyFiles?: () => void;
  validateReferencesDetailed?: () => {
    valid: boolean;
    issues: Array<{ level: string }>;
  };
}

export interface UiHelpersFull {
  toast: (message: string, kind?: string, duration?: number) => void;
  openModal: (opts: {
    title: string;
    content: string | HTMLElement;
    footer?: HTMLElement;
    width?: string;
    onClose?: () => void;
  }) => HTMLElement;
  closeModal: (overlay: HTMLElement, onClose?: () => void) => void;
  confirm: (message: string, onYes: () => void, onNo?: () => void) => void;
  openEffectPicker: (onPick: (effectId: string) => void) => void;
  createTagInput: (opts: {
    tags: string[];
    onChange?: (tags: string[]) => void;
    placeholder?: string;
    suggestions?: string[];
  }) => HTMLElement & { _getTags(): string[]; _setTags(t: string[]): void };
}

// ── UNIFIED ACCESS ───────────────────────────────────────────────────
export function cjs(): CjsEditor {
  return getEditorCjs();
}

export function ds(): DataStoreFull {
  const d = cjs().DataStore as unknown as DataStoreFull;
  if (!d) throw new Error("CJS.DataStore is not initialized");
  return d;
}

export function cm(): ContentManagerFull {
  const m = cjs().ContentManager as unknown as ContentManagerFull;
  if (!m) throw new Error("CJS.ContentManager is not initialized");
  return m;
}

export function ui(): UiHelpersFull {
  const u = cjs().UI as unknown as UiHelpersFull;
  if (!u) throw new Error("CJS.UI is not initialized");
  return u;
}

export function constants(): CjsConstants {
  const c = (cjs() as unknown as { CONST?: CjsConstants }).CONST;
  if (!c) throw new Error("CJS.CONST is not initialized");
  return c;
}

export interface PortraitWidget {
  el: HTMLElement;
  getValue: () => string;
  getFocus: () => unknown;
  setFallbackIcon: (icon: string) => void;
}

export interface PortraitPickerApi {
  loadManifest: () => Promise<unknown>;
  createWidget: (opts: {
    currentPath?: string;
    currentFocus?: unknown;
    category?: string;
    id?: string;
    name?: string;
    fallbackIcon?: string;
  }) => PortraitWidget;
}

export function portraitPicker(): PortraitPickerApi | null {
  return (
    (cjs() as unknown as { PortraitPicker?: PortraitPickerApi }).PortraitPicker || null
  );
}

export interface AudioManagerApi {
  loadManifest: () => Promise<unknown>;
  getManifest: () => { sfx?: Record<string, unknown>; music?: Record<string, unknown> };
  playSfx: (key: string, opts?: Record<string, unknown>) => void;
}

export function audioManager(): AudioManagerApi | null {
  return (
    (cjs() as unknown as { AudioManager?: AudioManagerApi }).AudioManager || null
  );
}

export function effectRegistry(): EffectRegistryApi {
  const r = (cjs() as unknown as { EffectRegistry?: EffectRegistryApi }).EffectRegistry;
  if (!r) throw new Error("CJS.EffectRegistry is not initialized");
  return r;
}

// Subscribes a callback to BOTH DataStore changes AND a custom
// `cjs:data-replaced` window event used by hot-reload / import paths
// that don't go through the per-entity DataStore mutation API.
export function subscribeData(cb: () => void): () => void {
  const off = ds().subscribe(() => cb());
  const onReplaced = () => cb();
  window.addEventListener("cjs:data-replaced", onReplaced);
  return () => {
    off();
    window.removeEventListener("cjs:data-replaced", onReplaced);
  };
}
