import { Fragment, useEffect, useState } from "react";
import { getCombatCjs } from "./types";

type PhaseId = "setup" | "initiative" | "action" | "resolve" | "end";

const STEPS: ReadonlyArray<{ id: PhaseId; label: string; number: string }> = [
  { id: "setup", label: "Setup", number: "1" },
  { id: "initiative", label: "Initiative", number: "2" },
  { id: "action", label: "Take Action", number: "3" },
  { id: "resolve", label: "Resolve", number: "4" },
  { id: "end", label: "Outcome", number: "5" }
];

interface PhaseStripProps {
  readonly combatVisible: boolean;
}

// Light polling kept to preserve the original behaviour: there's no event
// stream the React layer can subscribe to for sub-phases that the vanilla
// renderer surfaces, so we poll every 800ms exactly as the legacy script did.
export function PhaseStrip({ combatVisible }: PhaseStripProps) {
  const [phase, setPhase] = useState<PhaseId>("setup");

  useEffect(() => {
    const sync = () => {
      if (!combatVisible) {
        setPhase("setup");
        return;
      }
      const cjs = getCombatCjs();
      const state = cjs.CombatManager?.getState?.() ?? null;
      const stateLike = state as { phase?: string } | null;
      if (stateLike?.phase === "battle_end") {
        setPhase("end");
        return;
      }
      if (stateLike?.phase === "turn") {
        setPhase("action");
        return;
      }
      if (stateLike?.phase === "init") {
        setPhase("initiative");
        return;
      }
      setPhase("action");
    };
    sync();
    const id = window.setInterval(sync, 800);
    return () => window.clearInterval(id);
  }, [combatVisible]);

  const activeIdx = STEPS.findIndex((s) => s.id === phase);

  return (
    <div
      className="ku-phase-strip"
      aria-label="Combat phases"
      id="ku-phase-strip"
    >
      {STEPS.map((step, i) => {
        const cls = [
          "ku-phase-step",
          i === activeIdx ? "is-active" : "",
          activeIdx >= 0 && i < activeIdx ? "is-done" : ""
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <Fragment key={step.id}>
            <span className={cls} data-phase={step.id}>
              <b>{step.number}</b>
              {step.label}
            </span>
            {i < STEPS.length - 1 ? (
              <span className="ku-phase-divider" />
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}
