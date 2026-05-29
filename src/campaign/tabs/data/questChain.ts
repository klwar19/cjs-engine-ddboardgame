// questChain.ts — Phase H.4 shared typed quest-chain data builders.
//
// Used by `getEventTabData` (side variant) + `getQuestChainsData`.
// The closure-private JS helpers (`_questChainStepData`,
// `_questChainStakesData`, `_questChainVnPanelData`,
// `_questChainActiveData`, `_questChainTemplateData`,
// `_questChainResolvedData`, `_sideStoryFlowGuideData`,
// `_questChainStepSystems`) all port here.
//
// The shape definitions live in `data/eventTab.ts` + `data/hub.ts` for
// the existing import paths; this file just produces the typed data.

import { label } from "../../util/cui-utils";
import type { QuestObjectiveTrigger } from "../../util/state-helpers";
import type {
  QuestChainStep,
  QuestChainStakes,
  QuestChainVnPanel,
  QuestChainVnStepChip,
  QuestChainVnStepState,
  QuestChainActiveData,
  QuestChainTemplateData
} from "./eventTab";
import type { QuestChainResolved, SideStoryFlowGuide } from "./hub";

// ── Module surfaces ─────────────────────────────────────────────────
interface CampaignOpsSurface {
  readonly describe?: (ops: readonly unknown[]) => readonly string[];
}

interface CampaignSideContentSurface {
  readonly riskClass?: (risk: string | undefined) => string;
}

interface QuestChainCjs {
  readonly CampaignOps?: CampaignOpsSurface;
  readonly CampaignSideContent?: CampaignSideContentSurface;
}

function cjs(): QuestChainCjs {
  return (window as unknown as { CJS?: QuestChainCjs }).CJS ?? {};
}

// ── Source shapes (from the engine; loosely typed) ─────────────────
export interface ChainStepInput {
  readonly id?: string;
  readonly label?: string;
  readonly text?: string;
  readonly chapterLabel?: string;
  readonly phaseType?: string;
  readonly kind?: string;
  readonly vn?: { readonly prompt?: string };
  readonly visualNovel?: { readonly prompt?: string };
  readonly character?: { readonly beat?: string };
  readonly event?: { readonly prompt?: string };
  readonly map?: { readonly objective?: string };
  readonly combat?: { readonly objective?: string };
  readonly minigame?: { readonly objective?: string };
  readonly progressTriggers?: readonly QuestObjectiveTrigger[];
}

export interface ChainTemplateInput {
  readonly id?: string;
  readonly title?: string;
  readonly name?: string;
  readonly summary?: string;
  readonly canonRisk?: string;
  readonly tags?: readonly string[];
  readonly contextTags?: readonly string[];
  readonly monsterTags?: readonly string[];
  readonly steps?: readonly ChainStepInput[];
  readonly mainNpcs?: readonly string[];
  readonly flowSummary?: string;
  readonly type?: string;
  readonly rewardOps?: readonly unknown[];
  readonly rewards?: readonly unknown[];
  readonly failureOps?: readonly unknown[];
  readonly failureConsequences?: readonly unknown[];
  readonly battleSetIds?: readonly string[];
  readonly mapSeedIds?: readonly string[];
  readonly linkedScenario?: string;
  readonly phasePlan?: ReadonlyArray<{
    chapterLabel?: string;
    id?: string;
    title?: string;
    phaseType?: string;
  }>;
}

export interface ChainActiveInput {
  readonly templateId?: string;
  readonly title?: string;
  readonly status?: string;
  readonly currentStepId?: string;
  readonly completedAtPhase?: string | number;
  readonly failedAtPhase?: string | number;
  readonly template?: ChainTemplateInput;
}

