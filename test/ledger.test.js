import assert from 'node:assert/strict';
import test from 'node:test';
import { balance } from '../lib/stats.js';
import { createLedger, extrasFor, MAX_VALUE, parseAmount } from '../lib/ledger.js';

function memory() {
  const data = new Map();
  return {
    data,
    getKeys: async () => [...data.keys()],
    getItems: async (keys) => {
      assert.ok(keys.length <= 100, 'too many keys in one read');
      return Object.fromEntries(keys.map((k) => [k, data.get(k) ?? '']));
    },
    setItem: async (k, v) => {
      assert.ok(v.length <= MAX_VALUE, 'value exceeds the CloudStorage limit');
      data.set(k, v);
    },
    removeItem: async (k) => void data.delete(k),
  };
}
const entry = (i, title = 'x'.repeat(40)) =>
  [`id${String(i).padStart(4, '0')}`, 1 + (i % 28), 100 + i, i % 11, title, 0, 600, 0, 0, '', 'AZN', 'AZN', 100 + i, 0];
const goal = (extra = {}) => ({
  id: 'goal0001', title: 'Holiday', subtitle: '', icon: 'flight', currency: 'AZN', target: 12_000_000, base: 0,
  quick: 100_000, locked: false, auto: 0, autoMonth: '', log: {}, ...extra,
});

test('amounts are exact', () => {
  assert.equal(parseAmount('1 200,5'), 120050);
  assert.equal(parseAmount('1,234'), 123400);
  assert.equal(parseAmount('348,200.50'), 34820050);
  assert.equal(parseAmount('12,50'), 1250);
  assert.equal(parseAmount('0,29'), 29);
  assert.equal(parseAmount('0', { allowZero: true }), 0);
  for (const bad of ['', '0', '-1', '1.234', '1e3', 'abc', '1,00.00', '0,123', '12,3456', '1.234,50']) assert.equal(parseAmount(bad), null, bad);
});

test('concurrent adds split into parts without losing entries', async () => {
  const store = memory();
  const ledger = createLedger(store);
  await Promise.all(Array.from({ length: 200 }, (_, i) => ledger.add('2026-11', entry(i))));
  assert.equal((await ledger.loadAll()).items.length, 200);
  assert.ok(store.data.size > 2);
  await ledger.remove('2026-11', 'id0005');
  assert.equal((await ledger.loadAll()).items.length, 199);
  await ledger.updateMeta({ limit: 500 });
});

test('saving the same entry twice at once stores it once', async () => {
  const ledger = createLedger(memory());
  await Promise.all([ledger.add('2026-11', entry(1)), ledger.add('2026-11', entry(1))]);
  assert.equal((await ledger.loadAll()).items.length, 1);
});

test('damaged data is never overwritten', async () => {
  const store = memory();
  store.data.set('t_2026_11_0', 'broken');
  const ledger = createLedger(store);
  await assert.rejects(ledger.loadAll(), /damaged/);
  await assert.rejects(ledger.add('2026-11', entry(1)), /damaged/);
  assert.equal(store.data.get('t_2026_11_0'), 'broken');
});

test('goals: deposits and withdrawals never go below zero', async () => {
  const ledger = createLedger(memory());
  await ledger.createGoal(goal());
  await ledger.add('2026-11', ['abcd', 1, 245_000, 0, '', 0, -1, 5000, 1000, 'goal0001', 'AZN', 'AZN', 245_000, 6000]);
  const { items } = await ledger.loadAll();
  assert.equal(extrasFor(items, 'goal0001'), 6000);
  await ledger.contribute('goal0001', 1000, '2026-11', 6000);
  await assert.rejects(ledger.contribute('goal0001', -7001, '2026-11', 6000), /enough money/);
  await ledger.contribute('goal0001', -7000, '2026-11', 6000);
  const [saved] = (await ledger.loadAll()).goals;
  assert.equal(saved.base + 6000, 0);
  assert.equal(saved.log['2026-11'], -6000);
});

test('data saved with the removed auto-saving features still loads with the same balances', async () => {
  const store = memory();
  store.data.set('meta', JSON.stringify({
    v: 3, currency: 'AZN', extra: ['USD'], opening: { AZN: 1000 }, limit: 0, limitCurrency: 'AZN',
    roundOn: true, cashOn: true, autoGoal: 'goal0001',
  }));
  store.data.set('g_goal0001', JSON.stringify(goal({ base: 500, auto: 200, autoMonth: '2026-10', log: { '2026-10': 200 } })));
  store.data.set('t_2026_11_0', JSON.stringify([['abcd', 1, 245, 0, '', 0, -1, 55, 10, 'goal0001', 'AZN', 'AZN', 245, 65]]));
  const ledger = createLedger(store);

  const { items, goals, meta } = await ledger.loadAll();
  assert.equal(goals[0].base + extrasFor(items, 'goal0001'), 565);
  assert.equal(balance(items, meta.opening.AZN, '2026-11-28'), 1000 - 245 + 10);

  // No further auto-deposit exists, and editing a goal clears the old setting.
  assert.equal(ledger.applyAuto, undefined);
  await ledger.editGoal('goal0001', { ...goals[0], title: 'Renamed' });
  const edited = (await ledger.loadAll()).goals[0];
  assert.deepEqual([edited.title, edited.base, edited.auto], ['Renamed', 500, 0]);

  // Old data can still be backed up, restored, and deleted.
  const copy = createLedger(memory());
  await (await copy.planImport(JSON.stringify(await ledger.exportData()))).apply();
  assert.deepEqual(await copy.loadAll(), await ledger.loadAll());
  await ledger.deleteGoal('goal0001');
  assert.equal((await ledger.loadAll()).items.length, 1);
});

