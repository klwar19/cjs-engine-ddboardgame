// farm.ts — typed data builder for the Pocket Haven Farm tab JSX port.
//
// Faithful read-side port of the RENDER half of `js/campaign/farming-mode.js`
// (renderFarm + _renderTiles / _renderTool / _renderTileMenu / _renderQteWindow
// / _renderTileDetail / _actionLabel / _tileActionOptions and the pure tile /
// crop / slot read helpers). ALL stateful operations, QTE-hit timing, growth
// ticks and `normalizeFarm` stay in `farming-mode.js` (invoked via the farm.ts
// action handlers); this module only DERIVES the view model the JSX renders, so
// no behaviour/timing logic is duplicated. The QTE bar is CSS-animated
// (`--qte-duration`), so the static view model is enough.

import type { CampaignStateSnapshot } from "../../store";

export interface FarmDirection {
  readonly x: number;
  readonly y: number;
  readonly label: string;
}
export const DIRECTIONS: Readonly<Record<string, FarmDirection>> = {
  up: { x: 0, y: -1, label: "North" },
  down: { x: 0, y: 1, label: "South" },
  left: { x: -1, y: 0, label: "West" },
  right: { x: 1, y: 0, label: "East" }
};

export interface FarmTool {
  readonly id: string;
  readonly label: string;
  readonly glyph: string;
}
export const TOOLS: readonly FarmTool[] = [
  { id: "hand", label: "Hand", glyph: "A" },
  { id: "hoe", label: "Hoe", glyph: "H" },
  { id: "seed", label: "Seed", glyph: "S" },
  { id: "water", label: "Water", glyph: "W" },
  { id: "fertilizer", label: "Fertilizer", glyph: "F" },
  { id: "scythe", label: "Scythe", glyph: "C" }
];

const QTE_TARGET_WIDTH = 18;
const QTE_DEFAULT_DURATION = 1500;
const DEFAULT_FERTILIZER_ID = "haven_basic_fertilizer";

// ── Engine surfaces ───────────────────────────────────────────────────
interface CropRecord {
  id?: string;
  name?: string;
  _world?: string;
  growthTicks?: number;
  stages?: Array<{ id?: string }>;
  readyGlyph?: string;
  midGlyph?: string;
  sproutGlyph?: string;
}
interface DataStoreSurface {
  readonly get?: (bucket: string, id: string) => CropRecord | null | undefined;
  readonly getAllAsArray?: (bucket: string) => CropRecord[];
}
interface FarmingModeModule {
  readonly normalizeFarm?: (rawFarm?: unknown, options?: unknown) => FarmState;
}
interface FarmCjs {
  readonly DataStore?: DataStoreSurface;
  readonly FarmingMode?: FarmingModeModule;
}
function cjs(): FarmCjs {
  return (window as unknown as { CJS?: FarmCjs }).CJS ?? {};
}
function ds(): DataStoreSurface | undefined {
  return cjs().DataStore;
}

// ── Farm state shape (read-only view of the normalized farm) ───────────
export interface FarmTile {
  terrain?: string;
  grass?: boolean;
  tilled?: boolean;
  watered?: boolean;
  fertilized?: boolean;
  cared?: boolean;
  blocked?: boolean;
  seedId?: string | null;
  cropId?: string | null;
  progress?: number;
  required?: number;
  ready?: boolean;
  neglect?: number;
}
interface FarmPlayer {
  x: number;
  y: number;
  facing: string;
}
interface FarmQte {
  available?: boolean;
  active?: boolean;
  streak?: number;
  startedAt?: number;
  duration?: number;
  targetStart?: number;
  targetWidth?: number;
}
interface FarmState {
  width: number;
  height: number;
  player: FarmPlayer;
  selectedTool: string;
  selectedSeed: string;
  selectedFertilizer?: string;
  cropSlots: string[];
  unlockedCropSlots: number;
  maxCropSlots: number;
  seedStock: Record<string, number>;
  fertilizerStock: Record<string, number>;
  tools: Record<string, { level?: number }>;
  tiles: Record<string, FarmTile>;
  recent: string[];
  qte: FarmQte;
  bonusHarvests: number;
  lastClickedTile: string | null;
  actionMenu: { x: number; y: number } | null;
}
interface FarmStateContainer {
  currentWorld?: string;
  inventory?: { materials?: Record<string, number> };
  pocketHaven?: { farm?: FarmState };
}

