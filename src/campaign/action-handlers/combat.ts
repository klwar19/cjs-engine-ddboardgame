// combat.ts — Phase H.3 combat execution / resolution handlers.
//
// run-battle opens the pending battle through CampaignCombatBridge (saving
// first, and routing through the combat popup when present). apply-combat-result
// applies the returned result and clears it. manual-battle records a GM-entered
// result. run-next-beat advances the linear scenario beat. roll-travel-surprise
// forces a travel surprise. These touch only engine modules (CampaignCombatBridge
// / ScenarioRunner / CampaignSave / CampaignCombatPopup) + CampaignOps, with no
// shared battle-selection helpers, so they port cleanly. Toast strings, op
// names, the `combat_bridge`/`ui` sources and guards mirror the deleted closures.
//
// The battle-selection actions (run-roll-battle / run-pick-battle /
// run-queue-set-battle / battle-reroll / battle-override) stay in the switch:
// they share `_battleDefeatFields` / `_battleMapFor*` / `_fallbackBattlePool`
// with the manual event builder, so they port with that cluster.

import { applyOp, cs, mod, toast } from "./context";

interface PendingBattle {
  encounterId?: string | null;
  battleSetId?: string | null;
  monsterIds?: string[];
}

interface CombatBridgeModule {
  applyResult: (result: unknown) => void;
  openBattle: (battle: unknown) => void;
  isMemberBattleReady?: (member: unknown) => boolean;
}
interface RunnerModule {
  advanceLinearBeat?: () => unknown;
  rollTravelSurprise?: (cfg: { force?: boolean }) => { title?: string; category?: string } | null | undefined;
}
interface SaveModule {
  saveCurrent?: () => void;
}
interface CombatPopupModule {
  show?: (battle: unknown, opts: { onEngage: (b: unknown) => void }) => void;
}
interface WidgetsModalApi {
  openModal: (cfg: { title?: string; content?: HTMLElement; footer?: HTMLElement; width?: string }) => unknown;
  closeModal: (overlay: unknown) => void;
}

function bridge(): CombatBridgeModule | undefined {
  return mod<CombatBridgeModule>("CampaignCombatBridge");
}
function runner(): RunnerModule | undefined {
  return mod<RunnerModule>("ScenarioRunner");
}

export function runBattle(): void {
  const state = cs().getState() as { pendingBattle?: PendingBattle; party?: Record<string, unknown> } | null;
  const battle = state?.pendingBattle;
  if (!battle) return;
  if (!battle.encounterId && !battle.battleSetId && !battle.monsterIds?.length) {
    toast("This battle needs an encounter, battle set, or monster pool first.", "info");
    return;
  }
  const b = bridge();
  const readyCount = Object.values(state?.party || {}).filter((member) => b?.isMemberBattleReady?.(member)).length;
  if (!readyCount) {
    toast("No available party members can enter this battle", "error");
    return;
  }
  mod<SaveModule>("CampaignSave")?.saveCurrent?.();
  const popup = mod<CombatPopupModule>("CampaignCombatPopup");
  if (popup?.show) {
    popup.show(battle, {
      onEngage: (engaged) => {
        toast("Opening combat. Results apply automatically when you return.", "info");
        b?.openBattle(engaged);
      }
    });
    return;
  }
  toast("Opening combat. Results apply automatically when you return.", "info");
  b?.openBattle(battle);
}

export function applyCombatResult(): void {
  const result = (cs().getState() as { pendingBattleResult?: unknown } | null)?.pendingBattleResult;
  if (!result) return;
  bridge()?.applyResult(result);
  cs().mutate((state) => {
    (state as { pendingBattleResult?: unknown }).pendingBattleResult = null;
  }, { source: "combat_bridge" });
}

export function manualBattleModal(): void {
  const ui = mod<WidgetsModalApi>("UI");
  if (!ui) return;
  const body = document.createElement("div");
  body.innerHTML = `
      <label class="form-label">Result</label>
      <select id="campaign-manual-result"><option value="victory">Victory (battle rewards)</option><option value="defeat">Defeat (setback penalty)</option><option value="draw">Draw (small setback)</option></select>
      <div class="campaign-muted" style="margin:8px 0 10px">Defeat and draw keep the party alive by default, then apply danger and currency penalties unless this battle has authored consequences.</div>
      <label class="form-label">Summary</label>
      <textarea id="campaign-manual-summary"></textarea>
    `;
  const footer = document.createElement("div");
  footer.innerHTML = '<button class="btn btn-primary">Apply</button>';
  const overlay = ui.openModal({ title: "Manual Battle Result", content: body, footer, width: "480px" });
  const button = footer.querySelector("button");
  if (button) {
    button.onclick = () => {
      const resultEl = body.querySelector("#campaign-manual-result") as HTMLSelectElement | null;
      const summaryEl = body.querySelector("#campaign-manual-summary") as HTMLTextAreaElement | null;
      applyOp({
        op: "manual_battle_result",
        result: resultEl?.value,
        summary: summaryEl?.value.trim()
      });
      ui.closeModal(overlay);
    };
  }
}

export function runNextBeat(): void {
  const beat = runner()?.advanceLinearBeat?.();
  if (!beat) toast("No more beats", "info");
}

export function rollTravelSurprise(): void {
  const result = runner()?.rollTravelSurprise?.({ force: true });
  if (!result) {
    toast("No travel surprise available right now", "info");
    return;
  }
  toast(result.title || "Travel surprise ready", result.category === "battle" ? "warning" : "success");
}
