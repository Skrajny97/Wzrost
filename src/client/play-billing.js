// Google Play Billing in the app from the Sklep Play (867 A: the Punkty
// Systemu are bought only there; src/server/google-play.js). The app is a
// Trusted Web Activity whose page has the Digital Goods API (prices and
// unfinished purchases) and the Payment Request API with Google Play's
// method (the purchase itself); a browser has neither, so the purchase is
// not offered there. The server credits a purchase only after Google's
// word on its token and then consumes it (screens/shop-points.js).

export const PLAY_METHOD = 'https://play.google.com/billing';

// The Digital Goods service, or null outside the app (asked once). Asking
// for it throws where it is not there, so a throw is a null too.
let service = null;
export function playBilling() {
  if (!service) {
    try {
      service = typeof window.getDigitalGoodsService === 'function' ? Promise.resolve(window.getDigitalGoodsService(PLAY_METHOD)).catch(() => null) : Promise.resolve(null);
    } catch {
      service = Promise.resolve(null);
    }
  }
  return service;
}

// Google's prices of the products, by product id: { currency, value }.
export async function playPrices(ids) {
  const goods = await playBilling();
  if (!goods) return new Map();
  const details = await goods.getDetails(ids).catch(() => []);
  return new Map(details.map((item) => [item.itemId, item.price]));
}

// The purchases not yet consumed (the app closed in the middle of one, or
// the server did not answer): [{ itemId, purchaseToken }].
export async function playPurchases() {
  const goods = await playBilling();
  if (!goods) return [];
  return goods.listPurchases().catch(() => []);
}

// Google Play's window for a product: its answer, whose details hold the
// purchase's token (details.purchaseToken; details.token is the old name);
// rejected with an AbortError when the player closes it.
export function buyInPlay(sku) {
  // A total the Payment Request API needs; Google's window shows its own.
  const total = { label: 'Total', amount: { currency: 'PLN', value: '0' } };
  const request = new PaymentRequest([{ supportedMethods: PLAY_METHOD, data: { sku } }], { total });
  return request.show();
}
