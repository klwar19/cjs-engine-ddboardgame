import { MODES, type ModeId } from "../modes";

interface TopBarProps {
  readonly mode: ModeId | null;
  readonly onToggleMobile: () => void;
}

export function TopBar({ mode, onToggleMobile }: TopBarProps) {
  const title = mode ? MODES[mode].title : "Welcome";
  const popOutHref = mode ? MODES[mode].file : "#";
  const popOutDisabled = mode == null;

  return (
    <header className="launcher-topbar">
      <button
        className="launcher-menu-toggle"
        id="launcher-menu-toggle"
        type="button"
        aria-label="Open menu"
        title="Open menu"
        onClick={onToggleMobile}
      >
        <span aria-hidden="true">Menu</span>
      </button>
      <h1 className="launcher-current-title" id="launcher-current-title">{title}</h1>
      <div className="launcher-topbar-actions">
        <a
          className={`launcher-pop-out${popOutDisabled ? " is-disabled" : ""}`}
          id="launcher-pop-out"
          href={popOutHref}
          target="_blank"
          rel="noopener"
          title="Open current mode in a new tab"
          aria-disabled={popOutDisabled || undefined}
        >
          Open in tab
        </a>
      </div>
    </header>
  );
}
