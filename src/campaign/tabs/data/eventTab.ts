// eventTab.ts — Phase F bridge for the Event {Character,Special,Side}
// tabs. Shared shape; `kind` selects which variant.

import type { CampaignStateSnapshot } from "../../store";

export type EventTabKind = "character" | "special" | "side";

export interface EventFileEntry {
  readonly id: string;
  readonly title: string;
  readonly kindLabel: string;
  readonly summary: string;
  readonly tagLabels: readonly string[];
  readonly deliveryHtml: string;
  readonly actionHtml: string;
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
  readonly activeSequenceHtml: string;
  readonly questChains: EventTabQuestChains | null;
  readonly soloNoticeHtml: string;
  readonly pendingBattleHtml: string;
  readonly combatResultHtml: string;
  readonly eventResultHtml: string;
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