// ── Pure read helpers (ported 1:1) ─────────────────────────────────────
function key(x: number, y: number): string {
  return `${x},${y}`;
}
function className(value: unknown): string {
  return String(value || "").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}
function clampInt(value: number, min: number, max: number): number {
  const n = Math.round(Number(value || min));
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}
function coordsInside(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}
function inside(farm: FarmState, x: number, y: number): boolean {
  return coordsInside(farm.width, farm.height, x, y);
}
function crop(seedId: string | null | undefined): CropRecord | null {
  return seedId ? ds()?.get?.("crops", seedId) || null : null;
}
function name(type: string, id: string): string {
  return ds()?.get?.(type, id)?.name || id;
}
function stockQty(stock: Record<string, number> | undefined, id: string): number {
  return Math.max(0, Number(stock?.[id] || 0));
}
function fertilizerAvailable(state: FarmStateContainer, farm: FarmState): number {
  const id = farm.selectedFertilizer || DEFAULT_FERTILIZER_ID;
  return stockQty(farm.fertilizerStock, id) + Number(state.inventory?.materials?.[id] || 0);
}
function defaultTile(x: number, y: number): FarmTile {
  return {
    terrain: "grass",
    grass: (x * 7 + y * 11) % 5 === 0,
    tilled: false,
    watered: false,
    fertilized: false,
    blocked: false
  };
}
function tileAt(farm: FarmState, x: number, y: number): FarmTile {
  return farm.tiles?.[key(x, y)] || defaultTile(x, y);
}
function targetCell(farm: FarmState): { x: number; y: number } {
  const delta = DIRECTIONS[farm.player.facing] || DIRECTIONS.down;
  return { x: farm.player.x + delta.x, y: farm.player.y + delta.y };
}
function isUnlockedCropSlot(farm: FarmState, k: string): boolean {
  const index = farm.cropSlots.indexOf(k);
  return index >= 0 && index < farm.unlockedCropSlots;
}
function isLockedCropSlot(farm: FarmState, k: string): boolean {
  const index = farm.cropSlots.indexOf(k);
  return index >= 0 && index >= farm.unlockedCropSlots;
}
function isCropSlot(farm: FarmState, k: string): boolean {
  return farm.cropSlots.indexOf(k) >= 0;
}
function canStandOnTile(farm: FarmState, x: number, y: number): boolean {
  if (!inside(farm, x, y)) return false;
  if (tileAt(farm, x, y).blocked) return false;
  return !isLockedCropSlot(farm, key(x, y));
}
function cropOptions(world: string | undefined): CropRecord[] {
  const all = ds()?.getAllAsArray?.("crops") || [];
  return all.filter((c) => !c._world || !world || c._world === world);
}
function seedOptions(world: string | undefined): CropRecord[] {
  const crops = cropOptions(world);
  if (crops.length) return crops;
  return [{ id: "haven_frostcap_seed", name: "Frostcap Seed", growthTicks: 3 }];
}
function cropStage(tile: FarmTile, c: CropRecord | null): string {
  const stages = c?.stages || [];
  if (!stages.length) return tile.ready ? "ready" : "growing";
  if (tile.ready) return stages[stages.length - 1]?.id || "ready";
  const pct = Number(tile.progress || 0) / Math.max(1, Number(tile.required || c?.growthTicks || 3));
  const index = Math.min(stages.length - 1, Math.floor(pct * stages.length));
  return stages[index]?.id || `stage-${index + 1}`;
}
function cropGlyph(tile: FarmTile, c: CropRecord | null): string {
  if (tile.ready) return c?.readyGlyph || "!";
  const pct = Number(tile.progress || 0) / Math.max(1, Number(tile.required || c?.growthTicks || 3));
  if (pct >= 0.66) return c?.midGlyph || "o";
  if (pct >= 0.33) return c?.sproutGlyph || "v";
  return ".";
}
function tileLabel(tile: FarmTile, c: CropRecord | null, locked: boolean): string {
  if (locked) return "Locked crop slot";
  if (c) return `${c.name || c.id} ${tile.ready ? "ready" : "growing"}`;
  if (tile.grass) return "Tall grass";
  if (tile.tilled) return "Prepared soil";
  return "Farm ground";
}
function tileKind(tile: FarmTile, slotIndex: number, unlocked: boolean): string {
  if (slotIndex >= 0) return unlocked ? "Open Crop Slot" : "Locked Crop Slot";
  if (tile.grass) return "Tall Grass";
  return tile.tilled ? "Prepared Soil" : "Farm Ground";
}
function toolLabel(id: string): string {
  return TOOLS.find((tool) => tool.id === id)?.label || id;
}
function actionLabel(farm: FarmState, tile: FarmTile): string {
  const tool = farm.selectedTool || "hand";
  if (tool === "hand" && tile.seedId && tile.ready) return "Harvest";
  if (tool === "hand") return "Take Care";
  if (tool === "hoe") return "Plough";
  if (tool === "seed") return "Plant";
  if (tool === "water") return "Water";
  if (tool === "fertilizer") return "Fertilize";
  if (tool === "scythe") return "Cut";
  return toolLabel(tool);
}