// ── Step builders ──────────────────────────────────────────────────
function triggerLabel(trigger: QuestObjectiveTrigger = {}): string {
  const bits: string[] = [];
  if (trigger.outcome) bits.push(label(trigger.outcome));
  if (trigger.skillIds?.length) bits.push(trigger.skillIds.map(label).join(" / "));
  if (trigger.statusIds?.length) bits.push(`Status ${trigger.statusIds.map(label).join(" / ")}`);
  if (trigger.defeatedTypes?.length) bits.push(`Defeat ${trigger.defeatedTypes.map(label).join(" / ")}`);
  if (trigger.defeatedMonsterIds?.length) bits.push(`Defeat ${trigger.defeatedMonsterIds.map(label).join(" / ")}`);
  const tags = trigger.requiresTags || trigger.requiresAnyTags || trigger.anyTags || [];
  const tagList = Array.isArray(tags) ? tags : [tags];
  if (tagList.length) bits.push(tagList.filter(Boolean).map((t) => label(t)).join(" / "));
  if (trigger.onlyPlayerActionTags?.length) bits.push(`Only ${trigger.onlyPlayerActionTags.map(label).join(" / ")}`);
  return bits.length ? `Auto: ${bits.join(" + ")}` : "Auto progress available";
}

function questChainStepSystems(step: ChainStepInput = {}): readonly string[] {
  const systems: string[] = [];
  if (step.vn || step.visualNovel) systems.push("VN");
  if (step.character) systems.push("Character");
  if (step.event) systems.push("Event");
  if (step.map) systems.push("Map");
  if (step.combat) systems.push("Combat");
  if (step.minigame) systems.push("Mini-Game");
  return systems;
}

export function questChainStepData(step: ChainStepInput = {}, index = 0): QuestChainStep {
  const meta = [
    step.chapterLabel ? `Chapter ${step.chapterLabel}` : "",
    step.phaseType ? label(step.phaseType) : "",
    step.kind ? label(step.kind) : ""
  ].filter(Boolean);
  const detail = [
    step.vn?.prompt || step.visualNovel?.prompt,
    step.character?.beat,
    step.event?.prompt,
    step.map?.objective,
    step.combat?.objective,
    step.minigame?.objective
  ]
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 2);
  return {
    id: String(step.id || ""),
    label: String(step.label || step.id || `Step ${index + 1}`),
    text: String(step.text || ""),
    meta: meta.map(String),
    systems: questChainStepSystems(step),
    detailLines: detail.map(String),
    pulseHints: (step.progressTriggers || []).slice(0, 2).map((trigger) => triggerLabel(trigger))
  };
}

export function questChainStakesData(chain: ChainTemplateInput = {}): QuestChainStakes {
  const ops = cjs().CampaignOps;
  const rewards = ops?.describe?.(chain.rewardOps || chain.rewards || []) || [];
  const failures = ops?.describe?.(chain.failureOps || chain.failureConsequences || []) || [];
  const battleCount = (chain.battleSetIds || []).length;
  const mapCount = (chain.mapSeedIds || []).length + (chain.linkedScenario ? 1 : 0);
  const runBits: string[] = [mapCount ? `${mapCount} map hook${mapCount === 1 ? "" : "s"}` : "generated map"];
  if (battleCount) runBits.push(`${battleCount} battle hook${battleCount === 1 ? "" : "s"}`);
  return {
    runLine: runBits.join(" · "),
    rewardLine: rewards.length ? rewards.join("; ") : "",
    failureLine: failures.length ? failures.join("; ") : "GM consequence or mark failed"
  };
}

