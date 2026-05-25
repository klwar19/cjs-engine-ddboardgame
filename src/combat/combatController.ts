// Combat controller — orchestrates click/keyboard interaction between the
// React UI, the GridRenderer, and the CombatManager. Owns the imperative
// mode machine (idle → move → target_single | target_aoe → idle) that the
// vanilla combat-ui.js used to own.
//
// React components dispatch through `requestAction` and `cancel`. The
// controller calls into the engine, sets highlights on the grid, and
// surfaces mode hints / pending state through a tiny subscribe API.

interface CjsAny {
  CombatManager?: {
    getCurrentUnit?: () => Record<string, unknown> | null;
    getState?: () => Record<string, unknown> | null;
    submitAction?: (action: Record<string, unknown>) => { success: boolean; reason?: string; damage?: number; healing?: number; isCritical?: boolean; targetUnit?: { pos?: number[] } };
    runUntilInput?: (maxSteps?: number) => unknown;
    notify?: () => void;
  };
  GridEngine?: {
    getValidMoves?: (id: string) => number[][];
    getUnitsInRange?: (r: number, c: number, range: number, opts?: { excludeId?: string }) => Array<{ unit: { pos: number[]; currentHP?: number } }>;
    getCellsInRange?: (r: number, c: number, range: number) => number[][];
    getUnitAt?: (r: number, c: number) => Record<string, unknown> | null;
    isDestructibleTerrain?: (r: number, c: number) => boolean;
    getFlankPosition?: (attacker: unknown, target: unknown) => { position: string; critBonus: number };
    getUnitElevation?: (unit: unknown) => number;
  };
  GridRenderer?: {
    setHighlights?: (cells: Array<{ r: number; c: number }>, color: string, type: string) => void;
    clearHighlights?: (type?: string) => void;
    addDamageFloat?: (r: number, c: number, text: string | number, color: string) => void;
    getCellSize?: () => number;
  };
  ActionHandler?: {
    getAttackRange?: (unit: unknown) => number;
    getAvailableActions?: (unit: unknown) => { interactTargets?: Array<{ r: number; c: number }> };
  };
  SkillResolver?: {
    resolveUnitSkill?: (unit: unknown, id: string) => Record<string, unknown> | null;
  };
  DataStore?: {
    get?: <T>(type: string, id: string) => T | null;
  };
  QteManager?: {
    trigger?: (opts: { skill: unknown; attacker: unknown; container: HTMLElement }) => Promise<unknown>;
  };
  GMControls?: {
    isToolActive?: () => boolean;
    handleCellClick?: (r: number, c: number) => boolean;
    cancelTool?: () => void;
  };
  CONST?: {
    ENVIRONMENTAL_INTERACTIONS?: { barrelExplosionRadius?: number; barrelKickAPCost?: number };
    ELEVATION?: { accuracyBonusPerStep?: number };
  };
}

function cjs(): CjsAny {
  return (window as unknown as { CJS?: CjsAny }).CJS ?? {};
}

export type CombatMode = "idle" | "move" | "target_single" | "target_aoe" | "qte";

export interface PendingAction {
  type: "attack" | "skill" | "item";
  skillId?: string;
  itemId?: string;
  targetId?: string;
  aoeCenter?: number[];
}

interface ControllerStateSnap {
  mode: CombatMode;
  pending: PendingAction | null;
  hint: string;
  version: number;
}

type Listener = (state: ControllerStateSnap) => void;

export class CombatController {
  private state: ControllerStateSnap = {
    mode: "idle",
    pending: null,
    hint: "",
    version: 0
  };
  private listeners: Set<Listener> = new Set();
  private qteOverlayEl: HTMLDivElement | null = null;

  setQteOverlay(el: HTMLDivElement | null): void {
    this.qteOverlayEl = el;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): ControllerStateSnap {
    return this.state;
  }

