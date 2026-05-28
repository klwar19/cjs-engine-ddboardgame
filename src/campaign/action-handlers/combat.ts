// combat.ts — Phase H.3 combat execution / resolution / selection handlers.
//
// Execution / resolution: run-battle opens the pending battle through
// CampaignCombatBridge (saving first, routing through the combat popup when
// present). apply-combat-result applies the returned result and clears it.
// manual-battle records a GM-entered result. run-next-beat advances the linear
// scenario beat. roll-travel-surprise forces a travel surprise.
//
// Selection: run-roll-battle (random table, else contextual world-pool roll),
// run-pick-battle (searchable encounter picker), run-queue-set-battle (queue an
// authored set battle), battle-reroll (reroll a random battle), battle-override
// (re-open the picker). These build the same pending-battle payloads as the
// deleted closures via the shared `battle-pool.ts` helpers (also used by the
// still-in-JS manual event builder). Op names, payload keys, sources, modal
// titles and the QP context wiring mirror the deleted closures exactly.

import { applyOp, cs, ds, mod, ops, toast } from "./context";
import { modals, type PickerOption } from "./modals";
import {
  battleContextFor,
  battleDefeatFields,
  battleMapForCard,
  fallbackBattlePool,
  pickContextualBattle,
  type BattleLike
} from "./battle-pool";

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
  rollRandomBattle?: (tableId: string) => unknown;
}
interface BattleSetForgeModule {
  getCards?: (opts?: { world?: string }) => BattleLike[];
}
interface Scenario {
  setting?: string;
  randomBattleTables?: Array<{ id?: string; name?: string; entries?: BattleLike[] }>;
  setBattles?: BattleLike[];
}
interface PickerEntry extends PickerOption {
  _battle?: BattleLike;
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

// ── Battle selection ──────────────────────────────────────────────
function activeScenario(): Scenario | null | undefined {
  return cs().getActiveScenario() as Scenario | null | undefined;
}

export function runRollBattle(): void {
  const scenario = activeScenario();
  const tables = scenario?.randomBattleTables || [];
  if (tables.length) {
    const pending = runner()?.rollRandomBattle?.(tables[0].id || "");
    if (!pending) toast("No battle rolled", "info");
    return;
  }
  const pool = fallbackBattlePool();
  if (!pool.length) {
    toast("No battles available in this world", "info");
    return;
  }
  const pick = pickContextualBattle(pool) || {};
  const questContext = battleContextFor(pick);
  const pending = {
    encounterId: pick.encounterId || null,
    battleSetId: pick.battleSetId || null,
    monsterIds: pick.monsterIds || [],
    label: pick.label,
    source: "random",
    rewardOps: pick.rewardOps || [],
    ...battleDefeatFields(pick),
    objective: pick.objective || "",
    notes: pick.notes || "",
    battleMap: pick.battleMap || null,
    setting: pick.setting || scenario?.setting || null,
    tags: pick.tags || [],
    contextTags: questContext?.contextTags || [],
    monsterTags: questContext?.monsterTags || pick.monsterTags || [],
    questId: questContext?.questId || null,
    questChainId: questContext?.questChainId || null,
    objectiveId: questContext?.objectiveId || null,
    questContext
  };
  cs().mutate((state) => {
    state.pendingBattle = pending;
    const run = state.activeScenarioRun as { randomBattlesUsed?: number } | null;
    if (run) run.randomBattlesUsed = (run.randomBattlesUsed || 0) + 1;
  }, { source: "random_battle_fallback" });
  ops().apply({ op: "log", text: `Random battle rolled (world pool): ${pending.label}.` }, { source: "random_battle" });
}

export function runPickBattle(): void {
  const scenario = activeScenario();
  const seen = new Map<string, PickerEntry>();
  for (const set of scenario?.setBattles || []) {
    const value = set.id || set.battleSetId || set.encounterId;
    if (!value || seen.has(value)) continue;
    seen.set(value, { value, label: set.label || set.name || set.encounterId || set.battleSetId || value, sub: "scenario", _battle: set });
  }
  for (const table of scenario?.randomBattleTables || []) {
    for (const entry of table.entries || []) {
      const value = entry.id || entry.battleSetId || entry.encounterId;
      if (!value || seen.has(value)) continue;
      seen.set(value, { value, label: entry.label || entry.encounterId || entry.battleSetId || value, sub: table.name || table.id, _battle: entry });
    }
  }
  for (const card of mod<BattleSetForgeModule>("CampaignBattleSetForge")?.getCards?.() || []) {
    if (!card.id || seen.has(card.id)) continue;
    seen.set(card.id, {
      value: card.id,
      label: card.name || card.id,
      sub: `battle set ${card.rank || ""}`.trim(),
      _battle: {
        battleSetId: card.id,
        encounterId: card.encounterId || null,
        label: card.name || card.id,
        rewardOps: card.rewardOps || [],
        ...battleDefeatFields(card),
        objective: card.objective || "",
        notes: card.gimmick || "",
        battleMap: battleMapForCard(card),
        tags: card.tags || [],
        contextTags: card.tags || [],
        monsterTags: card.tags || []
      }
    });
  }
  const world = cs().getState()?.currentWorld;
  for (const enc of (ds()?.getAllAsArray("encounters") as BattleLike[] | undefined) || []) {
    if (!enc.id || seen.has(enc.id)) continue;
    if (enc._world && enc._world !== world) continue;
    seen.set(enc.id, { value: enc.id, label: enc.name || enc.id, sub: enc._world || "all" });
  }
  const options = Array.from(seen.values()).sort((a, b) => String(a.label).localeCompare(String(b.label)));
  if (!options.length) {
    toast("No encounters available", "info");
    return;
  }
  modals()?.opPickerModal({
    title: "Pick Battle",
    options,
    placeholder: "Search encounters…",
    primaryLabel: "Queue Battle",
    onSubmit: ({ value }) => {
      const opt = seen.get(value);
      const battle = opt?._battle || {};
      const context = battleContextFor(battle);
      const pending = {
        encounterId: battle.battleSetId ? battle.encounterId || null : battle.encounterId || value,
        battleSetId: battle.battleSetId || null,
        label: battle.label || opt?.label || value,
        source: "manual_pick",
        rewardOps: battle.rewardOps || [],
        ...battleDefeatFields(battle),
        objective: battle.objective || "",
        notes: battle.notes || "",
        battleMap: battle.battleMap || null,
        tags: battle.tags || [],
        contextTags: context?.contextTags || [],
        monsterTags: context?.monsterTags || battle.monsterTags || [],
        questContext: context
      };
      cs().mutate((state) => {
        state.pendingBattle = pending;
      }, { source: "run_pick_battle" });
      ops().apply({ op: "log", text: `Battle queued (manual pick): ${pending.label}.` }, { source: "run" });
    }
  });
}

export function runQueueSetBattle(battleId: string): void {
  const scenario = activeScenario();
  const battle = (scenario?.setBattles || []).find(
    (b) => b.id === battleId || b.encounterId === battleId || b.battleSetId === battleId
  );
  if (!battle) {
    toast("Set battle not found", "error");
    return;
  }
  const context = battleContextFor(battle);
  const pending = {
    encounterId: battle.encounterId || null,
    battleSetId: battle.battleSetId || null,
    label: battle.label || battle.name || battle.encounterId || battle.battleSetId,
    source: "set",
    rewardOps: battle.rewardOps || [],
    ...battleDefeatFields(battle),
    objective: battle.objective || "",
    notes: battle.notes || "",
    battleMap: battle.battleMap || null,
    tags: battle.tags || [],
    contextTags: context?.contextTags || [],
    monsterTags: context?.monsterTags || battle.monsterTags || [],
    questContext: context
  };
  cs().mutate((state) => {
    state.pendingBattle = pending;
  }, { source: "run_set_battle" });
  ops().apply({ op: "log", text: `Set battle queued: ${pending.label}.` }, { source: "run" });
}

export function battleReroll(): void {
  const battle = (cs().getState() as { pendingBattle?: { source?: string; tableId?: string } } | null)?.pendingBattle;
  if (!battle || battle.source !== "random") {
    toast("Only random battles can be rerolled", "info");
    return;
  }
  const tables = (activeScenario()?.randomBattleTables) || [];
  const tableId = battle.tableId || tables[0]?.id;
  if (!tableId) {
    toast("No random table to reroll from", "info");
    return;
  }
  runner()?.rollRandomBattle?.(tableId);
}

export function battleOverride(): void {
  const battle = (cs().getState() as { pendingBattle?: unknown } | null)?.pendingBattle;
  if (!battle) return;
  runPickBattle();
}
