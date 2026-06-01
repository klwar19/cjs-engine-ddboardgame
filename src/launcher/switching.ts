import { isModeId, type ModeId } from "./modes";

export const LAST_MODE_STORAGE_KEY = "cjs.launcher.lastMode";

type ModeStorage = Pick<Storage, "getItem" | "setItem">;

export function readModeHash(hash: string): ModeId | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const id = raw.split(/[?&]/, 1)[0];
  return isModeId(id) ? id : null;
}

export function modeHash(mode: ModeId | null): string {
  return mode ? `#${mode}` : "";
}

export function launcherUrlForMode(pathname: string, search: string, mode: ModeId | null): string {
  return `${pathname || "/"}${search || ""}${modeHash(mode)}`;
}

export function readStoredMode(storage: ModeStorage | null | undefined): ModeId | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(LAST_MODE_STORAGE_KEY);
    return isModeId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredMode(storage: ModeStorage | null | undefined, mode: ModeId | null): void {
  if (!storage || !mode) return;
  try {
    storage.setItem(LAST_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore storage failures */
  }
}

export function rememberVisitedMode(
  visited: ReadonlyArray<ModeId>,
  mode: ModeId | null,
  maxFrames: number
): ReadonlyArray<ModeId> {
  if (!mode || visited.includes(mode)) return visited;
  const limit = Math.max(1, Math.floor(maxFrames || 1));
  const next = [...visited, mode];
  return next.length > limit ? next.slice(next.length - limit) : next;
}
