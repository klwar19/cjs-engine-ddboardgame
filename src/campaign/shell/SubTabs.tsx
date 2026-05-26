// SubTabs.tsx — Phase F JSX port of `_renderSubTabs`.
//
// Renders the sub-tab strip below the mode bar. The tabs list is
// produced by the bridge: utility tabs when the active tab is one of
// (maps/roster/relationships/logs/settings), otherwise the tabs for
// the active mode. onClick routes through `setActiveTab`.

import { setActiveTab } from "./bridge";
import type { SubTabButton } from "./types";

interface Props {
  readonly tabs: readonly SubTabButton[];
  readonly activeTab: string;
  readonly isUtility: boolean;
}

export function CampaignSubTabs({ tabs, activeTab, isUtility }: Props) {
  if (!tabs.length) return null;
  return (
    <nav className={`campaign-subtabs ${isUtility ? "is-utility" : ""}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`campaign-tab ${tab.id === activeTab ? "active" : ""}`}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
