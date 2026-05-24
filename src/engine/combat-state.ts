import type { EntityId, Position, TeamId } from "./types";

export type { EntityId, Position, TeamId };

// Re-export of the legacy ambient global types under modern names.
// As individual engine files get converted to TS, their concrete types
// can replace these aliases.
export type CombatUnit = CJSCombatUnit;
export type TurnState = CJSTurnState;
export type CombatAction = CJSCombatAction;
export type CombatPhase = CJSCombatPhase;
export type CombatState = CJSCombatState;
export type QTEResult = CJSQTEResult;
export type Skill = CJSSkill;
export type SkillRef = CJSSkillRef;
export type AIRule = CJSAIRule;

export interface ActorPanelView {
  readonly unit: CombatUnit;
  readonly isActive: boolean;
  readonly isAlly: boolean;
  readonly availableAP: number;
  readonly availableMP: number;
}

export interface CombatLogEntry {
  readonly id: string;
  readonly turn: number;
  readonly text: string;
  readonly kind?: "info" | "damage" | "heal" | "status" | "system";
}
