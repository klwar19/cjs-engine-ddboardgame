// sequence.ts — Phase G.9 / G.10 shared types for sequence cards
// (event tab) and the sequence-shelf (storyHome). The vanilla bridge
// (`_sequenceDeliveryData`, `_sequenceActionData`,
// `_sequenceShelfData` in campaign-ui.js) produces these directly.

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

interface Bridge {
  readonly getSequenceShelfData: (
    scope: SequenceScope,
    options?: { wide?: boolean; title?: string; note?: string },
    state?: CampaignStateSnapshot
  ) => SequenceShelfData | null;
}

interface Cjs {
  readonly CampaignUI?: Bridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function getSequenceShelfData(
  scope: SequenceScope,
  options: { wide?: boolean; title?: string; note?: string } = {},
  state?: CampaignStateSnapshot
): SequenceShelfData | null {
  return cjs().CampaignUI?.getSequenceShelfData(scope, options, state) ?? null;
}
