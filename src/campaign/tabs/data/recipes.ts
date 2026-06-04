// recipes.ts — typed data builder for the Craft + Cook tab JSX ports. Faithful
// port of the shared `_renderRecipeRow` / `_renderIngredientLine` /
// `_renderOutputLine` / `_bundleAvailable` logic from the vanilla
// `js/campaign/pocket-haven.js` island. Pure derivation from the CampaignState
// snapshot + `window.CJS.DataStore`; the JSX consumer renders typed onClick
// (`craft-recipe` / `cook-food`) instead of the old data-* island markers.

import type { CampaignStateSnapshot } from "../../store";

interface Bundle {
  readonly currencies?: Record<string, number>;
  readonly items?: Record<string, number>;
  readonly materials?: Record<string, number>;
  readonly food?: Record<string, number>;
  readonly questItems?: Record<string, number>;
  readonly seeds?: Record<string, number>;
  readonly farmFertilizer?: Record<string, number>;
}

interface RecipeRecord {
  readonly id?: string;
  readonly name?: string;
  readonly icon?: string;
  readonly description?: string;
  readonly _world?: string;
  readonly inputs?: Bundle;
  readonly outputs?: Bundle;
  readonly buff?: { stat?: string; amount?: number };
  readonly duration?: string;
}

interface DataStoreSurface {
  readonly get?: (bucket: string, id: string) => { name?: string } | null | undefined;
  readonly getAllAsArray?: (bucket: string) => RecipeRecord[];
}

function ds(): DataStoreSurface | undefined {
  return (window as unknown as { CJS?: { DataStore?: DataStoreSurface } }).CJS?.DataStore;
}

function recordName(type: string, id: string): string {
  return ds()?.get?.(type, id)?.name || id;
}

interface RecipeStateLike {
  readonly currencies?: Record<string, number>;
  readonly inventory?: Record<string, Record<string, number>>;
  readonly currentWorld?: string;
  readonly pocketHaven?: { farm?: { seedStock?: Record<string, number>; fertilizerStock?: Record<string, number> } };
}

export interface RecipeIngredient {
  readonly text: string;
  readonly ok: boolean;
}

export interface RecipeRow {
  readonly id: string;
  readonly icon: string;
  readonly name: string;
  readonly description: string;
  readonly buff: string;
  readonly ingredients: readonly RecipeIngredient[];
  readonly outputText: string;
  readonly canMake: boolean;
}

// Ingredient chips (materials, items, currencies — same order the island used).
function buildIngredients(state: RecipeStateLike, inputs: Bundle): RecipeIngredient[] {
  const out: RecipeIngredient[] = [];
  for (const [id, qty] of Object.entries(inputs.materials || {})) {
    const have = state.inventory?.materials?.[id] || 0;
    out.push({ text: `${recordName("materials", id)} ${have}/${qty}`, ok: have >= qty });
  }
  for (const [id, qty] of Object.entries(inputs.items || {})) {
    const have = state.inventory?.items?.[id] || 0;
    out.push({ text: `${recordName("items", id)} ${have}/${qty}`, ok: have >= qty });
  }
  for (const [id, qty] of Object.entries(inputs.currencies || {})) {
    const have = state.currencies?.[id] || 0;
    out.push({ text: `${id} ${have}/${qty}`, ok: have >= qty });
  }
  return out;
}

function buildOutputText(outputs: Bundle): string {
  const parts: string[] = [];
  for (const [id, qty] of Object.entries(outputs.items || {})) parts.push(`${qty} ${recordName("items", id)}`);
  for (const [id, qty] of Object.entries(outputs.materials || {})) parts.push(`${qty} ${recordName("materials", id)}`);
  for (const [id, qty] of Object.entries(outputs.food || {})) parts.push(`${qty} ${recordName("food", id)}`);
  for (const [id, qty] of Object.entries(outputs.seeds || {})) parts.push(`${qty} ${recordName("crops", id)}`);
  for (const [id, qty] of Object.entries(outputs.farmFertilizer || {})) parts.push(`${qty} ${recordName("materials", id)}`);
  return parts.join(" | ");
}

function bundleAvailable(state: RecipeStateLike, bundle: Bundle): boolean {
  for (const [id, qty] of Object.entries(bundle.currencies || {})) {
    if ((state.currencies?.[id] || 0) < Number(qty || 0)) return false;
  }
  for (const bucket of ["items", "materials", "food", "questItems"] as const) {
    for (const [id, qty] of Object.entries(bundle[bucket] || {})) {
      if ((state.inventory?.[bucket]?.[id] || 0) < Number(qty || 0)) return false;
    }
  }
  for (const [id, qty] of Object.entries(bundle.seeds || {})) {
    if ((state.pocketHaven?.farm?.seedStock?.[id] || 0) < Number(qty || 0)) return false;
  }
  for (const [id, qty] of Object.entries(bundle.farmFertilizer || {})) {
    if ((state.pocketHaven?.farm?.fertilizerStock?.[id] || 0) < Number(qty || 0)) return false;
  }
  return true;
}

function buildRow(state: RecipeStateLike, recipe: RecipeRecord): RecipeRow {
  const inputs = recipe.inputs || {};
  const buff = recipe.buff
    ? `Buff: ${recipe.buff.stat || ""} +${recipe.buff.amount || 0} (${recipe.duration || "next_battle"})`
    : "";
  return {
    id: recipe.id || "",
    icon: recipe.icon || "",
    name: recipe.name || recipe.id || "",
    description: recipe.description || "",
    buff,
    ingredients: buildIngredients(state, inputs),
    outputText: buildOutputText(recipe.outputs || {}),
    canMake: bundleAvailable(state, inputs)
  };
}

export function getCraftRecipes(state: CampaignStateSnapshot | null): readonly RecipeRow[] {
  const s = (state || {}) as RecipeStateLike;
  return (ds()?.getAllAsArray?.("crafting") || [])
    .filter((recipe) => !recipe._world || recipe._world === s.currentWorld)
    .map((recipe) => buildRow(s, recipe));
}

export function getCookFoods(state: CampaignStateSnapshot | null): readonly RecipeRow[] {
  const s = (state || {}) as RecipeStateLike;
  return (ds()?.getAllAsArray?.("food") || []).map((recipe) => buildRow(s, recipe));
}
