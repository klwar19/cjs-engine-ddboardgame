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
  SequenceAction
} from "./data/eventTab";

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