export interface FarmTileActionOption {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly primary: boolean;
  readonly hint: string;
}

function tileActionOptions(
  state: FarmStateContainer,
  farm: FarmState,
  tile: FarmTile,
  target: { x: number; y: number }
): FarmTileActionOption[] {
  const k = key(target.x, target.y);
  const locked = isLockedCropSlot(farm, k);
  const distance = Math.abs(target.x - farm.player.x) + Math.abs(target.y - farm.player.y);
  const seedId = farm.selectedSeed;
  const seedName = name("crops", seedId);
  const seedQty = stockQty(farm.seedStock, seedId);
  const fertilizerQty = fertilizerAvailable(state, farm);
  const adjacent = distance === 1;
  const out: FarmTileActionOption[] = [];

  out.push({
    id: "move",
    label: "Move Here",
    enabled: adjacent && canStandOnTile(farm, target.x, target.y),
    primary: false,
    hint: locked ? "Slot locked" : adjacent ? "" : "Stand next to it"
  });

  if (locked) {
    out.push({ id: "hoe", label: "Locked Slot", enabled: false, primary: false, hint: "Unlock more crop slots first" });
    return out;
  }

  if (tile.seedId) {
    out.push({
      id: tile.ready ? "harvest" : "care",
      label: tile.ready ? "Harvest" : "Take Care",
      enabled: adjacent,
      primary: !!tile.ready,
      hint: adjacent ? (tile.ready ? "Collect crop" : "Reset neglect") : "Stand next to it"
    });
  } else {
    out.push({
      id: "hoe",
      label: "Plough",
      enabled: adjacent && isUnlockedCropSlot(farm, k) && !tile.tilled,
      primary: !tile.tilled && isUnlockedCropSlot(farm, k),
      hint: !isCropSlot(farm, k) ? "Not a crop slot" : tile.tilled ? "Already prepared" : ""
    });
  }

  out.push({
    id: "seed",
    label: "Plant Seed",
    enabled: adjacent && isUnlockedCropSlot(farm, k) && !!tile.tilled && !tile.seedId && seedQty > 0,
    primary: adjacent && !!tile.tilled && !tile.seedId && seedQty > 0,
    hint: seedQty <= 0 ? `Need ${seedName}` : !tile.tilled ? "Plough first" : tile.seedId ? "Already planted" : `${seedName} x${seedQty}`
  });

  out.push({
    id: "water",
    label: "Water",
    enabled: adjacent && (!!tile.tilled || !!tile.seedId) && !tile.watered,
    primary: false,
    hint: tile.watered ? "Already watered" : !tile.tilled && !tile.seedId ? "Needs prepared soil" : ""
  });

  out.push({
    id: "fertilizer",
    label: "Fertilize",
    enabled: adjacent && (!!tile.tilled || !!tile.seedId) && !tile.fertilized && fertilizerQty > 0,
    primary: false,
    hint: fertilizerQty <= 0 ? "Craft or find fertilizer" : tile.fertilized ? "Already fertilized" : `Stock ${fertilizerQty}`
  });

  out.push({
    id: "scythe",
    label: "Cut Grass",
    enabled: adjacent && !!tile.grass && !tile.seedId,
    primary: false,
    hint: tile.grass ? "Gives clippings" : "No tall grass"
  });

  return out;
}

