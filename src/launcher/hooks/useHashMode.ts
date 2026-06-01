import { useCallback, useEffect, useRef, useState } from "react";
import type { ModeId } from "../modes";
import { launcherUrlForMode, modeHash, readModeHash, readStoredMode, writeStoredMode } from "../switching";

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
  const [mode, setModeState] = useState<ModeId | null>(() => readModeHash(window.location.hash) ?? readStoredMode(localStorage));
  const suppressRef = useRef(false);

  const setMode = useCallback((next: ModeId | null) => {
    setModeState(next);
    writeStoredMode(localStorage, next);
    suppressRef.current = true;
    const targetHash = modeHash(next);
    if (window.location.hash !== targetHash) {
      history.pushState(
        { mode: next },
        "",
        launcherUrlForMode(window.location.pathname, window.location.search, next)
      );
    }
    setTimeout(() => {
      suppressRef.current = false;
    }, 0);
  }, []);

  useEffect(() => {
    const syncFromLocation = () => {
      if (suppressRef.current) return;
      const next = readModeHash(window.location.hash);
      setModeState(next);
      writeStoredMode(localStorage, next);
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
