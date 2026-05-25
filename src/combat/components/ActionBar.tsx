// ActionBar — combat action tabs (Move/Attack/Skills/Items/Guard) and
// the buttons inside each tab. Replicates the markup and class names from
// the original combat-ui._renderActions exactly so existing CSS keeps
// working.

import { useMemo, useState } from "react";
import type { CombatController } from "../combatController";
import { useCombatVersion } from "../store";
import { renderEntityIconHtml } from "../uiHelpers";

interface CjsAny {
  CombatManager?: {
    getCurrentUnit?: () => Record<string, unknown> | null;
    getState?: () => Record<string, unknown> | null;
    isAwaitingInput?: () => boolean;
    isManualTurn?: () => boolean;
    getAvailableActionsForCurrent?: () => AvailableActions | null;
  };
  SkillResolver?: {
    resolveUnitSkill?: (unit: unknown, id: string) => Record<string, unknown> | null;
  };
  DataStore?: {
    get?: <T>(type: string, id: string) => T | null;
  };
}

interface SkillEntry {
  id: string;
  skill: {
    id?: string;
    name?: string;
    description?: string;
    element?: string;
    damageType?: string;
    tags?: string[];
    qte?: string;
    aoe?: string;
    range?: number;
    [key: string]: unknown;
  };
  usable: boolean;
  silenced?: boolean;
  weaponReady?: boolean;
  requiredWeaponTypes?: string[];
  cooldown?: number;
  apCost?: number;
  mpCost?: number;
  isUltimate?: boolean;
  ultimateCost?: number;
  ultimateReady?: boolean;
}

interface ItemEntry {
  id: string;
  item: { name?: string; icon?: string; [key: string]: unknown };
  usable: boolean;
}

interface AvailableActions {
  move?: boolean;
  attack?: boolean;
  defend?: boolean;
  endTurn?: boolean;
  skills?: SkillEntry[];
  items?: ItemEntry[];
  interactTargets?: Array<{ r: number; c: number }>;
}

function cjs(): CjsAny {
  return (window as unknown as { CJS?: CjsAny }).CJS ?? {};
}

const ACTION_TABS = [
  { id: "move", label: "Move" },
  { id: "attack", label: "Attack" },
  { id: "skills", label: "Skills" },
  { id: "items", label: "Items" },
  { id: "guard", label: "Guard" }
] as const;

type TabId = (typeof ACTION_TABS)[number]["id"];

interface Props {
  readonly controller: CombatController;
}

export function ActionBar({ controller }: Props) {
  const version = useCombatVersion();
  const [tabId, setTabId] = useState<TabId>("attack");
  const [skillFilter, setSkillFilter] = useState("");

  const cm = cjs().CombatManager;
  const state = cm?.getState?.() || null;
  const phase = state?.phase as string | undefined;

  // While the engine is between phases or in battle_end we render the
  // appropriate placeholder. battle_end is handled by BattleEndPanel
  // higher up the tree.
  if (phase === "battle_end") {
    return <div id="cbt-actions" className="action-panel" />;
  }

  const awaitingInput = cm?.isAwaitingInput?.() ?? false;
  if (!awaitingInput && phase !== "action") {
    return (
      <div id="cbt-actions" className="action-panel">
        <div className="action-wait">Processing...</div>
      </div>
    );
  }

  const unit = cm?.getCurrentUnit?.();
  if (!unit) {
    return <div id="cbt-actions" className="action-panel" />;
  }
  if (!cm?.isManualTurn?.()) {
    return (
      <div id="cbt-actions" className="action-panel">
        <div className="action-wait">AI is thinking...</div>
      </div>
    );
  }
  const available = cm.getAvailableActionsForCurrent?.();
  if (!available) {
    return <div id="cbt-actions" className="action-panel" />;
  }

  const tabs = getActionTabs(available);
  const activeTab = resolveActiveTab(tabs, tabId);

  return (
    <div id="cbt-actions" className="action-panel">
      <div className="action-buttons combat-action-panel-v2">
        <div
          className="combat-action-tabs"
          role="tablist"
          aria-label="Combat actions"
        >
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                className={`combat-action-tab ${active ? "is-active" : ""}`}
                role="tab"
                aria-selected={active}
                data-action-tab={tab.id}
                disabled={!tab.enabled}
                aria-disabled={!tab.enabled}
                onClick={() => {
                  if (tab.enabled) setTabId(tab.id as TabId);
                }}
              >
                <span className="combat-action-tab-label">{tab.label}</span>
                <span className="combat-action-tab-count">{tab.count}</span>
              </button>
            );
          })}
        </div>
        <div
          className="combat-action-tab-panel"
          role="tabpanel"
          data-action-tab-panel={activeTab}
        >
          <ActionTabContent
            tabId={activeTab}
            available={available}
            unit={unit}
            controller={controller}
            skillFilter={skillFilter}
            onSkillFilterChange={setSkillFilter}
            versionKey={version}
          />
        </div>
      </div>
    </div>
  );
}

