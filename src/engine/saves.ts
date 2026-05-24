// Save-file shape. localStorage today; IndexedDB later.
// The schema version lets future migrations rewrite older payloads.

export const SAVE_SCHEMA_VERSION = 1 as const;

export interface SaveSlot {
  readonly slotId: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly schemaVersion: number;
}

export interface SavePayload<TPayload = unknown> extends SaveSlot {
  readonly payload: TPayload;
}

export interface CampaignSavePayload {
  readonly campaignId: string;
  readonly turn: number;
  readonly party: unknown[];
  readonly worldState: Record<string, unknown>;
  readonly questsState: Record<string, unknown>;
}

export interface CombatEncounterSavePayload {
  readonly encounterId: string;
  readonly phase: string;
  readonly turnIndex: number;
  readonly units: unknown[];
}

export type SaveMigration<TFrom = unknown, TTo = unknown> = (input: TFrom) => TTo;

export interface MigrationRegistry {
  readonly from: number;
  readonly to: number;
  readonly migrate: SaveMigration;
}
