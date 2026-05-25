import type { CampaignStateSnapshot } from "../store";

// Vanilla `cui-party-tab.js` exposes per-member rendering helpers we
// reuse for the inner card body. Porting those sub-renderers (skills,
// passives, statuses, equipment loadout, etc.) to JSX is a separate
// migration step — for now this tab owns the panel + bench structure
// in React and delegates each member's body to the existing module so
// `data-campaign-action` event delegation keeps working unchanged.
interface PartyTabModule {
  readonly renderRosterMember: (
    id: string,
    member: PartyMember,
    helpers: unknown
  ) => string;
}

interface CampaignUIModule {
  readonly getTabHelpers: () => unknown;
}

interface PartyMember {
  readonly name?: string;
  readonly rosterRole?: string;
  readonly [key: string]: unknown;
}

interface Cjs {
  readonly CampaignUI?: CampaignUIModule;
  readonly CampaignUIInternal?: { readonly PartyTab?: PartyTabModule };
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignRosterTab({ state }: Props) {
  const PartyTab = cjs().CampaignUIInternal?.PartyTab;
  const UI = cjs().CampaignUI;
  if (!PartyTab || !UI) {
    return (
      <div className="campaign-empty">Roster module not loaded.</div>
    );
  }
  const helpers = UI.getTabHelpers();

  // Active vs benched split mirrors the vanilla `renderRoster` partition.
  const partyMap = (state.party as Record<string, PartyMember> | undefined) ?? {};
  const entries = Object.entries(partyMap);
  const active = entries.filter(([, m]) => (m.rosterRole || "active") !== "bench");
  const bench = entries.filter(([, m]) => (m.rosterRole || "active") === "bench");

  return (
    <div className="campaign-tab-stack">
      <section className="campaign-panel">
        <div className="campaign-panel-head">
          <h2>Roster</h2>
          <button
            className="campaign-action"
            data-campaign-action="recruit-character"
          >
            Recruit
          </button>
        </div>
        {active.length === 0 ? (
          <div className="campaign-empty">No active roster.</div>
        ) : (
          active.map(([id, member]) => (
            <MemberCard key={id} id={id} member={member} PartyTab={PartyTab} helpers={helpers} />
          ))
        )}
      </section>

      <section className="campaign-panel">
        <div className="campaign-panel-head">
          <h2>Bench</h2>
        </div>
        {bench.length === 0 ? (
          <div className="campaign-empty">No benched members.</div>
        ) : (
          bench.map(([id, member]) => (
            <MemberCard key={id} id={id} member={member} PartyTab={PartyTab} helpers={helpers} />
          ))
        )}
      </section>
    </div>
  );
}

interface CardProps {
  readonly id: string;
  readonly member: PartyMember;
  readonly PartyTab: PartyTabModule;
  readonly helpers: unknown;
}

function MemberCard({ id, member, PartyTab, helpers }: CardProps) {
  // Vanilla `renderRosterMember` returns a complete `<article>` for the
  // member, including every interactive button. React inserts it via
  // dangerouslySetInnerHTML so the existing campaign-root event
  // delegation still catches every `data-campaign-action` click.
  let html: string;
  try {
    html = PartyTab.renderRosterMember(id, member, helpers);
  } catch (error) {
    console.error("renderRosterMember failed for", id, error);
    html = `<article class="campaign-roster-member"><div class="campaign-empty">Failed to render ${id}.</div></article>`;
  }
  return <div className="campaign-roster-member-mount" dangerouslySetInnerHTML={{ __html: html }} />;
}
