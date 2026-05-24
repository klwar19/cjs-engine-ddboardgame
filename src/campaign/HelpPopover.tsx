import { useCallback, useEffect, useState } from "react";

// Help guide items mirror the campaign.html legacy inline list.
const HELP_ITEMS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "World",
    body:
      "Switch between Haven, Earth, Zombie World, and Bazaar; each world loads its own story/activity/map content."
  },
  {
    title: "Story",
    body:
      "Main arc chapter files, active VN sequence, replay, manual notes, and story summary live here."
  },
  {
    title: "Quest / Scavenge",
    body:
      "Haven keeps classic quests. Zombie presents this as scavenging/survival runs. Earth and Bazaar use story, events, maps, and activities instead."
  },
  {
    title: "Event",
    body:
      "Only character events, special events, and side stories live here. Random events moved out."
  },
  {
    title: "Activities",
    body:
      "Hub, oracle/manual event notes, farm, forge, cooking, shops, rest, and inventory live here."
  },
  {
    title: "Manual Control",
    body:
      "Use Current Run, Party, Logs, Settings, and each tab's manual buttons whenever you want GM control."
  },
  {
    title: "Combat Return",
    body:
      "Campaign battles open the Combat screen and return results here automatically."
  }
];

export function CampaignHelpPopover() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        className="ku-help-fab"
        aria-label="Open quick guide"
        aria-expanded={open}
        aria-controls="ku-help-popover"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      <aside
        className="ku-help-popover"
        id="ku-help-popover"
        role="dialog"
        aria-labelledby="ku-help-popover-title"
        aria-hidden={!open}
        data-open={open ? "true" : "false"}
      >
        <div className="ku-help-popover-head">
          <h3 id="ku-help-popover-title">Campaign Quick Guide</h3>
          <button
            type="button"
            className="ku-help-popover-close"
            aria-label="Close quick guide"
            onClick={close}
          />
        </div>
        <ol>
          {HELP_ITEMS.map((item) => (
            <li key={item.title}>
              <b>{item.title}</b> {item.body}
            </li>
          ))}
        </ol>
      </aside>
    </>
  );
}
