// sequence.ts — Phase G.9 / G.10 shared types for sequence cards
// (event tab) and the sequence-shelf (storyHome).
//
// Phase H.4 — `getSequenceShelfData`, plus the per-entry data builders
// `sequenceDeliveryData`, `sequenceActionData`, `sequenceShelfEntryData`,
// and the story-meta helpers (`storySequenceSummary`,
// `storySequenceActionLabel`, etc.) ported inline. The
// CampaignSequences module surface is the same one the JS originals
// consulted; the story-status / story-meta lookups are typed.

import { label } from "../../util/cui-utils";
import type { CampaignStateSnapshot } from "../../store";

export type SequenceScope = "story" | "quest" | "event";

export interface SequenceDelivery {
  readonly statusLabel: string | null;
  readonly note: string;
}

export interface SequenceAction {
  readonly entryId: string;
  readonly label: string;
  readonly blocked: boolean;
}

export interface SequenceShelfEntry {
  readonly id: string;
  readonly scope: SequenceScope;
  readonly kindLabel: string;
  readonly title: string;
  readonly summary: string;
  readonly storyMetaChips: readonly string[];
  readonly storyStatusLabel: string;
  readonly tags: readonly string[];
  readonly delivery: SequenceDelivery | null;
  readonly action: SequenceAction;
}

export interface SequenceShelfData {
  readonly scope: SequenceScope;
  readonly wide: boolean;
  readonly title: string;
  readonly note: string;
  readonly entries: readonly SequenceShelfEntry[];
}

// ── Module surfaces ─────────────────────────────────────────────────
export interface SequenceEntry {
  readonly id?: string;
  readonly title?: string;
  readonly kind?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly summary?: { short?: string; default?: string };
}

interface StoryMeta {
  readonly chapterLabel?: string;
  readonly partLabel?: string;
  readonly deliveryStatus?: string;
  readonly deliveryNote?: string;
  readonly summary?: { short?: string; default?: string };
}

interface StoryStatus {
  readonly deliveryStatus?: string;
  readonly deliveryNote?: string;
  readonly deliveryBlocked?: boolean;
  readonly replayOnly?: boolean;
  readonly completed?: boolean;
  readonly defaulted?: boolean;
  readonly record?: unknown;
}

interface CampaignSequencesSurface {
  readonly list?: (scope: string, world?: string) => readonly SequenceEntry[];
  readonly storyMeta?: (entry: SequenceEntry | string, world?: string) => StoryMeta | null | undefined;
  readonly storyStatus?: (entryId: string | undefined, state: unknown, world?: string) => StoryStatus | null | undefined;
}

interface CampaignStateSurface {
  readonly getState?: () => CampaignStateForShelf | null | undefined;
}

interface SequenceCjs {
  readonly CampaignSequences?: CampaignSequencesSurface;
  readonly CampaignState?: CampaignStateSurface;
}

function cjs(): SequenceCjs {
  return (window as unknown as { CJS?: SequenceCjs }).CJS ?? {};
}

interface CampaignStateForShelf {
  readonly currentWorld?: string;
}

function currentState(): CampaignStateForShelf {
  return cjs().CampaignState?.getState?.() || {};
}

// ── Delivery status helpers (story / event / quest) ────────────────
function sequenceDeliveryStatus(entry: SequenceEntry, scope: SequenceScope, state: CampaignStateForShelf): string {
  const Seq = cjs().CampaignSequences;
  const world = state.currentWorld;
  if (scope === "story") {
    return (
      Seq?.storyStatus?.(entry.id, state, world)?.deliveryStatus ||
      Seq?.storyMeta?.(entry, world)?.deliveryStatus ||
      "ready"
    );
  }
  return Seq?.storyMeta?.(entry, world)?.deliveryStatus || "ready";
}

function sequenceDeliveryBlocked(entry: SequenceEntry, scope: SequenceScope, state: CampaignStateForShelf): boolean {
  const status = sequenceDeliveryStatus(entry, scope, state);
  return status === "in_update" || status === "blocked";
}

function sequenceDeliveryNote(entry: SequenceEntry, scope: SequenceScope, state: CampaignStateForShelf): string {
  const Seq = cjs().CampaignSequences;
  const world = state.currentWorld;
  if (scope === "story") {
    return (
      Seq?.storyStatus?.(entry.id, state, world)?.deliveryNote ||
      Seq?.storyMeta?.(entry, world)?.deliveryNote ||
      ""
    );
  }
  return Seq?.storyMeta?.(entry, world)?.deliveryNote || "";
}

