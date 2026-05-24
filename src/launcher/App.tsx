import { useCallback, useEffect, useRef, useState } from "react";
import { FrameView } from "./components/FrameView";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { useCollapsedSidebar } from "./hooks/useCollapsedSidebar";
import { useHashMode } from "./hooks/useHashMode";
import { type ModeId } from "./modes";

export function App() {
  const { mode, setMode } = useHashMode();
  const [collapsed, toggleCollapsed] = useCollapsedSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [visited, setVisited] = useState<Set<ModeId>>(() => (mode ? new Set([mode]) : new Set()));

  // Track every mode the user has visited so the iframe stays mounted after
  // they switch away — preserves audio playback, in-memory state, modals.
  useEffect(() => {
    if (mode && !visited.has(mode)) {
      setVisited((prev) => new Set([...prev, mode]));
    }
  }, [mode, visited]);

  const handleSelect = useCallback(
    (next: ModeId) => {
      setMode(next);
      setMobileOpen(false);
    },
    [setMode]
  );

  const handleToggleMobile = useCallback(() => setMobileOpen((v) => !v), []);

  const shellRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const onClick = (e: MouseEvent) => {
      const shell = shellRef.current;
      if (!shell) return;
      const target = e.target as Node | null;
      if (!target) return;
      const sidebar = shell.querySelector(".launcher-sidebar");
      const toggle = shell.querySelector(".launcher-menu-toggle");
      if (sidebar && sidebar.contains(target)) return;
      if (toggle && toggle.contains(target)) return;
      setMobileOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [mobileOpen]);

  const shellClass = [
    "launcher-shell",
    collapsed ? "is-collapsed" : "",
    mobileOpen ? "is-mobile-open" : ""
  ]
    .filter(Boolean)
    .join(" ");

  const showWelcome = mode == null;

  return (
    <div ref={shellRef} className={shellClass}>
      <Sidebar
        activeMode={mode}
        onSelect={handleSelect}
        onToggleCollapsed={toggleCollapsed}
      />
      <main className="launcher-main">
        <TopBar mode={mode} onToggleMobile={handleToggleMobile} />
        <div className="launcher-frame-wrap">
          <WelcomeScreen visible={showWelcome} onSelect={handleSelect} />
          {[...visited].map((m) => (
            <FrameView key={m} mode={m} active={mode === m} />
          ))}
        </div>
      </main>
    </div>
  );
}
