// story-director.ts — Phase H.3 story-director action handlers.
//
// Ports the story-director handlers that are thin wrappers over the
// CampaignStoryDirector module (roll outcomes are held/skipped/applied,
// stage set, side-quest flow synced) with no other closure dependency.
// Toast strings, the queued/applied branches and the already/synced
// branches mirror the deleted closures exactly.
//
// The roll + beat-modal handlers (_rollStoryDirector / _openStoryBeatModal
// / _openLastStoryBeatModal) stay in campaign-ui.js for now — they depend
// on the closure-private `_renderStoryDirectorCard` HTML builder. That
// modal calls save/reject/apply, so those follow-ups route back through
// the action registry (story-save-beat / story-reject-beat /
// story-apply-choice).

import { mod, rerender, toast } from "./context";

interface StoryDirectorModule {
  saveLast?: (status: string) => unknown;
  rejectLast?: () => unknown;
  applyChoice?: (cardId: string, choiceIndex: number) => { queued?: boolean; applied?: boolean } | undefined;
  setStage?: (stageId: string) => void;
  syncSideQuestFlow?: () => { already?: boolean; synced?: boolean } | undefined;
}

function sd(): StoryDirectorModule | undefined {
  return mod<StoryDirectorModule>("CampaignStoryDirector");
}

export function saveStoryBeat(): void {
  const card = sd()?.saveLast?.("saved");
  if (!card) {
    toast("No story scene to hold", "info");
    return;
  }
  rerender();
  toast("Story scene held for later", "success");
}

export function rejectStoryBeat(): void {
  const card = sd()?.rejectLast?.();
  if (!card) {
    toast("No story roll to skip", "info");
    return;
  }
  rerender();
  toast("Story roll skipped", "info");
}

export function applyStoryChoice(cardId: string, choiceIndex = 0): void {
  const result = sd()?.applyChoice?.(cardId, choiceIndex);
  if (result?.queued) {
    rerender();
    toast("Red-risk story route queued for review", "info");
    return;
  }
  if (result?.applied) {
    rerender();
    toast("Story route chosen", "success");
    return;
  }
  toast("Story scene not found", "info");
}

export function setStoryStage(stageId: string): void {
  if (!stageId) return;
  sd()?.setStage?.(stageId);
  rerender();
}

export function syncStorySideQuests(): void {
  const result = sd()?.syncSideQuestFlow?.();
  if (result?.already) {
    toast("Side quest flow already synced for this stage", "info");
    return;
  }
  if (result?.synced) {
    rerender();
    toast("Side quest flow synced", "success");
    return;
  }
  toast("No side quest flow for this stage", "info");
}
