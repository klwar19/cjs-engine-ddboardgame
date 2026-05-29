// CommandRail.tsx — Phase F JSX port of `_renderCommandRail`.
//
// Renders the right-edge command rail: panel toggle buttons (party,
// inventory, quests, log, notes — filtered by the world UI profile),
// a GM Override button, and the gold/JP currency footer. Clicking a
// rail button toggles the drawer for that panel. The GM Override
// button still routes through dispatchCampaignAction (the legacy
// handler shows a modal); replace with a typed wrapper when that
// modal is migrated.

import { dispatchCampaignAction } from "../actions";
import { memoDeep } from "../util/memo";
import { setActivePanel } from "./bridge";
import type { CommandRailData, RailPanel } from "./types";

interface Props {
  readonly data: CommandRailData;
}

function CampaignCommandRailView({ data }: Props) {
  return (
    <>
      {data.panels.map((panel) => (
        <RailButton
          key={panel.id}
          panel={panel}
          active={panel.id === data.activePanel}
        />
      ))}
      <div className="campaign-rail-divider" aria-hidden="true" />
      <button
        className="campaign-rail-btn is-gm"
        onClick={() => dispatchCampaignAction("gm-override")}
        title="GM Override"
        aria-label="GM Override"
      >
        <span className="campaign-rail-btn-icon" aria-hidden="true">⚜</span>
        <span className="campaign-rail-btn-label">GM</span>
      </button>
      <div className="campaign-rail-currency" title="Gold and Jester Points">
        <span>G {data.currency.gold}</span>
        <span className="campaign-rail-jp" title="Jester Points">JP {data.currency.jp}</span>
      </div>
    </>
  );
}

// Always-mounted chrome (in the command rail aside): memoized so it skips
// unless the panel toggles or currency footer change.
export const CampaignCommandRail = memoDeep(CampaignCommandRailView);

function RailButton({ panel, active }: { panel: RailPanel; active: boolean }) {
  return (
    <button
      className={`campaign-rail-btn ${active ? "is-active" : ""}`}
      onClick={() => setActivePanel(panel.id)}
      title={panel.title}
      aria-label={panel.title}
    >
      <span className="campaign-rail-btn-icon" aria-hidden="true">{panel.icon}</span>
      <span className="campaign-rail-btn-label">{panel.label}</span>
      {panel.count > 0 && <span className="campaign-rail-dot" aria-hidden="true" />}
    </button>
  );
}
