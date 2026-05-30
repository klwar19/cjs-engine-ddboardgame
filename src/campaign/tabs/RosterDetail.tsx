// RosterDetail.tsx — Phase K.3.2 JSX for the roster detail row.
//
// The skills / passives / statuses / equipment cards, ported from the
// `cui-party-tab.js` HTML island to JSX reading typed `RosterDetailData`
// (rosterDetail.ts). Icons render through `<Icon>` (the icon-as-JSX twin of
// UIIcons.renderIcon); every action button uses a direct onClick dispatch
// instead of a `data-campaign-action` attribute. `test_roster_detail.js`
// proves this renders the same DOM the island did (action-wiring attributes
// normalized away) for empty AND rich members.

import { dispatchCampaignAction, type CampaignActionName } from "../actions";
import { Icon } from "../util/Icon";
import type {
  RosterDetailData,
  SkillSlot,
  PassiveSlot,
  KnownSkillData,
  KnownPassiveData,
  KnownStatusData
} from "./data/rosterDetail";

function dispatch(name: CampaignActionName, data: Record<string, string>) {
  dispatchCampaignAction(name, data);
}

// Shared record-line shell (mirrors `renderKnownRecord`).
function RecordLine({
  title,
  meta,
  body,
  actions
}: {
  title: string;
  meta: string;
  body: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div className="campaign-record-line">
      <div>
        <strong>{title}</strong>
        <small>{meta}</small>
        {body}
      </div>
      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>{actions}</div>
    </div>
  );
}

function PerkLines({ earnedText, nextText }: { earnedText: string; nextText: string }) {
  return (
    <>
      {earnedText && (
        <div className="campaign-muted" style={{ fontSize: "0.8em" }}>
          Perks: {earnedText}
        </div>
      )}
      {nextText && (
        <div className="campaign-muted" style={{ fontSize: "0.8em", color: "var(--accent)" }}>
          {nextText}
        </div>
      )}
    </>
  );
}

// ── Skills card ──────────────────────────────────────────────────────────
function SkillSlotGrid({ slots, memberId }: { slots: readonly SkillSlot[]; memberId: string }) {
  if (!slots.length) return null;
  return (
    <div className="campaign-slot-grid">
      {slots.map((s, i) =>
        s.filled ? (
          <div key={i} className="campaign-slot filled" title={s.title}>
            <Icon entity={s.entity} kind="skill" size="md" alt={s.name} />
            <span className="campaign-slot-name">{s.name}</span>
            <button
              className="campaign-slot-remove"
              title="Unequip"
              onClick={() => dispatch("unequip-skill", { id: memberId, skillId: s.skillId })}
            >
              ✕
            </button>
          </div>
        ) : (
          <div
            key={i}
            className="campaign-slot empty"
            title="Equip a skill from pool"
            onClick={() => dispatch("pick-equip-skill", { id: memberId })}
          >
            <span className="campaign-slot-plus">+</span>
          </div>
        )
      )}
    </div>
  );
}

function KnownSkillRow({ d }: { d: KnownSkillData }) {
  return (
    <RecordLine
      title={d.title}
      meta={d.meta}
      body={
        <>
          <p>{d.description || "No description yet."}</p>
          <PerkLines earnedText={d.earnedText} nextText={d.nextText} />
        </>
      }
      actions={
        <>
          {d.equip === "equipped" && (
            <button
              className="campaign-action danger"
              title="Unequip (frees slot/SP)"
              onClick={() => dispatch("unequip-skill", { id: d.memberId, skillId: d.skillId })}
            >
              Unequip
            </button>
          )}
          {d.equip === "unequipped" && (
            <button
              className="campaign-action"
              title={`Equip (uses ${d.spCost} SP)`}
              onClick={() => dispatch("equip-skill", { id: d.memberId, skillId: d.skillId })}
            >
              Equip
            </button>
          )}
          {d.showAp && (
            <button
              className="campaign-action"
              title="Grant AbP for this skill (edit-mode)"
              onClick={() => dispatch("grant-skill-ap", { id: d.memberId, skillId: d.skillId })}
            >
              +AbP
            </button>
          )}
          {d.showLevel && (
            <button
              className="campaign-action"
              title="Force level-up (edit-mode)"
              onClick={() => dispatch("level-up-skill", { id: d.memberId, skillId: d.skillId })}
            >
              +Lv
            </button>
          )}
          {d.showDetail && (
            <button
              className="campaign-action"
              title="Show full perk tree"
              onClick={() => dispatch("show-skill-detail", { id: d.memberId, skillId: d.skillId })}
            >
              Detail
            </button>
          )}
          {d.learned && (
            <button
              className="campaign-icon-btn danger"
              title="Remove"
              onClick={() => dispatch("unlearn-skill", { id: d.memberId, skillId: d.skillId })}
            >
              -
            </button>
          )}
        </>
      }
    />
  );
}

