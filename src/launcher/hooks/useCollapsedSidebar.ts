import { useCallback, useState } from "react";

const KEY = "cjs.launcher.sidebarCollapsed";

function readInitial(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function useCollapsedSidebar(): readonly [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(readInitial);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return [collapsed, toggle] as const;
}
