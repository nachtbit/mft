import { CURRENCY_INFO } from '../lib/categories.js';
import { convert } from '../lib/currency.js';
import { today } from '../lib/dates.js';
import { money, percent } from '../lib/format.js';
import { extrasFor } from '../lib/ledger.js';
import { goalSaved } from '../lib/stats.js';
import { Icon, Progress, RatesCredit, useAction } from './ui.js';

function Toggle({ icon, title, text, checked, onChange, disabled }) {
  return (
    <li>
      <span className="circle small-circle"><Icon name={icon} size={20} /></span>
      <span className="grow"><strong>{title}</strong><small>{text}</small></span>
      <input type="checkbox" role="switch" className="switch" aria-label={title} checked={checked}
        disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </li>
  );
}

// `data` is in the default currency (for totals); `raw` keeps each goal in its own.
// With no display currency chosen, goals show their own currency.
export default function Savings({ data, raw, display, table, ledger, reload, onNew, onOpen }) {
  const { meta, items, goals } = data;
  const { busy, error, run } = useAction();
  const shown = (cents, from = meta.currency) => {
    const to = display || from;
    const value = convert(cents, from, to, table);
    if (value === null) return money(cents, from);
    return to === from ? money(value, to) : `≈ ${money(Math.round(value / 100) * 100, to)}`;
  };

  const total = goals.reduce((sum, g) => sum + goalSaved(g, items), 0);
  const target = goals.reduce((sum, g) => sum + g.target, 0);
  const month = today().slice(0, 7);
  const ids = new Set(goals.map((g) => g.id));
  const monthItems = items.filter((e) => e.month === month && ids.has(e.goal));
  const roundSum = monthItems.reduce((s, e) => s + e.roundUpBase, 0);
  const cashSum = monthItems.reduce((s, e) => s + e.cashbackBase, 0);
  const autoGoal = goals.find((g) => g.id === meta.autoGoal);

  const change = (patch) => run(async () => {
    const next = { ...patch };
    if ((next.roundOn || next.cashOn) && !autoGoal) next.autoGoal = goals[0].id;
    await ledger.updateMeta(next);
    await reload();
  });

  const quickAdd = (goal) => run(async () => {
    await ledger.contribute(goal.id, goal.quick, month, extrasFor(raw.items, goal.id));
    await reload();
  });

  const step = money(CURRENCY_INFO[meta.currency].roundStep, meta.currency);

  return (
    <>
      <section>
        <div className="title-row tight">
          <p className="label">Total saved</p>
          {target > 0 && <small>{Math.round((total / target) * 100)}% of plan</small>}
        </div>
        <p className="balance left huge">{shown(total)}</p>
        <Progress value={target ? total / target : 0} />
        <div className="title-row tight"><small>Current progress</small><small>{shown(target)} total target</small></div>
        {((display && display !== meta.currency) || raw.goals.some((g) => g.currency !== meta.currency)) && <RatesCredit />}
      </section>

      <button className="button primary tall" onClick={onNew}><Icon name="add" size={20} />New goal</button>

      <div className="title-row">
        <h2>Savings goals</h2>
        <small>Active: {goals.length}</small>
      </div>
      {error && <p role="alert">{error}</p>}
      {!goals.length && <p className="card muted center">No goals yet.</p>}
      {raw.goals.map((goal) => {
        const saved = goalSaved(goal, raw.items);
        return (
          <article className="card goal" key={goal.id}>
            <div className="goal-head">
              <button className="goal-main" onClick={() => onOpen(goal)}>
                <span className="square"><Icon name={goal.icon} /></span>
                <span className="grow">
                  <strong>{goal.title}{goal.locked && <Icon name="lock" size={14} />}</strong>
                  <small>{goal.subtitle || 'Tap to edit'}</small>
                </span>
              </button>
              {goal.auto > 0
                ? <span className="pill dark-text">● Auto</span>
                : goal.quick > 0 && (
                  <button className="pill dark-text" onClick={() => quickAdd(goal)} disabled={busy}>
                    +{money(goal.quick, goal.currency)}
                  </button>
                )}
            </div>
            <button className="goal-body" onClick={() => onOpen(goal)}>
              <span className="title-row tight"><span className="stat">{shown(saved, goal.currency)}</span><span className="muted">of {shown(goal.target, goal.currency)}</span></span>
              <Progress value={saved / goal.target} />
              <span className="title-row tight">
                <small>{goal.auto > 0 ? `Deposit on the 1st: ${money(goal.auto, goal.currency)}` : ''}</small>
                <small>{percent((saved / goal.target) * 100)}</small>
              </span>
            </button>
          </article>
        );
      })}

      <p className="label section-label">Smart auto-saving</p>
      <ul className="card toggles">
        <Toggle icon="payments" title="Round up spending" text={`Round expenses up, for example to the next ${step}`}
          checked={meta.roundOn} disabled={busy || !goals.length} onChange={(roundOn) => change({ roundOn })} />
        <Toggle icon="percent" title="Cashback to savings" text="Enter cashback when you add an expense"
          checked={meta.cashOn} disabled={busy || !goals.length} onChange={(cashOn) => change({ cashOn })} />
      </ul>
      {(meta.roundOn || meta.cashOn) && (
        <label>Save into goal
          <select value={autoGoal?.id ?? ''} disabled={busy} onChange={(e) => change({ autoGoal: e.target.value })}>
            {!autoGoal && <option value="" disabled>Choose a goal</option>}
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </label>
      )}
      <p className="muted small">These are records in the app: no real money moves.</p>

      {roundSum + cashSum > 0 && (
        <section className="note">
          <Icon name="wand_stars" size={20} />
          <div>
            <strong>Saving habit</strong>
            <p>Set aside this month: {money(roundSum, meta.currency)} from round-ups and {money(cashSum, meta.currency)} from cashback.</p>
          </div>
        </section>
      )}
    </>
  );
}
