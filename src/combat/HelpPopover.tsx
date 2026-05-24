import { useCallback, useEffect, useState } from "react";

const HELP_ITEMS = [
  {
    title: "Setup",
    body:
      'Pick units, place them on the grid. The blue "Start" button below the grid begins the battle.'
  },
  {
    title: "Initiative",
    body: 'The top bar shows the turn order. The unit with the glowing "Acting" tag is up.'
  },
  {
    title: "Take Action",
    body:
      "On your turn, pick from Move / Attack / Defend / Skill / Item / End. Hover the grid to preview range."
  },
  {
    title: "Dice & Assist",
    body:
      "Open Battle Assist for Auto Turn / Auto Round, manual dice queue, and animation toggle."
  },
  {
    title: "Outcome",
    body:
      "When all of one team falls, you'll see Victory or Defeat with loot. Campaign battles return automatically."
  }
];

export function HelpPopover({ title }: { title: string }) {
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
          <h3 id="ku-help-popover-title">{title}</h3>
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
              <b>{item.title}</b>
              {item.body}
            </li>
          ))}
        </ol>
      </aside>
    </>
  );
}
