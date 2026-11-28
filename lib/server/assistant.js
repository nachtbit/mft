// Server only. Financial data must be numbers in a fixed shape. The only free text
// accepted is the chat itself, with strict size limits. The system prompt is fixed.
import { CURRENCIES, EXPENSE_CATEGORIES } from '../categories.js';
import { HttpError } from './http.js';

const MAX_TURNS = 8;
const MAX_QUESTION = 500;
const MAX_REPLY = 4000;
const LIMIT = Number.MAX_SAFE_INTEGER;

const isSum = (n, min = 0) => Number.isSafeInteger(n) && n >= min && n <= LIMIT;
const isMonth = (m) => typeof m === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(m);

export function parseSnapshot(data) {
  const valid =
    CURRENCIES.includes(data?.currency) &&
    typeof data.today === 'string' && /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(data.today) &&
    isSum(data.balance, -LIMIT) && isSum(data.limit) && isSum(data.saved) && isSum(data.target) &&
    Array.isArray(data.months) && data.months.length >= 1 && data.months.length <= 6 &&
    data.months.every(
      (m) =>
        isMonth(m?.month) && isSum(m.income) && Array.isArray(m.expenses) &&
        m.expenses.length === EXPENSE_CATEGORIES.length && m.expenses.every((n) => isSum(n)),
    );
  if (!valid) throw new HttpError(400, 'bad_data');
  return data;
}

export function parseTurns(turns) {
  const valid =
    Array.isArray(turns) && turns.length >= 1 && turns.length <= MAX_TURNS &&
    turns.at(-1)?.role === 'user' &&
    turns.every(
      (t) =>
        (t?.role === 'user' || t?.role === 'assistant') &&
        typeof t.content === 'string' && t.content.trim() &&
        t.content.length <= (t.role === 'user' ? MAX_QUESTION : MAX_REPLY),
    );
  if (!valid) throw new HttpError(400, 'bad_message');
  // Extra fields are dropped.
  return turns.map(({ role, content }) => ({ role, content }));
}

export function buildMessages(data, turns) {
  const amount = (cents) => (cents / 100).toFixed(2);
  const months = data.months.map((m) => {
    const parts = EXPENSE_CATEGORIES.map((c, i) => [c.name, m.expenses[i]])
      .filter(([, cents]) => cents > 0)
      .map(([name, cents]) => `${name} ${amount(cents)}`);
    return `${m.month}: income ${amount(m.income)}; expenses: ${parts.join(', ') || 'none recorded'}`;
  });
  const system = [
    'You are a personal budgeting assistant. Always reply in English, briefly (under 120 words), in plain text without Markdown.',
    'Rely only on the data below. If it is not enough, say so. Do not give investment advice.',
    `Today is ${data.today}. Currency: ${data.currency}. The current month may be incomplete.`,
    `Balance: ${amount(data.balance)}. Monthly spending limit: ${data.limit ? amount(data.limit) : 'not set'}.`,
    `Saved towards goals: ${amount(data.saved)} of ${amount(data.target)}.`,
    ...months,
  ].join('\n');
  return [{ role: 'system', content: system }, ...turns];
}
