// cui-controls.ts — campaign "purpose taxonomy" helpers.
//
// History: the original `js/campaign/ui/cui-controls.js` exported a frozen
// `Controls` namespace of stateless HTML builders (action button, menu,
// control group, town action button) on
// `window.CJS.CampaignUIInternal.Controls`. Every one of those HTML-string
// builders has since been superseded by JSX components that dispatch through
// `onClick` (e.g. `shell/Header.tsx`'s action menu, `CampaignOverviewTab`'s
// control group, `CampaignMapsTab`'s ControlGroup/ActionButton), so the
// builders — and the namespace nothing reads anymore — were removed. The two
// that stamped `data-campaign-action` (`actionBtn` / `renderTownActionButton`)
// were the last `data-campaign-action` emitters in the whole `src` tree and
// had zero callers; dropping them removes the stringly-typed action surface.
//
// What remains is the "purpose" taxonomy: it classifies a hub-pulse / oracle /
// event / rumor card by the kind of commitment it represents to the GM, and
// renders the display-only inline-purpose blurb. These are consumed via ESM
// named imports by the typed data builders (`tabs/data/hub.ts`,
// `tabs/data/resultPanels.ts`). `renderInlinePurpose` returns a display-only
// HTML string (no actions) surfaced through `dangerouslySetInnerHTML`.

import { esc, escAttr } from "./cui-utils";

// ── Tool / purpose taxonomy ─────────────────────────────────────────
// The "purpose" classifies a hub-pulse / oracle / event / rumor card by
// what kind of commitment it represents to the GM. The label appears as
// an impact badge in the card header; the role/use/flow/commit text is
// surfaced in the inline-purpose blurb under the title.
export type ToolPurposeKey = "oracle" | "rumor" | "problem" | "hubPulse" | "event";

export interface ToolPurpose {
  readonly label: string;
  readonly role: string;
  readonly use: string;
  readonly flow: string;
  readonly commit: string;
}

const TOOL_PURPOSES: Readonly<Record<ToolPurposeKey, ToolPurpose>> = {
  oracle: {
    label: "Oracle",
    role: "GM prompt / keywords",
    use: "Use when you need inspiration, a line of narration, or a sharper scene image.",
    flow: "Text only → Save Note → Make Rumor/Event if you want it to matter later.",
    commit: "No mechanics by default."
  },
  rumor: {
    label: "Rumor",
    role: "Stored lead bank",
    use: "Use when an idea is interesting but should not become canon or a quest yet.",
    flow: "Hear lead → Hold in hub → Promote later to quest, event, character scene, map seed, oracle, or problem.",
    commit: "Saved as a lead until promoted."
  },
  problem: {
    label: "Problem",
    role: "Active hub pressure",
    use: "Use when the hub is already affected and the party should see pressure building.",
    flow: "Add pressure → Show in hub → Resolve manually or through quest/event results.",
    commit: "Counts as active state until resolved."
  },
  hubPulse: {
    label: "Hub Pulse",
    role: "Living hub moment",
    use: "Use when you want town, guild, tavern, forge, or weird local activity.",
    flow: "Roll/pick pulse → Review card → Apply choice, save idea, make rumor, or reject.",
    commit: "Only commits when you apply a choice."
  },
  event: {
    label: "Authored Event",
    role: "Immediate happening",
    use: "Use during story, quest, travel, aftermath, or event play when something happens now.",
    flow: "Roll/pick event → Review rewards/risks/text → Apply, edit, note only, pin, or ignore.",
    commit: "May change rewards, danger, flags, rumors, quests, or notes."
  }
};

export type PurposeTone = "mixed" | "quest" | "plot" | "flavor";

export function purposeTone(key: string): PurposeTone {
  if (key === "event") return "mixed";
  if (key === "hubPulse" || key === "problem") return "quest";
  if (key === "rumor") return "plot";
  return "flavor";
}

export interface CardLike {
  readonly type?: string;
  readonly source?: string;
  readonly [key: string]: unknown;
}

export function purposeKeyForCard(card: CardLike = {}): ToolPurposeKey {
  const type = String(card.type || "").toLowerCase();
  const source = String(card.source || "").toLowerCase();
  if (type.includes("oracle") || source.includes("oracle")) return "oracle";
  if (type.includes("rumor")) return "rumor";
  if (source.includes("hub_pulse") || type.includes("hub_pulse")) return "hubPulse";
  if (type.includes("event")) return "event";
  return "hubPulse";
}

// Display-only inline-purpose blurb (no actions). Consumed via
// `dangerouslySetInnerHTML` by the typed data builders that previously
// reached for `Controls.renderInlinePurpose`.
export function renderInlinePurpose(key: string): string {
  const item = TOOL_PURPOSES[key as ToolPurposeKey] || TOOL_PURPOSES.oracle;
  return `
      <div class="campaign-purpose-inline">
        <span class="campaign-impact-badge is-${escAttr(purposeTone(key))}">${esc(item.label)}</span>
        <span><b>${esc(item.role)}.</b> ${esc(item.flow)} ${esc(item.commit)}</span>
      </div>
    `;
}

// `renderRumorPurpose` removed in Phase K.3 — the rumor-purpose blurb
// is now static JSX in CampaignHubTabs.tsx / TownPanels.tsx.
//
// `impactLegendItem` / `controlGroup` / `actionMenu` / `actionBtn` /
// `renderTownActionButton` and the `CampaignUIInternal.Controls` namespace
// install were removed: the HTML-string builders are superseded by JSX, and
// the two action-string emitters had no callers.
