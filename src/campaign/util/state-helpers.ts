// state-helpers.ts — Small TS predicates / lookups over CampaignState
// shared across the data builders.
//
// Phase H.4 — each function mirrors a closure-private helper in
// `js/campaign/campaign-ui.js`. The JS originals stay until the last
// closure caller ports; the TS versions are pure (no module state) so
// they can be imported from any data file without dependency cycles.

export interface QuestLike {
  readonly status?: string;
  readonly current?: number;
  readonly required?: number;
  readonly [key: string]: unknown;
}

// `_isQuestResolved` — `complete` / `completed` / `failed` all count as
// resolved. `active` and anything else are treated as still-running so
// new save files default to active.
export function isQuestResolved(quest: QuestLike = {}): boolean {
  const status = String(quest.status || "active");
  return status === "complete" || status === "completed" || status === "failed";
}

// `_questStatusClass` — CSS class for the quest status pill.
export function questStatusClass(quest: QuestLike = {}): string {
  const status = String(quest.status || "active");
  if (status === "failed") return "is-failed";
  if (isQuestResolved(quest)) return "is-complete";
  return "is-active";
}

export interface QuestObjective {
  readonly id?: string;
  readonly label?: string;
  readonly kind?: string;
  readonly current?: number;
  readonly required?: number;
  readonly minigame?: unknown;
  readonly miniGame?: unknown;
  readonly minigameId?: string;
  readonly progressTriggers?: ReadonlyArray<QuestObjectiveTrigger>;
  readonly [key: string]: unknown;
}

export interface QuestObjectiveTrigger {
  readonly outcome?: string;
  readonly skillIds?: readonly string[];
  readonly statusIds?: readonly string[];
  readonly defeatedTypes?: readonly string[];
  readonly defeatedMonsterIds?: readonly string[];
  readonly requiresTags?: readonly string[] | string;
  readonly requiresAnyTags?: readonly string[] | string;
  readonly anyTags?: readonly string[] | string;
  readonly onlyPlayerActionTags?: readonly string[];
}

// `_questObjectiveDone` — required defaults to 1 so a zero/missing
// required threshold doesn't trivially mark every objective done.
export function questObjectiveDone(obj: QuestObjective = {}): boolean {
  return Number(obj.current || 0) >= Math.max(1, Number(obj.required || 1));
}

// `_questNextObjective` — first incomplete objective, falling back to
// the first objective when all are done so callers always have one to
// describe.
export function questNextObjective(quest: { objectives?: readonly QuestObjective[] } = {}): QuestObjective | null {
  const objectives = quest.objectives || [];
  return objectives.find((entry) => !questObjectiveDone(entry)) || objectives[0] || null;
}

// `_questMiniGameObjective` — first incomplete objective with a
// mini-game / puzzle binding (or `kind === 'minigame'/'puzzle'`).
export function questMiniGameObjective(quest: { objectives?: readonly QuestObjective[] } = {}): QuestObjective | null {
  return (quest.objectives || []).find((objective) => {
    if (questObjectiveDone(objective)) return false;
    const kind = String(objective.kind || "").toLowerCase();
    return !!(
      objective.minigame ||
      objective.miniGame ||
      objective.minigameId ||
      kind === "minigame" ||
      kind === "puzzle"
    );
  }) || null;
}

// `_activeRunQuestId` — derives the quest id bound to an active scenario
// run (or its template scenario `source.questId`). Returns null when
// the run isn't quest-bound.
export interface ActiveRunLike {
  readonly questId?: string;
}
export interface ActiveScenarioLike {
  readonly source?: { readonly questId?: string };
}
export function activeRunQuestId(
  run: ActiveRunLike | null | undefined,
  scenario: ActiveScenarioLike | null | undefined
): string | null {
  return run?.questId || scenario?.source?.questId || null;
}

// `_pendingSoloHookCard` — resolves the pending solo-hook card from
// the state's `sideContent.generatedIdeas` keyed by `pendingSoloHook.cardId`
// or the lastSideContentCard if it matches.
export interface SideContentCard {
  readonly id?: string;
  readonly type?: string;
  readonly [key: string]: unknown;
}

export interface SoloHookStateShape {
  readonly pendingSoloHook?: { readonly cardId?: string; readonly kind?: string };
  readonly sideContent?: { readonly generatedIdeas?: Record<string, SideContentCard> };
  readonly lastSideContentCard?: SideContentCard;
}

export function pendingSoloHookCard(state: SoloHookStateShape | null | undefined): SideContentCard | null {
  if (!state) return null;
  const id = state.pendingSoloHook?.cardId;
  if (!id) return null;
  return state.sideContent?.generatedIdeas?.[id]
    || (state.lastSideContentCard?.id === id ? state.lastSideContentCard : null)
    || null;
}
