import type { CampaignStateSnapshot } from "../store";
import * as CampaignActions from "../actions";
import { VirtualList } from "../util/VirtualList";
import { LogLineView, type LogLine } from "./LogLine";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignLogsTab({ state }: Props) {
  const lines: readonly LogLine[] = ((state.log as readonly LogLine[] | undefined) ?? []);
  const hasLog = lines.length > 0;

  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h2>Session Log</h2>
        <div className="campaign-panel-actions">
          <button className="campaign-action" onClick={CampaignActions.exportLog}>
            Export Log
          </button>
          {hasLog ? (
            <button className="campaign-action danger" onClick={CampaignActions.clearLog}>
              Clear Log
            </button>
          ) : null}
        </div>
      </div>
      {hasLog ? (
        <VirtualList
          items={lines}
          itemKey={(_, index) => index}
          renderItem={(line) => <LogLineView line={line} />}
          estimateHeight={44}
          listClassName="campaign-log-list"
          ariaLabel="Session log entries"
        />
      ) : (
        <div className="campaign-empty">No log entries.</div>
      )}
    </section>
  );
}
