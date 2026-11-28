// Ledger logic over a key-value backend:
// { getKeys(), getItems(keys) -> {key: string}, setItem(key, string), removeItem(key) }
//
// Keys:  meta            settings
//        t_YYYY_MM_N     one month of entries, split into parts
//        g_<id>          one savings goal
// Entry: [id, day, cents, category, title, kind, minutes, roundUp, cashback, goalId,
//         currency, valueCurrency, value, credit]
//        kind: 0 expense, 1 income. minutes: time of day, or -1.
//        cents, roundUp, cashback: in `currency`. value: cents converted to `valueCurrency`
//        (the default currency when saved). credit: added to the goal, in its currency.
import {
  CURRENCIES, CURRENCY_INFO, EXPENSE_CATEGORIES, GOAL_ICONS, INCOME_CATEGORIES,
  MAX_CENTS, MAX_GOALS, MAX_TITLE,
} from './categories.js';
import { daysIn } from './dates.js';

export const MAX_VALUE = 4096;
export const MAX_KEYS = 1024;
const RESERVED_KEYS = 4; // meta, ai_model and spare room
const LOG_MONTHS = 24;
const BATCH = 100;
const PART_KEY = /^t_(\d{4})_(\d{2})_(\d+)$/;
const GOAL_KEY = /^g_[a-z0-9]{4,24}$/;

export const DEFAULT_META = {
  v: 3, currency: 'AZN', extra: ['USD', 'EUR'], opening: {}, limit: 0, limitCurrency: 'AZN',
  roundOn: false, cashOn: false, autoGoal: '',
};

export class LedgerError extends Error {}

export const isMonth = (m) => typeof m === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(m);
const isId = (id) => typeof id === 'string' && /^[a-z0-9]{4,24}$/.test(id);
const isAmount = (n, min = 0) => Number.isSafeInteger(n) && n >= min && n <= MAX_CENTS;
const isSum = (n) => Number.isSafeInteger(n) && n >= 0;
const isCurrency = (c) => CURRENCIES.includes(c);
const isText = (s, max) => typeof s === 'string' && s.length <= max;

// "12.5", "12,50", "1,200.50" or "1 200" -> cents. Returns null if invalid. No floating-point rounding.
// A comma followed by exactly three digits separates thousands; otherwise it is a decimal comma.
export function parseAmount(text, { allowZero = false } = {}) {
  let plain = String(text).replace(/\s/g, '');
  if (/^[1-9]\d{0,2}(,\d{3})+(\.\d{1,2})?$/.test(plain)) plain = plain.replaceAll(',', '');
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(plain);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return isAmount(cents, allowZero ? 0 : 1) ? cents : null;
}

export function roundUpFor(cents, currency) {
  const step = CURRENCY_INFO[currency].roundStep;
  return (step - (cents % step)) % step;
}

export function isEntry(entry, month) {
  if (!Array.isArray(entry) || entry.length !== 14) return false;
  const [id, day, cents, category, title, kind, minutes, roundUp, cashback, goal,
    currency, valueCurrency, value, credit] = entry;
  const list = kind === 0 ? EXPENSE_CATEGORIES : kind === 1 ? INCOME_CATEGORIES : null;
  const extras = roundUp !== 0 || cashback !== 0;
  return (
    isId(id) &&
    Number.isInteger(day) && day >= 1 && day <= daysIn(month) &&
    isAmount(cents, 1) &&
    list !== null && Number.isInteger(category) && category >= 0 && category < list.length &&
    isText(title, MAX_TITLE) &&
    Number.isInteger(minutes) && minutes >= -1 && minutes < 1440 &&
    isAmount(roundUp) && isAmount(cashback) &&
    (extras ? kind === 0 && isId(goal) : goal === '' && credit === 0) &&
    isCurrency(currency) && isCurrency(valueCurrency) && isSum(value) && isSum(credit) &&
    (currency !== valueCurrency || value === cents)
  );
}

export function isMeta(m) {
  return (
    m?.v === 3 && isCurrency(m.currency) && isAmount(m.limit) && isCurrency(m.limitCurrency) &&
    Array.isArray(m.extra) && m.extra.every((c) => isCurrency(c) && c !== m.currency) &&
    new Set(m.extra).size === m.extra.length &&
    m.opening && typeof m.opening === 'object' && !Array.isArray(m.opening) &&
    Object.entries(m.opening).every(([c, n]) => isCurrency(c) && isAmount(n)) &&
    typeof m.roundOn === 'boolean' && typeof m.cashOn === 'boolean' &&
    (m.autoGoal === '' || isId(m.autoGoal))
  );
}

