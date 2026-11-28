// All figures shown in the app are calculated here from the user's own entries.
import { EXPENSE_CATEGORIES } from './categories.js';
import { convert } from './currency.js';
import { MONTHS, WEEKDAYS, addDays, addMonths, daysIn, diffDays, weekday } from './dates.js';
import { extrasFor } from './ledger.js';

const sum = (list, pick) => list.reduce((total, x) => total + pick(x), 0);
export const between = (items, from, to) => items.filter((e) => e.date >= from && e.date <= to);
export const spent = (items) => sum(items, (e) => (e.kind === 0 ? e.cents : 0));
export const income = (items) => sum(items, (e) => (e.kind === 1 ? e.cents : 0));

// Entries dated in the future are not part of today's balance.
export function balance(items, opening, upTo) {
  const past = items.filter((e) => e.date <= upTo);
  return opening + income(past) - spent(past) + sum(past, (e) => e.cashback);
}

// What is held in each currency, and the total in `base` at the current rates.
// A currency without a rate is left out of the total and reported as missing.
export function totalFunds(items, opening, base, table, upTo) {
  const holdings = {};
  for (const currency of new Set([...Object.keys(opening), ...items.map((e) => e.currency)])) {
    const own = items.filter((e) => e.currency === currency);
    holdings[currency] = balance(own, opening[currency] ?? 0, upTo);
  }
  let total = 0;
  let missing = false;
  for (const [currency, cents] of Object.entries(holdings)) {
    const value = cents ? convert(cents, currency, base, table) : 0;
    if (value === null) missing = true;
    else total += value;
  }
  return { holdings, total, missing };
}

// Change since the end of last month at today's rates, so only your own money flows count.
export function monthChange(items, opening, base, table, now) {
  const lastMonth = addDays(`${now.slice(0, 7)}-01`, -1);
  const before = totalFunds(items, opening, base, table, lastMonth);
  const current = totalFunds(items, opening, base, table, now);
  if (before.missing || current.missing || before.total <= 0) return null;
  return ((current.total - before.total) / before.total) * 100;
}

export const goalSaved = (goal, items) => goal.base + extrasFor(items, goal.id);

export function savedInMonth(goals, items, month) {
  const ids = new Set(goals.map((g) => g.id));
  const extras = sum(items.filter((e) => e.month === month && ids.has(e.goal)), (e) => e.credit);
  return sum(goals, (g) => g.log[month] ?? 0) + extras;
}

export function byCategory(items) {
  const totals = EXPENSE_CATEGORIES.map((c, category) => ({ category, name: c.name, cents: 0 }));
  for (const e of items) if (e.kind === 0) totals[e.category].cents += e.cents;
  return totals.filter((t) => t.cents > 0).sort((a, b) => b.cents - a.cents);
}

export function periodRange(period, anchor) {
  if (period === 'week') {
    const from = addDays(anchor, -weekday(anchor));
    return { from, to: addDays(from, 6), previous: addDays(from, -7) };
  }
  if (period === 'year') {
    const year = Number(anchor.slice(0, 4));
    return { from: `${year}-01-01`, to: `${year}-12-31`, previous: `${year - 1}-01-01` };
  }
  const month = anchor.slice(0, 7);
  return { from: `${month}-01`, to: `${month}-${daysIn(month)}`, previous: `${addMonths(month, -1)}-01` };
}

export function periodLimit(period, anchor, monthly) {
  if (period === 'week') return Math.round((monthly * 7) / daysIn(anchor.slice(0, 7)));
  return period === 'year' ? monthly * 12 : monthly;
}

export function analytics(items, period, anchor, now) {
  const { from, to, previous } = periodRange(period, anchor);
  const end = to < now ? to : now;
  const elapsed = end >= from ? diffDays(from, end) + 1 : 0;
  const current = between(items, from, to);
  const toDate = spent(between(items, from, end));
  const before = elapsed
    ? spent(between(items, previous, [addDays(previous, elapsed - 1), addDays(from, -1)].sort()[0]))
    : 0;

  let bars;
  if (period === 'year') {
    bars = Array.from({ length: 12 }, (_, i) => ({
      label: MONTHS[i][0],
      cents: spent(current.filter((e) => Number(e.date.slice(5, 7)) === i + 1)),
    }));
  } else {
    // Week: that week's days. Month: totals for each day of the week.
    bars = WEEKDAYS.map((label, i) => ({
      label,
      weekend: i > 4,
      cents: spent(current.filter((e) => weekday(e.date) === i)),
    }));
  }

  return {
    total: spent(current),
    categories: byCategory(current),
    bars,
    average: elapsed ? Math.round(toDate / elapsed) : 0,
    change: before > 0 ? ((toDate - before) / before) * 100 : null,
  };
}

