// SideContent.tsx — K.3 JSX for the shared side-content card and rumor
// row (previously HubTab.renderSideCard / renderRumorRow HTML strings).
//
// The interactive buttons are JSX onClick dispatch. Display-only inner
// fragments (inline purpose, flavor trail, choice consequence preview)
// arrive pre-rendered as HTML through the typed bridge and are inserted
// via <HtmlBridge> — the same display-bridge pattern ResultPanels uses.
// Those fragments carry no data-campaign-action; they get a full JSX
// port when cui-hub-tab.js / cui-controls.js are deleted in H.4.

import { dispatchCampaignAction } from "../actions";
import type { SideCardData, RumorRowData } from "./data/hub";

export function HtmlBridge({ html, className }: { html: string; className: string }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function SideCard({ card }: { card: SideCardData }) {
  const cls = ["campaign-panel", "campaign-side-card", "campaign-result-card", `is-${card.tone}`];
  if (card.compact) cls.push("compact");
  return (
    <section className={cls.join(" ")}>
      <div className="campaign-panel-head">
        <div>
          <h3>{card.title}</h3>
          <div className="campaign-muted">{card.subtitle}</div>
        </div>
        <div className="campaign-impact-row">
          <span className={`campaign-impact-badge is-${card.tone}`}>{card.toneLabel}</span>
          <span className={`campaign-risk ${card.canonRiskClass}`}>{card.canonRisk}</span>
        </div>
      </div>
      <HtmlBridge html={card.purposeHtml} className="campaign-inline-purpose-bridge" />
      {card.prompt && <p>{card.prompt}</p>}
      {card.text && <p>{card.text}</p>}
      {card.summary && <p>{card.summary}</p>}
      <HtmlBridge html={card.flavorTrailHtml} className="campaign-flavor-trail-bridge" />
      {card.gmKeywords.length > 0 && (
        <div className="campaign-chip-row">
          {card.gmKeywords.map((tag, i) => (
            <span key={i} className="campaign-chip">{tag}</span>
          ))}
        </div>
      )}
      {card.gmNote && <div className="campaign-warning">{card.gmNote}</div>}
      {card.choiceStackHtml && (
        <div
          className="campaign-choice-stack"
          dangerouslySetInnerHTML={{ __html: card.choiceStackHtml }}
        />
      )}
      <div className="campaign-action-grid">
        {card.choiceButtons.map((choice) => (
          <button
            key={choice.index}
            className={`campaign-action ${choice.index === 0 ? "primary" : ""}`}
            title={`Apply: ${choice.label}`}
            onClick={() =>
              dispatchCampaignAction("apply-side-choice", { id: card.id, choice: choice.index })
            }
          >
            <span className="ku-action-prefix">Apply</span>
            <span className="ku-action-label">{choice.label}</span>
          </button>
        ))}
        <button
          className="campaign-action"
          title="Save this idea to the bank without committing it."
          onClick={() => dispatchCampaignAction("save-side-idea", { id: card.id })}
        >
          Save
        </button>
        <button
          className="campaign-action"
          title="Copy the card text to clipboard."
          onClick={() => dispatchCampaignAction("copy-side-card", { id: card.id })}
        >
          Copy
        </button>
        {card.showDismiss && (
          <button
            className="campaign-action"
            title="Hide this card from the current result slot."
            onClick={() => dispatchCampaignAction("dismiss-side-card", { id: card.id })}
          >
            Dismiss
          </button>
        )}
        <button
          className="campaign-action campaign-action-reject"
          title="Discard this idea. Nothing is committed."
          onClick={() => dispatchCampaignAction("reject-side-idea", { id: card.id })}
        >
          Reject
        </button>
      </div>
    </section>
  );
}

export function RumorRow({ rumor }: { rumor: RumorRowData }) {
  const cls = ["campaign-row", "campaign-rumor-row"];
  if (rumor.compact) cls.push("is-compact");
  const payload = { id: rumor.id, hubId: rumor.hubId };
  return (
    <div className={cls.join(" ")}>
      <div>
        <strong>{rumor.text}</strong>
        <div className="campaign-muted">
          {rumor.statusLabel} | {rumor.riskLabel} lead | parked until promoted
        </div>
      </div>
      <div className="campaign-row-actions">
        <span className={`campaign-risk ${rumor.canonRiskClass}`}>{rumor.canonRisk}</span>
        <button
          className="campaign-action"
          onClick={() => dispatchCampaignAction("rumor-to-quest", payload)}
        >
          Make Quest
        </button>
        <button
          className="campaign-action"
          onClick={() => dispatchCampaignAction("rumor-to-problem", payload)}
        >
          Make Problem
        </button>
        <button
          className="campaign-action danger"
          onClick={() => dispatchCampaignAction("resolve-rumor", payload)}
        >
          Resolve
        </button>
      </div>
    </div>
  );
}
