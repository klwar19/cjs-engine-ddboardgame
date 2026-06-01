import { MODE_IDS, MODES, type ModeId } from "../modes";

interface WelcomeScreenProps {
  readonly visible: boolean;
  readonly onSelect: (mode: ModeId) => void;
  readonly onPreload: (mode: ModeId) => void;
}

export function WelcomeScreen({ visible, onSelect, onPreload }: WelcomeScreenProps) {
  return (
    <div className="launcher-welcome" id="launcher-welcome" hidden={!visible}>
      <div className="launcher-welcome-inner">
        <h2>Welcome to the CJS Engine</h2>
        <p className="dim">Pick a mode from the sidebar to get started.</p>
        <div className="launcher-cards">
          {MODE_IDS.map((id) => {
            const cfg = MODES[id];
            return (
              <button
                key={id}
                type="button"
                className="launcher-card"
                data-mode={id}
                onFocus={() => onPreload(id)}
                onMouseEnter={() => onPreload(id)}
                onClick={() => onSelect(id)}
              >
                <span className="launcher-card-icon" aria-hidden="true">{cfg.icon}</span>
                <span className="launcher-card-title">{cfg.label}</span>
                <span className="launcher-card-desc">{cfg.description}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