const firstDate = (items) => items.reduce((min, e) => (e.date < min ? e.date : min), '9999');

// Projects the rest of the month from the last 20 days of spending.
export function forecast(items, meta, now) {
  const past = items.filter((e) => e.date <= now);
  const expenses = past.filter((e) => e.kind === 0);
  if (!expenses.length) return null;
  const days = Math.min(20, diffDays(firstDate(expenses), now) + 1);
  if (days < 3) return null;
  const month = now.slice(0, 7);
  const left = daysIn(month) - Number(now.slice(8));
  const rate = spent(between(past, addDays(now, 1 - days), now)) / days;
  const thisMonth = past.filter((e) => e.month === month);
  const projected = Math.round(spent(thisMonth) + rate * left);

  let basis = meta.limit;
  let remaining;
  if (basis) remaining = basis - projected;
  else if (income(thisMonth)) remaining = (basis = income(thisMonth)) - projected;
  else {
    basis = meta.funds;
    remaining = Math.round(basis - rate * left);
  }
  return { days, projected, remaining, basis, share: basis > 0 ? Math.max(0, remaining) / basis : 0 };
}

// Average weekend-day spending against average weekday spending, over up to 8 weeks.
export function weekendPattern(items, now) {
  const expenses = items.filter((e) => e.kind === 0 && e.date <= now);
  if (!expenses.length) return null;
  const days = Math.min(56, diffDays(firstDate(expenses), now) + 1);
  if (days < 14) return null;
  const totals = [0, 0];
  const counts = [0, 0];
  for (let i = 0; i < days; i++) counts[weekday(addDays(now, -i)) > 4 ? 1 : 0]++;
  for (const e of between(expenses, addDays(now, 1 - days), now)) totals[weekday(e.date) > 4 ? 1 : 0] += e.cents;
  const [weekdays, weekends] = [totals[0] / counts[0], totals[1] / counts[1]];
  return weekdays > 0 ? Math.round((weekends / weekdays - 1) * 100) : null;
}

// A simple 0-100 score. Each deduction is listed so the app can explain it.
export function healthScore(items, meta, goals, now) {
  const past = items.filter((e) => e.date <= now);
  if (past.filter((e) => e.kind === 0).length < 5) return null;
  const penalties = [];
  const outlook = forecast(items, meta, now);
  if (meta.limit && outlook && outlook.projected > meta.limit) {
    const over = outlook.projected / meta.limit - 1;
    penalties.push({ points: Math.min(40, 10 + Math.round(over * 60)), reason: 'Forecast is above your monthly limit' });
  }
  const last30 = between(past, addDays(now, -29), now);
  if (income(last30) && spent(last30) > income(last30)) {
    penalties.push({ points: 30, reason: 'Spending exceeded income over 30 days' });
  }
  if (savedInMonth(goals, items, now.slice(0, 7)) <= 0) {
    penalties.push({ points: 12, reason: 'No savings this month' });
  }
  if ((weekendPattern(items, now) ?? 0) > 40) {
    penalties.push({ points: 8, reason: 'Weekend spending is much higher' });
  }
  const value = Math.max(0, 100 - sum(penalties, (p) => p.points));
  const label = value >= 75 ? 'Stable' : value >= 50 ? 'Needs attention' : 'At risk';
  return { value, label, penalties };
}

// What the AI receives: category sums only. No titles, goal names or entry IDs.
export function snapshot(items, meta, goals, now) {
  const month = now.slice(0, 7);
  const clamp = (n) => Math.max(0, Math.round(n));
  const months = Array.from({ length: 6 }, (_, i) => addMonths(month, -i)).map((m) => {
    const list = items.filter((e) => e.month === m && e.date <= now);
    const expenses = EXPENSE_CATEGORIES.map(() => 0);
    for (const e of list) if (e.kind === 0) expenses[e.category] += e.cents;
    return { month: m, income: income(list), expenses };
  });
  return {
    currency: meta.currency,
    today: now,
    balance: Math.round(meta.funds),
    limit: meta.limit,
    saved: clamp(sum(goals, (g) => goalSaved(g, items))),
    target: clamp(sum(goals, (g) => g.target)),
    months,
  };
}
