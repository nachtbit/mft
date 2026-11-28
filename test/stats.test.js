import assert from 'node:assert/strict';
import test from 'node:test';
import { toItem } from '../lib/ledger.js';
import { money } from '../lib/format.js';
import { greeting } from '../lib/dates.js';
import { parseSnapshot } from '../lib/server/assistant.js';
import { convert } from '../lib/currency.js';
import { view } from '../lib/view.js';
import {
  analytics, balance, forecast, healthScore, monthChange, periodLimit, savedInMonth, snapshot,
  subscriptions, weekendPattern,
} from '../lib/stats.js';

let n = 0;
const item = (date, cents, { category = 0, kind = 0, title = '', cashback = 0, currency = 'AZN', value = cents, valueCurrency = currency } = {}) =>
  toItem(date.slice(0, 7), [`t${1000 + n++}`, Number(date.slice(8)), cents, category, title, kind, -1, 0, cashback, cashback ? 'goal0001' : '',
    currency, valueCurrency, value, cashback]);
const NOW = '2026-11-28';
const meta = { currency: 'AZN', funds: 1000, limit: 100_000 };
// 1 USD = 80 AZN, 1 EUR = 100 AZN.
const table = { rates: { AZN: 1, USD: 1 / 80, EUR: 1 / 100 } };

test('balance ignores future entries and includes cashback', () => {
  const items = [item('2026-10-01', 500, { kind: 1 }), item('2026-11-02', 300, { cashback: 10 }), item('2026-12-01', 999)];
  assert.equal(balance(items, 1000, NOW), 1210);
  assert.equal(Math.round(monthChange(items, { AZN: 1000 }, 'AZN', null, NOW)), -19);
  assert.equal(monthChange([], {}, 'AZN', null, NOW), null);
});

test('period totals, limits and weekday bars', () => {
  const items = [item('2026-11-23', 100), item('2026-11-28', 200, { category: 5 }), item('2026-11-01', 50), item('2026-10-05', 700)];
  const week = analytics(items, 'week', NOW, NOW);
  assert.equal(week.total, 300);
  assert.deepEqual(week.bars.map((b) => b.cents), [100, 0, 0, 0, 0, 200, 0]);
  const month = analytics(items, 'month', NOW, NOW);
  assert.equal(month.total, 350);
  assert.equal(month.categories[0].category, 5);
  assert.equal(Math.round(month.change), -50);
  assert.equal(analytics(items, 'year', NOW, NOW).total, 1050);
  assert.equal(periodLimit('week', NOW, 30_000), 7000);
  assert.equal(periodLimit('year', NOW, 30_000), 360_000);
});

test('forecast, weekend pattern, subscriptions and score', () => {
  assert.equal(forecast([], meta, NOW), null);
  const items = Array.from({ length: 28 }, (_, i) => item(`2026-11-${String(i + 1).padStart(2, '0')}`, 1000));
  const result = forecast(items, meta, NOW);
  assert.deepEqual([result.days, result.projected, result.remaining], [20, 30_000, 70_000]);
  assert.equal(weekendPattern(items, NOW), 0);
  const subs = subscriptions([...items, item('2026-11-20', 990, { category: 4, title: 'Apple One' })], NOW);
  assert.deepEqual([subs.total, subs.names], [990, ['Apple One']]);
  assert.equal(healthScore(items, meta, [], NOW).value, 88);
  assert.equal(healthScore(items.slice(0, 4), meta, [], NOW), null);
});

test('the AI snapshot holds no names and passes server validation', () => {
  const items = [item('2026-11-02', 300, { title: 'PRIVATE', cashback: 10 })];
  const goals = [{ id: 'goal0001', title: 'SECRET', base: 0, target: 100, log: {} }];
  const data = snapshot(items, { ...meta, name: 'Test Person' }, goals, NOW);
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE|SECRET|goal0001|t10|Test Person/);
  assert.equal(parseSnapshot(data), data);
  assert.equal(savedInMonth(goals, items, '2026-11'), 10);
});

test('money is formatted in English', () => {
  assert.equal(money(34_820_050, 'AZN').replace(/\u00a0/g, ' '), '348,200.50 ₼');
});

test('conversion uses cross rates and reports missing ones', () => {
  assert.equal(convert(100, 'USD', 'AZN', table), 8000);
  assert.equal(convert(8000, 'AZN', 'USD', table), 100);
  assert.equal(convert(500, 'USD', 'EUR', table), 400);
  assert.equal(convert(500, 'USD', 'USD', null), 500);
  assert.equal(convert(500, 'USD', 'TRY', table), null);
});

const stored = (items, extra = {}) => ({
  meta: { currency: 'AZN', extra: ['USD'], opening: { USD: 10_00 }, limit: 100_00, limitCurrency: 'USD', ...extra },
  items,
  goals: [{ id: 'goal0001', title: 'G', currency: 'USD', base: 100, target: 1000, log: { '2026-11': 100 } }],
});

test('wallets use current rates while history keeps the saved value', () => {
  // Saved when 1 USD was 70 AZN.
  const expense = item('2026-11-10', 200, { currency: 'USD', value: 14_000, valueCurrency: 'AZN' });
  const rub = item('2026-11-11', 500, { kind: 1 });
  const shown = view(stored([expense, rub]), table, NOW);
  assert.deepEqual(shown.holdings, { USD: 800, AZN: 500 });
  assert.equal(shown.meta.funds, 800 * 80 + 500);
  assert.equal(shown.items[0].cents, 14_000);
  assert.deepEqual([shown.items[0].amount, shown.items[0].currency], [200, 'USD']);
  assert.equal(shown.meta.limit, 8000_00);
  assert.equal(shown.goals[0].base, 8000);
  assert.equal(savedInMonth(shown.goals, shown.items, '2026-11'), 8000);
  assert.equal(shown.missing, false);
});

test('without rates, saved values still work and gaps are flagged', () => {
  const expense = item('2026-11-10', 200, { currency: 'USD', value: 14_000, valueCurrency: 'AZN' });
  const shown = view(stored([expense], { opening: { AZN: 100_000 }, limit: 0 }), null, NOW);
  assert.equal(shown.items[0].cents, 14_000);
  assert.equal(shown.meta.funds, 100_000);
  assert.equal(shown.missing, true);
});

test('the greeting follows the time of day', () => {
  assert.deepEqual([4, 5, 11, 12, 16, 17, 21, 22].map((h) => greeting(h).split(' ')[1]),
    ['night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night']);
});
