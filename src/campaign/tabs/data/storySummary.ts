// storySummary.ts — Phase F typed bridge for the Story Summary tab.
//
// Phase H.4 — `getStorySummaryData` ported inline. Reads the typed
// snapshot via the `CampaignSequences` module + the storyMode /
// storyDirector slots on the state.

import { label } from "../../util/cui-utils";
import type { CampaignStateSnapshot } from "../../store";

export interface StoryPartEntry {
  readonly title: string;
  readonly chapterLabel: string;
  readonly partLabel: string;
  readonly modeLabel: string;
  readonly result: string;
  readonly timestamp: string;
  readonly summaryText: string;
  readonly routeText: string;
  readonly syncSummary: readonly string[];
}

export interface ManualNote {
  readonly title: string;
  readonly timestamp: string;
  readonly text: string;
}

export interface RevealedFact {
  readonly title: string;
  readonly text: string;
}

export interface HeldBeat {
  readonly title: string;
  readonly status: string;
  readonly text: string;
}

export interface StorySummaryData {
  readonly storyParts: readonly StoryPartEntry[];
  readonly manual: readonly ManualNote[];
  readonly facts: readonly RevealedFact[];
  readonly queue: readonly HeldBeat[];
}

// ── Module surfaces ──────────────────────────────────────────────────
interface StoryEntry {
  readonly id?: string;
  readonly title?: string;
  readonly chapterLabel?: string;
}

interface StoryMeta {
  readonly chapterLabel?: string;
  readonly partLabel?: string;
  readonly syncSummary?: readonly string[];
}

interface SequenceLogLine {
  readonly summary?: string;
}

interface StoryPartRecord {
  readonly sequenceId?: string;
  readonly title?: string;
  readonly chapterLabel?: string;
  readonly mode?: string;
  readonly result?: string;
  readonly completedAt?: string;
  readonly startedAt?: string;
  readonly summaryText?: string;
  readonly log?: readonly SequenceLogLine[];
  readonly routeChoices?: ReadonlyArray<{ label?: string; choiceId?: string }>;
  readonly syncSummary?: readonly string[];
  readonly [key: string]: unknown;
}

interface CampaignSequencesSurface {
  readonly list?: (kind: string, world: string | undefined) => readonly StoryEntry[];
  readonly storyMeta?: (entry: StoryEntry, world: string | undefined) => StoryMeta | null | undefined;
}

interface StorySummaryCjs {
  readonly CampaignSequences?: CampaignSequencesSurface;
}

function cjs(): StorySummaryCjs {
  return (window as unknown as { CJS?: StorySummaryCjs }).CJS ?? {};
}

interface CampaignStateForStorySummary {
  readonly currentWorld?: string;
  readonly storyMode?: {
    readonly partResults?: Record<string, StoryPartRecord>;
    readonly manualSummaryEntries?: ReadonlyArray<{
      title?: string;
      at?: string;
      text?: string;
    }>;
  };
  readonly storyDirector?: {
    readonly revealedFacts?: Record<string, { title?: string; id?: string; text?: string; note?: string }>;
    readonly storyQueue?: Record<string, { id?: string; title?: string; status?: string; prompt?: string; summary?: string }>;
  };
}

// `_storySummaryTextFromRecord` — derives a one-line summary when the
// record doesn't have an explicit summaryText set.
function storySummaryTextFromRecord(record: StoryPartRecord): string {
  if (record.summaryText) return record.summaryText;
  const fromLog = (record.log || []).map((line) => line.summary).filter(Boolean).slice(-3).join(" | ");
  if (fromLog) return fromLog;
  return record.result || "Story part recorded.";
}

// `_storySummaryEntries` — builds the story-summary entry list,
// ordered by Sequences.list() with un-ordered records appended.
function storySummaryEntries(state: CampaignStateForStorySummary): readonly StoryPartRecord[] {
  const Seq = cjs().CampaignSequences;
  const ordered = Seq?.list?.("story", state.currentWorld) || [];
  const records = state.storyMode?.partResults || {};
  const seen = new Set<string>();
  const out: StoryPartRecord[] = ordered
    .map((entry): StoryPartRecord | null => {
      const id = entry.id;
      if (!id) return null;
      const record = records[id];
      if (!record) return null;
      seen.add(id);
      const meta = Seq?.storyMeta?.(entry, state.currentWorld) || {};
      return {
        ...record,
        title: record.title || entry.title || id,
        chapterLabel: record.chapterLabel || meta.chapterLabel || "",
        partLabel: meta.partLabel || "",
        summaryText: storySummaryTextFromRecord(record),
        syncSummary: record.syncSummary || meta.syncSummary || []
      } as StoryPartRecord;
    })
    .filter((value): value is StoryPartRecord => value != null);
  for (const record of Object.values(records)) {
    if (!record?.sequenceId || seen.has(record.sequenceId)) continue;
    out.push({
      ...record,
      title: record.title || record.sequenceId,
      chapterLabel: record.chapterLabel || "",
      partLabel: "",
      summaryText: storySummaryTextFromRecord(record),
      syncSummary: record.syncSummary || []
    } as StoryPartRecord);
  }
  return out;
}

export function getStorySummaryData(state: CampaignStateSnapshot): StorySummaryData | null {
  if (!state) return null;
  const typed = state as CampaignStateForStorySummary;
  const storyParts: StoryPartEntry[] = storySummaryEntries(typed).map((entry) => ({
    title: entry.title || entry.sequenceId || "Story Part",
    chapterLabel: entry.chapterLabel || "",
    partLabel: (entry as { partLabel?: string }).partLabel || "",
    modeLabel: label(entry.mode || "played"),
    result: entry.result || "complete",
    timestamp: entry.completedAt || entry.startedAt || "",
    summaryText: entry.summaryText || "",
    routeText: (entry.routeChoices || [])
      .map((choice) => choice.label || choice.choiceId)
      .filter((value): value is string => Boolean(value))
      .join(" → "),
    syncSummary: Array.isArray(entry.syncSummary) ? entry.syncSummary.slice(0) : []
  }));
  const manual: ManualNote[] = (typed.storyMode?.manualSummaryEntries || []).map((entry) => ({
    title: entry.title || "Manual Note",
    timestamp: entry.at || "",
    text: entry.text || ""
  }));
  const facts: RevealedFact[] = Object.values(typed.storyDirector?.revealedFacts || {})
    .slice(0, 8)
    .map((fact) => ({
      title: fact.title || fact.id || "Fact",
      text: fact.text || fact.note || ""
    }));
  const queue: HeldBeat[] = Object.values(typed.storyDirector?.storyQueue || {})
    .slice(0, 8)
    .map((beat) => ({
      title: beat.title || beat.id || "Beat",
      status: beat.status || "held",
      text: beat.prompt || beat.summary || ""
    }));
  return { storyParts, manual, facts, queue };
}
