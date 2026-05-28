// cooking.ts — Phase H.3 cooking handlers.
//
// `openCookingMinigame` launches the standalone CookingMinigame module
// (which applies its own cook_basic op) and toasts the grade. `cookFood`
// is the Cook-tab action: route through the minigame when it's loaded so
// timing affects buff potency / recipe discovery, otherwise fall back to
// an immediate cook_basic op. Shared by the cook-food and haven-open-cooking
// actions. Recipe lookup, op payload, grade toasts and the `ui` source
// mirror the deleted `_openCookingMinigame` closure + the cook-food case.

import { applyOp, ds, mod, rerender, toast } from "./context";

interface FoodDef {
  name?: string;
  inputs?: Record<string, unknown>;
}

interface CookingMinigameModule {
  open?: (cfg: { foodId: string; inputs: Record<string, unknown> }) => Promise<{ ok?: boolean; grade?: string } | undefined>;
}

function cooking(): CookingMinigameModule | undefined {
  return mod<CookingMinigameModule>("CookingMinigame");
}

export async function openCookingMinigame(foodId: string): Promise<void> {
  if (!foodId) return;
  const food = ds()?.get("food", foodId) as FoodDef | undefined;
  if (!food) {
    toast("Unknown recipe", "error");
    return;
  }
  // The minigame handles the cook_basic op itself; we just react to the
  // result so the UI refreshes and we acknowledge the grade.
  const result = await cooking()?.open?.({ foodId, inputs: food.inputs || {} });
  if (!result?.ok) return;
  if (result.grade === "perfect") {
    toast(`Perfect cook! ${food.name} buff potency boosted`, "success");
  } else if (result.grade === "burnt") {
    toast(`Burnt the ${food.name}…`, "info");
  } else {
    toast(`Cooked ${food.name} (${result.grade})`, "success");
  }
  rerender();
}

export function cookFood(foodId: string): void {
  // If the cooking minigame is loaded, route through it so timing affects
  // buff potency and recipes can be discovered. Falls back to the immediate
  // cook op when the minigame isn't available.
  if (cooking()?.open) {
    void openCookingMinigame(foodId);
    return;
  }
  const food = ds()?.get("food", foodId) as FoodDef | undefined;
  applyOp({
    op: "cook_basic",
    id: foodId,
    label: food?.name || foodId,
    inputs: food?.inputs || {},
    outputs: { food: { [foodId]: 1 } }
  });
}
