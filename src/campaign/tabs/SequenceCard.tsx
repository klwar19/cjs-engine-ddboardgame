// SequenceCard.tsx — Phase G.9 / G.10 JSX port of the shared sequence
// card body. The EventTab uses the simpler variant (no story meta /
// status chip rows). The future StoryHome / QuestHome shelf reuses
// the same skeleton with extra meta + status chip rows passed in.
//
// The card body is the same skeleton across scopes:
//   • paper-pin + kind chip
//   • title + optional summary paragraph
//   • optional tag chip-row
//   • optional pre-action chip-rows (delivery state, story meta, story status)
//   • a muted note (e.g. delivery blocked reason)
//   • a single "Start" / "Read" / "In Update" action button
//
// Delivery / action shapes come from the typed bridge so the React
// tree doesn't reach back into CJS.CampaignSequences for status.

import { dispatchCampaignAction } from "../actions";
import type {
  SequenceDelivery,
  SequenceAction,
  SequenceShelfData,
  SequenceShelfEntry
} from "./data/sequence";

export function SequenceDeliveryState({ delivery }: { delivery: SequenceDelivery | null }) {
  if (!delivery) return null;
  return (
    <>
      {delivery.statusLabel && (
        <div className="campaign-chip-row">
          <span className="campaign-chip">{delivery.statusLabel}</span>
        </div>
      )}
      {delivery.note && <div className="campaign-muted">{delivery.note}</div>}
    </>
  );
}

export function SequenceActionButton({ action }: { action: SequenceAction }) {
  return (
    <button
      className="campaign-action primary"
      disabled={action.blocked}
      onClick={() => dispatchCampaignAction("sequence-start", { id: action.entryId })}
    >
      {action.label}
    </button>
  );
}

// Sequence Shelf — the "Chapter Files" / "Quest Papers" / "Event Files"
// panel used by storyHome (G.10). Header has title, note, and an
// entries-count pill; the grid is one card per entry. Story-scope
// entries get the chapter-meta chip row, an always-shown summary
// paragraph, and an additional status chip-row after the delivery
// state.
export function SequenceShelfPanel({ shelf }: { shelf: SequenceShelfData }) {
  const sectionCls = `campaign-panel${shelf.wide ? " campaign-wide-panel" : ""} campaign-sequence-shelf`;
  return (
    <section className={sectionCls}>
      <div className="campaign-panel-head">
        <div>
          <h3>{shelf.title}</h3>
          <div className="campaign-muted">{shelf.note}</div>
        </div>
        <span className="campaign-pill">{shelf.entries.length} files</span>
      </div>
      <div className="campaign-sequence-grid">
        {shelf.entries.length > 0 ? (
          shelf.entries.map((entry) => (
            <SequenceShelfCard key={entry.id || entry.title} entry={entry} />
          ))
        ) : (
          <div className="campaign-empty">No sequence files loaded for this scope.</div>
        )}
      </div>
    </section>
  );
}

function SequenceShelfCard({ entry }: { entry: SequenceShelfEntry }) {
  return (
    <article className={`campaign-sequence-card is-${entry.scope}`}>
      <div className="campaign-sequence-paper-pin" />
      <div className="campaign-sequence-kind">{entry.kindLabel}</div>
      <strong>{entry.title}</strong>
      {entry.storyMetaChips.length > 0 && (
        <div className="campaign-chip-row">
          {entry.storyMetaChips.map((bit, i) => (
            <span key={i} className="campaign-chip">{bit}</span>
          ))}
        </div>
      )}
      {entry.summary && <p>{entry.summary}</p>}
      <div className="campaign-chip-row">
        {entry.tags.map((tag, i) => (
          <span key={i} className="campaign-chip">{tag}</span>
        ))}
      </div>
      <SequenceDeliveryState delivery={entry.delivery} />
      {entry.storyStatusLabel && (
        <div className="campaign-chip-row">
          <span className="campaign-chip">{entry.storyStatusLabel}</span>
        </div>
      )}
      <SequenceActionButton action={entry.action} />
    </article>
  );
}
