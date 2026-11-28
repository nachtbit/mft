// Conversion uses a rate table { rates } where rates[X] is the amount of X per unit of
// one common base, so any pair can be converted. Returns null if a rate is missing.
export function convert(cents, from, to, table) {
  if (from === to) return cents;
  const a = table?.rates?.[from];
  const b = table?.rates?.[to];
  return a > 0 && b > 0 ? Math.round((cents * b) / a) : null;
}

// The default currency first, then the additional ones chosen in settings.
export const enabledCurrencies = (meta) => [meta.currency, ...meta.extra];