function getActionTabs(available: AvailableActions) {
  const skills = available.skills || [];
  const items = available.items || [];
  return ACTION_TABS.map((tab) => {
    if (tab.id === "move")
      return { ...tab, count: available.move ? 1 : 0, enabled: !!available.move };
    if (tab.id === "attack")
      return { ...tab, count: available.attack ? 1 : 0, enabled: !!available.attack };
    if (tab.id === "skills")
      return { ...tab, count: skills.length, enabled: skills.length > 0 };
    if (tab.id === "items")
      return { ...tab, count: items.length, enabled: items.length > 0 };
    return { ...tab, count: (available.defend ? 1 : 0) + 1, enabled: true };
  });
}

function resolveActiveTab(
  tabs: ReturnType<typeof getActionTabs>,
  current: TabId
): TabId {
  const found = tabs.find((tab) => tab.id === current && tab.enabled);
  if (found) return current;
  for (const id of ["attack", "skills", "items", "move", "guard"] as TabId[]) {
    const tab = tabs.find((entry) => entry.id === id && entry.enabled);
    if (tab) return id;
  }
  return "guard";
}

interface TabProps {
  readonly tabId: TabId;
  readonly available: AvailableActions;
  readonly unit: Record<string, unknown>;
  readonly controller: CombatController;
  readonly skillFilter: string;
  readonly onSkillFilterChange: (value: string) => void;
  readonly versionKey: number;
}

function ActionTabContent({
  tabId,
  available,
  unit,
  controller,
  skillFilter,
  onSkillFilterChange,
  versionKey
}: TabProps) {
  // Force a re-render when the engine state version changes so cooldown /
  // AP / MP refresh after each action.
  void versionKey;
  switch (tabId) {
    case "move":
      return available.move ? (
        <CoreActionList>
          <CoreActionButton
            action="move"
            label="Move"
            meta="Pick a reachable blue cell"
            className="btn-move"
            onClick={() => {
              if (controller.getState().mode === "move") {
                controller.cancel();
                return;
              }
              controller.enterMoveMode();
            }}
          />
        </CoreActionList>
      ) : (
        <div className="combat-action-empty">Move is already used.</div>
      );
    case "attack":
      return available.attack ? (
        <CoreActionList>
          <CoreActionButton
            action="attack"
            label="Attack"
            meta="Choose an enemy in weapon range"
            className="btn-attack"
            onClick={() => {
              if (controller.isInModeForAction("attack")) {
                controller.cancel();
                return;
              }
              controller.enterTargetMode({ type: "attack" });
            }}
          />
        </CoreActionList>
      ) : (
        <div className="combat-action-empty">Attack is unavailable.</div>
      );
    case "skills":
      return (
        <SkillsPanel
          skills={available.skills || []}
          unit={unit}
          filter={skillFilter}
          onFilterChange={onSkillFilterChange}
          controller={controller}
        />
      );
    case "items":
      return (
        <ItemsPanel items={available.items || []} controller={controller} />
      );
    case "guard":
    default:
      return (
        <CoreActionList>
          {available.defend ? (
            <CoreActionButton
              action="defend"
              label="Defend"
              meta="Guard and end your main action"
              className="btn-defend"
              onClick={() => controller.submitDirectAction({ type: "defend" })}
            />
          ) : null}
          <CoreActionButton
            action="end_turn"
            label="End Turn"
            meta="Pass remaining actions"
            className="btn-end-turn"
            onClick={() => controller.submitDirectAction({ type: "end_turn" })}
          />
        </CoreActionList>
      );
  }
}

