// CampaignQuestsPanelTab.tsx — Phase F JSX port of `_renderQuestPanel`.
//
// Renders the Quest Tracker panel: header (counts + Add Quest /
// Quest Run buttons), solo-notice bridge, the active quest list, and
// a collapsible "Resolved" section. Per-quest rows still come from
// the HTML bridge because `_renderQuestRow` is shared with several
// other tabs.
//
// Zombie world delegates to the existing `_renderZombieScavengeTracker`
// for now via a single HTML bridge; it ports later.

import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import { getQuestPanelData, type QuestPanelData } from "./data/questPanel";
import { QuestRow } from "./QuestRow";
import { SoloNoticePanel } from "./ResultPanels";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignQuestsPanelTab({ state }: Props) {
  const data = getQuestPanelData(state);
  if (!data) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">Quest Tracker not ready.</div>
      </section>
    );
  }
  if (data.isZombie === true) {
    return (
      <div
        className="campaign-quest-panel-zombie-bridge"
        dangerouslySetInnerHTML={{ __html: data.zombieHtml }}
      />
    );
  }
  return <NormalQuestPanel state={state} data={data} />;
}

function NormalQuestPanel({
  state,
  data
}: {
  state: CampaignStateSnapshot;
  data: Extract<QuestPanelData, { isZombie: false }>;
}) {
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h2>Quest Tracker</h2>
        <div className="campaign-panel-actions">
          <span className="campaign-pill">
            {data.activeCount} active | {data.finishedCount} resolved | {data.templateCount} templates
          </span>
          <button
            className="campaign-action primary"
            onClick={() => dispatchCampaignAction("add-quest")}
          >
            Add Quest
          </button>
          <button
            className="campaign-action"
            onClick={() => dispatchCampaignAction("random-quest-offer")}
          >
            Quest Run
          </button>
        </div>
      </div>
      <SoloNoticePanel state={state} />
      <div className="campaign-quest-list">
        {data.activeQuestRows.length ? (
          data.activeQuestRows.map((row) => <QuestRow key={row.id} row={row} />)
        ) : (
          <div className="campaign-empty">No active quests.</div>
        )}
      </div>
      {data.finishedQuestRows.length > 0 && (
        <details className="campaign-resolved-quests">
          <summary>Resolved ({data.finishedCount})</summary>
          <div className="campaign-quest-list">
            {data.finishedQuestRows.map((row) => <QuestRow key={row.id} row={row} />)}
          </div>
        </details>
      )}
    </section>
  );
}