function storySequenceSummary(entry: SequenceEntry, state: CampaignStateForShelf): string {
  const meta = cjs().CampaignSequences?.storyMeta?.(entry, state.currentWorld) || {};
  return meta.summary?.short || meta.summary?.default || entry.description || "";
}

function storySequenceActionLabel(entry: SequenceEntry, state: CampaignStateForShelf): string {
  const status = cjs().CampaignSequences?.storyStatus?.(entry.id, state, state.currentWorld);
  if (status?.deliveryBlocked) return "In Update";
  return status?.replayOnly ? "Read" : "Start";
}

function storySequenceMetaChips(entry: SequenceEntry, state: CampaignStateForShelf): readonly string[] {
  const meta = cjs().CampaignSequences?.storyMeta?.(entry, state.currentWorld) || {};
  const bits: string[] = [];
  if (meta.chapterLabel) bits.push(`Chapter ${meta.chapterLabel}`);
  if (meta.partLabel) bits.push(meta.partLabel);
  return bits;
}

function storySequenceStatusLabel(entry: SequenceEntry, state: CampaignStateForShelf): string {
  const status = cjs().CampaignSequences?.storyStatus?.(entry.id, state, state.currentWorld);
  if (!status?.record) return "";
  return status.defaulted ? "Defaulted" : status.completed ? "Played" : "Read";
}

// ── Per-entry data builders (exported for getEventTabData) ─────────
export function sequenceDeliveryData(
  entry: SequenceEntry = {},
  scope: SequenceScope = "story"
): SequenceDelivery | null {
  const state = currentState();
  const status = sequenceDeliveryStatus(entry, scope, state);
  const note = sequenceDeliveryNote(entry, scope, state);
  if (!status || status === "ready") {
    return note ? { statusLabel: null, note: String(note) } : null;
  }
  return {
    statusLabel: label(status),
    note: String(note || "")
  };
}

export function sequenceActionData(
  entry: SequenceEntry = {},
  scope: SequenceScope = "story"
): SequenceAction {
  const state = currentState();
  const blocked = sequenceDeliveryBlocked(entry, scope, state);
  const labelText = scope === "story" ? storySequenceActionLabel(entry, state) : blocked ? "In Update" : "Start";
  return {
    entryId: String(entry.id || ""),
    label: String(labelText),
    blocked
  };
}

function sequenceShelfEntryData(entry: SequenceEntry, scope: SequenceScope, state: CampaignStateForShelf): SequenceShelfEntry {
  const isStory = scope === "story";
  const hasNativeSummary = entry.summary?.short || entry.summary?.default || entry.description;
  const summaryText = isStory
    ? storySequenceSummary(entry, state)
    : hasNativeSummary
      ? String(entry.summary?.short || entry.summary?.default || entry.description)
      : "";
  return {
    id: String(entry.id || ""),
    scope,
    kindLabel: label(entry.kind || scope),
    title: String(entry.title || entry.id || ""),
    summary: String(summaryText),
    storyMetaChips: isStory ? storySequenceMetaChips(entry, state) : [],
    storyStatusLabel: isStory ? storySequenceStatusLabel(entry, state) : "",
    tags: (entry.tags || []).slice(0, 4).map((tag) => label(tag)),
    delivery: sequenceDeliveryData(entry, scope),
    action: sequenceActionData(entry, scope)
  };
}

export interface SequenceShelfOptions {
  readonly wide?: boolean;
  readonly title?: string;
  readonly note?: string;
}

export function getSequenceShelfData(
  scope: SequenceScope,
  options: SequenceShelfOptions = {},
  state?: CampaignStateSnapshot
): SequenceShelfData | null {
  const typedState = (state ?? currentState()) as CampaignStateForShelf;
  if (!typedState) return null;
  const entries = cjs().CampaignSequences?.list?.(scope, typedState.currentWorld) || [];
  const titleText =
    options.title ||
    (scope === "story" ? "Story Files" : scope === "event" ? "Event Files" : "Quest Papers");
  const note = options.note || "Small authored files that can be played one node at a time.";
  return {
    scope,
    wide: !!options.wide,
    title: String(titleText),
    note: String(note),
    entries: entries.map((entry) => sequenceShelfEntryData(entry, scope, typedState))
  };
}
