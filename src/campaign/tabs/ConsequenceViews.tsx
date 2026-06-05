// ConsequenceViews.tsx — Part B JSX components for the three display-only
// side-content fragments that were HTML-string islands until now:
//
//   <InlinePurpose>      — the purpose taxonomy blurb (was Controls.renderInlinePurpose)
//   <ConsequencePreview> — the op tone/summary preview  (was HubTab.renderConsequencePreview)
//   <FlavorTrail>        — the GM flavor-hook list       (was HubTab.renderFlavorTrail)
//
// Each renders the SAME element tree / classes / text the emitter produced, so
// the rendered DOM is layout-identical (their containers are grid/flex with
// `gap`, so inter-element whitespace was never significant). The typed data
// builders (`tabs/data/*`) now emit structured props instead of `*Html`
// strings, and consumers render these components instead of
// `dangerouslySetInnerHTML`. The pure tone/consequence math still lives in
// `util/cui-hub-tab.ts` (`consequencePreviewData` / `flavorTrailData`) and the
// purpose taxonomy in `util/cui-controls.ts` (`toolPurpose` / `purposeTone`).

import { purposeTone, toolPurpose } from "../util/cui-controls";
import type { ConsequencePreviewData, FlavorTrailData } from "../util/cui-hub-tab";

export function InlinePurpose({ purpose }: { purpose: string }) {
  const item = toolPurpose(purpose);
  return (
    <div className="campaign-purpose-inline">
      <span className={`campaign-impact-badge is-${purposeTone(purpose)}`}>{item.label}</span>
      <span>
        <b>{item.role}.</b> {item.flow} {item.commit}
      </span>
    </div>
  );
}

export function ConsequencePreview({ data }: { data: ConsequencePreviewData }) {
  return (
    <div className={`campaign-consequence is-${data.tone}`}>
      <div className="campaign-consequence-head">
        <span className={`campaign-impact-badge is-${data.tone}`}>{data.label}</span>
        <strong>{data.title}</strong>
      </div>
      <span>{data.text}</span>
      {data.lines.length > 0 && (
        <ul>
          {data.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FlavorTrail({ data }: { data: FlavorTrailData | null }) {
  if (!data) return null;
  return (
    <div className="campaign-flavor-trail">
      {data.lines.map((line, i) => (
        <div key={i}>
          <b>{line.label}</b>
          <span>{line.text}</span>
        </div>
      ))}
    </div>
  );
}