// ── View models ────────────────────────────────────────────────────────
export interface FarmTileView {
  readonly x: number;
  readonly y: number;
  readonly className: string;
  readonly label: string;
  readonly hasGrass: boolean;
  readonly cropGlyph: string | null;
  readonly cropStageClass: string;
  readonly isPlayer: boolean;
}
export interface FarmToolView {
  readonly id: string;
  readonly label: string;
  readonly glyph: string;
  readonly glyphClass: string;
  readonly level: number;
  readonly active: boolean;
}
export interface FarmSeedOption {
  readonly id: string;
  readonly label: string;
  readonly selected: boolean;
}
export interface FarmDetail {
  readonly title: string;
  readonly facingLabel: string;
  readonly progress: string;
  readonly soil: string;
  readonly water: string;
  readonly fertilizer: string;
}
export interface FarmTileMenu {
  readonly x: number;
  readonly y: number;
  readonly title: string;
  readonly subtitle: string;
  readonly meta: readonly string[];
  readonly options: readonly FarmTileActionOption[];
}
export interface FarmQteView {
  readonly targetStart: number;
  readonly targetWidth: number;
  readonly duration: number;
}
export interface FarmData {
  readonly subtitle: string;
  readonly qteAvailable: boolean;
  readonly qteActive: boolean;
  readonly hasTileMenu: boolean;
  readonly width: number;
  readonly tiles: readonly FarmTileView[];
  readonly tools: readonly FarmToolView[];
  readonly seedOptions: readonly FarmSeedOption[];
  readonly mainActionLabel: string;
  readonly detail: FarmDetail;
  readonly recent: readonly string[];
  readonly tileMenu: FarmTileMenu | null;
  readonly qte: FarmQteView | null;
}

function buildTiles(farm: FarmState, targetKey: string): FarmTileView[] {
  const cells: FarmTileView[] = [];
  const playerKey = key(farm.player.x, farm.player.y);
  for (let y = 0; y < farm.height; y++) {
    for (let x = 0; x < farm.width; x++) {
      const k = key(x, y);
      const tile = tileAt(farm, x, y);
      const c = tile.seedId ? crop(tile.seedId) : null;
      const stage = c ? cropStage(tile, c) : "";
      const distance = Math.abs(farm.player.x - x) + Math.abs(farm.player.y - y);
      const slotIndex = farm.cropSlots.indexOf(k);
      const locked = slotIndex >= 0 && slotIndex >= farm.unlockedCropSlots;
      const isPlayer = k === playerKey;
      const classes = [
        "farm-tile",
        `terrain-${className(tile.terrain || "grass")}`,
        tile.tilled ? "is-tilled" : "",
        tile.watered ? "is-watered" : "",
        tile.fertilized ? "is-fertilized" : "",
        tile.grass ? "has-grass" : "",
        tile.seedId ? "has-crop" : "",
        tile.ready ? "is-ready" : "",
        k === targetKey ? "is-target" : "",
        k === farm.lastClickedTile ? "is-click-goal" : "",
        distance === 1 ? "is-neighbor" : "",
        isPlayer ? `is-player facing-${className(farm.player.facing)}` : "",
        locked ? "is-locked-slot" : "",
        slotIndex >= 0 && !locked ? "is-crop-slot" : ""
      ]
        .filter(Boolean)
        .join(" ");
      cells.push({
        x,
        y,
        className: classes,
        label: tileLabel(tile, c, locked),
        hasGrass: !!tile.grass,
        cropGlyph: tile.seedId ? cropGlyph(tile, c) : null,
        cropStageClass: stage,
        isPlayer
      });
    }
  }
  return cells;
}

function buildTileMenu(state: FarmStateContainer, farm: FarmState): FarmTileMenu | null {
  const menu = farm.actionMenu;
  if (!menu || !inside(farm, menu.x, menu.y)) return null;
  const tile = tileAt(farm, menu.x, menu.y);
  const c = tile.seedId ? crop(tile.seedId) : null;
  const k = key(menu.x, menu.y);
  const slotIndex = farm.cropSlots.indexOf(k);
  const locked = isLockedCropSlot(farm, k);
  const unlocked = isUnlockedCropSlot(farm, k);
  const title = c ? c.name || c.id || "" : tileKind(tile, slotIndex, unlocked);
  const meta: string[] = [];
  if (c) {
    const required = tile.required || c.growthTicks || 3;
    meta.push(`Growth ${Math.min(tile.progress || 0, required)}/${required}`);
  }
  meta.push(tile.tilled ? "Prepared soil" : "Wild ground");
  meta.push(tile.watered ? "Watered" : "Dry");
  if (tile.fertilized) meta.push("Fertilized");
  return {
    x: menu.x,
    y: menu.y,
    title,
    subtitle: locked ? "Locked crop slot" : `Tile ${menu.x + 1},${menu.y + 1}`,
    meta,
    options: tileActionOptions(state, farm, tile, menu)
  };
}