test('new goals never get an auto-deposit', async () => {
  const ledger = createLedger(memory());
  await ledger.createGoal(goal({ auto: 500, autoMonth: '2026-11' }));
  const [created] = (await ledger.loadAll()).goals;
  assert.deepEqual([created.auto, created.autoMonth], [0, '']);
});

test('backup restores everything, and import only adds what is missing', async () => {
  const source = createLedger(memory());
  await source.updateMeta({ currency: 'EUR', extra: ['USD'], opening: { EUR: 5000, USD: 700 }, limit: 9000, limitCurrency: 'EUR' });
  await source.createGoal(goal());
  for (let i = 0; i < 120; i++) await source.add('2026-11', entry(i, '"\\'.repeat(20)));
  const backup = JSON.stringify(await source.exportData());

  const target = createLedger(memory());
  assert.equal(await (await target.planImport(backup)).apply(), 121);
  assert.deepEqual(await target.loadAll(), await source.loadAll());
  assert.equal((await target.planImport(backup)).count, 0);

  await target.remove('2026-11', 'id0003');
  await target.add('2026-11', entry(999));
  assert.equal(await (await target.planImport(backup)).apply(), 1);
  assert.equal((await target.loadAll()).items.length, 121);
});

test('currencies can be changed without rewriting stored amounts', async () => {
  const store = memory();
  const ledger = createLedger(store);
  await ledger.add('2026-11', entry(1));
  const before = store.data.get('t_2026_11_0');
  await ledger.updateMeta({ currency: 'USD', extra: ['AZN', 'TRY'] });
  assert.equal(store.data.get('t_2026_11_0'), before);
  assert.equal((await ledger.loadAll()).meta.currency, 'USD');
  for (const patch of [{ currency: 'RUB' }, { extra: ['KZT'] }, { currency: 'XXX' }, { extra: ['USD'] }, { extra: ['AZN', 'AZN'] }, { opening: { XXX: 1 } }, { opening: { AZN: -1 } }]) {
    await assert.rejects(ledger.updateMeta(patch), /settings values/);
  }
});

test('the name is kept through other changes and imports, and is limited', async () => {
  const ledger = createLedger(memory());
  await ledger.updateMeta({ name: 'Test Person' });
  await ledger.updateMeta({ limit: 100 });
  assert.equal((await ledger.loadAll()).meta.name, 'Test Person');
  await assert.rejects(ledger.updateMeta({ name: 'x'.repeat(61) }), /settings values/);

  // A backup made before names existed does not erase the name.
  const old = createLedger(memory());
  await old.add('2026-11', entry(1));
  await (await ledger.planImport(JSON.stringify(await old.exportData()))).apply();
  assert.equal((await ledger.loadAll()).meta.name, 'Test Person');
});

test('the theme accepts only light or dark', async () => {
  const ledger = createLedger(memory());
  await ledger.updateMeta({ theme: 'dark' });
  assert.equal((await ledger.loadAll()).meta.theme, 'dark');
  await assert.rejects(ledger.updateMeta({ theme: 'neon' }), /settings values/);
});

test('invalid backups write nothing', async () => {
  const store = memory();
  const ledger = createLedger(store);
  const meta = { v: 3, currency: 'AZN', extra: [], opening: {}, limit: 0, limitCurrency: 'AZN', roundOn: false, cashOn: false, autoGoal: '' };
  const make = (extra) => JSON.stringify({ app: 'mft', v: 3, meta, goals: [], months: { '2026-11': [entry(1)] }, ...extra });
  const bad = entry(1);
  bad[12] += 1; // same currency, so the value must equal the amount
  for (const text of ['x', '{}', 'null', make({ meta: { ...meta, currency: 'XXX' } }), make({ months: { __x: [] } }),
    make({ goals: [goal({ icon: 'unknown' })] }), make({ goals: [goal({ currency: 'XXX' })] }),
    make({ months: { '2026-11': [bad] } }), make({ months: { '2026-02': [['abcd', 30, ...entry(1).slice(2)]] } })]) {
    await assert.rejects(ledger.planImport(text));
  }
  assert.equal(store.data.size, 0);
});
