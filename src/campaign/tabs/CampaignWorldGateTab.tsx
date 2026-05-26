// CampaignWorldGateTab.tsx — Phase F JSX port of `_renderWorldGate`.
//
// Renders the World Gate panel: header (title + current world line +
// pressure-strip HTML bridge), then the world card grid. Each card
// still comes through `_renderWorldGateCard` as one HTML string —
// the card body has a banner CSS-var, conditional buttons (Enter /
// Open / Map Movement / Activities / Arena), per-world feature
// chips, and per-world dev notes. Porting those to JSX requires
// porting the world-menu defs alongside, which is its own slice.

import type { CampaignStateSnapshot } from "../store";
import { getWorldGateData, type WorldGateCardEntry } from "./data/worldGate";

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
        {data.pressureStripHtml && (
          <div
            className="campaign-pressure-strip-bridge"
            dangerouslySetInnerHTML={{ __html: data.pressureStripHtml }}
          />
        )}
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

function WorldGateCard({ card }: { card: WorldGateCardEntry }) {
  return (
    <div
      className="campaign-world-gate-card-bridge"
      dangerouslySetInnerHTML={{ __html: card.cardHtml }}
    />
  );
}
