import { useRef, useState } from 'react';
import { CURRENCY_INFO, GOAL_ICONS, MAX_TITLE } from '../lib/categories.js';
import { loadRates } from '../lib/client/rates.js';
import { confirmAction } from '../lib/client/telegram.js';
import { convert, enabledCurrencies } from '../lib/currency.js';
import { today } from '../lib/dates.js';
import { money } from '../lib/format.js';
import { extrasFor, newId, parseAmount } from '../lib/ledger.js';
import { goalSaved } from '../lib/stats.js';
import { CurrencyChips, Icon, Sheet, useAction } from './ui.js';

const toInput = (cents) => (cents ? String(cents / 100) : '');

// Creates a goal, or edits one when `goal` is given.
export function GoalForm({ goal, meta, ledger, reload, onClose }) {
  const [form, setForm] = useState(() => ({
    title: goal?.title ?? '',
    subtitle: goal?.subtitle ?? '',
    icon: goal?.icon ?? GOAL_ICONS[0],
    target: toInput(goal?.target),
    start: '',
    quick: toInput(goal?.quick),
    locked: goal?.locked ?? false,
    currency: goal?.currency ?? meta.currency,
  }));
  const id = useRef(goal?.id ?? newId());
  const { busy, error, setError, run } = useAction();
  const set = (name) => (e) => {
    setError('');
    setForm({ ...form, [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  };

  async function submit(event) {
    event.preventDefault();
    const amount = (text) => (text.trim() ? parseAmount(text, { allowZero: true }) : 0);
    const [target, start, quick] = [form.target, form.start, form.quick].map(amount);
    if (!form.title.trim()) return setError('Enter a name.');
    if (!target || [start, quick].includes(null)) return setError('Check the amounts. The target must be above zero.');
    const fields = {
      title: form.title.trim(), subtitle: form.subtitle.trim(), icon: form.icon,
      target, quick, locked: form.locked,
    };
    const ok = await run(async () => {
      if (goal) await ledger.editGoal(goal.id, fields);
      else await ledger.createGoal({ ...fields, currency: form.currency, id: id.current, base: start, log: {} });
      await reload();
    });
    if (ok) onClose();
  }

  const symbol = CURRENCY_INFO[form.currency].symbol;
  return (
    <Sheet title={goal ? 'Edit goal' : 'New goal'} onClose={onClose}>
      <form onSubmit={submit}>
        <label>Name<input maxLength={MAX_TITLE} value={form.title} onChange={set('title')} /></label>
        <label>Description<input maxLength={MAX_TITLE} value={form.subtitle} onChange={set('subtitle')} /></label>
        <div className="chips" role="group" aria-label="Icon">
          {GOAL_ICONS.map((name) => (
            <button type="button" className="chip" key={name} aria-label={name} aria-pressed={form.icon === name}
              onClick={() => setForm({ ...form, icon: name })}>
              <Icon name={name} size={20} />
            </button>
          ))}
        </div>
        {!goal && (
          <>
            <p className="muted small">Goal currency</p>
            <CurrencyChips label="Goal currency" options={enabledCurrencies(meta)} value={form.currency}
              onChange={(currency) => setForm({ ...form, currency })} />
          </>
        )}
        <label>Target amount, {symbol}<input inputMode="decimal" value={form.target} onChange={set('target')} /></label>
        {!goal && <label>Already saved, {symbol}<input inputMode="decimal" value={form.start} onChange={set('start')} placeholder="0" /></label>}
        <label>Quick-add button amount, {symbol}<input inputMode="decimal" value={form.quick} onChange={set('quick')} /></label>
        <label className="check"><input type="checkbox" checked={form.locked} onChange={set('locked')} />Protected reserve</label>
        {error && <p role="alert">{error}</p>}
        <button className="button primary" disabled={busy}>Save</button>
      </form>
    </Sheet>
  );
}

// An amount typed in any enabled currency, converted into the goal's currency.
function useGoalAmount(meta, goal) {
  const options = enabledCurrencies(meta);
  const [amount, setAmount] = useState('');
  const [chosen, setChosen] = useState('');
  const fallback = goal && options.includes(goal.currency) ? goal.currency : meta.currency;
  const currency = chosen || fallback;
  const cents = parseAmount(amount);

  async function resolve() {
    if (!cents) throw new Error('Enter an amount above zero.');
    const rates = currency === goal.currency ? null : await loadRates(meta.currency);
    const value = convert(cents, currency, goal.currency, rates);
    if (!value) throw new Error('Could not convert the amount to the goal currency.');
    return value;
  }
  return { options, amount, setAmount, currency, setCurrency: setChosen, resolve };
}

function GoalAmount({ input, onEdit, autoFocus }) {
  return (
    <>
      <label>Amount, {CURRENCY_INFO[input.currency].symbol}
        <input className="amount-input" inputMode="decimal" autoFocus={autoFocus} value={input.amount} placeholder="0"
          onChange={(e) => { onEdit(); input.setAmount(e.target.value); }} />
      </label>
      <CurrencyChips options={input.options} value={input.currency}
        onChange={(c) => { onEdit(); input.setCurrency(c); }} />
    </>
  );
}

export function GoalSheet({ goal, meta, items, ledger, reload, onEdit, onClose }) {
  const input = useGoalAmount(meta, goal);
  const { busy, error, setError, run } = useAction();
  const saved = goalSaved(goal, items);

  async function change(direction) {
    if (direction < 0 && goal.locked &&
        !(await confirmAction('This is a protected reserve. Withdraw anyway?'))) return;
    const ok = await run(async () => {
      const value = await input.resolve();
      await ledger.contribute(goal.id, direction * value, today().slice(0, 7), extrasFor(items, goal.id));
      await reload();
    });
    if (ok) onClose();
  }

  async function remove() {
    if (!(await confirmAction(`Delete the goal “${goal.title}”? Your entries will stay.`))) return;
    const ok = await run(async () => {
      await ledger.deleteGoal(goal.id);
      await reload();
    });
    if (ok) onClose();
  }

  return (
    <Sheet title={goal.title} onClose={onClose}>
      <p className="big">{money(saved, goal.currency)}</p>
      <p className="muted">of {money(goal.target, goal.currency)}</p>
      <GoalAmount input={input} onEdit={() => setError('')} />
      <div className="pair">
        <button className="button primary" onClick={() => change(1)} disabled={busy}>Add money</button>
        <button className="button" onClick={() => change(-1)} disabled={busy}>Withdraw</button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="pair">
        <button className="button" onClick={onEdit} disabled={busy}>Edit</button>
        <button className="button danger" onClick={remove} disabled={busy}>Delete</button>
      </div>
    </Sheet>
  );
}

// "To savings" on the home screen.
export function DepositSheet({ meta, goals, items, ledger, reload, onNewGoal, onClose }) {
  const [goalId, setGoalId] = useState(goals[0]?.id ?? '');
  const goal = goals.find((g) => g.id === goalId);
  const input = useGoalAmount(meta, goal);
  const { busy, error, setError, run } = useAction();

  async function submit(event) {
    event.preventDefault();
    const ok = await run(async () => {
      const value = await input.resolve();
      await ledger.contribute(goalId, value, today().slice(0, 7), extrasFor(items, goalId));
      await reload();
    });
    if (ok) onClose();
  }

  return (
    <Sheet title="To savings" onClose={onClose}>
      {!goals.length ? (
        <>
          <p className="muted">Create a savings goal first.</p>
          <button className="button primary" onClick={onNewGoal}><Icon name="add" size={20} />New goal</button>
        </>
      ) : (
        <form onSubmit={submit}>
          <label>Goal
            <select value={goalId} onChange={(e) => { setError(''); setGoalId(e.target.value); }}>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.title} ({g.currency})</option>)}
            </select>
          </label>
          <GoalAmount input={input} onEdit={() => setError('')} autoFocus />
          {error && <p role="alert">{error}</p>}
          <button className="button primary" disabled={busy}>Set aside</button>
        </form>
      )}
    </Sheet>
  );
}
