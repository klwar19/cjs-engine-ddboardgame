import type { CampaignStateSnapshot } from "../store";

// Wrappers for tabs whose body is still produced by a closure-private
// `_render*` function inside `campaign-ui.js`. The vanilla side exposes
// `CampaignUI.renderTabBody(tabId, state)` to bridge over the closure;
// these React components just mount the resulting HTML so the rest of
// the shell (header, mode bar, sub-tabs, command rail) can be wholly
// React-owned without porting every inner renderer in one go.

interface CampaignUIModule {
  readonly renderTabBody: (tabId: string, state?: CampaignStateSnapshot) => string;
}

interface Cjs {
  readonly CampaignUI?: CampaignUIModule;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

interface Props {
  readonly state: CampaignStateSnapshot;
}

function VanillaTab({
  tabId,
  state,
  mountClass
}: {
  tabId: string;
  state: CampaignStateSnapshot;
  mountClass: string;
}) {
  const UI = cjs().CampaignUI;
  if (!UI?.renderTabBody) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">Campaign shell still booting…</div>
      </section>
    );
  }
  let html: string;
  try {
    html = UI.renderTabBody(tabId, state);
  } catch (error) {
    console.error(`renderTabBody(${tabId}) failed:`, error);
    html = `<section class="campaign-panel"><div class="campaign-empty">${tabId} render failed.</div></section>`;
  }
  return <div className={mountClass} dangerouslySetInnerHTML={{ __html: html }} />;
}

// CampaignWorldGateTab moved to a dedicated JSX port at
// `src/campaign/tabs/CampaignWorldGateTab.tsx` (Phase F.12).

// CampaignStoryHomeTab moved to a dedicated JSX port at
// `src/campaign/tabs/CampaignStoryHomeTab.tsx` (Phase F.11).

// CampaignStorySummaryTab moved to a dedicated JSX port at
// `src/campaign/tabs/CampaignStorySummaryTab.tsx` (Phase F.5).

export const CampaignStoryDirectorTab = ({ state }: Props) =>
  <VanillaTab tabId="storyDirector" state={state} mountClass="campaign-story-director-react" />;

// CampaignQuestHomeTab moved to a dedicated JSX port at
// `src/campaign/tabs/CampaignQuestHomeTab.tsx` (Phase F.6).

// CampaignQuestsPanelTab moved to a dedicated JSX port at
// `src/campaign/tabs/CampaignQuestsPanelTab.tsx` (Phase F.10).

// CampaignEventHomeTab / CampaignEventCharacterTab / CampaignEventSpecialTab
// / CampaignEventSideTab moved to a dedicated JSX port at
// `src/campaign/tabs/CampaignEventTab.tsx` (Phase F.7).

// CampaignEventLogTab moved to its own JSX-first port at
// `src/campaign/tabs/CampaignEventLogTab.tsx` (Phase F.2). The vanilla
// `_renderEventLog` body has been removed; only the two sub-panels
// (last event result, last oracle) are still HTML bridges and will
// migrate alongside the event{Character,Special,Side} tabs.

// CampaignScenariosTab moved to a dedicated JSX port at
// `src/campaign/tabs/CampaignScenariosTab.tsx` (Phase F.8).

// CampaignMapsTab moved to a dedicated JSX port at
// `src/campaign/tabs/CampaignMapsTab.tsx` (Phase F.9).

// CampaignMinigameTestTab moved to a dedicated JSX port at
// `src/campaign/tabs/CampaignMinigameTestTab.tsx` (Phase F.3).
// CampaignOverviewTab moved to a dedicated JSX port at
// `src/campaign/tabs/CampaignOverviewTab.tsx` (Phase F.4).
