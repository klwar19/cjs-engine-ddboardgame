// eventLog.ts — Phase F typed bridge for the Event Log tab.
//
// `getEventLogData(state)` returns a JSON snapshot the JSX renderer
// reads. The two shared sub-panels (event result, oracle) live in
// `src/campaign/tabs/ResultPanels.tsx` and are imported by the
// Event Log JSX directly.
//
// Phase H.4 — ported inline. Reads `state.eventLog.entries` directly,
// formats labels via the TS leaf helpers, and resolves the world hero
// backdrop URL via the same `cssVarAssetUrl` helper the chrome reader
// uses.

import { label, cssVarAssetUrl } from "../../util/cui-utils";
import { formatLogTime } from "../../util/cui-log";
import { worldThemeHomeBackdrop } from "./worldThemeAssets";
import type { CampaignStateSnapshot } from "../../store";

export interface EventLogEntry {
  readonly title: string;
  readonly summary: string;
  readonly scopeLabel: string;
  readonly phase: number | null;
  readonly at: string;
  readonly consequences: readonly string[];
  readonly tags: readonly string[];
}

export interface EventLogData {
  readonly entries: readonly EventLogEntry[];
  readonly totalCount: number;
  readonly oracleCount: number;
  readonly manualCount: number;
  readonly heroBackdropUrl: string | null;
}

interface RawEventLogEntry {
  readonly title?: string;
  readonly summary?: string;
  readonly scope?: string;
  readonly source?: string;
  readonly phase?: number;
  readonly at?: string | number | Date;
  readonly consequences?: readonly string[];
  readonly tags?: readonly string[];
}

interface CampaignStateForEventLog {
  readonly eventLog?: { readonly entries?: readonly RawEventLogEntry[] };
}

interface CampaignStateModule {
  readonly getCurrentWorld?: () => {
    readonly id?: string;
    readonly storyModeTheme?: {
      readonly id?: string;
      readonly homeBackdrop?: string;
      readonly bannerImage?: string;
      readonly backdrop?: string;
    };
  } | null | undefined;
}

interface Cjs {
  readonly CampaignState?: CampaignStateModule;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

// Resolved backdrop URL for the world's home hero (or null when the
// world doesn't ship one). Used as a CSS variable on the React hero;
// JSX needs only the URL, not the wrapping `style="..."`.
function worldHomeBackdropUrl(): string | null {
  const world = cjs().CampaignState?.getCurrentWorld?.() || {};
  const theme = world.storyModeTheme || {};
  const backdrop = worldThemeHomeBackdrop(world.id || theme.id || "", theme);
  if (!backdrop) return null;
  return cssVarAssetUrl(backdrop);
}

export function getEventLogData(state: CampaignStateSnapshot): EventLogData | null {
  if (!state) return null;
  const rawEntries = (state as CampaignStateForEventLog).eventLog?.entries || [];
  const entries: EventLogEntry[] = rawEntries.map((entry) => ({
    title: entry.title || "Event",
    summary: entry.summary || "",
    scopeLabel: label(entry.scope || entry.source || "event"),
    phase: entry.phase ?? null,
    at: entry.at ? formatLogTime(entry.at) : "",
    consequences: Array.isArray(entry.consequences) ? entry.consequences.slice(0) : [],
    tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 8).map((tag) => label(tag)) : []
  }));
  const oracleCount = rawEntries.filter((entry) =>
    String(entry.source || "").includes("oracle") || (entry.tags || []).includes("oracle")
  ).length;
  const manualCount = rawEntries.filter((entry) =>
    String(entry.source || "").includes("manual") || (entry.tags || []).includes("manual_event")
  ).length;
  return {
    entries,
    totalCount: rawEntries.length,
    oracleCount,
    manualCount,
    heroBackdropUrl: worldHomeBackdropUrl()
  };
}
