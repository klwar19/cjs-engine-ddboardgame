// CampaignCraftCookTabs.tsx — JSX port of the vanilla `pocket-haven.js`
// `renderCraft` / `renderCook` islands (which shared one `_renderRecipeRow`).
// The make button dispatches via typed onClick (`craft-recipe` / `cook-food`)
// instead of the old data-* island markers that `htmlIslandActions.ts`
// translated. Row data is derived by tabs/data/recipes.ts.

import { Fragment } from "react";
import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import { getCraftRecipes, getCookFoods, type RecipeRow } from "./data/recipes";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignCraftTab({ state }: Props) {
  const recipes = getCraftRecipes(state);
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h3>Craft</h3>
      </div>
      {recipes.length ? (
        recipes.map((recipe) => <RecipeRowView key={recipe.id} recipe={recipe} kind="craft" />)
      ) : (
        <div className="campaign-empty">No recipes yet. Use GM Override for manual crafting.</div>
      )}
    </section>
  );
}

export function CampaignCookTab({ state }: Props) {
  const foods = getCookFoods(state);
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h3>Cook</h3>
      </div>
      {foods.length ? (
        foods.map((food) => <RecipeRowView key={food.id} recipe={food} kind="cook" />)
      ) : (
        <div className="campaign-empty">No food data yet. Use GM Override for manual cooking.</div>
      )}
    </section>
  );
}

function RecipeRowView({ recipe, kind }: { recipe: RecipeRow; kind: "craft" | "cook" }) {
  return (
    <div className="campaign-row">
      <div>
        <strong>
          {recipe.icon} {recipe.name}
        </strong>
        <div className="campaign-muted">{recipe.description}</div>
        {recipe.buff ? <div className="campaign-muted">{recipe.buff}</div> : null}
        {recipe.ingredients.length ? (
          <div className="campaign-muted" style={{ fontSize: "0.85em" }}>
            Needs:{" "}
            {recipe.ingredients.map((ing, index) => (
              <Fragment key={index}>
                {index > 0 ? " · " : ""}
                <span style={{ color: ing.ok ? "var(--green)" : "var(--red)" }}>{ing.text}</span>
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="campaign-muted" style={{ fontSize: "0.8em" }}>
            No ingredients required.
          </div>
        )}
        {recipe.outputText ? (
          <div className="campaign-muted" style={{ fontSize: "0.85em" }}>
            Makes: {recipe.outputText}
          </div>
        ) : null}
      </div>
      <MakeButton recipe={recipe} kind={kind} />
    </div>
  );
}

function MakeButton({ recipe, kind }: { recipe: RecipeRow; kind: "craft" | "cook" }) {
  if (!recipe.canMake) {
    return (
      <button className="campaign-action" disabled title="Missing ingredients">
        Need Ingredients
      </button>
    );
  }
  if (kind === "cook") {
    return (
      <button className="campaign-action" onClick={() => dispatchCampaignAction("cook-food", { foodId: recipe.id })}>
        Cook
      </button>
    );
  }
  return (
    <button className="campaign-action" onClick={() => dispatchCampaignAction("craft-recipe", { recipeId: recipe.id })}>
      Craft
    </button>
  );
}
