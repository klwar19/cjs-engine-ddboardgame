// CampaignInventoryTab.tsx — JSX port of the vanilla `campaign-inventory.js`
// island. Renders the per-bucket inventory grid; buttons dispatch via typed
// onClick (`dispatchCampaignAction`) instead of the old data-* island markers
// that `htmlIslandActions.ts` translated. Behaviour matches the island:
// five buckets, qty>0 rows, name / meta / description lines, +/- delta and
// per-bucket quick-add.

import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import { getInventoryData, type InventoryBucket, type InventoryEntry } from "./data/inventory";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignInventoryTab({ state }: Props) {
  const buckets = getInventoryData(state);
  return (
    <div className="campaign-tab-grid">
      {buckets.map((bucket) => (
        <InventoryBucketPanel key={bucket.bucket} bucket={bucket} />
      ))}
    </div>
  );
}

function InventoryBucketPanel({ bucket }: { bucket: InventoryBucket }) {
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h3>{bucket.label}</h3>
        <button
          className="campaign-icon-btn"
          title={`Add ${bucket.label}`}
          onClick={() => dispatchCampaignAction("quick-add-inventory", { bucket: bucket.bucket })}
        >
          +
        </button>
      </div>
      {bucket.entries.length ? (
        bucket.entries.map((entry) => <InventoryRow key={entry.id} entry={entry} />)
      ) : (
        <div className="campaign-empty">Empty.</div>
      )}
    </section>
  );
}

function InventoryRow({ entry }: { entry: InventoryEntry }) {
  return (
    <div className="campaign-row">
      <div>
        <strong>{entry.name}</strong>
        <div className="campaign-muted">{entry.meta}</div>
        {entry.description ? <div className="campaign-muted">{entry.description}</div> : null}
      </div>
      <div className="campaign-row-actions">
        <span className="campaign-pill">x{entry.qty}</span>
        <button
          className="campaign-icon-btn"
          title="Add one"
          onClick={() =>
            dispatchCampaignAction("inventory-delta", { bucket: entry.bucket, id: entry.id, delta: 1 })
          }
        >
          +
        </button>
        <button
          className="campaign-icon-btn"
          title="Remove one"
          onClick={() =>
            dispatchCampaignAction("inventory-delta", { bucket: entry.bucket, id: entry.id, delta: -1 })
          }
        >
          -
        </button>
      </div>
    </div>
  );
}
