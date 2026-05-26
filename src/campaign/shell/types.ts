// types.ts — Typed contract for the Phase F React chrome.
//
// `js/campaign/campaign-ui.js::getChromeData(state)` returns this exact
// shape. Every chrome component in this folder reads its slice of it,
// so the JSX is a thin map from data → markup. When campaign-ui.js
// disappears in Phase F's final step, the bridge becomes a TypeScript
// module that produces the same shape from typed state.

export interface LogKind {
  readonly key: string;
  readonly label: string;
}

export interface RecentLogEntry {
  readonly kind: LogKind;
  readonly text: string;
  readonly meta: string;
}

export interface WorldEventChip {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly summary: string;
  readonly category: string;
  readonly remainingPhases: number;
}

export interface CurrencyAmounts {
  readonly gold: number;
  readonly jp: number;
}

export interface HeaderData {
  readonly campaignName: string;
  readonly worldName: string;
  readonly chapter: string | number;
  readonly phaseNumber: number;
  readonly phaseLabel: string;
  readonly worldEvents: readonly WorldEventChip[];
  readonly currencies: CurrencyAmounts;
}

export interface ModeButton {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
}

export interface UtilityButton {
  readonly id: string;
  readonly label: string;
}

export interface ScenarioHudData {
  readonly scenarioName: string;
  readonly danger: number;
  readonly dangerMax: number;
  readonly campsUsed: number;
  readonly campsMax: number;
  readonly battlesUsed: number;
  readonly battlesMax: number;
  readonly generated: boolean;
}

export interface ModeBarData {
  readonly modes: readonly ModeButton[];
  readonly activeMode: string | null;
  readonly utilityTabs: readonly UtilityButton[];
  readonly activeTab: string;
  readonly scenarioHud: ScenarioHudData | null;
}

export interface SubTabButton {
  readonly id: string;
  readonly label: string;
}

export interface RecentLogData {
  readonly entries: readonly RecentLogEntry[];
  readonly hasLog: boolean;
}

export interface RailPanel {
  readonly id: string;
  readonly icon: string;
  readonly label: string;
  readonly title: string;
  readonly count: number;
}

export interface CommandRailData {
  readonly panels: readonly RailPanel[];
  readonly activePanel: string | null;
  readonly currency: CurrencyAmounts;
}

export interface ChromeData {
  readonly activeMode: string;
  readonly activeTab: string;
  readonly activePanel: string | null;
  readonly isUtility: boolean;
  readonly header: HeaderData;
  readonly modeBar: ModeBarData;
  readonly subTabs: readonly SubTabButton[];
  readonly recentLog: RecentLogData;
  readonly commandRail: CommandRailData;
}
