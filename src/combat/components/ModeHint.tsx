// ModeHint — small text under the action panel that surfaces the current
// click-mode instruction ("Click a blue cell to move..." etc).

import { useEffect, useState } from "react";
import type { CombatController } from "../combatController";

interface Props {
  readonly controller: CombatController;
}

export function ModeHint({ controller }: Props) {
  const [hint, setHint] = useState(controller.getState().hint);

  useEffect(() => {
    setHint(controller.getState().hint);
    return controller.subscribe((s) => setHint(s.hint));
  }, [controller]);

  if (!hint) return <div className="mode-hint" style={{ display: "none" }} />;
  return (
    <div className="mode-hint" style={{ display: "block" }}>
      {hint}
    </div>
  );
}
