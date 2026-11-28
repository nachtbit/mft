// Turns stored data (mixed currencies) into figures in the default currency for display.
// Stored data is never changed here.
import { convert } from './currency.js';
import { totalFunds } from './stats.js';

export function view(data, table, now) {
  const base = data.meta.currency;
  let missing = false;
  const toBase = (cents, from) => {
    const value = convert(cents, from, base, table);
    if (value === null) missing = true;
    return value ?? 0;
  };
  const goalCurrency = new Map(data.goals.map((g) => [g.id, g.currency]));

  // History keeps the value saved with each entry, so past reports do not move with rates.
  const entryValue = (e) => {
    if (e.currency === base) return e.cents;
    if (e.valueCurrency === base) return e.value;
    return convert(e.value, e.valueCurrency, base, table) ?? toBase(e.cents, e.currency);
  };

  const items = data.items.map((e) => {
    const cents = entryValue(e);
    const part = (n) => Math.round((cents * n) / e.cents);
    return {
      ...e,
      amount: e.cents,
      cents,
      roundUpBase: part(e.roundUp),
      cashbackBase: part(e.cashback),
      credit: goalCurrency.has(e.goal) ? toBase(e.credit, goalCurrency.get(e.goal)) : 0,
    };
  });

  const goals = data.goals.map((g) => ({
    ...g,
    base: toBase(g.base, g.currency),
    target: toBase(g.target, g.currency),
    log: Object.fromEntries(Object.entries(g.log).map(([month, n]) => [month, toBase(n, g.currency)])),
  }));

  const funds = totalFunds(data.items, data.meta.opening, base, table, now);
  const limit = data.meta.limit ? toBase(data.meta.limit, data.meta.limitCurrency) : 0;
  return {
    meta: { ...data.meta, limit, funds: funds.total },
    items,
    goals,
    holdings: funds.holdings,
    missing: missing || funds.missing,
  };
}
