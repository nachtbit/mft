import { useRef, useState } from 'react';
import { CURRENCY_INFO, EXPENSE_CATEGORIES, INCOME_CATEGORIES, MAX_TITLE } from '../lib/categories.js';
import { loadRates } from '../lib/client/rates.js';
import { convert, enabledCurrencies } from '../lib/currency.js';
import { nowMinutes, today } from '../lib/dates.js';
import { newId, parseAmount } from '../lib/ledger.js';
import { CurrencyChips, Icon, Sheet, useAction } from './ui.js';

export default function EntrySheet({ kind, meta, ledger, reload, onClose }) {
  const categories = kind ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(0);
  const [currency, setCurrency] = useState(meta.currency);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const { busy, error, setError, run } = useAction();
  // A retry after a failed save reuses the ID, so the entry is not stored twice.
  const pendingId = useRef(null);

  const cents = parseAmount(amount);

  const edit = (set) => (value) => {
    pendingId.current = null;
    setError('');
    set(value);
  };

  async function submit(event) {
    event.preventDefault();
    if (!cents) return setError('Enter an amount above zero, with up to 2 decimals.');
    if (!date) return setError('Choose a date.');
    const id = (pendingId.current ??= newId());
    const ok = await run(async () => {
      // Rates are needed only for another currency; otherwise saving works offline.
      const rates = currency === meta.currency ? null : await loadRates(meta.currency);
      const value = convert(cents, currency, meta.currency, rates);
      if (value === null) throw new Error('No exchange rate for this currency.');
      await ledger.add(date.slice(0, 7), [
        id, Number(date.slice(8)), cents, category, title.trim(), kind,
        date === today() ? nowMinutes() : -1, 0, 0, '', currency, meta.currency, value, 0,
      ]);
      await reload();
    });
    if (ok) onClose();
  }

  return (
    <Sheet title={kind ? 'New income' : 'New expense'} onClose={onClose}>
      <form onSubmit={submit}>
        <label>
          Amount, {CURRENCY_INFO[currency].symbol}
          <input className="amount-input" inputMode="decimal" autoFocus autoComplete="off" placeholder="0"
            value={amount} onChange={(e) => edit(setAmount)(e.target.value)} disabled={busy} />
        </label>
        <CurrencyChips options={enabledCurrencies(meta)} value={currency} disabled={busy} onChange={edit(setCurrency)} />
        <div className="chips" role="group" aria-label="Category">
          {categories.map((c, i) => (
            <button type="button" className="chip" key={c.name} aria-pressed={category === i} disabled={busy}
              onClick={() => edit(setCategory)(i)}>
              <Icon name={c.icon} size={18} />{c.name}
            </button>
          ))}
        </div>
        <button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        {error && <p role="alert">{error}</p>}
        <label>
          Title
          <input maxLength={MAX_TITLE} value={title}
            onChange={(e) => edit(setTitle)(e.target.value)} disabled={busy} />
        </label>
        <label>
          Date
          <input type="date" min="2000-01-01" max="2099-12-31" value={date}
            onChange={(e) => edit(setDate)(e.target.value)} disabled={busy} />
        </label>
      </form>
    </Sheet>
  );
}