function buildDetail(farm: FarmState, tile: FarmTile, target: { x: number; y: number }): FarmDetail {
  const c = tile.seedId ? crop(tile.seedId) : null;
  const slotKey = key(target.x, target.y);
  const slotIndex = farm.cropSlots.indexOf(slotKey);
  const unlocked = isUnlockedCropSlot(farm, slotKey);
  const required = tile.required || c?.growthTicks || 3;
  return {
    title: c ? c.name || c.id || "" : tileKind(tile, slotIndex, unlocked),
    facingLabel: DIRECTIONS[farm.player.facing]?.label || "Target",
    progress: c ? `${Math.min(tile.progress || 0, required)}/${required}` : "none",
    soil: tile.tilled ? "Ready" : "Wild",
    water: tile.watered ? "Wet" : "Dry",
    fertilizer: tile.fertilized ? "Mixed" : "None"
  };
}

function fallbackFarm(): FarmState {
  return (
    cjs().FarmingMode?.normalizeFarm?.({}) || {
      width: 8,
      height: 6,
      player: { x: 1, y: 3, facing: "down" },
      selectedTool: "hand",
      selectedSeed: "",
      cropSlots: [],
      unlockedCropSlots: 0,
      maxCropSlots: 0,
      seedStock: {},
      fertilizerStock: {},
      tools: {},
      tiles: {},
      recent: [],
      qte: {},
      bonusHarvests: 0,
      lastClickedTile: null,
      actionMenu: null
    }
  );
}

export function getFarmData(state: CampaignStateSnapshot | null): FarmData {
  const container = (state || {}) as FarmStateContainer;
  const farm = container.pocketHaven?.farm || fallbackFarm();
  const target = targetCell(farm);
  const targetTile = tileAt(farm, target.x, target.y);
  const targetKey = key(target.x, target.y);
  const seedQty = stockQty(farm.seedStock, farm.selectedSeed);
  const fertilizerQty = fertilizerAvailable(container, farm);

  const subtitle =
    `Slots ${farm.unlockedCropSlots}/${farm.maxCropSlots} | Seeds ${seedQty} | Fertilizer ${fertilizerQty}` +
    (farm.bonusHarvests ? ` | Harvest bonus +${farm.bonusHarvests}` : "");

  const tools: FarmToolView[] = TOOLS.map((tool) => ({
    id: tool.id,
    label: tool.label,
    glyph: tool.glyph,
    glyphClass: className(tool.id),
    level: farm.tools?.[tool.id]?.level || 1,
    active: farm.selectedTool === tool.id
  }));

  const seedOptionList: FarmSeedOption[] = seedOptions(container.currentWorld).map((seed) => ({
    id: seed.id || "",
    label: `${seed.name || seed.id} (${stockQty(farm.seedStock, seed.id || "")})`,
    selected: seed.id === farm.selectedSeed
  }));

  const qte = farm.qte || {};
  const qteView: FarmQteView | null = qte.active
    ? {
        targetStart: clampInt(qte.targetStart || 40, 0, 90),
        targetWidth: clampInt(qte.targetWidth || QTE_TARGET_WIDTH, 8, 34),
        duration: clampInt(qte.duration || QTE_DEFAULT_DURATION, 900, 2400)
      }
    : null;

  return {
    subtitle,
    qteAvailable: !!qte.available,
    qteActive: !!qte.active,
    hasTileMenu: !!farm.actionMenu,
    width: farm.width,
    tiles: buildTiles(farm, targetKey),
    tools,
    seedOptions: seedOptionList,
    mainActionLabel: actionLabel(farm, targetTile),
    detail: buildDetail(farm, targetTile, target),
    recent: (farm.recent || []).slice(0, 4),
    tileMenu: buildTileMenu(container, farm),
    qte: qteView
  };
}
