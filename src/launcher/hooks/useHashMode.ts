import { useEffect, useState, useCallback, useRef } from "react";
import { isModeId, type ModeId } from "../modes";

const STORAGE_KEY = "cjs.launcher.lastMode";

function readStored(): ModeId | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isModeId(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeStored(mode: ModeId | null) {
  try {
    if (mode) localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function readHash(): ModeId | null {
  const raw = window.location.hash.slice(1);
  return isModeId(raw) ? raw : null;
}

export interface UseHashModeResult {
  readonly mode: ModeId | null;
  readonly setMode: (mode: ModeId | null) => void;
}

/**
 * Tracks the active launcher mode. Initial value comes from URL hash, then
 * localStorage. Updates push to history (back/forward works) and persist
 * the last-active mode for next visit.
 */
export function useHashMode(): UseHashModeResult {
  const [mode, setModeState] = useState<ModeId | null>(() => readHash() ?? readStored());
  const suppressRef = useRef(false);

  const setMode = useCallback((next: ModeId | null) => {
    setModeState(next);
    writeStored(next);
    suppressRef.current = true;
    const targetHash = next ? `#${next}` : "";
    if (window.location.hash !== targetHash) {
      if (next) {
        history.pushState({ mode: next }, "", targetHash);
      } else {
        history.pushState({ mode: null }, "", window.location.pathname + window.location.search);
      }
    }
    setTimeout(() => {
      suppressRef.current = false;
    }, 0);
  }, []);

  useEffect(() => {
    const syncFromLocation = () => {
      if (suppressRef.current) return;
      const next = readHash();
      setModeState(next);
      writeStored(next);
    };
    window.addEventListener("hashchange", syncFromLocation);
    window.addEventListener("popstate", syncFromLocation);
    return () => {
      window.removeEventListener("hashchange", syncFromLocation);
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, []);

  return { mode, setMode };
}
