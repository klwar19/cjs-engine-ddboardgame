// LogLine.tsx — one campaign log line as JSX. Shared by the Logs tab
// (full meta) and the command-rail log drawer (`compact`), so both render
// from a single source. It is its own module so importing it into the eager
// shell drawer doesn't pull the lazy `CampaignLogsTab` chunk eagerly.
//
// Mirrors the old `cui-log.ts` `renderLogEntry(line, { compact })` HTML
// emitter element-for-element; the kind/meta math stays in the engine util
// (`CampaignUIInternal.Log`), read through the typed accessor below.

export interface LogLine {
  readonly op?: string;
  readonly text?: string;
  readonly at?: string;
  readonly phase?: string | number;
}

interface LogKindModule {
  readonly logKind: (line: LogLine) => { key: string; label: string };
  readonly logMeta: (line: LogLine, compact?: boolean) => string;
}

function logHelpers(): LogKindModule | undefined {
  return (window as unknown as { CJS?: { CampaignUIInternal?: { Log?: LogKindModule } } })
    .CJS?.CampaignUIInternal?.Log;
}

export function LogLineView({ line, compact = false }: { line: LogLine; compact?: boolean }) {
  const helpers = logHelpers();
  const kind = helpers?.logKind?.(line) ?? { key: "system", label: "Log" };
  const meta = helpers?.logMeta?.(line, compact) ?? "";
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