function SkillsCard({ data, id }: { data: RosterDetailData["skills"]; id: string }) {
  return (
    <section className="campaign-roster-card campaign-roster-skills">
      <div className="campaign-roster-card-title">
        <span>Skills</span>
        <small className="campaign-muted">{data.budgetBadge}</small>
      </div>
      <SkillSlotGrid slots={data.slots} memberId={id} />
      <details className="campaign-pool-details">
        <summary className="campaign-pool-summary">Manage Pool ({data.poolCount} in pool)</summary>
        {data.pool.length === 0 ? (
          <div className="campaign-empty">No skills in pool. Use the + button to learn one.</div>
        ) : (
          data.pool.map((row) => <KnownSkillRow key={row.key} d={row} />)
        )}
      </details>
    </section>
  );
}

// ── Passives card ──────────────────────────────────────────────────────────
function PassiveSlotGrid({ slots, memberId }: { slots: readonly PassiveSlot[]; memberId: string }) {
  if (!slots.length) return null;
  return (
    <div className="campaign-slot-grid">
      {slots.map((s, i) =>
        s.filled ? (
          <div key={i} className="campaign-slot filled" title={s.title}>
            <Icon entity={s.entity} kind="passive" size="md" alt={s.name} />
            <span className="campaign-slot-name">
              {s.name} <small>{s.rankLabel}</small>
            </span>
            <button
              className="campaign-slot-remove"
              title="Unequip"
              onClick={() => dispatch("unequip-passive", { id: memberId, passiveId: s.passiveId })}
            >
              ✕
            </button>
          </div>
        ) : (
          <div
            key={i}
            className="campaign-slot empty"
            title="Equip a passive from pool"
            onClick={() => dispatch("pick-equip-passive", { id: memberId })}
          >
            <span className="campaign-slot-plus">+</span>
          </div>
        )
      )}
    </div>
  );
}

function KnownPassiveRow({ d }: { d: KnownPassiveData }) {
  return (
    <RecordLine
      title={d.title}
      meta={d.meta}
      body={
        <>
          <p>{d.description || "No description yet."}</p>
          <PerkLines earnedText={d.earnedText} nextText={d.nextText} />
        </>
      }
      actions={
        <>
          {d.equip === "equipped" && (
            <button
              className="campaign-action danger"
              title="Unequip (frees slot/SP)"
              onClick={() => dispatch("unequip-passive", { id: d.memberId, passiveId: d.passiveId })}
            >
              Unequip
            </button>
          )}
          {d.equip === "unequipped" && (
            <button
              className="campaign-action"
              title="Equip (uses 1 SP)"
              onClick={() => dispatch("equip-passive", { id: d.memberId, passiveId: d.passiveId })}
            >
              Equip
            </button>
          )}
          {d.showRankUp && (
            <button
              className="campaign-action"
              title={`Consumes ${d.rankCostText || "rank material"}`}
              onClick={() => dispatch("rank-up-passive", { id: d.memberId, passiveId: d.passiveId })}
            >
              Rank Up
            </button>
          )}
          {d.learned && (
            <button
              className="campaign-icon-btn danger"
              title="Remove"
              onClick={() => dispatch("unlearn-passive", { id: d.memberId, passiveId: d.passiveId })}
            >
              -
            </button>
          )}
        </>
      }
    />
  );
}

