// DrawerPanels.tsx — the command-rail drawer side panels that were the last
// HTML-string island in the shell (`boot.ts` `renderQuestsFallback` /
// `renderLogFallback` / `renderQuestMini`, reached via the retired
// `renderDrawerBody` bridge). They render the same element tree those emitters
// produced. Party / inventory / notes are owned by their own components
// (`PartyDrawer` / the inventory tab chunk / `NotesPanel`); these two are the
// remaining quests / log panels.

import type { CampaignStateSnapshot } from "../store";
import { LogLineView, type LogLine } from "../tabs/LogLine";

interface QuestObjectiveMini {
  readonly label?: string;
  readonly current?: number;
  readonly required?: number;
}

interface QuestMini {
  readonly title?: string;
  readonly id?: string;
  readonly summary?: string;
  readonly objectives?: readonly QuestObjectiveMini[];
}

function QuestMiniView({ quest }: { quest: QuestMini }) {
  const first = quest.objectives?.[0];
  return (
    <div className="campaign-quest-mini">
      <strong>{quest.title || quest.id}</strong>
      <div className="campaign-muted">
        {first
          ? `${first.label} ${first.current || 0}/${first.required || 1}`
          : (quest.summary || "")}
      </div>
    </div>
  );
}

export function QuestsDrawerPanel({ state }: { state: CampaignStateSnapshot }) {
  const quests = Object.values((state.quests as Record<string, QuestMini> | undefined) ?? {});
  if (!quests.length) return <div className="campaign-empty">No quests.</div>;
  return (
    <section className="campaign-side-section">
      <div className="campaign-panel-head"><h2>All Quests</h2></div>
      {quests.map((quest, i) => (
        <QuestMiniView key={quest.id ?? i} quest={quest} />
      ))}
    </section>
  );
}

export function LogDrawerPanel({ state }: { state: CampaignStateSnapshot }) {
  const log = (state.log as readonly LogLine[] | undefined) ?? [];
  if (!log.length) return <div className="campaign-empty">No log entries.</div>;
  return (
    <section className="campaign-side-section">
      <div className="campaign-panel-head"><h2>Campaign Log</h2></div>
      {log.map((line, i) => (
        <LogLineView key={i} line={line} compact />
      ))}
    </section>
  );
}
