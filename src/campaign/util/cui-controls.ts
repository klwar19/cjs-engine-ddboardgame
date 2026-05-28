// cui-controls.ts — Phase H.4 TypeScript port of the Controls helpers.
//
// `js/campaign/ui/cui-controls.js` exported a frozen `Controls` namespace
// on `window.CJS.CampaignUIInternal.Controls`. The TS port installs the
// same surface for both the vanilla JS callers (still-JS tab modules,
// the modal builders in campaign-ui.js) and the TS modules.
//
// Stateless HTML builders for small reusable widgets: action button,
// menu, control group, inline purpose chip, town action button.

import { esc, escAttr, label } from "./cui-utils";

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

export function impactLegendItem(tone: string, text: string): string {
  return `<span class="campaign-impact-badge is-${escAttr(tone)}">${esc(text)}</span>`;
}

export function controlGroup(title: string, buttons: string, description = ""): string {
  return `
      <div class="campaign-control-group">
        <div class="campaign-control-title">${esc(title)}</div>
        ${description ? `<div class="campaign-control-help">${esc(description)}</div>` : ""}
        <div class="campaign-action-grid">${buttons}</div>
      </div>
    `;
}

export interface ActionMenuOptions {
  readonly align?: "start" | "end";
  readonly compact?: boolean;
}

export function actionMenu(menuLabel: string, buttons: string, options: ActionMenuOptions = {}): string {
  const cls = ["campaign-action-menu"];
  if (options.align === "end") cls.push("align-end");
  if (options.compact) cls.push("is-compact");
  return `
      <details class="${cls.join(" ")}">
        <summary class="campaign-action-menu-trigger">
          <span>${esc(menuLabel)}</span>
        </summary>
        <div class="campaign-action-menu-panel">
          ${buttons}
        </div>
      </details>
    `;
}

export interface ActionBtnProps {
  readonly action: string;
  readonly label: string;
  readonly hint?: string;
  readonly kind?: string;
  readonly data?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  readonly disabled?: boolean;
}

export function actionBtn(props: ActionBtnProps): string {
  const { action, label: btnLabel, hint, kind = "", data = {}, disabled = false } = props;
  const cls = ["campaign-action"];
  if (kind) cls.push(kind);
  if (hint) cls.push("has-hint");
  const dataAttrs = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `data-${k}="${escAttr(String(v))}"`)
    .join(" ");
  const disable = disabled ? "disabled" : "";
  const titleAttr = hint ? ` title="${escAttr(hint)}"` : "";
  return `
      <button class="${cls.join(" ")}" data-campaign-action="${escAttr(action)}" ${dataAttrs}${titleAttr} ${disable}>
        <span class="campaign-action-label">${esc(btnLabel)}</span>
        ${hint ? `<small class="campaign-action-hint">${esc(hint)}</small>` : ""}
      </button>
    `;
}

export interface TownActionButtonProps {
  readonly action: string;
  readonly tone: string;
  readonly title: string;
  readonly meta: string;
  readonly text: string;
}

export function renderTownActionButton(props: TownActionButtonProps): string {
  const { action, tone, title, meta, text } = props;
  return `
      <button class="campaign-town-option is-${escAttr(tone)}" data-campaign-action="${escAttr(action)}">
        <span class="campaign-impact-badge is-${escAttr(tone)}">${esc(meta)}</span>
        <strong>${esc(title)}</strong>
        <span>${esc(text)}</span>
      </button>
    `;
}

// ── Legacy namespace install ─────────────────────────────────────────
export interface CuiControls {
  readonly purposeTone: typeof purposeTone;
  readonly purposeKeyForCard: typeof purposeKeyForCard;
  readonly renderInlinePurpose: typeof renderInlinePurpose;
  readonly impactLegendItem: typeof impactLegendItem;
  readonly controlGroup: typeof controlGroup;
  readonly actionMenu: typeof actionMenu;
  readonly actionBtn: typeof actionBtn;
  readonly renderTownActionButton: typeof renderTownActionButton;
}

const NAMESPACE: CuiControls = Object.freeze({
  purposeTone,
  purposeKeyForCard,
  renderInlinePurpose,
  impactLegendItem,
  controlGroup,
  actionMenu,
  actionBtn,
  renderTownActionButton
});

interface CuiInternalWindow {
  CJS?: {
    CampaignUIInternal?: { Controls?: CuiControls; [key: string]: unknown };
    [key: string]: unknown;
  };
}
const w = window as unknown as CuiInternalWindow;
w.CJS = w.CJS || {};
w.CJS.CampaignUIInternal = w.CJS.CampaignUIInternal || {};
w.CJS.CampaignUIInternal.Controls = NAMESPACE;

// `label` is exported by `./cui-utils`; the legacy `cui-controls.js`
// imported it but didn't re-export. Mark it as used so TS doesn't warn.
void label;

export default NAMESPACE;
