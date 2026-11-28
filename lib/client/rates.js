// Free daily rates. The provider requires attribution and forbids redistribution,
// so the browser asks it directly. Only a currency code is sent.
const TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map();

// Resolves to a rate table { rates } for lib/currency.js.
export function loadRates(base) {
  const cached = cache.get(base);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.request;
  const request = fetch(`https://open.er-api.com/v6/latest/${base}`, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(10_000),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.result !== 'success' || !data.rates) throw new Error('rates');
      return { rates: data.rates };
    })
    .catch(() => {
      cache.delete(base);
      throw new Error('Exchange rates are unavailable. Check your connection and try again.');
    });
  cache.set(base, { at: Date.now(), request });
  return request;
}
