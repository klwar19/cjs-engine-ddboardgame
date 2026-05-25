import type { CampaignStateSnapshot } from "../store";

// Save metadata as the vanilla CampaignSave module exposes it. Anything
// the settings panel doesn't read is left as `unknown`.
interface CampaignSaveSlot {
  readonly saveId: string;
  readonly slotName?: string;
  readonly currentWorld?: string;
  readonly currentChapter?: string;
  readonly storyMode?: { readonly currentChapterLabel?: string };
  readonly saveVersion?: number;
  readonly lastUpdated?: string;
}

interface CampaignSaveModule {
  readonly getSlots: () => Record<string, CampaignSaveSlot>;
  readonly getActiveSlotId: () => string;
  readonly isCompatible: (slot: CampaignSaveSlot) => boolean;
  readonly describeIncompatibility: (slot: CampaignSaveSlot) => string;
  readonly currentSaveVersion: () => number;
  readonly minCompatibleVersion: () => number;
}

interface CampaignUIModule {
  readonly getBootIncompatibleNotice: () => {
    readonly slotName: string;
    readonly reason: string;
    readonly slotId: string;
  } | null;
}

interface Cjs {
  readonly CampaignSave?: CampaignSaveModule;
  readonly CampaignUI?: CampaignUIModule;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

function formatLogTime(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

interface Props {
  readonly state: CampaignStateSnapshot;
}

// Re-uses the vanilla event delegation: every button carries the same
// `data-campaign-action` attribute that the campaign-ui shell already
// listens for via event bubbling on the campaign-root. React doesn't need
// to bind its own handlers — the existing `_handleAction` dispatcher in
// campaign-ui.js still wins.
export function CampaignSettingsTab(_props: Props) {
  const Save = cjs().CampaignSave;
  const UI = cjs().CampaignUI;
  if (!Save) {
    return (
      <section className="campaign-panel">
        <div className="campaign-empty">Save manager not loaded.</div>
      </section>
    );
  }

  const slotsMap = Save.getSlots();
  const activeId = Save.getActiveSlotId();
  const buildVersion = Save.currentSaveVersion();
  const minVersion = Save.minCompatibleVersion();
  const bootNotice = UI?.getBootIncompatibleNotice() ?? null;

  // Match vanilla ordering: newest lastUpdated first, lexicographic compare
  // (the same ISO timestamps the legacy save manager produces).
  const slots = Object.values(slotsMap).sort((a, b) =>
    String(b.lastUpdated || "").localeCompare(String(a.lastUpdated || ""))
  );

  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <div>
          <h2>Campaign Saves</h2>
          <div className="campaign-muted">
            Build save version <strong>{buildVersion}</strong> · Min compatible{" "}
            <strong>{minVersion}</strong>
          </div>
        </div>
      </div>

      {bootNotice ? (
        <div className="campaign-save-warning">
          <strong>Heads up:</strong> Your previous save{" "}
          <em>{bootNotice.slotName}</em> was made by an older build and could
          not be loaded. {bootNotice.reason} A fresh save has been started — you
          can delete or export the old slot below.
        </div>
      ) : null}

      <div className="campaign-save-manager">
        <div className="campaign-save-actions">
          <button className="campaign-action primary" data-campaign-action="new-save">
            + New Campaign Save
          </button>
          <button className="campaign-action" data-campaign-action="save-slot">
            Save Now
          </button>
          <button className="campaign-action" data-campaign-action="fork-save">
            Fork Current
          </button>
          <button className="campaign-action" data-campaign-action="export-save">
            Export Current
          </button>
          <button className="campaign-action" data-campaign-action="import-save">
            Import…
          </button>
          <button
            className="campaign-action danger"
            data-campaign-action="delete-all-saves"
          >
            Delete All Saves
          </button>
        </div>

        {slots.length === 0 ? (
          <div className="campaign-save-empty">
            No saved campaigns yet. Use{" "}
            <strong>New Campaign Save</strong> below to start one.
          </div>
        ) : (
          slots.map((slot) => {
            const compatible = Save.isCompatible(slot);
            const reason = compatible ? "" : Save.describeIncompatibility(slot);
            const isActive = slot.saveId === activeId;
            const chapter =
              slot.storyMode?.currentChapterLabel || slot.currentChapter || "1.1";
            return (
              <div
                key={slot.saveId}
                className={`campaign-save-slot${isActive ? " is-active" : ""}${
                  compatible ? "" : " is-incompatible"
                }`}
              >
                <div>
                  <h4>{slot.slotName || slot.saveId}</h4>
                  <div className="campaign-save-meta">
                    <span>World: {slot.currentWorld || "?"}</span>
                    <span>Chapter {chapter}</span>
                    <span>Saved {formatLogTime(slot.lastUpdated)}</span>
                    <span>v{slot.saveVersion ?? 0}</span>
                    {isActive ? <span>● Active</span> : null}
                    {!compatible ? <span className="is-warn">Incompatible</span> : null}
                  </div>
                  {!compatible ? (
                    <div className="campaign-muted" style={{ marginTop: 6 }}>
                      {reason}
                    </div>
                  ) : null}
                </div>
                <div className="campaign-save-row-actions">
                  {compatible ? (
                    <button
                      className="campaign-action primary"
                      data-campaign-action="load-slot"
                      data-id={slot.saveId}
                      disabled={isActive}
                    >
                      {isActive ? "Loaded" : "Load"}
                    </button>
                  ) : (
                    <button
                      className="campaign-action"
                      data-campaign-action="export-slot"
                      data-id={slot.saveId}
                      title="Export the old save before deleting"
                    >
                      Export
                    </button>
                  )}
                  <button
                    className="campaign-action danger"
                    data-campaign-action="delete-slot"
                    data-id={slot.saveId}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
