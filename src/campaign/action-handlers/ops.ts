// ops.ts — Phase H.3 thin engine-op action handlers.
//
// These are the one-line `_handleAction` cases that ran a single
// CampaignOps / CampaignState call (or a fixed toast) with no closure
// dependencies. Op names, payload keys and `source` values mirror the
// deleted switch cases exactly. (pass-phase lives in actions.ts as
// passPhase — pinned there by the bridge test — and is registered from
// there.)

import { applyOp, cs, toast } from "./context";

// ── Phase / rest ──────────────────────────────────────────────────
export function fullRest(): void {
  applyOp({ op: "full_rest" });
}

// ── Hub / review queue ────────────────────────────────────────────
export function reviewResolve(reviewId: string, decision: string): void {
  applyOp({ op: "review_queue_resolve", reviewId, decision });
}

export function resolveHubProblem(hubId: string, problemId: string): void {
  applyOp({ op: "hub_problem_remove", hubId, problemId });
}

// ── Quest ─────────────────────────────────────────────────────────
export function completeQuest(questId: string): void {
  applyOp({ op: "complete_quest", questId });
}

export function failQuest(questId: string): void {
  applyOp({ op: "fail_quest", questId });
}

export function noticeRandomQuestEventsDisabled(): void {
  toast("Random quest events are disabled. Use Hub Scene, Check, Battle, or authored Event files.", "info");
}

// ── Shop ──────────────────────────────────────────────────────────
export function sellShopItem(args: { id: string; type: string; price: number; currency: string }): void {
  applyOp({ op: "shop_sell", id: args.id, type: args.type, price: args.price, currency: args.currency, qty: 1 });
}

// ── Run / scenario combat ─────────────────────────────────────────
export function tickRunDanger(): void {
  applyOp({ op: "danger", amount: 1 }, "run");
}

export function revealNode(nodeId: string): void {
  applyOp({ op: "reveal_node", nodeId });
}

export function noticeRandomEventsDisabled(): void {
  toast("Random event rolls are disabled. Use authored Event files or Quest tools.", "info");
}

// ── Pending battle / combat result ────────────────────────────────
export function skipBattleVictory(): void {
  applyOp({ op: "manual_battle_result", result: "victory", summary: "Skipped as GM-approved victory." });
}

export function skipBattleDefeat(): void {
  applyOp({ op: "manual_battle_result", result: "defeat", summary: "Skipped as GM-approved defeat." });
}

export function cancelPendingBattle(): void {
  cs().mutate((state) => {
    state.pendingBattle = null;
  }, { source: "ui" });
}

export function ignoreCombatResult(): void {
  cs().mutate((state) => {
    state.pendingBattleResult = null;
  }, { source: "ui" });
}
