// CampaignQuestsPanelTab.tsx — Phase F JSX port of `_renderQuestPanel`.
//
// Renders the Quest Tracker panel: header (counts + Add Quest /
// Quest Run buttons), solo-notice panel, the active quest list
// (shared `<QuestRow>` JSX), and a collapsible "Resolved" section.
//
// Zombie world renders the scavenge tracker JSX (Phase G.17).

import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import { getQuestPanelData, type QuestPanelData } from "./data/questPanel";
import { QuestRow } from "./QuestRow";
import { ZombieScavengeTracker } from "./ZombieScavenge";
import { SoloNoticePanel } from "./ResultPanels";
import { VirtualList } from "../util/VirtualList";

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
    return <ZombieScavengeTracker data={data.zombie} />;
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
      <SoloNoticePanel />
      {data.activeQuestRows.length ? (
        <VirtualList
          items={data.activeQuestRows}
          itemKey={(row) => row.id}
          renderItem={(row) => <QuestRow row={row} />}
          estimateHeight={240}
          gap={12}
          listClassName="campaign-quest-list"
          ariaLabel="Active quests"
        />
      ) : (
        <div className="campaign-quest-list">
          <div className="campaign-empty">No active quests.</div>
        </div>
      )}
      {data.finishedQuestRows.length > 0 && (
        <details className="campaign-resolved-quests">
          <summary>Resolved ({data.finishedCount})</summary>
          <VirtualList
            items={data.finishedQuestRows}
            itemKey={(row) => row.id}
            renderItem={(row) => <QuestRow row={row} />}
            estimateHeight={180}
            gap={12}
            listClassName="campaign-quest-list"
            ariaLabel="Resolved quests"
          />
        </details>
      )}
    </section>
  );
}