function PassivesCard({ data, id }: { data: RosterDetailData["passives"]; id: string }) {
  return (
    <section className="campaign-roster-card campaign-roster-passives">
      <div className="campaign-roster-card-title">
        <span>Passives</span>
        <small className="campaign-muted">{data.budgetBadge}</small>
      </div>
      <PassiveSlotGrid slots={data.slots} memberId={id} />
      <details className="campaign-pool-details">
        <summary className="campaign-pool-summary">Manage Pool ({data.poolCount} in pool)</summary>
        {data.pool.length === 0 ? (
          <div className="campaign-empty">No passives in pool. Use the + button to learn one.</div>
        ) : (
          data.pool.map((row) => <KnownPassiveRow key={row.key} d={row} />)
        )}
      </details>
    </section>
  );
}

// ── Statuses card ──────────────────────────────────────────────────────────
function StatusRow({ d }: { d: KnownStatusData }) {
  return (
    <RecordLine
      title={d.title}
      meta={d.meta}
      body={<p>{d.description || "No description yet."}</p>}
      actions={null}
    />
  );
}

function StatusesCard({ statuses, id }: { statuses: readonly KnownStatusData[]; id: string }) {
  return (
    <section className="campaign-roster-card campaign-roster-statuses">
      <div className="campaign-roster-card-title">
        <span>Statuses</span>
        <button
          className="campaign-icon-btn"
          onClick={() => dispatch("status-char", { id })}
        >
          +
        </button>
      </div>
      {statuses.length === 0 ? (
        <div className="campaign-empty">No statuses.</div>
      ) : (
        statuses.map((s) => <StatusRow key={s.key} d={s} />)
      )}
    </section>
  );
}

// ── Equipment card ───────────────────────────────────────────────────────
function EquipmentCard({ data, id }: { data: RosterDetailData["equipment"]; id: string }) {
  return (
    <section className="campaign-roster-card campaign-roster-equipment">
      <div className="campaign-roster-card-title">
        <span>Equipment</span>
      </div>
      <div className="campaign-equipment-proficiency">{data.proficiency}</div>
      {data.rows.map((row) => (
        <div key={row.slot} className="campaign-equipment-line">
          <div className="campaign-equipment-icon">
            {row.filled ? (
              <Icon entity={row.entity} kind={row.slotKind} size="md" alt={row.itemName} />
            ) : (
              <span className={`cjs-icon cjs-icon-md cjs-icon-${row.slotKind}`} style={{ opacity: ".4" }}>
                +
              </span>
            )}
          </div>
          <div>
            <strong>{row.slotLabel}</strong>
            <small>
              {row.itemName}
              {row.meta ? ` | ${row.meta}` : ""}
            </small>
            {row.filled && <p>{row.description}</p>}
          </div>
          <div className="campaign-row-actions">
            <button
              className="campaign-icon-btn"
              onClick={() => dispatch("equip-item", { id, slot: row.slot })}
            >
              Equip
            </button>
            {row.filled && (
              <button
                className="campaign-icon-btn danger"
                onClick={() => dispatch("unequip-item", { id, slot: row.slot })}
              >
                -
              </button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

// ── Detail row (the 2-column grid the tab/modal own) ───────────────────────
export function RosterDetailRow({ data }: { data: RosterDetailData }) {
  return (
    <div className="campaign-roster-detail-row">
      <SkillsCard data={data.skills} id={data.id} />
      <PassivesCard data={data.passives} id={data.id} />
      <StatusesCard statuses={data.statuses} id={data.id} />
      <EquipmentCard data={data.equipment} id={data.id} />
    </div>
  );
}
