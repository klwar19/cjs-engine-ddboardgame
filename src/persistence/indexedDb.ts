import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  migrateContentDraft,
  migrateSavePayload,
  type CampaignSavePayload,
  type ContentDraftPayload
} from "./migrations";

const DB_NAME = "cjs-browser-persistence";
const DB_VERSION = 1;

export const LEGACY_CAMPAIGN_SLOTS_KEY = "cjs.campaign.slots.v1";
export const LEGACY_EDITOR_DRAFT_KEY = "cjs.editor.localDraft";
export const LOCAL_STORAGE_MIGRATION_KEY = "cjs.persistence.localStorageToIndexedDb.v1";

const CAMPAIGN_SAVE_STORE = "campaignSaves";
const CONTENT_DRAFT_STORE = "contentDrafts";
const META_STORE = "meta";

interface MetaRecord {
  readonly key: string;
  readonly value: unknown;
  readonly updatedAt: string;
}

interface CjsPersistenceDb extends DBSchema {
  campaignSaves: {
    key: string;
    value: CampaignSavePayload & { saveId: string; lastUpdated?: string };
    indexes: { "by-last-updated": string };
  };
  contentDrafts: {
    key: string;
    value: ContentDraftPayload & { id: string; kind?: string; updatedAt?: string };
    indexes: { "by-kind": string };
  };
  meta: {
    key: string;
    value: MetaRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<CjsPersistenceDb>> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readLegacyJson<T>(store: Storage | null, key: string, fallback: T): T {
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function db(): Promise<IDBPDatabase<CjsPersistenceDb>> {
  if (!dbPromise) {
    dbPromise = openDB<CjsPersistenceDb>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(CAMPAIGN_SAVE_STORE)) {
          const saves = database.createObjectStore(CAMPAIGN_SAVE_STORE, { keyPath: "saveId" });
          saves.createIndex("by-last-updated", "lastUpdated");
        }
        if (!database.objectStoreNames.contains(CONTENT_DRAFT_STORE)) {
          const drafts = database.createObjectStore(CONTENT_DRAFT_STORE, { keyPath: "id" });
          drafts.createIndex("by-kind", "kind");
        }
        if (!database.objectStoreNames.contains(META_STORE)) {
          database.createObjectStore(META_STORE, { keyPath: "key" });
        }
      }
    });
  }
  return dbPromise;
}

export async function readAllCampaignSaves(): Promise<CampaignSavePayload[]> {
  const database = await db();
  const records = await database.getAll(CAMPAIGN_SAVE_STORE);
  return records.map((record) => migrateSavePayload(record));
}

export async function getCampaignSave(saveId: string): Promise<CampaignSavePayload | null> {
  if (!saveId) return null;
  const record = await (await db()).get(CAMPAIGN_SAVE_STORE, saveId);
  return record ? migrateSavePayload(record) : null;
}

export async function putCampaignSave(payload: unknown): Promise<CampaignSavePayload> {
  const save = migrateSavePayload(payload);
  const saveId = String(save.saveId || "");
  if (!saveId) throw new Error("Campaign save payload is missing saveId.");
  await (await db()).put(CAMPAIGN_SAVE_STORE, { ...save, saveId });
  return save;
}

export async function deleteCampaignSave(saveId: string): Promise<void> {
  if (!saveId) return;
  await (await db()).delete(CAMPAIGN_SAVE_STORE, saveId);
}

export async function clearCampaignSaves(): Promise<void> {
  await (await db()).clear(CAMPAIGN_SAVE_STORE);
}

export async function getContentDraft(id: string): Promise<ContentDraftPayload | null> {
  if (!id) return null;
  const record = await (await db()).get(CONTENT_DRAFT_STORE, id);
  return record ? migrateContentDraft(record) : null;
}

export async function putContentDraft(id: string, payload: unknown): Promise<ContentDraftPayload> {
  if (!id) throw new Error("Content draft id is required.");
  const draft = migrateContentDraft(payload);
  await (await db()).put(CONTENT_DRAFT_STORE, {
    ...draft,
    id,
    updatedAt: nowIso()
  });
  return draft;
}

export async function deleteContentDraft(id: string): Promise<void> {
  if (!id) return;
  await (await db()).delete(CONTENT_DRAFT_STORE, id);
}

async function markMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put(META_STORE, { key, value, updatedAt: nowIso() });
}

export async function migrateLocalStorageToIndexedDb(): Promise<{
  readonly skipped: boolean;
  readonly campaignSlots: number;
  readonly contentDrafts: number;
}> {
  const store = localStore();
  if (!store) return { skipped: true, campaignSlots: 0, contentDrafts: 0 };
  if (store.getItem(LOCAL_STORAGE_MIGRATION_KEY) === "1") {
    return { skipped: true, campaignSlots: 0, contentDrafts: 0 };
  }

  let campaignSlots = 0;
  let contentDrafts = 0;
  const database = await db();
  const tx = database.transaction([CAMPAIGN_SAVE_STORE, CONTENT_DRAFT_STORE, META_STORE], "readwrite");

  const legacySlots = readLegacyJson<Record<string, unknown>>(store, LEGACY_CAMPAIGN_SLOTS_KEY, {});
  for (const raw of Object.values(legacySlots || {})) {
    const save = migrateSavePayload(raw);
    const saveId = String(save.saveId || "");
    if (!saveId) continue;
    await tx.objectStore(CAMPAIGN_SAVE_STORE).put({ ...save, saveId });
    campaignSlots += 1;
  }

  const legacyDraft = readLegacyJson<unknown | null>(store, LEGACY_EDITOR_DRAFT_KEY, null);
  if (legacyDraft) {
    const draft = migrateContentDraft(legacyDraft);
    await tx.objectStore(CONTENT_DRAFT_STORE).put({
      ...draft,
      id: "editor-local-draft",
      updatedAt: nowIso()
    });
    contentDrafts += 1;
  }

  await tx.objectStore(META_STORE).put({
    key: "localStorageToIndexedDb",
    value: { campaignSlots, contentDrafts },
    updatedAt: nowIso()
  });
  await tx.done;

  store.removeItem(LEGACY_CAMPAIGN_SLOTS_KEY);
  store.removeItem(LEGACY_EDITOR_DRAFT_KEY);
  store.setItem(LOCAL_STORAGE_MIGRATION_KEY, "1");
  await markMeta("lastWarmup", { at: nowIso() });
  return { skipped: false, campaignSlots, contentDrafts };
}

export async function warmPersistence(): Promise<void> {
  await db();
}

export const Persistence = Object.freeze({
  warmPersistence,
  migrateLocalStorageToIndexedDb,
  readAllCampaignSaves,
  getCampaignSave,
  putCampaignSave,
  deleteCampaignSave,
  clearCampaignSaves,
  getContentDraft,
  putContentDraft,
  deleteContentDraft
});

type PersistenceApi = typeof Persistence;

declare global {
  interface CJSNamespace {
    Persistence?: PersistenceApi;
  }
}

if (typeof window !== "undefined") {
  window.CJS = window.CJS || {};
  window.CJS.Persistence = Persistence;
}