function CoreActionList({ children }: { children: React.ReactNode }) {
  return <div className="combat-action-list">{children}</div>;
}

function CoreActionButton({
  action,
  label,
  meta,
  className,
  onClick
}: {
  action: string;
  label: string;
  meta: string;
  className: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`btn btn-action ${className}`}
      data-action={action}
      onClick={onClick}
    >
      <span className="btn-action-copy">
        <span className="btn-action-name">{label}</span>
        <span className="btn-action-meta">{meta}</span>
      </span>
    </button>
  );
}

function SkillsPanel({
  skills,
  unit,
  filter,
  onFilterChange,
  controller
}: {
  skills: SkillEntry[];
  unit: Record<string, unknown>;
  filter: string;
  onFilterChange: (value: string) => void;
  controller: CombatController;
}) {
  const lowered = filter.trim().toLowerCase();
  const visible = useMemo(
    () => skills.map((s) => ({ entry: s, hidden: !skillMatchesFilter(s, lowered) })),
    [skills, lowered]
  );
  const visibleCount = visible.filter((v) => !v.hidden).length;
  if (!skills.length) {
    return <div className="combat-action-empty">No skills available.</div>;
  }

  return (
    <>
      {skills.length > 8 ? (
        <label className="combat-action-search">
          <span>Search</span>
          <input
            type="search"
            data-action-skill-search
            value={filter}
            placeholder="Filter skills"
            onChange={(e) => onFilterChange(e.currentTarget.value)}
          />
        </label>
      ) : null}
      <div className="combat-action-list combat-skill-list">
        {visible.map(({ entry, hidden }) => (
          <SkillButton
            key={entry.id}
            entry={entry}
            unit={unit}
            hidden={hidden}
            controller={controller}
          />
        ))}
      </div>
      <div
        className="combat-action-empty"
        data-skill-search-empty
        hidden={visibleCount > 0}
      >
        No skills match that search.
      </div>
    </>
  );
}

function SkillButton({
  entry,
  unit,
  hidden,
  controller
}: {
  entry: SkillEntry;
  unit: Record<string, unknown>;
  hidden: boolean;
  controller: CombatController;
}) {
  const skill = entry.skill || {};
  const skillName = skill.name || entry.id;
  const disabled = !entry.usable;
  const reasonText = skillDisabledReason(entry, unit);
  const iconHtml = renderEntityIconHtml(skill, "skill", "sm");
  const searchText = skillSearchText(entry);

  return (
    <button
      className="btn btn-action btn-skill"
      data-action="skill"
      data-skill={entry.id}
      data-skill-search-text={searchText}
      disabled={disabled}
      aria-disabled={disabled}
      title={reasonText || undefined}
      hidden={hidden}
      onClick={() => {
        if (disabled) return;
        if (controller.isInModeForAction("skill", entry.id)) {
          controller.cancel();
          return;
        }
        const resolver = cjs().SkillResolver;
        const resolved =
          (resolver && resolver.resolveUnitSkill?.(unit, entry.id)) ||
          cjs().DataStore?.get?.<{ aoe?: string; range?: number; id?: string }>(
            "skills",
            entry.id
          );
        const skillObj = resolved as { aoe?: string; range?: number } | null;
        if (skillObj?.aoe && skillObj.aoe !== "none") {
          controller.enterAoETargetMode({ id: entry.id, range: skillObj.range });
        } else {
          controller.enterTargetMode({ type: "skill", skillId: entry.id });
        }
      }}
    >
      <span dangerouslySetInnerHTML={{ __html: iconHtml }} />
      <span className="btn-action-copy">
        <span className="btn-action-name">{skillName}</span>
        <span className="btn-action-meta">
          <SkillMetaChips entry={entry} unit={unit} />
          {skill.qte && skill.qte !== "none" ? (
            <span className="action-chip qte">QTE {skill.qte}</span>
          ) : null}
        </span>
        {reasonText && !entry.usable ? (
          <span className="btn-action-reason">{reasonText}</span>
        ) : null}
      </span>
    </button>
  );
}

