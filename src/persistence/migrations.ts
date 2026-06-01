export const CURRENT_SAVE_SCHEMA_VERSION = 1;
export const CURRENT_CONTENT_DRAFT_SCHEMA_VERSION = 1;

export const SAVE_SCHEMA_FIELD = "saveSchemaVersion";
export const CONTENT_DRAFT_SCHEMA_FIELD = "contentDraftSchemaVersion";

type JsonRecord = Record<string, unknown>;

export class UnsupportedPersistenceVersionError extends Error {
  readonly kind = "unsupported_persistence_version";
  readonly schema: "campaign-save" | "content-draft";
  readonly version: number;
  readonly currentVersion: number;

  constructor(schema: "campaign-save" | "content-draft", version: number, currentVersion: number) {
    super(`${schema} version ${version} is newer than this build supports (${currentVersion}).`);
    this.name = "UnsupportedPersistenceVersionError";
    this.schema = schema;
    this.version = version;
    this.currentVersion = currentVersion;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function schemaVersion(value: JsonRecord, primaryField: string): number {
  const raw = value[primaryField];
  if (raw == null) return 0;
  const version = Number(raw);
  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`Invalid ${primaryField}: ${String(raw)}`);
  }
  return version;
}

function cloneRecord<T extends JsonRecord>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface CampaignSavePayload extends JsonRecord {
  readonly saveId?: string;
  readonly saveVersion?: number;
  readonly saveSchemaVersion: typeof CURRENT_SAVE_SCHEMA_VERSION;
}

export interface ContentDraftPayload extends JsonRecord {
  readonly id?: string;
  readonly kind?: string;
  readonly json?: string;
  readonly savedAt?: string | number;
  readonly source?: string;
  readonly contentDraftSchemaVersion: typeof CURRENT_CONTENT_DRAFT_SCHEMA_VERSION;
}

export function migrateSavePayload(payload: unknown): CampaignSavePayload {
  if (!isRecord(payload)) {
    throw new Error("Campaign save payload must be an object.");
  }

  const version = schemaVersion(payload, SAVE_SCHEMA_FIELD);
  if (version > CURRENT_SAVE_SCHEMA_VERSION) {
    throw new UnsupportedPersistenceVersionError("campaign-save", version, CURRENT_SAVE_SCHEMA_VERSION);
  }
  if (version === CURRENT_SAVE_SCHEMA_VERSION) {
    return payload as CampaignSavePayload;
  }

  // v0 is any pre-persistence-schema campaign save. Preserve the engine's
  // own saveVersion field; this migration only annotates the storage envelope.
  const next = cloneRecord(payload);
  next[SAVE_SCHEMA_FIELD] = CURRENT_SAVE_SCHEMA_VERSION;
  return next as CampaignSavePayload;
}

export function migrateContentDraft(payload: unknown): ContentDraftPayload {
  if (!isRecord(payload)) {
    throw new Error("Content draft payload must be an object.");
  }

  const version = schemaVersion(payload, CONTENT_DRAFT_SCHEMA_FIELD);
  if (version > CURRENT_CONTENT_DRAFT_SCHEMA_VERSION) {
    throw new UnsupportedPersistenceVersionError(
      "content-draft",
      version,
      CURRENT_CONTENT_DRAFT_SCHEMA_VERSION
    );
  }
  if (version === CURRENT_CONTENT_DRAFT_SCHEMA_VERSION) {
    return payload as ContentDraftPayload;
  }

  // v0 is the old SaveManager localStorage draft: { json, savedAt, source }.
  const next = cloneRecord(payload);
  next[CONTENT_DRAFT_SCHEMA_FIELD] = CURRENT_CONTENT_DRAFT_SCHEMA_VERSION;
  next.kind = typeof next.kind === "string" ? next.kind : "editor-local-draft";
  next.source = typeof next.source === "string" ? next.source : "autosave";
  next.savedAt = next.savedAt || new Date().toISOString();
  return next as ContentDraftPayload;
}
