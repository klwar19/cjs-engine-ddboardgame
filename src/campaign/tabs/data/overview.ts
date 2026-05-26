// overview.ts — Phase F bridge for the Overview (Town) tab.
//
// The Overview's outer structure is JSX. Each shared sub-panel —
// town snapshot, roll float, solo notice, scenario summary, etc. —
// still renders through HTML strings via `renderOverviewSectionHtml`.
// A future commit can replace one section at a time with a JSX port
// by deleting the matching dangerouslySetInnerHTML block and the
// matching case in campaign-ui.js.

import type { CampaignStateSnapshot } from "../../store";

export type OverviewSectionId =
  | "townSnapshot"
  | "townRollFloat"
  | "adventureLegend"
  | "scenarioSummary";

interface Bridge {
  readonly renderOverviewSectionHtml: (
    sectionId: OverviewSectionId,
    state?: CampaignStateSnapshot
  ) => string;
}

interface Cjs {
  readonly CampaignUI?: Bridge;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

export function renderOverviewSectionHtml(
  sectionId: OverviewSectionId,
  state: CampaignStateSnapshot
): string {
  return cjs().CampaignUI?.renderOverviewSectionHtml(sectionId, state) ?? "";
}
