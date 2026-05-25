// ActorPanel — selected unit info: HP/MP/ULT bars, statuses, persona, combo,
// proc modifier. Mirrors the markup of the original combat-ui._renderUnitInfo.

import { useCombatVersion } from "../store";
import { portraitHtml, statusIcon } from "../uiHelpers";

interface CjsAny {
  CombatManager?: {
    getCurrentUnit?: () => Record<string, unknown> | null;
  };
  ActionHandler?: {
    getComboBonus?: (unit: unknown) => number;
  };
}

function cjs(): CjsAny {
  return (window as unknown as { CJS?: CjsAny }).CJS ?? {};
}

export function ActorPanel() {
  useCombatVersion();
  const unit = cjs().CombatManager?.getCurrentUnit?.() as Record<string, unknown> | null;
  if (!unit) {
    return (
      <div id="cbt-unit-info" className="unit-info-panel">
        <div className="unit-info-empty">Waiting...</div>
      </div>
    );
  }

  const u = unit as {
    name?: string;
    baseId?: string;
    icon?: string;
    rank?: string;
    type?: string;
    portrait?: string;
    portraitFocus?: unknown;
    team?: string;
    currentHP?: number;
    maxHP?: number;
    currentMP?: number;
    maxMP?: number;
    ultimateMax?: number;
    ultimateMeter?: number;
    ultimateSkillId?: string;
    activePersona?: string;
    personaName?: string;
    personaOutOfWorld?: boolean;
    personaWorld?: string;
    damageDealtMultiplier?: number;
    damageTakenMultiplier?: number;
    procModifier?: string;
    procModifierLabel?: string;
    procModifierIcon?: string;
    activeStatuses?: Array<{ statusId: string; duration: number; stacks?: number }>;
    comboState?: { chain?: number };
    turnState?: { hasMoved?: boolean; mainActionUsed?: boolean; apRemaining?: number };
  };

  const turnState = u.turnState || {};
  const hpPct = Math.round(((u.currentHP || 0) / (u.maxHP || 1)) * 100);
  const mpPct = u.maxMP ? Math.round(((u.currentMP || 0) / u.maxMP) * 100) : 0;
  const ultMax = Number(u.ultimateMax || 100);
  const ultCur = Number(u.ultimateMeter || 0);
  const ultPct = Math.max(0, Math.min(100, Math.round((ultCur / (ultMax || 1)) * 100)));
  const ultReady = ultCur >= ultMax;
  const showUltRow = typeof u.ultimateMeter === "number" && !!u.ultimateSkillId;

  const portrait = portraitHtml({
    path: u.portrait,
    imageClass: "unit-portrait",
    fallbackClass: "unit-icon-lg",
    icon: u.icon || "?",
    focus: u.portraitFocus
  });

  const personaChip = u.activePersona ? renderPersonaChip(u) : null;
  const modifierChip =
    u.procModifier && u.team !== "player" && u.team !== "ally"
      ? renderModifierChip(u)
      : null;
  const comboChain = u.comboState?.chain || 0;
  const comboChip = comboChain >= 2 ? renderComboChip(u, comboChain) : null;

  return (
    <div id="cbt-unit-info" className="unit-info-panel">
      <div className={`unit-card ${u.team || "player"}`}>
        <div className="unit-header">
          <span dangerouslySetInnerHTML={{ __html: portrait }} />
          <div>
            <div className="unit-name">{u.name || u.baseId || "?"}</div>
            <div className="unit-rank">
              Rank {u.rank || "?"} {u.type || ""}
            </div>
            {personaChip}
            {modifierChip}
            {comboChip}
          </div>
        </div>
        <div className="resource-bars">
          <div className="bar-row">
            <span className="bar-label">HP</span>
            <div className="bar-track hp">
              <div className="bar-fill" style={{ width: `${hpPct}%` }} />
            </div>
            <span className="bar-num">
              {u.currentHP || 0}/{u.maxHP || 0}
            </span>
          </div>
          <div className="bar-row">
            <span className="bar-label">MP</span>
            <div className="bar-track mp">
              <div className="bar-fill" style={{ width: `${mpPct}%` }} />
            </div>
            <span className="bar-num">
              {u.currentMP || 0}/{u.maxMP || 0}
            </span>
          </div>
          {showUltRow ? (
            <div className="bar-row">
              <span className="bar-label">ULT</span>
              <div className={`bar-track ultimate ${ultReady ? "ultimate-ready" : ""}`}>
                <div className="bar-fill" style={{ width: `${ultPct}%` }} />
              </div>
              <span className="bar-num">
                {ultCur | 0}/{ultMax | 0}
              </span>
            </div>
          ) : null}
        </div>
        <div className="turn-state">
          <span className={turnState.hasMoved ? "used" : "available"}>
            Move: {turnState.hasMoved ? "Used" : "Ready"}
          </span>
          <span className={turnState.mainActionUsed ? "used" : "available"}>
            Action: {turnState.mainActionUsed ? "Used" : "Ready"}
          </span>
          <span>AP: {turnState.apRemaining || 0}</span>
        </div>
        {u.activeStatuses && u.activeStatuses.length > 0 ? (
          <div className="unit-statuses">
            {u.activeStatuses.map((status, idx) => (
              <span
                key={`${status.statusId}:${idx}`}
                className="status-chip"
                title={`${status.statusId} (${status.duration}t, ${status.stacks || 0}stk)`}
              >
                {statusIcon(status.statusId)} {status.duration}t
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function renderPersonaChip(u: {
  personaName?: string;
  activePersona?: string;
  personaOutOfWorld?: boolean;
  personaWorld?: string;
  damageDealtMultiplier?: number;
  damageTakenMultiplier?: number;
}) {
  const personaName = u.personaName || u.activePersona || "";
  const out = !!u.personaOutOfWorld;
  const dealt = Number(u.damageDealtMultiplier ?? 1);
  const taken = Number(u.damageTakenMultiplier ?? 1);
  const tooltip = out
    ? `${personaName} (out of world: ${u.personaWorld || ""}). Damage ×${dealt} dealt / ×${taken} taken.`
    : `${personaName} (${u.personaWorld || ""})`;
  return (
    <div
      className="unit-persona-chip"
      title={tooltip}
      style={{
        fontSize: "0.74rem",
        marginTop: "2px",
        color: out ? "#f59e0b" : "var(--text-mute)"
      }}
    >
      🎭 {personaName}
      {out ? ` ⚠ ×${dealt}/×${taken}` : ""}
    </div>
  );
}

function renderModifierChip(u: {
  procModifierLabel?: string;
  procModifier?: string;
  procModifierIcon?: string;
}) {
  const label = u.procModifierLabel || u.procModifier || "";
  const icon = u.procModifierIcon || "✨";
  return (
    <div
      className="unit-modifier-chip"
      title="Procedural enemy modifier — random prefix giving this normal monster a twist."
      style={{
        fontSize: "0.74rem",
        marginTop: "2px",
        color: "#a855f7",
        fontWeight: 600
      }}
    >
      {icon} {label}
    </div>
  );
}

function renderComboChip(unit: unknown, chain: number) {
  const bonusPct = Math.round((cjs().ActionHandler?.getComboBonus?.(unit) || 0) * 100);
  return (
    <div
      className="unit-combo-chip"
      title="Chain QTE successes for bonus damage. Breaks on QTE fail, defend, or item use."
      style={{
        fontSize: "0.74rem",
        marginTop: "2px",
        color: "#f97316",
        fontWeight: 600
      }}
    >
      🔥 Combo x{chain} · +{bonusPct}% next hit
    </div>
  );
}
