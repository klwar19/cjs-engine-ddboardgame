import { MODE_IDS, MODES, type ModeId } from "../modes";

interface SidebarProps {
  readonly activeMode: ModeId | null;
  readonly collapsed: boolean;
  readonly onSelect: (mode: ModeId) => void;
  readonly onPreload: (mode: ModeId) => void;
  readonly onToggleCollapsed: () => void;
}

export function Sidebar({ activeMode, collapsed, onSelect, onPreload, onToggleCollapsed }: SidebarProps) {
  const collapseLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <aside className="launcher-sidebar" id="launcher-sidebar" aria-label="App navigation">
      <header className="launcher-brand">
        <button
          className="launcher-collapse"
          id="launcher-collapse"
          type="button"
          aria-label={collapseLabel}
          title={collapseLabel}
          onClick={onToggleCollapsed}
        >
          <span className="launcher-collapse-icon" aria-hidden="true">{collapsed ? ">" : "<"}</span>
        </button>
        <div className="launcher-brand-text">
          <div className="launcher-brand-name">CJS Engine</div>
          <div className="launcher-brand-sub">Cosmic Jester System</div>
        </div>
      </header>

      <nav className="launcher-nav" role="navigation">
        {MODE_IDS.map((id) => {
          const cfg = MODES[id];
          const isActive = activeMode === id;
          return (
            <button
              key={id}
              type="button"
              className={`launcher-nav-item${isActive ? " is-active" : ""}`}
              data-mode={id}
              onFocus={() => onPreload(id)}
              onMouseEnter={() => onPreload(id)}
              onClick={() => onSelect(id)}
            >
              <span className="launcher-nav-icon" aria-hidden="true">{cfg.icon}</span>
              <span className="launcher-nav-label">{cfg.label}</span>
            </button>
          );
        })}
      </nav>

      <footer className="launcher-foot">
        <a
          className="launcher-foot-link"
          href="https://github.com/klwar19/cjs-engine-ddboardgame"
          target="_blank"
          rel="noopener"
        >
          GitHub
        </a>
      </footer>
    </aside>
  );
}
