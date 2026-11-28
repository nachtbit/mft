import { useState } from 'react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../lib/categories.js';
import { confirmAction } from '../lib/client/telegram.js';
import { MONTHS, addMonths, shortDate, today, whenLabel } from '../lib/dates.js';
import { money } from '../lib/format.js';
import { Icon, Sheet, useAction } from './ui.js';

const categoryOf = (item) => (item.kind ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)[item.category];
// Shown in the currency the entry was made in.
const signed = (item) => `${item.kind ? '+' : '−'}${money(item.amount, item.currency)}`;

export function OperationList({ items, onSelect }) {
  return (
    <ul className="card list">
      {items.map((item) => {
        const category = categoryOf(item);
        return (
          <li key={item.id}>
            <button className="operation" onClick={() => onSelect(item)}>
              <span className="circle"><Icon name={category.icon} /></span>
              <span className="grow">
                <strong>{item.title || (item.kind ? 'Income' : category.name)}</strong>
                <small>{category.name} • {whenLabel(item.date, item.minutes)}</small>
              </span>
              <span className="amount-text">{signed(item)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function OperationSheet({ item, ledger, reload, onClose }) {
  const { busy, error, run } = useAction();

  async function remove() {
    if (!(await confirmAction(`Delete the entry ${signed(item)}?`))) return;
    const ok = await run(async () => {
      await ledger.remove(item.month, item.id);
      await reload();
    });
    if (ok) onClose();
  }

  return (
    <Sheet title={item.title || categoryOf(item).name} onClose={onClose}>
      <p className="big">{signed(item)}</p>
      <p className="muted">{categoryOf(item).name} • {shortDate(item.date)} {item.date.slice(0, 4)}</p>
      {error && <p role="alert">{error}</p>}
      <button className="button danger" onClick={remove} disabled={busy}>
        <Icon name="delete" size={20} />Delete
      </button>
    </Sheet>
  );
}

export function AllOperations({ items, onSelect, onClose }) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const list = items.filter((e) => e.month === month);
  return (
    <Sheet title="All entries" onClose={onClose}>
      <div className="month-nav">
        <button className="round" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
          <Icon name="chevron_left" />
        </button>
        <strong>{MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)}</strong>
        <button className="round" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
          <Icon name="chevron_right" />
        </button>
      </div>
      {list.length ? <OperationList items={list} onSelect={onSelect} /> : <p className="muted center">No entries for this month.</p>}
    </Sheet>
  );
}
