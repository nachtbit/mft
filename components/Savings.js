import { convert } from '../lib/currency.js';
import { today } from '../lib/dates.js';
import { money, percent } from '../lib/format.js';
import { extrasFor } from '../lib/ledger.js';
import { goalSaved } from '../lib/stats.js';
import { Icon, Progress, RatesCredit, useAction } from './ui.js';

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

  const quickAdd = (goal) => run(async () => {
    await ledger.contribute(goal.id, goal.quick, month, extrasFor(raw.items, goal.id));
    await reload();
  });

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
                  {goal.subtitle && <small>{goal.subtitle}</small>}
                </span>
              </button>
              {goal.quick > 0 && (
                <button className="pill dark-text" onClick={() => quickAdd(goal)} disabled={busy}>
                  +{money(goal.quick, goal.currency)}
                </button>
              )}
            </div>
            <button className="goal-body" onClick={() => onOpen(goal)}>
              <span className="title-row tight"><span className="stat">{shown(saved, goal.currency)}</span><span className="muted">of {shown(goal.target, goal.currency)}</span></span>
              <Progress value={saved / goal.target} />
              <small className="right">{percent((saved / goal.target) * 100)}</small>
            </button>
          </article>
        );
      })}

    </>
  );
}
