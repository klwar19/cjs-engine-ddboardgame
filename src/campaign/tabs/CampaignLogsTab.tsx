import type { CampaignStateSnapshot } from "../store";
import * as CampaignActions from "../actions";
import { VirtualList } from "../util/VirtualList";

interface LogLine {
  readonly op?: string;
  readonly text?: string;
  readonly at?: string;
  readonly phase?: string | number;
}

interface LogKindModule {
  readonly logKind: (line: LogLine) => { key: string; label: string };
  readonly formatLogTime: (value: string | undefined, compact?: boolean) => string;
  readonly logMeta: (line: LogLine, compact?: boolean) => string;
}

interface Cjs {
  readonly CampaignUIInternal?: { readonly Log?: LogKindModule };
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignLogsTab({ state }: Props) {
  const helpers = cjs().CampaignUIInternal?.Log;
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
          renderItem={(line) => <LogEntry line={line} helpers={helpers} />}
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

interface EntryProps {
  readonly line: LogLine;
  readonly helpers?: LogKindModule;
}

function LogEntry({ line, helpers }: EntryProps) {
  const kind = helpers?.logKind?.(line) ?? { key: "system", label: "Log" };
  const meta = helpers?.logMeta?.(line, false) ?? "";
  return (
    <div className={`campaign-log-line campaign-log-${kind.key}`}>
      <div className="campaign-log-main">
        <span className="campaign-log-type">{kind.label}</span>
        <span>{line.text ?? ""}</span>
      </div>
      <small>{meta}</small>
    </div>
  );
}
