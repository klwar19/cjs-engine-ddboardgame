import type { CampaignStateSnapshot } from "../store";

// Vanilla `CampaignWorldMap.renderTravelMap` produces a complete travel-
// map panel (SVG + node buttons). It already carries every interactive
// `data-campaign-action` attribute the legacy event delegation expects,
// so the React wrapper just hands ownership of the placeholder to React
// without porting the SVG renderer. The SVG itself is a follow-up port.
interface WorldMapModule {
  readonly renderTravelMap: (state: CampaignStateSnapshot) => string;
  readonly renderActivities: (state: CampaignStateSnapshot) => string;
}

interface Cjs {
  readonly CampaignWorldMap?: WorldMapModule;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignWorldMapTab({ state }: Props) {
  const mod = cjs().CampaignWorldMap;
  if (!mod?.renderTravelMap) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">World map UI not loaded.</div>
      </section>
    );
  }
  let html: string;
  try {
    html = mod.renderTravelMap(state);
  } catch (error) {
    console.error("renderTravelMap failed:", error);
    html = '<section class="campaign-panel"><div class="campaign-empty">World map render failed.</div></section>';
  }
  return (
    <div className="campaign-world-map-react" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export function CampaignWorldActivitiesTab({ state }: Props) {
  const mod = cjs().CampaignWorldMap;
  if (!mod?.renderActivities) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">World activities UI not loaded.</div>
      </section>
    );
  }
  let html: string;
  try {
    html = mod.renderActivities(state);
  } catch (error) {
    console.error("renderActivities failed:", error);
    html = '<section class="campaign-panel"><div class="campaign-empty">World activities render failed.</div></section>';
  }
  return (
    <div className="campaign-world-activities-react" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
