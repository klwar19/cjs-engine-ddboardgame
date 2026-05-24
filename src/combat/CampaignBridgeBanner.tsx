import type {
  CampaignRequest,
  CombatResult,
  PartyOverlayEntry
} from "./types";
import { getCombatCjs } from "./types";

interface CampaignBridgeBannerProps {
  readonly request: CampaignRequest;
  readonly result: CombatResult | null;
  readonly onReturn: () => void;
}

function renderPersonas(request: CampaignRequest): string | null {
  const overlay = request.partyOverlay ?? {};
  const personas: string[] = [];
  for (const [id, patchUnknown] of Object.entries(overlay)) {
    const patch = patchUnknown as PartyOverlayEntry | undefined;
    const unit = patch?.unit;
    if (!unit?.activePersona) continue;
    const out = unit.personaOutOfWorld;
    const dealt = Number(unit.damageDealtMultiplier ?? 1);
    const taken = Number(unit.damageTakenMultiplier ?? 1);
    const name = unit.name ?? id;
    const personaName = unit.personaName ?? unit.activePersona;
    personas.push(
      `${name}: 🎭 ${personaName}${out ? ` ⚠ ×${dealt}/×${taken}` : ""}`
    );
  }
  return personas.length ? personas.join(" · ") : null;
}

export function CampaignBridgeBanner({
  request,
  result,
  onReturn
}: CampaignBridgeBannerProps) {
  const cjs = getCombatCjs();
  const personaLine = renderPersonas(request);
  const lootText = result ? cjs.CampaignCombatBridge?.summarizeLoot(result) ?? "" : "";
  const subText = result
    ? `Result saved: ${result.result} in ${result.rounds ?? 0} rounds. Returning to Campaign...`
    : request.label ?? request.encounterId ?? "Ready";

  return (
    <div
      id="campaign-bridge-banner"
      className="campaign-bridge-banner"
      style={{
        margin: "12px",
        padding: "12px",
        border: "1px solid #64b5f6",
        borderRadius: "8px",
        background: "#101923",
        color: "#f5f7fa",
        display: "flex",
        gap: "12px",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap"
      }}
    >
      <div>
        <strong>Campaign Battle</strong>
        <div style={{ color: "#a9b4c0", fontSize: "0.9rem" }}>{subText}</div>
        {personaLine ? (
          <div
            style={{ color: "#a9b4c0", fontSize: "0.85rem", marginTop: "4px" }}
          >
            {personaLine}
          </div>
        ) : null}
        {result ? (
          <div style={{ color: "#c8df83", fontSize: "0.9rem" }}>
            Loot: {lootText}
          </div>
        ) : null}
      </div>
      <button
        id="campaign-return-btn"
        className="btn btn-primary"
        onClick={onReturn}
      >
        {result ? "Return Now" : "Return to Campaign"}
      </button>
    </div>
  );
}
