// eventTab.ts — Phase F bridge for the Event {Character,Special,Side}
// tabs. Shared shape; `kind` selects which variant.
//
// Phase H.4 — `getEventTabData` ported inline. The per-entry delivery /
// action metadata comes from `data/sequence.ts`; the quest-chain side
// rail data comes from `data/questChain.ts`.

import { label } from "../../util/cui-utils";
import {
  sequenceDeliveryData,
  sequenceActionData,
  type SequenceDelivery,
  type SequenceAction,
  type SequenceEntry
} from "./sequence";
import {
  questChainActiveData,
  questChainTemplateData,
  type ChainActiveInput,
  type ChainTemplateInput
} from "./questChain";
import type { CampaignStateSnapshot } from "../../store";

export type { SequenceDelivery, SequenceAction } from "./sequence";

export type EventTabKind = "character" | "special" | "side";

export interface EventFileEntry {
  readonly id: string;
  readonly title: string;
  readonly kindLabel: string;
  readonly summary: string;
  readonly tagLabels: readonly string[];
  readonly delivery: SequenceDelivery | null;
  readonly action: SequenceAction;
}

// G.14 — typed quest-chain shapes.
export interface QuestChainStep {
  readonly id: string;
  readonly label: string;
  readonly text: string;
  readonly meta: readonly string[];
  readonly systems: readonly string[];
  readonly detailLines: readonly string[];
  readonly pulseHints: readonly string[];
}

export interface QuestChainStakes {
  readonly runLine: string;
  readonly rewardLine: string;
  readonly failureLine: string;
}

export type QuestChainVnStepState = "current" | "done" | "upcoming";

export interface QuestChainVnStepChip {
  readonly index: number;
  readonly label: string;
  readonly state: QuestChainVnStepState;
}

export interface QuestChainVnPanel {
  readonly badgeLabel: string;
  readonly title: string;
  readonly text: string;
  readonly systems: readonly string[];
  readonly plot: string;
  readonly characters: string;
  readonly steps: readonly QuestChainVnStepChip[];
}

export interface QuestChainActiveData {
  readonly templateId: string;
  readonly title: string;
  readonly status: string;
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly stepLabel: string;
  readonly currentStepDetail: QuestChainStep | null;
  readonly contextTags: readonly string[];
  readonly vnPanel: QuestChainVnPanel;
  readonly stakes: QuestChainStakes;
}

export interface QuestChainTemplateData {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly canonRisk: string;
  readonly canonRiskClass: string;
  readonly tags: readonly string[];
  readonly vnPanel: QuestChainVnPanel;
  readonly stakes: QuestChainStakes;
  readonly steps: readonly QuestChainStep[];
}

export interface EventTabQuestChains {
  readonly activeCount: number;
  readonly availableCount: number;
  readonly active: readonly QuestChainActiveData[];
  readonly available: readonly QuestChainTemplateData[];
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

// ── Module surfaces ─────────────────────────────────────────────────
interface CampaignSequencesSurface {
  readonly list?: (scope: string) => readonly SequenceEntry[];
}

interface CampaignQuestChainsSurface {
  readonly getActive?: () => readonly ChainActiveInput[];
  readonly getAvailable?: () => readonly ChainTemplateInput[];
}

interface EventTabCjs {
  readonly CampaignSequences?: CampaignSequencesSurface;
  readonly CampaignQuestChains?: CampaignQuestChainsSurface;
}

function cjs(): EventTabCjs {
  return (window as unknown as { CJS?: EventTabCjs }).CJS ?? {};
}

const KIND_LABELS: Readonly<Record<EventTabKind, {
  readonly kicker: string;
  readonly title: string;
  readonly text: string;
  readonly empty: string;
}>> = {
  character: {
    kicker: "Character Event",
    title: "Relationship / Persona Scenes",
    text: "Focused authored scenes for party members, dialogue, relationship flags, and small consequences.",
    empty: "No character events loaded yet."
  },
  special: {
    kicker: "Special Event",
    title: "Limited or Plot-Timed",
    text: "Rank-up, holiday, unlock, or story-progression events with proper authored flow.",
    empty: "No special events loaded yet."
  },
  side: {
    kicker: "Side Stories",
    title: "Optional Story Content",
    text: "Side-story files and existing side-story chains. Battles and map runs should be attached through Quest.",
    empty: "No side stories loaded yet."
  }
};

// `_eventFileKind` — classifies a sequence entry by side / special /
// character so the Event{Character,Special,Side} tabs each show only
// their own files.
function eventFileKind(entry: SequenceEntry = {}): EventTabKind {
  const kind = String(entry.kind || "").toLowerCase();
  const tags = (entry.tags || []).map((tag) => String(tag).toLowerCase());
  if (kind.includes("special") || tags.includes("special_event")) return "special";
  if (kind.includes("side") || tags.includes("side_story")) return "side";
  return "character";
}

export function getEventTabData(kind: EventTabKind, state: CampaignStateSnapshot): EventTabData | null {
  if (!state) return null;
  const c = cjs();
  const entries = (c.CampaignSequences?.list?.("event") || []).filter((entry) => eventFileKind(entry) === kind);
  const info = KIND_LABELS[kind] || KIND_LABELS.character;
  const activeChains = kind === "side" ? c.CampaignQuestChains?.getActive?.() || [] : [];
  const availableChains = kind === "side" ? c.CampaignQuestChains?.getAvailable?.() || [] : [];
  return {
    kind,
    kicker: info.kicker,
    title: info.title,
    text: info.text,
    empty: info.empty,
    meta:
      kind === "side"
        ? [`${entries.length} files`, `${activeChains.length} active`, `${availableChains.length} available`]
        : [`${entries.length} files`, "authored flow", "event log ready"],
    entryCount: entries.length,
    entries: entries.map((entry) => ({
      id: String(entry.id || ""),
      title: entry.title || entry.id || "",
      kindLabel: label(entry.kind || kind),
      summary: entry.summary?.short || entry.summary?.default || entry.description || "",
      tagLabels: (entry.tags || []).slice(0, 4).map((tag) => label(tag)),
      delivery: sequenceDeliveryData(entry, "event"),
      action: sequenceActionData(entry, "event")
    })),
    questChains:
      kind === "side"
        ? {
            activeCount: activeChains.length,
            availableCount: availableChains.length,
            active: activeChains.map((chain) => questChainActiveData(chain)),
            available: availableChains.map((chain) => questChainTemplateData(chain))
          }
        : null
  };
}