function SkillMetaChips({
  entry,
  unit
}: {
  entry: SkillEntry;
  unit: Record<string, unknown>;
}) {
  return (
    <>
      <span className="action-chip">AP {entry.apCost || 0}</span>
      {entry.mpCost ? (
        <span className="action-chip">MP {entry.mpCost}</span>
      ) : null}
      {(entry.cooldown || 0) > 0 ? (
        <span className="action-chip cooldown">CD {entry.cooldown}</span>
      ) : null}
      {entry.isUltimate ? (
        <span
          className={`action-chip ultimate ${entry.ultimateReady ? "ready" : "locked"}`}
        >
          ULT {Math.min(Number((unit as { ultimateMeter?: number }).ultimateMeter || 0), Number(entry.ultimateCost || 100))}
          /{Number(entry.ultimateCost || 100)}
        </span>
      ) : null}
    </>
  );
}

function ItemsPanel({
  items,
  controller
}: {
  items: ItemEntry[];
  controller: CombatController;
}) {
  if (!items.length) {
    return (
      <div className="combat-action-empty">
        No consumable items available.
      </div>
    );
  }
  return (
    <div className="combat-action-list combat-item-list">
      {items.map((entry) => {
        const itemName = entry.item?.name || entry.id;
        const iconHtml = renderEntityIconHtml(entry.item, "item", "sm");
        return (
          <button
            key={entry.id}
            className="btn btn-action btn-item"
            data-action="item"
            data-item={entry.id}
            onClick={() => {
              if (controller.isInModeForAction("item", undefined, entry.id)) {
                controller.cancel();
                return;
              }
              controller.enterTargetMode({ type: "item", itemId: entry.id });
            }}
          >
            <span dangerouslySetInnerHTML={{ __html: iconHtml }} />
            <span className="btn-action-copy">
              <span className="btn-action-name">{itemName}</span>
              <span className="btn-action-meta">Consumable</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function skillSearchText(entry: SkillEntry): string {
  const skill = entry.skill || {};
  return [
    entry.id,
    skill.name,
    skill.description,
    skill.element,
    skill.damageType,
    skill.qte,
    ...(skill.tags || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function skillMatchesFilter(entry: SkillEntry, filter: string): boolean {
  return !filter || skillSearchText(entry).includes(filter);
}

function skillDisabledReason(
  entry: SkillEntry,
  unit: Record<string, unknown>
): string {
  if (entry.usable) return "";
  if (entry.silenced) return "Skills are blocked";
  if (!entry.weaponReady && entry.requiredWeaponTypes?.length) {
    return `Requires ${entry.requiredWeaponTypes
      .map((type) => type.replace(/_/g, " "))
      .join(" or ")}`;
  }
  if ((entry.cooldown || 0) > 0) return `Cooldown: ${entry.cooldown} turns`;
  if (((unit as { currentMP?: number }).currentMP || 0) < (entry.mpCost || 0)) {
    return `Needs ${entry.mpCost || 0} MP`;
  }
  if (
    (((unit as { turnState?: { apRemaining?: number } }).turnState?.apRemaining) || 0) <
    (entry.apCost || 0)
  ) {
    return `Needs ${entry.apCost || 0} AP`;
  }
  if (entry.isUltimate && !entry.ultimateReady) return "Ultimate not ready";
  return "Unavailable";
}
