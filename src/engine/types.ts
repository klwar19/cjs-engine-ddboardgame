// Core engine primitives shared across modules.
// These re-export the existing ambient CJS* globals under cleaner names
// so React/TSX code can `import { CombatUnit } from "../engine"` without
// reaching into window.CJS.

export type EntityId = string;
export type RecordId = string;
export type TeamId = "player" | "enemy" | (string & {});

export type Position = [number, number];

export type CJSRecordShape = CJSRecord;

export interface NamedRef {
  readonly id: EntityId;
  readonly name?: string;
}

export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };
