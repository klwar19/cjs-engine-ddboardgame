// story-director-card.ts — Phase H.4 render island for the Story Director
// beat modal card.
//
// Ported from the closure-private `_renderStoryDirectorCard` +
// `_renderStoryRouteChoices` in campaign-ui.js (G.11b had kept them as
// HTML). The card body is consumed by the imperative beat modal in
// `story-director-modals.ts`, which wires the `data-story-modal-choice`
// buttons to the `story-apply-choice` action — so this stays an
// HTML-string island rather than a JSX modal portal.
//
// Only the modal render path survived the port: the sole caller always
// passed `{ modal: true }`, so the old non-modal action-grid branch (Open
// Popup / Hold For Later / Skip Roll buttons + the `data-campaign-action`
// route variant) was dead and is gone.

import { esc, label } from "../util/cui-utils";

interface RouteChoice {
  readonly label?: string;
  readonly ops?: readonly unknown[];
}

export interface StoryDirectorCard {
  readonly id?: string;
  readonly title?: string;
  readonly kind?: string;
  readonly stageName?: string;
  readonly stageId?: string;
  readonly canonRisk?: string;
  readonly prompt?: string;
  readonly text?: string;
  readonly summary?: string;
  readonly gmNote?: string;
  readonly tags?: readonly string[];
  readonly suggestedChoices?: readonly RouteChoice[];
}

interface SideContentSurface {
  readonly riskClass?: (value: string | undefined) => string;
}
interface HubTabSurface {
  readonly renderConsequencePreview?: (
    ops: readonly unknown[],
    options?: { title?: string; emptyTitle?: string; emptyText?: string }
  ) => string;
}
interface CardCjs {
  readonly CampaignSideContent?: SideContentSurface;
  readonly CampaignUIInternal?: { readonly HubTab?: HubTabSurface };
}
function cardCjs(): CardCjs {
  return (window as unknown as { CJS?: CardCjs }).CJS ?? {};
}

// The consequence-preview HTML chunk still comes from the HubTab island
// (shared with every other result/side panel that previews ops).
function renderConsequencePreview(
  ops: readonly unknown[],
  options: { title?: string; emptyTitle?: string; emptyText?: string }
): string {
  return cardCjs().CampaignUIInternal?.HubTab?.renderConsequencePreview?.(ops, options) ?? "";
}

function renderStoryRouteChoices(card: StoryDirectorCard): string {
  const choices = card.suggestedChoices || [];
  const branchChoices: readonly RouteChoice[] = choices.length
    ? choices
    : [
        {
          label: "Accept as story note",
          ops: [{ op: "log", text: card.prompt || card.text || card.summary || card.title || "Story beat accepted." }]
        }
      ];
  return `
      <div class="campaign-story-route-map">
        <div class="campaign-section-title">Route Choices</div>
        ${branchChoices
          .map((choice, index) => {
            return `
            <div class="campaign-story-route ${index === 0 ? "is-recommended" : ""}">
              <div class="campaign-story-route-head">
                <span>Route ${String(index + 1).padStart(2, "0")}</span>
                <strong>${esc(choice.label || `Choice ${index + 1}`)}</strong>
                ${index === 0 ? "<small>Suggested</small>" : ""}
              </div>
              ${renderConsequencePreview(choice.ops || [], {
                title: choice.label || `Choice ${index + 1}`,
                emptyTitle: choice.label || `Choice ${index + 1}`,
                emptyText: "Story-only route. Choose it if it fits the current scene."
              })}
              <button class="campaign-action ${index === 0 ? "primary" : "quest"}" data-story-modal-choice="${index}" title="Choose this route and commit its listed consequences">
                Choose Route ${index + 1}
              </button>
            </div>
          `;
          })
          .join("")}
      </div>
    `;
}

// Renders the Story Director beat card (modal variant). Mirrors the old
// `_renderStoryDirectorCard(card, { modal: true })` HTML byte-for-byte.
export function renderStoryDirectorCardHtml(card: StoryDirectorCard): string {
  const cardClass = [
    "campaign-panel",
    "campaign-side-card",
    "campaign-result-card",
    "campaign-story-card",
    "campaign-story-dialogue",
    "is-modal"
  ];
  const kind = label(card.kind || "story");
  const riskClass = cardCjs().CampaignSideContent?.riskClass?.(card.canonRisk) ?? "";
  return `
      <section class="${cardClass.join(" ")}">
        <div class="campaign-story-dialogue-head">
          <div>
            <h3>${esc(card.title || card.id)}</h3>
            <div class="campaign-muted">${esc(card.stageName || card.stageId || "")} | ${esc(kind)}</div>
          </div>
          <span class="campaign-risk ${riskClass}">${esc(card.canonRisk || "green")}</span>
        </div>
        <div class="campaign-story-dialogue-box">
          <div class="campaign-story-speaker">${esc(kind)}</div>
          ${card.prompt ? `<p>${esc(card.prompt)}</p>` : ""}
          ${card.text ? `<p>${esc(card.text)}</p>` : ""}
          ${card.summary ? `<p class="campaign-muted">${esc(card.summary)}</p>` : ""}
        </div>
        ${card.gmNote ? `<div class="campaign-warning">${esc(card.gmNote)}</div>` : ""}
        ${card.tags?.length ? `<div class="campaign-chip-row">${card.tags.map((tag) => `<span class="campaign-chip">${esc(tag)}</span>`).join("")}</div>` : ""}
        ${renderStoryRouteChoices(card)}
      </section>
    `;
}
