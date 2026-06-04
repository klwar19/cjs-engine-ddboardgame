// CampaignShopsTab.tsx — JSX port of the vanilla `campaign-economy.js` island
// (`renderRest` + `renderShops`). Buttons dispatch via typed onClick
// (`full-rest` / `camp-rest` / `shop-buy` / `shop-sell`) instead of the old
// data-* island markers that `htmlIslandActions.ts` translated.

import type { CampaignStateSnapshot } from "../store";
import { dispatchCampaignAction } from "../actions";
import { getShopsData, type ShopCard, type ShopStockEntry } from "./data/shops";

interface Props {
  readonly state: CampaignStateSnapshot;
}

export function CampaignShopsTab({ state }: Props) {
  const data = getShopsData(state);
  return (
    <>
      <RestPanel hasRun={data.hasRun} />
      {data.shops.length ? (
        <div className="campaign-tab-grid">
          {data.shops.map((shop) => (
            <ShopPanel key={shop.id} shop={shop} />
          ))}
        </div>
      ) : (
        <section className="campaign-panel">
          <h3>Shops</h3>
          <div className="campaign-empty">
            No shop is open for this world and phase. Use GM Override for manual buys and sells.
          </div>
        </section>
      )}
    </>
  );
}

function RestPanel({ hasRun }: { hasRun: boolean }) {
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h3>Rest</h3>
      </div>
      <div className="campaign-action-grid">
        <button className="campaign-action" onClick={() => dispatchCampaignAction("full-rest")}>
          Full Rest
        </button>
        <button
          className="campaign-action"
          disabled={!hasRun}
          onClick={() => dispatchCampaignAction("camp-rest")}
        >
          Camp Rest
        </button>
      </div>
      <div className="campaign-muted">
        Camp rest consumes one scenario rest use, restores partial HP/MP, and can increase danger.
      </div>
    </section>
  );
}

function ShopPanel({ shop }: { shop: ShopCard }) {
  return (
    <section className="campaign-panel">
      <div className="campaign-panel-head">
        <h3>{shop.name}</h3>
        <span className="campaign-pill">{shop.currencyLabel}</span>
      </div>
      <div className="campaign-muted">{shop.description}</div>
      {shop.stock.length ? (
        shop.stock.map((item) => <ShopStockRow key={item.index} shopId={shop.id} item={item} />)
      ) : (
        <div className="campaign-empty">No stock yet.</div>
      )}
    </section>
  );
}

function ShopStockRow({ shopId, item }: { shopId: string; item: ShopStockEntry }) {
  return (
    <div className="campaign-row">
      <div>
        <strong>{item.name}</strong>
        <div className="campaign-muted">{item.subline}</div>
        {item.requiresText ? <div className="campaign-muted">{item.requiresText}</div> : null}
        {item.consumesText ? <div className="campaign-muted">{item.consumesText}</div> : null}
      </div>
      <div className="campaign-row-actions">
        <span className="campaign-pill">{item.priceLabel}</span>
        <button
          className="campaign-action"
          disabled={!item.canBuy}
          onClick={() =>
            dispatchCampaignAction("shop-buy", {
              shopId,
              stockIndex: item.index,
              id: item.id,
              type: item.type,
              price: item.buyPrice,
              currency: item.currency
            })
          }
        >
          Buy
        </button>
        {item.sellable ? (
          <button
            className="campaign-action"
            onClick={() =>
              dispatchCampaignAction("shop-sell", {
                id: item.id,
                type: item.type,
                price: item.sellPrice,
                currency: item.currency
              })
            }
          >
            Sell
          </button>
        ) : null}
      </div>
    </div>
  );
}
