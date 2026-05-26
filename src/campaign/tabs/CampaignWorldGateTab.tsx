// CampaignWorldGateTab.tsx — Phase F JSX port of `_renderWorldGate`.
//
// Renders the World Gate panel: header (title + current world line +
// pressure-strip chips), then the world card grid. As of Phase G.13
// each card is a full JSX `WorldGateCard` with typed banner, status
// pill, feature/loop chips, dev note, and primary/secondary buttons
// (Enter / Open / Map Movement / Activities / Arena).

import type { CampaignStateSnapshot } from "../store";
import { getWorldGateData } from "./data/worldGate";
import { WorldGateCard, WorldGatePressureStrip } from "./WorldGateCard";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignWorldGateTab({ state }: Props) {
  const data = getWorldGateData(state);
  if (!data) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">World Gate not ready.</div>
      </section>
    );
  }
  return (
    <section className="campaign-panel campaign-world-gate">
      <div className="campaign-panel-head">
        <div>
          <h2>World Gate</h2>
          <span className="campaign-muted">
            Choose which world content to load. Current world: {data.currentWorldName}
          </span>
        </div>
        <WorldGatePressureStrip pressures={data.pressures} />
      </div>
      <div className="campaign-world-gate-grid">
        {data.cards.length ? (
          data.cards.map((card) => <WorldGateCard key={card.worldId} card={card} />)
        ) : (
          <div className="campaign-empty">No campaign worlds are available.</div>
        )}
      </div>
    </section>
  );
}
