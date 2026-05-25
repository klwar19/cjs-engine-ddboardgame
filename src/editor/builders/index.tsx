// Registry of React-migrated builders. EditorPage consults this to
// decide whether a given panel should render its React component or
// fall back to the vanilla BuilderPanel wrapper.
//
// As each builder is ported, add a row here. When the row is present
// the corresponding entry in `editorTypes.ts::builderFor` becomes
// unreachable for that panel and can be removed.

import type { ComponentType } from "react";
import type { PanelId } from "../editorTypes";
import { EffectEditor } from "./EffectEditor";
import { JobEditor } from "./JobEditor";
import { PassiveEditor } from "./PassiveEditor";
import { SkillEditor } from "./SkillEditor";
import { StatusEditor } from "./StatusEditor";

export const REACT_BUILDERS: Partial<Record<PanelId, ComponentType>> = {
  effects: EffectEditor,
  statuses: StatusEditor,
  passives: PassiveEditor,
  skills: SkillEditor,
  jobs: JobEditor
};

export function getReactBuilder(panel: PanelId): ComponentType | undefined {
  return REACT_BUILDERS[panel];
}
