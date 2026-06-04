// downtime.ts — Phase H.3 between-battle downtime actions.
//
// rel-activity runs a relationship_activity op (respecting the per-phase
// activity-act budget), then surfaces the authored narrative beat (or a
// toast). camp-rest opens the consume-item + danger-change modal and
// applies a camp_rest op. Op names, payload keys, the `relationships_ui` /
// `ui` sources, modal copy and the narrative-modal markup mirror the
// deleted `_doRelActivity` / `_relationshipNarrativeModal` / `_campRestModal`
// closures.

import { applyOp, cs, ds, toast } from "./context";
import { esc, modals, options, widgets } from "./modals";
import { ACTIVITIES } from "../tabs/data/relationships";

interface Narrative {
  characterId?: string;
  activityId?: string;
  text?: string;
  blocked?: boolean;
  amount?: number | string;
  field?: string;
  title?: string;
}

function relationshipNarrativeModal(narrative: Narrative): void {
  const ui = widgets();
  if (!ui) return;
  const body = document.createElement("div");
  body.className = "campaign-relationship-narrative";
  body.innerHTML = `
      <div class="campaign-quest-narrative">
        <p>${esc(narrative.text || "A small moment passes between you.")}</p>
        ${narrative.blocked ? "" : `<p class="campaign-muted">+${esc(narrative.amount || 0)} ${esc(narrative.field || "bond")}</p>`}
      </div>
    `;
  const footer = document.createElement("div");
  const close = document.createElement("button");
  close.className = "btn btn-primary";
  close.textContent = "Continue";
  footer.appendChild(close);
  const overlay = ui.openModal({
    title: narrative.title || "Relationship Moment",
    content: body,
    footer,
    width: "420px"
  });
  close.onclick = () => ui.closeModal(overlay);
}

export function doRelActivity(characterId: string, activityId: string): void {
  if (!characterId) {
    toast("Pick a character first", "info");
    return;
  }
  const acts = (cs().getState() as { relationshipActs?: { remaining?: number } } | null)?.relationshipActs;
  if (acts && Number(acts.remaining || 0) <= 0) {
    toast("No activity acts left. Pass a phase to refresh.", "info");
    return;
  }
  applyOp({ op: "relationship_activity", characterId, activityId: activityId || "hang_out" }, "relationships_ui");
  const narrative = (cs().getState() as { lastRelationshipNarrative?: Narrative } | null)?.lastRelationshipNarrative;
  if (narrative?.characterId === characterId && narrative?.activityId === (activityId || "hang_out")) {
    relationshipNarrativeModal(narrative);
    return;
  }
  const def = ACTIVITIES.find((a) => a.id === activityId);
  if (def) {
    const charBase = ds()?.get("characters", characterId) as { name?: string } | undefined;
    const name = charBase?.name || characterId;
    toast(`${def.label}: ${name} (${def.hint})`, "success");
  }
}

export function campRestModal(): void {
  const ui = widgets();
  const m = modals();
  if (!ui || !m) return;
  const tentOptions = options()?.tentOptions() ?? [];
  const body = document.createElement("div");
  body.appendChild(m.formLabel("Consume Item (optional)"));
  const select = ui.createSearchableSelect({
    options: [{ value: "", label: "— None (no item consumed) —" }, ...tentOptions],
    value: tentOptions.find((opt) => opt.value === "haven_basic_tent") ? "haven_basic_tent" : "",
    placeholder: "Search items…"
  });
  body.appendChild(select);
  body.appendChild(m.formLabel("Danger change"));
  const danger = ui.createNumberSlider({ value: 1, min: -3, max: 5, step: 1 });
  body.appendChild(danger);
  m.formModal({
    title: "Camp Rest",
    body,
    primaryLabel: "Camp",
    onSubmit: () => {
      const consumeItem = select._getValue() || null;
      const op: { op: string; dangerChange: number; consumeItem?: string } = {
        op: "camp_rest",
        dangerChange: danger._getValue() || 0
      };
      if (consumeItem) op.consumeItem = consumeItem;
      applyOp(op);
    }
  });
}
