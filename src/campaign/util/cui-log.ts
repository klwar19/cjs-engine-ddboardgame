// cui-log.ts — Phase H.4 TypeScript port of the Log helpers.
//
// `js/campaign/ui/cui-log.js` exported a frozen `Log` namespace on
// `window.CJS.CampaignUIInternal.Log`. The TS port installs the same
// surface for the still-JS callers (campaign-ui.js's chrome data
// builder + recent-log strip) and the ported TS callers.
//
// Categorizes a campaign log line by op/text, formats metadata
// (phase + time), and renders an entry row. Uses `esc` / `escAttr`
// from cui-utils.ts; no closure state from the main IIFE.

import { esc, escAttr } from "./cui-utils";

// ── Types ────────────────────────────────────────────────────────────
export interface LogLine {
  readonly op?: string;
  readonly text?: string;
  readonly at?: string | number | Date;
  readonly phase?: number | string;
  readonly [key: string]: unknown;
}

export interface LogKind {
  readonly key: string;
  readonly label: string;
}

export interface LogEntryOptions {
  readonly compact?: boolean;
}

// ── Kind classification ──────────────────────────────────────────────
// Same heuristic order as the original closure — order matters because
// the categories overlap (e.g. a "battle quest" line should classify as
// `quest` not `battle`, but the closure returned `party` first since
// HP/MP changes come from battle).
export function logKind(line: LogLine = {}): LogKind {
  const op = String(line.op || "").toLowerCase();
  const text = String(line.text || "").toLowerCase();
  const starts = (value: string) => text.startsWith(value);

  if (op.includes("party") || / hp\b| mp\b|joined the roster|left the roster|availability|learned|forgot|gained status|active party|bench/.test(text)) {
    return { key: "party", label: "Party" };
  }
  if (op.includes("battle") || text.includes("battle") || text.includes("combat")) {
    return { key: "battle", label: "Battle" };
  }
  if (op.includes("event") || starts("event ") || starts("plot seed")) {
    return { key: "event", label: "Event" };
  }
  if (op.includes("quest") || starts("quest ")) {
    return { key: "quest", label: "Quest" };
  }
  if (op.includes("oracle") || text.includes("oracle")) {
    return { key: "oracle", label: "Oracle" };
  }
  if (op.includes("scenario") || starts("scenario ") || starts("moved ") || starts("move blocked") || text.includes("danger")) {
    return { key: "run", label: "Run" };
  }
  if (op.includes("shop") || op.includes("craft") || op.includes("farm") || starts("added ") || starts("removed ") || starts("gained ") || starts("spent ")) {
    return { key: "loot", label: "Loot" };
  }
  if (op.includes("hub") || starts("rumor ") || starts("npc ") || starts("bond ") || starts("clock ") || starts("memory shard")) {
    return { key: "hub", label: "Hub" };
  }
  if (starts("phase ")) {
    return { key: "phase", label: "Phase" };
  }
  return { key: "system", label: "Log" };
}

// ── Time / meta formatting ───────────────────────────────────────────
export function formatLogTime(value: string | number | Date | undefined, compact = false): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const options: Intl.DateTimeFormatOptions = compact
    ? { hour: "2-digit", minute: "2-digit" }
    : { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
  return date.toLocaleString([], options);
}

export function logMeta(line: LogLine = {}, compact = false): string {
  const phase = line.phase ? `Phase ${line.phase}` : "Phase ?";
  const time = formatLogTime(line.at, compact);
  return [phase, time].filter(Boolean).join(" | ");
}

// ── Entry row HTML ───────────────────────────────────────────────────
export function renderLogEntry(line: LogLine, options: LogEntryOptions = {}): string {
  const kind = logKind(line);
  return `
      <div class="campaign-log-line campaign-log-${escAttr(kind.key)}">
        <div class="campaign-log-main">
          <span class="campaign-log-type">${esc(kind.label)}</span>
          <span>${esc(line.text || "")}</span>
        </div>
        <small>${esc(logMeta(line, options.compact))}</small>
      </div>
    `;
}

// ── Legacy namespace install ─────────────────────────────────────────
export interface CuiLog {
  readonly logKind: typeof logKind;
  readonly formatLogTime: typeof formatLogTime;
  readonly logMeta: typeof logMeta;
  readonly renderLogEntry: typeof renderLogEntry;
}

const NAMESPACE: CuiLog = Object.freeze({
  logKind,
  formatLogTime,
  logMeta,
  renderLogEntry
});

interface CuiInternalWindow {
  CJS?: {
    CampaignUIInternal?: { Log?: CuiLog; [key: string]: unknown };
    [key: string]: unknown;
  };
}
const w = window as unknown as CuiInternalWindow;
w.CJS = w.CJS || {};
w.CJS.CampaignUIInternal = w.CJS.CampaignUIInternal || {};
w.CJS.CampaignUIInternal.Log = NAMESPACE;

export default NAMESPACE;
