import type { CampaignStateSnapshot } from "../store";
import { dispatchHtmlIslandAction } from "../htmlIslandActions";

// Wrapper for the Farm tab, whose body still comes from the sibling vanilla
// PocketHaven/FarmingMode modules (the stateful tile-grid port is the last
// external-island migration). Same hybrid pattern as the hub family — React
// owns the mount, vanilla produces the inner HTML, and this wrapper translates
// island-local data markers into typed dispatch calls. Inventory + Shops +
// Relationships + Craft/Cook are already ported to JSX.

interface HavenMod       {
  readonly renderFarm: () => string;
}
interface FarmingMod { readonly selectSeed?: (value: string) => void }

interface Cjs {
  readonly PocketHaven?: HavenMod;
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

export function CampaignFarmTab(_props: Props) {
  const mod = cjs().PocketHaven;
  if (!mod?.renderFarm) return fallback("Pocket Haven farm UI not loaded.");
  return safeWrap("PocketHaven.renderFarm", () => mod.renderFarm(), "campaign-farm-react", onFarmSeedChange);
}