export function isGoal(g) {
  return Boolean(
    g && isId(g.id) && isText(g.title, MAX_TITLE) && g.title.trim() && isText(g.subtitle, MAX_TITLE) &&
    GOAL_ICONS.includes(g.icon) && isCurrency(g.currency) && isAmount(g.target, 1) &&
    // base can be negative when round-ups have been withdrawn.
    Number.isSafeInteger(g.base) && Math.abs(g.base) <= MAX_CENTS * 100 &&
    isAmount(g.quick) && typeof g.locked === 'boolean' && isAmount(g.auto) &&
    (g.autoMonth === '' || isMonth(g.autoMonth)) &&
    g.log && typeof g.log === 'object' &&
    Object.entries(g.log).length <= LOG_MONTHS &&
    Object.entries(g.log).every(([month, n]) => isMonth(month) && Number.isSafeInteger(n)),
  );
}

export function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
}

export function toItem(month, e) {
  const [id, day, cents, category, title, kind, minutes, roundUp, cashback, goal,
    currency, valueCurrency, value, credit] = e;
  const date = `${month}-${String(day).padStart(2, '0')}`;
  return {
    id, month, date, cents, category, title, kind, minutes, roundUp, cashback, goal,
    currency, valueCurrency, value, credit,
  };
}

// Money added to a goal by round-ups and cashback.
export const extrasFor = (items, goalId) =>
  items.reduce((sum, e) => (e.goal === goalId ? sum + e.credit : sum), 0);

const prefix = (month) => `t_${month.replace('-', '_')}_`;
const partIndex = (key) => Number(PART_KEY.exec(key)[3]);

function monthsOf(keys) {
  const months = keys.map((k) => PART_KEY.exec(k)).filter(Boolean).map((m) => `${m[1]}-${m[2]}`);
  return [...new Set(months)].filter(isMonth).sort();
}

// Splits entries into values that fit the per-item limit.
function pack(entries) {
  const parts = [];
  let current = [];
  for (const entry of entries) {
    if (current.length && JSON.stringify([...current, entry]).length > MAX_VALUE) {
      parts.push(current);
      current = [];
    }
    current.push(entry);
  }
  if (current.length) parts.push(current);
  return parts;
}

function trimLog(log) {
  return Object.fromEntries(Object.entries(log).sort().slice(-LOG_MONTHS));
}