  private commit(next: Partial<ControllerStateSnap>): void {
    this.state = { ...this.state, ...next, version: this.state.version + 1 };
    for (const listener of this.listeners) {
      try { listener(this.state); } catch (err) { console.error("CombatController listener:", err); }
    }
  }

  reset(): void {
    this.commit({ mode: "idle", pending: null, hint: "" });
  }

  cancel(): void {
    cjs().GridRenderer?.clearHighlights?.();
    this.commit({ mode: "idle", pending: null, hint: "" });
  }

  // GM tools use this to surface tool-specific hints in the same UI
  // slot as the player's action-mode hint.
  setHint(text: string): void {
    if (this.state.hint === text) return;
    this.commit({ hint: text });
  }

  enterMoveMode(): void {
    const unit = cjs().CombatManager?.getCurrentUnit?.();
    if (!unit) return;
    cjs().GridRenderer?.clearHighlights?.();
    const moves = cjs().GridEngine?.getValidMoves?.(unit.instanceId as string) ?? [];
    const cells = moves.map(([r, c]) => ({ r, c }));
    cjs().GridRenderer?.setHighlights?.(cells, "rgba(59,130,246,0.4)", "move");
    this.commit({
      mode: "move",
      pending: null,
      hint: "Click a blue cell to move, or click Move again / press Esc to cancel."
    });
  }

  enterTargetMode(action: PendingAction): void {
    const unit = cjs().CombatManager?.getCurrentUnit?.();
    if (!unit) return;
    cjs().GridRenderer?.clearHighlights?.();
    let range = 1;
    if (action.type !== "attack") {
      const skillId = action.skillId as string;
      const resolver = cjs().SkillResolver;
      const skill =
        (resolver && resolver.resolveUnitSkill?.(unit, skillId)) ||
        cjs().DataStore?.get?.<Record<string, unknown>>("skills", skillId);
      range = Math.max(1, Number(skill?.range || 1) + Number((unit.rangeBonus as number) || 0));
    } else {
      const ah = cjs().ActionHandler;
      if (ah?.getAttackRange) range = ah.getAttackRange(unit);
    }

    const targets =
      cjs().GridEngine?.getUnitsInRange?.(
        (unit.pos as number[])[0],
        (unit.pos as number[])[1],
        range,
        { excludeId: unit.instanceId as string }
      ) ?? [];
    const cells: Array<{ r: number; c: number }> = [];
    for (const entry of targets) {
      const target = entry.unit;
      if ((target.currentHP || 0) > 0) cells.push({ r: target.pos[0], c: target.pos[1] });
    }
    if (action.type === "attack") {
      const interactTargets = cjs().ActionHandler?.getAvailableActions?.(unit)?.interactTargets ?? [];
      for (const t of interactTargets) cells.push({ r: t.r, c: t.c });
    }
    cjs().GridRenderer?.setHighlights?.(cells, "rgba(239,68,68,0.4)", "target");
    this.commit({
      mode: "target_single",
      pending: action,
      hint: "Click a valid target, or click the same action again / press Esc to cancel."
    });
  }

  enterAoETargetMode(skill: { id: string; range?: number }): void {
    const unit = cjs().CombatManager?.getCurrentUnit?.();
    if (!unit) return;
    cjs().GridRenderer?.clearHighlights?.();
    const range = Math.max(1, Number(skill.range || 3) + Number((unit.rangeBonus as number) || 0));
    const rawCells =
      cjs().GridEngine?.getCellsInRange?.(
        (unit.pos as number[])[0],
        (unit.pos as number[])[1],
        range
      ) ?? [];
    const cells = rawCells.map(([r, c]) => ({ r, c }));
    cjs().GridRenderer?.setHighlights?.(cells, "rgba(168,85,247,0.3)", "target");
    this.commit({
      mode: "target_aoe",
      pending: { type: "skill", skillId: skill.id },
      hint: "Click a cell for the AoE center, or click the same skill again / press Esc to cancel."
    });
  }

