import type { EntityId } from "./types";

export type { EntityId };

export type StatusInstance = CJSStatusInstance;
export type ApplyStatusArgs = CJSApplyStatusArgs;

export type EffectKind =
  | "damage"
  | "heal"
  | "buff"
  | "debuff"
  | "status"
  | "move"
  | "summon"
  | "dispel"
  | (string & {});

export interface EffectDescriptor {
  readonly kind: EffectKind;
  readonly power?: number;
  readonly statusId?: string;
  readonly duration?: number;
  readonly chance?: number;
  readonly element?: string;
  readonly meta?: Record<string, unknown>;
}

export type ConditionExpression = string;
