// sequence.ts — Phase H.3 sequence-runner action handlers.
//
// Ports `_startSequenceFromUi` / `_advanceSequenceFromUi` /
// `_completeSequenceFromUi` + the sequence-open-vn case. They drive the
// CampaignSequences runner (and CampaignStoryBranch for manual branch
// chapters), set the active mode/tab via the render-free setters, and
// render at the exact points the closures did. Toast strings, scope→mode
// mapping and the replay/blocked branches mirror the originals.
//
// `_playSequenceMiniGame` stays in JS (it owns the mini-game session
// machinery); its win/lose follow-ups now route back through the registry
// (`sequence-win` / `sequence-lose`), which land on advanceSequence here.

import { mod, rerender, setActiveModeRaw, setActiveTabRaw, toast } from "./context";

interface SeqStartResult {
  blocked?: boolean;
  meta?: { deliveryNote?: string };
  sequence?: { title?: string; id?: string; scope?: string; _indexEntry?: { scope?: string } } | null;
  replayOnly?: boolean;
  defaulted?: unknown[];
}
interface SeqAdvanceResult {
  scenarioStarted?: boolean;
  queued?: boolean;
  complete?: boolean;
  ok?: boolean;
  replayOnly?: boolean;
  reason?: string;
  blockers?: string[];
}
interface CampaignSequencesModule {
  start?: (id: string) => Promise<SeqStartResult | undefined>;
  advance?: (action: string, value: unknown) => Promise<SeqAdvanceResult | undefined>;
  complete?: (reason: string) => Promise<{ ok?: boolean } | undefined>;
}
interface StoryBranchModule {
  getBranch?: (id: string) => unknown;
  playBranch?: (id: string, opts: { onComplete: () => void }) => boolean;
}
interface SequenceVnModule {
  setEnabled?: (on: boolean) => void;
}

function sequences(): CampaignSequencesModule | undefined {
  return mod<CampaignSequencesModule>("CampaignSequences");
}

export async function startSequence(sequenceId: string): Promise<void> {
  if (!sequenceId) return;
  // Manual branch chapters live outside the sequence runner — route them
  // through CampaignStoryBranch so they play as VN scenes.
  if (String(sequenceId).startsWith("branch_")) {
    const branch = mod<StoryBranchModule>("CampaignStoryBranch");
    const entry = branch?.getBranch?.(sequenceId);
    if (!entry) {
      toast("Branch chapter is missing.", "error");
      return;
    }
    setActiveModeRaw("story");
    const ok = branch?.playBranch?.(sequenceId, { onComplete: () => rerender() });
    if (!ok) toast("Branch chapter could not open.", "error");
    return;
  }
  try {
    const started = await sequences()?.start?.(sequenceId);
    if (started?.blocked) {
      rerender();
      toast(started?.meta?.deliveryNote || "That chapter part is still in update.", "info");
      return;
    }
    const sequence = started?.sequence || null;
    if (!sequence) {
      toast("Sequence file not found", "info");
      return;
    }
    const scope = sequence.scope || sequence._indexEntry?.scope || "event";
    if (scope === "story") setActiveModeRaw("story");
    else if (scope === "quest") setActiveModeRaw("quest");
    else if (scope === "event") setActiveModeRaw("event");
    rerender();
    if (started?.replayOnly) {
      toast(`Opened ${sequence.title || sequence.id} in replay mode`, "info");
      return;
    }
    if (started?.defaulted?.length) {
      const n = started.defaulted.length;
      toast(`Started ${sequence.title || sequence.id}; defaulted ${n} earlier part${n === 1 ? "" : "s"}`, "success");
      return;
    }
    toast(`Started ${sequence.title || sequence.id}`, "success");
  } catch (error) {
    console.error(error);
    toast((error as Error)?.message || "Sequence could not start", "error");
  }
}

export async function advanceSequence(action: string, value: unknown = null): Promise<void> {
  try {
    const result = await sequences()?.advance?.(action, value);
    if (result?.scenarioStarted || result?.queued) setActiveTabRaw("maps");
    rerender();
    if (result?.replayOnly && result?.reason === "replay_queue_blocked") {
      toast("Replay mode keeps consequences frozen. Use the continue buttons instead of queuing battle.", "info");
      return;
    }
    if (result?.replayOnly && result?.reason === "replay_scenario_blocked") {
      toast("Replay mode keeps exploration frozen too. Use the continue buttons instead of launching a scenario.", "info");
      return;
    }
    if (result?.scenarioStarted) { toast("Exploration run started from sequence", "success"); return; }
    if (result?.queued) { toast("Battle queued from sequence", "success"); return; }
    if (result?.complete) { toast("Sequence complete", "success"); return; }
    if (!result?.ok && result?.reason === "choice_locked") {
      toast((result.blockers || []).join(" | ") || "That choice is locked by earlier consequences.", "info");
      return;
    }
    if (!result?.ok) { toast("No active sequence node", "info"); return; }
  } catch (error) {
    console.error(error);
    toast((error as Error)?.message || "Sequence could not advance", "error");
  }
}

export async function completeSequence(): Promise<void> {
  const result = await sequences()?.complete?.("manual");
  rerender();
  if (result?.ok) toast("Sequence closed", "success");
}

export function openSequenceVn(): void {
  mod<SequenceVnModule>("CampaignSequenceVN")?.setEnabled?.(true);
  rerender();
}