  submitDirectAction(action: Record<string, unknown>): { success: boolean; reason?: string } {
    cjs().GridRenderer?.clearHighlights?.();
    this.commit({ mode: "idle", pending: null, hint: "" });
    const result = cjs().CombatManager?.submitAction?.(action);
    this.handleResult(result);
    cjs().CombatManager?.runUntilInput?.();
    return result || { success: false, reason: "no_manager" };
  }

  async handleCellClick(
    r: number,
    c: number,
    onLog: (text: string, type: string) => void
  ): Promise<void> {
    const gm = cjs().GMControls;
    if (gm?.isToolActive?.() && gm.handleCellClick?.(r, c)) {
      return;
    }

    const mode = this.state.mode;
    if (mode === "move") {
      const result = cjs().CombatManager?.submitAction?.({ type: "move", targetPos: [r, c] });
      if (result?.success) {
        cjs().GridRenderer?.clearHighlights?.("move");
        this.commit({ mode: "idle", pending: null, hint: "" });
        cjs().CombatManager?.runUntilInput?.();
      } else if (result?.reason) {
        onLog(`Action failed: ${result.reason}`, "error");
      }
      return;
    }

    if (mode !== "target_single" && mode !== "target_aoe") {
      return;
    }

    const pending = this.state.pending;
    if (!pending) return;
    const unitAt = cjs().GridEngine?.getUnitAt?.(r, c);
    const action: Record<string, unknown> = { ...pending };

    if (mode === "target_single") {
      if (!unitAt) {
        if (
          pending.type === "attack" &&
          cjs().GridEngine?.isDestructibleTerrain?.(r, c)
        ) {
          cjs().GridRenderer?.clearHighlights?.("target");
          this.commit({ mode: "idle", pending: null, hint: "" });
          const result = cjs().CombatManager?.submitAction?.({ type: "interact", targetPos: [r, c] });
          this.handleResult(result);
          cjs().CombatManager?.runUntilInput?.();
          return;
        }
        return;
      }
      action.targetId = (unitAt.instanceId as string) || (unitAt as unknown as string);
    } else {
      action.aoeCenter = [r, c];
      if (unitAt) action.targetId = (unitAt.instanceId as string) || (unitAt as unknown as string);
    }

    if (action.type === "skill") {
      const resolver = cjs().SkillResolver;
      const unit = cjs().CombatManager?.getCurrentUnit?.();
      const skillId = action.skillId as string;
      const skill =
        (resolver && unit && resolver.resolveUnitSkill?.(unit, skillId)) ||
        cjs().DataStore?.get?.<Record<string, unknown>>("skills", skillId);
      if (skill?.qte && skill.qte !== "none" && cjs().QteManager?.trigger) {
        await this.runQte(skill, action, onLog);
        return;
      }
    }

    cjs().GridRenderer?.clearHighlights?.("target");
    this.commit({ mode: "idle", pending: null, hint: "" });
    const result = cjs().CombatManager?.submitAction?.(action);
    this.handleResult(result);
    if (result && !result.success && result.reason) {
      onLog(`Action failed: ${result.reason}`, "error");
    }
    cjs().CombatManager?.runUntilInput?.();
  }

