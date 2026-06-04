import type { CampaignStateSnapshot } from "../store";
import { dispatchHtmlIslandAction } from "../htmlIslandActions";

// Wrappers for tabs whose body comes from a sibling vanilla module
// (CampaignInventory / CampaignEconomy / PocketHaven / RelationshipsTab).
// Same hybrid migration pattern as the hub family — React owns the
// mount, vanilla produces the inner HTML, and this wrapper translates
// island-local data markers into typed dispatch calls. Per-tab JSX ports
// land later as the inner content of each module moves to TypeScript.

interface InventoryMod   { readonly render: () => string }
interface EconomyMod     { readonly renderRest: () => string; readonly renderShops: () => string }
interface HavenMod       {
  readonly renderCraft: () => string;
  readonly renderCook: () => string;
  readonly renderFarm: () => string;
}
interface RelationshipsMod { readonly render: (state: CampaignStateSnapshot) => string }
interface FarmingMod { readonly selectSeed?: (value: string) => void }

interface Cjs {
  readonly CampaignInventory?: InventoryMod;
  readonly CampaignEconomy?: EconomyMod;
  readonly PocketHaven?: HavenMod;
  readonly RelationshipsTab?: RelationshipsMod;
  readonly FarmingMode?: FarmingMod;
}

function cjs(): Cjs {
  return (window as unknown as { CJS?: Cjs }).CJS ?? {};
}

interface Props {
  readonly state: CampaignStateSnapshot;
}

function fallback(label: string) {
  return (
    <section className="campaign-panel">
      <div className="campaign-empty">{label}</div>
    </section>
  );
}

function safeWrap(
  label: string,
  fn: () => string,
  mountClass: string,
  onChange?: React.ChangeEventHandler<HTMLDivElement>
) {
  let html: string;
  try {
    html = fn();
  } catch (error) {
    console.error(`${label} failed:`, error);
    html = `<section class="campaign-panel"><div class="campaign-empty">${label} render failed.</div></section>`;
  }
  return (
    <div
      className={mountClass}
      onClick={(event) => {
        const result = dispatchHtmlIslandAction(event.target as HTMLElement | null);
        if (result.handled) event.preventDefault();
      }}
      onChange={onChange}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// The farm body renders a `<select data-farm-select="seed">` whose change was
// previously caught by the shell `<main>` onChange forwarder. With that
// forwarder gone, the Farm tab owns the only change-driven island marker:
// it routes the seed pick straight to the vanilla FarmingMode, exactly as the
// old forwarder did.
function onFarmSeedChange(event: React.ChangeEvent<HTMLDivElement>) {
  const select = (event.target as HTMLElement | null)?.closest?.(
    "[data-farm-select='seed']"
  ) as HTMLSelectElement | null;
  if (select) cjs().FarmingMode?.selectSeed?.(select.value);
}

export function CampaignInventoryTab(_props: Props) {
  const mod = cjs().CampaignInventory;
  if (!mod?.render) return fallback("Inventory UI not loaded.");
  return safeWrap("CampaignInventory.render", () => mod.render(), "campaign-inventory-react");
}

export function CampaignShopsTab(_props: Props) {
  const mod = cjs().CampaignEconomy;
  if (!mod?.renderRest || !mod?.renderShops) return fallback("Economy UI not loaded.");
  return safeWrap(
    "CampaignEconomy.shops",
    () => `${mod.renderRest()}${mod.renderShops()}`,
    "campaign-shops-react"
  );
}

export function CampaignCraftTab(_props: Props) {
  const mod = cjs().PocketHaven;
  if (!mod?.renderCraft) return fallback("Pocket Haven craft UI not loaded.");
  return safeWrap("PocketHaven.renderCraft", () => mod.renderCraft(), "campaign-craft-react");
}

export function CampaignCookTab(_props: Props) {
  const mod = cjs().PocketHaven;
  if (!mod?.renderCook) return fallback("Pocket Haven cook UI not loaded.");
  return safeWrap("PocketHaven.renderCook", () => mod.renderCook(), "campaign-cook-react");
}

export function CampaignFarmTab(_props: Props) {
  const mod = cjs().PocketHaven;
  if (!mod?.renderFarm) return fallback("Pocket Haven farm UI not loaded.");
  return safeWrap("PocketHaven.renderFarm", () => mod.renderFarm(), "campaign-farm-react", onFarmSeedChange);
}

export function CampaignRelationshipsTab({ state }: Props) {
  const mod = cjs().RelationshipsTab;
  if (!mod?.render) return fallback("Relationships UI not loaded.");
  return safeWrap(
    "RelationshipsTab.render",
    () => mod.render(state),
    "campaign-relationships-react"
  );
}
