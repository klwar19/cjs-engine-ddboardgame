// eventTab.ts — Phase F bridge for the Event {Character,Special,Side}
// tabs. Shared shape; `kind` selects which variant.

import type { CampaignStateSnapshot } from "../../store";

export type EventTabKind = "character" | "special" | "side";

// Phase G.9 — typed delivery + action for sequence-card entries.
// `statusLabel` is null when the authored delivery state is 'ready'
// (no chip shown). `action.label` is one of 'Start' / 'Read' / 'In
// Update' depending on scope + delivery + replay state.
export interface SequenceDelivery {
  readonly statusLabel: string | null;
  readonly note: string;
}

export interface SequenceAction {
  readonly entryId: string;
  readonly label: string;
  readonly blocked: boolean;
}

export interface EventFileEntry {
  readonly id: string;
  readonly title: string;
  readonly kindLabel: string;
  readonly summary: string;
  readonly tagLabels: readonly string[];
  readonly delivery: SequenceDelivery | null;
  readonly action: SequenceAction;
}

export interface EventTabQuestChains {
  readonly activeCount: number;
  readonly availableCount: number;
  readonly activeHtml: string;
  readonly availableHtml: string;
}

export interface EventTabData {
  readonly kind: EventTabKind;
  readonly kicker: string;
  readonly title: string;
  readonly text: string;
  readonly empty: string;
  readonly meta: readonly string[];
  readonly entryCount: number;
  readonly entries: readonly EventFileEntry[];
  readonly questChains: EventTabQuestChains | null;
}

interface Bridge {
  readonly getEventTabData: (
    kind: EventTabKind,
    state?: CampaignStateSnapshot
  ) => EventTabData | null;
}

interface Cjs {
  readonly CampaignUI?: Bridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getEventTabData(
  kind: EventTabKind,
  state: CampaignStateSnapshot
): EventTabData | null {
  return cjs().CampaignUI?.getEventTabData(kind, state) ?? null;
}