export function createLedger(backend) {
  // Writes run one at a time, so two taps cannot overwrite each other.
  let queue = Promise.resolve();
  const serial = (task) => {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  };

  async function getMany(keys) {
    const values = {};
    for (let i = 0; i < keys.length; i += BATCH) {
      Object.assign(values, await backend.getItems(keys.slice(i, i + BATCH)));
    }
    return values;
  }

  // Unreadable data throws, so it is never silently overwritten.
  function decode(raw, check) {
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      value = undefined;
    }
    if (value === undefined || !check(value)) {
      throw new LedgerError('Saved data is damaged. Nothing was changed.');
    }
    return value;
  }

  const entriesCheck = (month) => (list) => Array.isArray(list) && list.every((e) => isEntry(e, month));

  async function readParts(month, keys) {
    if (!isMonth(month)) throw new LedgerError('Invalid month.');
    const names = (keys ?? (await backend.getKeys()))
      .filter((k) => PART_KEY.test(k) && k.startsWith(prefix(month)))
      .sort((a, b) => partIndex(a) - partIndex(b));
    const values = await getMany(names);
    return names.map((key) => ({ key, index: partIndex(key), entries: decode(values[key], entriesCheck(month)) }));
  }

  async function readMeta(keys) {
    if (!(keys ?? (await backend.getKeys())).includes('meta')) return { ...DEFAULT_META };
    const { meta } = await backend.getItems(['meta']);
    return decode(meta, isMeta);
  }

  async function readGoal(id) {
    const key = `g_${id}`;
    const values = await backend.getItems([key]);
    if (!values[key]) throw new LedgerError('Goal not found.');
    return decode(values[key], (g) => isGoal(g) && g.id === id);
  }

  const writeMeta = (meta) => backend.setItem('meta', JSON.stringify(meta));
  const writeGoal = (goal) => {
    if (!isGoal(goal)) throw new LedgerError('Check the goal details.');
    return backend.setItem(`g_${goal.id}`, JSON.stringify(goal));
  };

  function assertRoom(keys, extra = 1) {
    if (keys.length + extra > MAX_KEYS - RESERVED_KEYS) throw new LedgerError('Storage is full.');
  }

  async function loadAll() {
    const keys = await backend.getKeys();
    const partKeys = keys.filter((k) => PART_KEY.test(k) && isMonth(monthsOf([k])[0]));
    const goalKeys = keys.filter((k) => GOAL_KEY.test(k));
    const values = await getMany([...partKeys, ...goalKeys]);
    const items = partKeys.flatMap((key) => {
      const month = monthsOf([key])[0];
      return decode(values[key], entriesCheck(month)).map((e) => toItem(month, e));
    });
    items.sort((a, b) => b.date.localeCompare(a.date) || b.minutes - a.minutes);
    const goals = goalKeys.map((key) => decode(values[key], (g) => isGoal(g) && key === `g_${g.id}`));
    goals.sort((a, b) => a.id.localeCompare(b.id));
    return { meta: await readMeta(keys), items, goals };
  }

  const updateMeta = (patch) =>
    serial(async () => {
      const keys = await backend.getKeys();
      const current = await readMeta(keys);
      // Changing currencies rewrites no amounts: each one is stored with its own currency.
      const next = { ...current, ...patch, v: 3 };
      if (!isMeta(next)) throw new LedgerError('Check the settings values.');
      await writeMeta(next);
    });

  const add = (month, entry) =>
    serial(async () => {
      if (!isMonth(month) || !isEntry(entry, month)) throw new LedgerError('Check the entry.');
      const keys = await backend.getKeys();
      if (!keys.includes('meta')) await writeMeta({ ...DEFAULT_META });
      const parts = await readParts(month, keys);
      // Checked inside the queue, so a repeated save of one entry is stored once.
      if (parts.some((p) => p.entries.some((saved) => saved[0] === entry[0]))) return;
      const last = parts.at(-1);
      if (last && JSON.stringify([...last.entries, entry]).length <= MAX_VALUE) {
        await backend.setItem(last.key, JSON.stringify([...last.entries, entry]));
        return;
      }
      assertRoom(keys);
      await backend.setItem(`${prefix(month)}${last ? last.index + 1 : 0}`, JSON.stringify([entry]));
    });

  const remove = (month, id) =>
    serial(async () => {
      for (const part of await readParts(month)) {
        const rest = part.entries.filter((e) => e[0] !== id);
        if (rest.length === part.entries.length) continue;
        if (rest.length) await backend.setItem(part.key, JSON.stringify(rest));
        else await backend.removeItem(part.key);
      }
    });

  const createGoal = (goal) =>
    serial(async () => {
      const keys = await backend.getKeys();
      if (keys.includes(`g_${goal.id}`)) return;
      if (keys.filter((k) => GOAL_KEY.test(k)).length >= MAX_GOALS) {
        throw new LedgerError(`You can have up to ${MAX_GOALS} goals.`);
      }
      assertRoom(keys);
      if (!keys.includes('meta')) await writeMeta({ ...DEFAULT_META });
      await writeGoal(goal);
    });

  // Only descriptive fields can be edited here; amounts change through contribute().
  const editGoal = (id, { title, subtitle, icon, target, quick, locked, auto }, month) =>
    serial(async () => {
      const goal = await readGoal(id);
      // A newly enabled auto-deposit starts next month.
      const autoMonth = auto && !goal.auto ? month : goal.autoMonth;
      await writeGoal({ ...goal, title, subtitle, icon, target, quick, locked, auto, autoMonth });
    });

  const deleteGoal = (id) =>
    serial(async () => {
      await backend.removeItem(`g_${id}`);
      const meta = await readMeta();
      if (meta.autoGoal === id) await writeMeta({ ...meta, autoGoal: '', roundOn: false, cashOn: false });
    });

  // A positive delta adds to a goal, a negative one withdraws. `extras` is the
  // goal's current round-up and cashback total.
  const contribute = (id, delta, month, extras = 0) =>
    serial(async () => {
      const goal = await readGoal(id);
      if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > MAX_CENTS) {
        throw new LedgerError('Enter an amount.');
      }
      if (goal.base + extras + delta < 0) throw new LedgerError('The goal does not have enough money.');
      const log = trimLog({ ...goal.log, [month]: (goal.log[month] ?? 0) + delta });
      await writeGoal({ ...goal, base: goal.base + delta, log });
    });

  // Records this month's auto-deposit once. Amount and marker are saved together.
  const applyAuto = (month) =>
    serial(async () => {
      const keys = (await backend.getKeys()).filter((k) => GOAL_KEY.test(k));
      let applied = 0;
      for (const key of keys) {
        const goal = await readGoal(key.slice(2));
        if (!goal.auto || goal.autoMonth >= month) continue;
        const log = trimLog({ ...goal.log, [month]: (goal.log[month] ?? 0) + goal.auto });
        await writeGoal({ ...goal, base: goal.base + goal.auto, autoMonth: month, log });
        applied++;
      }
      return applied;
    });

  async function exportData() {
    const keys = await backend.getKeys();
    const months = {};
    for (const month of monthsOf(keys)) {
      months[month] = (await readParts(month, keys)).flatMap((p) => p.entries);
    }
    const { meta, goals } = await loadAll();
    return { app: 'mft', v: 3, meta, goals, months };
  }

  // Import only adds missing entries and goals. It never deletes or replaces them.
  // Settings are taken from the backup only when the ledger is empty.
  // Returns { count, apply() } so the user can confirm before anything is written.
  async function planImport(text) {
    const invalid = new LedgerError('This is not a valid MFT backup.');
    if (typeof text !== 'string' || text.length > 5_000_000) throw invalid;
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw invalid;
    }
    if (data?.app !== 'mft' || data.v !== 3 || !isMeta(data.meta)) throw invalid;
    if (!Array.isArray(data.goals) || data.goals.length > MAX_GOALS || !data.goals.every(isGoal)) throw invalid;
    if (!data.months || typeof data.months !== 'object') throw invalid;
    for (const [month, entries] of Object.entries(data.months)) {
      if (!isMonth(month) || !entriesCheck(month)(entries)) throw invalid;
    }

    async function build() {
      const keys = await backend.getKeys();
      await readMeta(keys); // Stops if the current settings are damaged.
      const empty = !monthsOf(keys).length && !keys.some((k) => GOAL_KEY.test(k));
      const writes = [];
      let count = 0;
      for (const [month, incoming] of Object.entries(data.months)) {
        const parts = await readParts(month, keys);
        const seen = new Set(parts.flatMap((p) => p.entries.map((e) => e[0])));
        const missing = incoming.filter((e) => !seen.has(e[0]) && seen.add(e[0]));
        count += missing.length;
        // Existing parts stay as they are; missing entries go into new parts.
        let index = parts.length ? parts.at(-1).index + 1 : 0;
        for (const chunk of pack(missing)) writes.push([`${prefix(month)}${index++}`, JSON.stringify(chunk)]);
      }
      const seenGoals = new Set(keys.filter((k) => GOAL_KEY.test(k)));
      const goals = data.goals.filter((g) => !seenGoals.has(`g_${g.id}`) && seenGoals.add(`g_${g.id}`));
      if (seenGoals.size > MAX_GOALS) throw new LedgerError(`You can have up to ${MAX_GOALS} goals.`);
      for (const goal of goals) writes.push([`g_${goal.id}`, JSON.stringify(goal)]);
      count += goals.length;
      assertRoom(keys, writes.length);
      if (empty && (count || !keys.includes('meta'))) writes.unshift(['meta', JSON.stringify(data.meta)]);
      return { writes, count };
    }

    const { count } = await build();
    return {
      count,
      apply: () =>
        serial(async () => {
          const plan = await build();
          if (!plan.count) return 0;
          for (const [key, value] of plan.writes) await backend.setItem(key, value);
          return plan.count;
        }),
    };
  }

  return {
    loadAll, updateMeta, add, remove, createGoal, editGoal, deleteGoal, contribute, applyAuto,
    exportData, planImport,
  };
}
