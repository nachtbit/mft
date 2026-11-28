import { enabledCurrencies } from '../lib/currency.js';
import { today } from '../lib/dates.js';
import { money, percent } from '../lib/format.js';
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
  // The money actually held in each currency. Shown once another currency is in use.
  const wallets = enabledCurrencies(raw.meta)
    .concat(Object.keys(data.holdings))
    .filter((c, i, all) => all.indexOf(c) === i && data.holdings[c]);
  const mixed = wallets.some((c) => c !== meta.currency);

  return (
    <>
      <section className="hero">
        <p className="label">Total funds</p>
        <p className="balance">{money(total, meta.currency)}</p>
        {change !== null && <p className="pill">{change >= 0 ? '+' : '−'}{percent(Math.abs(change))} this month</p>}
        {mixed && (
          <>
            <p className="wallets">
              {wallets.map((c) => <span key={c}>{money(data.holdings[c], c)}</span>)}
            </p>
            {/* The total converts these, and the rate provider requires this credit. */}
            <RatesCredit />
          </>
        )}
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
        ? <OperationList items={items.slice(0, 5)} onSelect={onSelect} />
        : <p className="card muted center">No entries yet.</p>}
    </>
  );
}
