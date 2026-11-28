import { CURRENCY_INFO } from '../lib/categories.js';
import { convert } from '../lib/currency.js';
import { today } from '../lib/dates.js';
import { money, number, percent } from '../lib/format.js';
import { income, monthChange, savedInMonth, spent } from '../lib/stats.js';
import { OperationList } from './Operations.js';
import { Icon, Progress, RatesCredit } from './ui.js';

export default function Home({ data, raw, table, onAdd, onDeposit, onAll, onSelect }) {
  const { meta, items, goals } = data;
  const now = today();
  const month = now.slice(0, 7);
  const total = meta.funds;
  const change = monthChange(raw.items, raw.meta.opening, meta.currency, table, now);
  const thisMonth = items.filter((e) => e.month === month && e.date <= now);
  const monthSpent = spent(thisMonth);
  const monthIncome = income(thisMonth);
  const saved = savedInMonth(goals, items, month);
  const converted = meta.extra
    .map((c) => [c, convert(total, meta.currency, c, table)])
    .filter(([, cents]) => cents !== null);
  // What is actually held, shown when more than the default currency is in use.
  const wallets = Object.entries(data.holdings).filter(([, cents]) => cents !== 0);
  const mixed = wallets.some(([c]) => c !== meta.currency);

  return (
    <>
      <section className="hero">
        <p className="label">Total funds</p>
        <p className="balance">{money(total, meta.currency)}</p>
        {change !== null && <p className="pill">{change >= 0 ? '+' : '−'}{percent(Math.abs(change))} this month</p>}
        {converted.length > 0 && (
          <p className="rates">
            ≈ {converted.map(([c, cents]) => `${CURRENCY_INFO[c].symbol}${number(Math.round(cents / 100) * 100)}`).join('  •  ')}
          </p>
        )}
        {mixed && <p className="muted small">In wallets: {wallets.map(([c, cents]) => money(cents, c)).join(' • ')}</p>}
        {(converted.length > 0 || mixed) && <RatesCredit />}
      </section>

      <div className="actions">
        <button className="action primary" onClick={() => onAdd(1)}><Icon name="add" size={20} />Income</button>
        <button className="action" onClick={() => onAdd(0)}><Icon name="remove" size={20} />Expense</button>
        <button className="action" onClick={onDeposit}><Icon name="savings" size={20} />To savings</button>
      </div>

      <section className="card split">
        <div>
          <p className="label">Spent</p>
          <p className="stat">{money(monthSpent, meta.currency)}</p>
          <Progress value={monthSpent / (meta.limit || monthIncome || Infinity)} />
        </div>
        <div>
          <p className="label">Saved</p>
          <p className="stat">{money(saved, meta.currency)}</p>
          <Progress value={saved / (monthIncome || Infinity)} tone="soft" />
        </div>
      </section>

      <div className="title-row">
        <h2>Recent activity</h2>
        <button className="text-button" onClick={onAll}>All</button>
      </div>
      {items.length
        ? <OperationList items={items.slice(0, 5)} currency={meta.currency} onSelect={onSelect} />
        : <p className="card muted center">No entries yet. Add income or an expense.</p>}
    </>
  );
}