function questChainVnPanelData(
  chain: ChainActiveInput | ChainTemplateInput,
  options: { active: boolean }
): QuestChainVnPanel {
  const active = options.active;
  const template = (active ? (chain as ChainActiveInput).template : (chain as ChainTemplateInput)) || ({} as ChainTemplateInput);
  const steps = template.steps || [];
  const currentId = active ? (chain as ChainActiveInput).currentStepId : steps[0]?.id;
  const currentIndex = Math.max(0, steps.findIndex((entry) => entry.id === currentId));
  const current = steps[currentIndex] || steps[0] || ({} as ChainStepInput);
  const npcs = (template.mainNpcs || []).slice(0, 4);
  return {
    badgeLabel: active ? "Current Scene" : "Opening Scene",
    title: String(current.label || template.title || template.id || "Side Story"),
    text: String(
      current.text ||
        template.summary ||
        "Pick a scene, run it as VN/table narration, then decide whether it becomes a map, battle, quest progress, or a parked lead."
    ),
    systems: questChainStepSystems(current),
    plot: String(template.flowSummary || template.type || "side story"),
    characters: npcs.length ? npcs.join(", ") : "GM choice",
    steps: steps.map((step, index) => {
      let state: QuestChainVnStepState = "upcoming";
      if (index === currentIndex) state = "current";
      else if (index < currentIndex) state = "done";
      const chip: QuestChainVnStepChip = {
        index: index + 1,
        label: String(step.label || step.id || `Step ${index + 1}`),
        state
      };
      return chip;
    })
  };
}

export function questChainActiveData(chain: ChainActiveInput = {}): QuestChainActiveData {
  const template = chain.template || ({} as ChainTemplateInput);
  const steps = template.steps || [];
  const currentIndex = Math.max(0, steps.findIndex((entry) => entry.id === chain.currentStepId));
  const step = steps.find((entry) => entry.id === chain.currentStepId) || null;
  const tags = Array.from(
    new Set(
      [
        ...(template.tags || []),
        ...(template.contextTags || []),
        ...(template.monsterTags || [])
      ].filter(Boolean)
    )
  ).slice(0, 8);
  return {
    templateId: String(chain.templateId || ""),
    title: String(chain.title || template.title || chain.templateId || ""),
    status: String(chain.status || ""),
    stepIndex: currentIndex + 1,
    stepCount: steps.length || 1,
    stepLabel: String(step?.label || chain.currentStepId || "-"),
    currentStepDetail: step ? questChainStepData(step, currentIndex) : null,
    contextTags: tags.map((tag) => label(tag)),
    vnPanel: questChainVnPanelData(chain, { active: true }),
    stakes: questChainStakesData(template)
  };
}

export function questChainTemplateData(chain: ChainTemplateInput = {}): QuestChainTemplateData {
  const sx = cjs().CampaignSideContent;
  return {
    id: String(chain.id || ""),
    title: String(chain.title || chain.name || chain.id || ""),
    summary: String(chain.summary || ""),
    canonRisk: String(chain.canonRisk || "green"),
    canonRiskClass: sx?.riskClass?.(chain.canonRisk) ?? "",
    tags: Array.isArray(chain.tags) ? chain.tags.map(String) : [],
    vnPanel: questChainVnPanelData(chain, { active: false }),
    stakes: questChainStakesData(chain),
    steps: (chain.steps || []).map((step, index) => questChainStepData(step, index))
  };
}

export function sideStoryFlowGuideData(chain: ChainTemplateInput = {}): SideStoryFlowGuide {
  const phases = (chain.phasePlan || [])
    .slice(0, 4)
    .map((phase) => `${phase.chapterLabel || phase.id || ""} ${phase.title || phase.phaseType || ""}`.trim())
    .filter(Boolean);
  return {
    title: String(chain.title || chain.name || "Side Story"),
    summary: String(
      chain.flowSummary ||
        chain.summary ||
        "Side stories have their own plot rail, scene beats, optional map run, and manual resolve controls."
    ),
    phases: phases.map(String)
  };
}

export function questChainResolvedData(chain: ChainActiveInput = {}): QuestChainResolved {
  const template = chain.template || ({} as ChainTemplateInput);
  return {
    title: String(chain.title || template.title || chain.templateId || ""),
    statusLabel: label(chain.status || "resolved"),
    phaseLabel: String(chain.completedAtPhase || chain.failedAtPhase || "-")
  };
}