  handleCellHover(r: number, c: number): void {
    if (this.state.mode !== "target_single") return;
    const attacker = cjs().CombatManager?.getCurrentUnit?.();
    if (!attacker) return;
    const target = cjs().GridEngine?.getUnitAt?.(r, c);
    if (!target && this.state.pending?.type === "attack" && cjs().GridEngine?.isDestructibleTerrain?.(r, c)) {
      const ENV = cjs().CONST?.ENVIRONMENTAL_INTERACTIONS || {};
      const radius = Number(ENV.barrelExplosionRadius || 1);
      this.commit({
        hint: `💥 Kick barrel — Fire AoE radius ${radius}, costs ${ENV.barrelKickAPCost || 1} AP.`
      });
      return;
    }
    if (!target || target.team === attacker.team || ((target.currentHP as number) || 0) <= 0) {
      this.commit({ hint: "Click a valid target, or click the same action again / press Esc to cancel." });
      return;
    }
    const parts = [`Target: ${target.name || target.baseId || "?"}`];
    try {
      const ge = cjs().GridEngine;
      if (ge?.getFlankPosition) {
        const f = ge.getFlankPosition(attacker, target);
        if (f.position === "rear") parts.push(`🗡️ REAR (+${f.critBonus}% crit)`);
        else if (f.position === "side")
          parts.push(f.critBonus > 0 ? `↙ SIDE (+${f.critBonus}% crit)` : "↙ Side");
        else parts.push("▲ Front");
      }
    } catch { /* ignore */ }
    try {
      const ge = cjs().GridEngine;
      if (ge?.getUnitElevation) {
        const ae = ge.getUnitElevation(attacker);
        const te = ge.getUnitElevation(target);
        if (ae > te) {
          const E = cjs().CONST?.ELEVATION || {};
          const acc = (ae - te) * Number(E.accuracyBonusPerStep || 0);
          parts.push(`⬆ High ground (+${acc}% acc)`);
        } else if (te > ae) {
          parts.push("⬇ Target on higher ground");
        }
      }
    } catch { /* ignore */ }
    this.commit({ hint: parts.join("   ·   ") });
  }

  private async runQte(
    skill: Record<string, unknown>,
    action: Record<string, unknown>,
    onLog: (text: string, type: string) => void
  ): Promise<void> {
    this.commit({ mode: "qte" });
    if (this.qteOverlayEl) this.qteOverlayEl.style.display = "flex";
    try {
      const unit = cjs().CombatManager?.getCurrentUnit?.();
      const result = await cjs().QteManager?.trigger?.({
        skill,
        attacker: unit,
        container: this.qteOverlayEl!
      });
      action.qteResult = result;
    } catch {
      action.qteResult = { grade: "ok", multiplier: 1.0 };
    }
    if (this.qteOverlayEl) {
      this.qteOverlayEl.style.display = "none";
      this.qteOverlayEl.innerHTML = "";
    }
    cjs().GridRenderer?.clearHighlights?.("target");
    this.commit({ mode: "idle", pending: null, hint: "" });
    const result = cjs().CombatManager?.submitAction?.(action);
    this.handleResult(result);
    if (result && !result.success && result.reason) {
      onLog(`Action failed: ${result.reason}`, "error");
    }
    cjs().CombatManager?.runUntilInput?.();
  }

  private handleResult(
    result:
      | { success: boolean; damage?: number; healing?: number; isCritical?: boolean; targetUnit?: { pos?: number[] }; reason?: string }
      | null
      | undefined
  ): void {
    if (!result || !result.success) return;
    const r = result.targetUnit?.pos?.[0];
    const c = result.targetUnit?.pos?.[1];
    if (result.damage && typeof r === "number" && typeof c === "number") {
      const color = result.isCritical ? "#fbbf24" : "#ff4444";
      cjs().GridRenderer?.addDamageFloat?.(r, c, result.damage, color);
    }
    if (result.healing && typeof r === "number" && typeof c === "number") {
      cjs().GridRenderer?.addDamageFloat?.(r, c, `+${result.healing}`, "#22c55e");
    }
  }

  isInModeForAction(actionType: "attack" | "skill" | "item", skillId?: string, itemId?: string): boolean {
    const { mode, pending } = this.state;
    if (mode !== "target_single" && mode !== "target_aoe") return false;
    if (!pending) return false;
    if (actionType === "attack") return pending.type === "attack";
    if (actionType === "skill") return pending.type === "skill" && pending.skillId === skillId;
    if (actionType === "item") return pending.type === "item" && pending.itemId === itemId;
    return false;
  }
}
