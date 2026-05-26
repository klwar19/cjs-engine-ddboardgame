// Registry of React-migrated builders. EditorPage consults this to
// decide whether a given panel should render its React component or
// fall back to the vanilla BuilderPanel wrapper.
//
// As each builder is ported, add a row here. When the row is present
// the corresponding entry in `editorTypes.ts::builderFor` becomes
// unreachable for that panel and can be removed.
//
// Each builder is `React.lazy()`'d so it only ships when the user
// opens that panel. The EditorPage wraps the rendered builder in a
// <Suspense> boundary that shows a tiny "Loading…" while the chunk
// is fetched. Build chunks become one-per-builder, so a change to
// MonsterEditor only invalidates monsters-editor cache, not the
// 230 KB editor bundle.

import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { PanelId } from "../editorTypes";

const AudioLibrary = lazy(() => import("./AudioLibrary").then((m) => ({ default: m.AudioLibrary })));
const CampaignEditor = lazy(() => import("./CampaignEditor").then((m) => ({ default: m.CampaignEditor })));
const CharEditor = lazy(() => import("./CharEditor").then((m) => ({ default: m.CharEditor })));
const DataBrowser = lazy(() => import("./DataBrowser").then((m) => ({ default: m.DataBrowser })));
const EffectEditor = lazy(() => import("./EffectEditor").then((m) => ({ default: m.EffectEditor })));
const EncounterEditor = lazy(() => import("./EncounterEditor").then((m) => ({ default: m.EncounterEditor })));
const ItemEditor = lazy(() => import("./ItemEditor").then((m) => ({ default: m.ItemEditor })));
const JobEditor = lazy(() => import("./JobEditor").then((m) => ({ default: m.JobEditor })));
const MonsterEditor = lazy(() => import("./MonsterEditor").then((m) => ({ default: m.MonsterEditor })));
const PassiveEditor = lazy(() => import("./PassiveEditor").then((m) => ({ default: m.PassiveEditor })));
const PersonaEditor = lazy(() => import("./PersonaEditor").then((m) => ({ default: m.PersonaEditor })));
const SkillEditor = lazy(() => import("./SkillEditor").then((m) => ({ default: m.SkillEditor })));
const StatusEditor = lazy(() => import("./StatusEditor").then((m) => ({ default: m.StatusEditor })));
// SimpleCollectionEditor exports three named components from a single
// module; lazy-loading the whole file once and pulling out each named
// export keeps the chunk shared between the three panels.
const SimpleCollection = () => import("./SimpleCollectionEditor");
const CraftingEditor = lazy(() => SimpleCollection().then((m) => ({ default: m.CraftingEditor })));
const FoodEditor = lazy(() => SimpleCollection().then((m) => ({ default: m.FoodEditor })));
const MaterialsEditor = lazy(() => SimpleCollection().then((m) => ({ default: m.MaterialsEditor })));

export const REACT_BUILDERS: Partial<Record<PanelId, LazyExoticComponent<ComponentType>>> = {
  effects: EffectEditor,
  statuses: StatusEditor,
  passives: PassiveEditor,
  skills: SkillEditor,
  jobs: JobEditor,
  personas: PersonaEditor,
  items: ItemEditor,
  food: FoodEditor,
  materials: MaterialsEditor,
  crafting: CraftingEditor,
  characters: CharEditor,
  monsters: MonsterEditor,
  encounters: EncounterEditor,
  campaign: CampaignEditor,
  browser: DataBrowser,
  audio: AudioLibrary
};

export function getReactBuilder(panel: PanelId): LazyExoticComponent<ComponentType> | undefined {
  return REACT_BUILDERS[panel];
}
