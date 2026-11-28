import { useState } from 'react';
import { MONTHS, shortDate, today } from '../lib/dates.js';
import { money, percent } from '../lib/format.js';
import { analytics, periodLimit, periodRange } from '../lib/stats.js';
import { Icon, Progress } from './ui.js';

const PERIODS = [['week', 'Week'], ['month', 'Month'], ['year', 'Year']];

function Donut({ rows, total }) {
  let offset = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        {rows.map((row, i) => {
          const share = (row.cents / total) * 100;
          const start = offset;
          offset += share;
          return (
            <circle key={row.name} className={`slice tone-${i}`} cx="60" cy="60" r="50" pathLength="100"
              strokeDasharray={`${Math.max(share - 0.5, 0.1)} ${100 - Math.max(share - 0.5, 0.1)}`}
              strokeDashoffset={-start} />
          );
        })}
      </svg>
      <div>
        <span className="label">Top</span>
        <strong>{percent((rows[0].cents / total) * 100)}</strong>
      </div>
    </div>
  );
}

function Bars({ bars, currency }) {
  const max = Math.max(...bars.map((b) => b.cents), 1);
  return (
    <div className="chart">
      {bars.map((bar, i) => {
        const height = (bar.cents / max) * 100;
        return (
          <div key={i} className={bar.weekend ? 'column weekend' : 'column'} title={money(bar.cents, currency)}>
            <svg viewBox="0 0 10 100" preserveAspectRatio="none" role="img" aria-label={`${bar.label}: ${money(bar.cents, currency)}`}>
              <rect x="1.5" width="7" y={100 - height} height={height} />
            </svg>
            <span>{bar.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Analytics({ data, onSetLimit }) {
  const { meta, items } = data;
  const now = today();
  const [period, setPeriod] = useState('month');
  const [anchor, setAnchor] = useState(now);
  const range = periodRange(period, anchor);
  const isCurrent = now >= range.from && now <= range.to;
  const stats = analytics(items, period, anchor, now);
  const limit = periodLimit(period, anchor, meta.limit);
  const heading = period === 'week'
    ? (isCurrent ? 'Spent this week' : `Spent in the week of ${shortDate(range.from)}`)
    : period === 'year' ? `Spent in ${anchor.slice(0, 4)}`
    : `Spent in ${MONTHS[Number(anchor.slice(5, 7)) - 1]}${anchor.slice(0, 4) === now.slice(0, 4) ? '' : ` ${anchor.slice(0, 4)}`}`;

  // Top five categories; the rest are grouped.
  const rows = stats.categories.slice(0, 5);
  const rest = stats.categories.slice(5).reduce((sum, c) => sum + c.cents, 0);
  if (rest) rows.push({ name: 'Everything else', cents: rest });

  return (
    <>
      <div className="segmented" role="group" aria-label="Period">
        {PERIODS.map(([key, name]) => (
          <button key={key} aria-pressed={period === key} onClick={() => setPeriod(key)}>{name}</button>
        ))}
      </div>

      <section className="card">
        <div className="title-row tight">
          <p className="label">{heading}</p>
          {limit
            ? <span className="pill dark-text">{Math.round((stats.total / limit) * 100)}% of limit</span>
            : <button className="pill dark-text" onClick={onSetLimit}>Set a limit</button>}
        </div>
        <p className="balance left">{money(stats.total, meta.currency)}</p>
        {limit > 0 && (
          <>
            <p className="muted">
              Limit {money(limit, meta.currency)} • <span className="strong">
                {stats.total <= limit ? `${money(limit - stats.total, meta.currency)} left` : `${money(stats.total - limit, meta.currency)} over`}
              </span>
            </p>
            <Progress value={stats.total / limit} />
          </>
        )}
      </section>

      <section className="card">
        <div className="title-row tight">
          <h2>Spending breakdown</h2>
          <small>Categories: {stats.categories.length}</small>
        </div>
        {!rows.length ? <p className="muted center">No expenses in this period.</p> : (
          <>
            <Donut rows={rows} total={stats.total} />
            <ul className="legend">
              {rows.map((row, i) => (
                <li key={row.name} className={`tone-${i}`}>
                  <div>
                    <span className="dot" />
                    <span className="grow">{row.name}</span>
                    <span>{money(row.cents, meta.currency)}</span>
                    <small>{percent((row.cents / stats.total) * 100)}</small>
                  </div>
                  <Progress value={row.cents / stats.total} tone="inherit" />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <div className="title-row tight">
          <div>
            <h2>{period === 'year' ? 'Monthly trend' : 'Daily trend'}</h2>
            <small>Average spend: {money(Math.round(stats.average / 100) * 100, meta.currency)}/day</small>
          </div>
          <label className="icon-input" aria-label="Choose a date">
            <Icon name="calendar_month" />
            <input type="date" min="2000-01-01" max="2099-12-31" value={anchor}
              onClick={(e) => e.target.showPicker?.()}
              onChange={(e) => e.target.value && setAnchor(e.target.value)} />
          </label>
        </div>
        <Bars bars={stats.bars} currency={meta.currency} />
        {!isCurrent && <button className="text-button" onClick={() => setAnchor(now)}>Back to today</button>}
      </section>

    </>
  );
}
