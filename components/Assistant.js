import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/client/api.js';
import { today } from '../lib/dates.js';
import { money } from '../lib/format.js';
import { forecast, healthScore, snapshot, subscriptions, weekendPattern } from '../lib/stats.js';
import { OperationList } from './Operations.js';
import { Icon, Progress, Sheet } from './ui.js';

const GREETING = 'Hello! Which part of your budget can we improve today?';
const QUICK = [
  ['local_taxi', 'How much did I spend on taxis?'],
  ['query_stats', 'Forecast my spending'],
  ['tune', 'Optimize my budget'],
];

function Score({ value }) {
  return (
    <div className="score">
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle className="track" cx="40" cy="40" r="35" />
        <circle className="fill" cx="40" cy="40" r="35" pathLength="100" strokeDasharray={`${value ?? 0} 100`} />
      </svg>
      <div><strong>{value ?? '—'}</strong><small>100</small></div>
    </div>
  );
}

export default function Assistant({ data, ai, chat, setChat, onSetup, onSelect }) {
  const { meta, items, goals } = data;
  const now = today();
  const score = healthScore(items, meta, goals, now);
  const subs = subscriptions(items, now);
  const outlook = forecast(items, meta, now);
  const weekend = weekendPattern(items, now);
  const [input, setInput] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [sheet, setSheet] = useState('');
  const end = useRef(null);
  const ready = Boolean(ai.key && ai.model);

  useEffect(() => {
    if (chat.messages.length) end.current?.scrollIntoView({ block: 'nearest' });
  }, [chat.messages.length, chat.waiting]);

  async function send(text) {
    const question = text.trim();
    if (!question || chat.waiting) return;
    if (!ready) return setNeedsSetup(true);
    const messages = [...chat.messages, { role: 'user', content: question }];
    setInput('');
    setChat({ messages, waiting: true, error: '' });
    try {
      const { reply } = await api('/api/chat', {
        key: ai.key,
        model: ai.model,
        data: snapshot(items, meta, goals, now),
        // The last few turns, starting with a question.
        messages: messages.slice(-7),
      });
      setChat({ messages: [...messages, { role: 'assistant', content: reply }], waiting: false, error: '' });
    } catch (e) {
      // The unanswered question goes back into the field.
      setChat({ messages: chat.messages, waiting: false, error: e.message });
      setInput(question);
    }
  }

  return (
    <>
      <button className="card hero-card" onClick={() => setSheet('score')}>
        <span>
          <span className="label">● Insights</span>
          <strong className="headline">{score ? score.label : 'Not enough data'}</strong>
          <span className="muted">
            {score?.penalties[0]?.reason}
          </span>
        </span>
        <Score value={score?.value} />
      </button>

      <div className="title-row"><span className="muted">Observations</span></div>

      <section className="card">
        <div className="row">
          <span className="square"><Icon name="credit_card_off" /></span>
          <span className="grow">
            <strong>Subscriptions</strong>
            <small>{subs.items.length ? `${subs.items.length} in the last 30 days` : 'None in the last 30 days'}</small>
          </span>
          {subs.total > 0 && <span className="pill alert-pill">−{money(subs.total, meta.currency)}/mo</span>}
        </div>
        {subs.items.length > 0 && (
          <div className="title-row tight">
            <span className="initials">{subs.names.slice(0, 3).map((n) => <i key={n}>{[...n][0].toUpperCase()}</i>)}</span>
            <button className="button primary compact" onClick={() => setSheet('subs')}>
              Review<Icon name="arrow_forward" size={18} />
            </button>
          </div>
        )}
      </section>

      <section className="card">
        <div className="row">
          <span className="square"><Icon name="trending_up" /></span>
          <span className="grow">
            <strong>End-of-month forecast</strong>
            {!outlook && <small>Not enough data</small>}
          </span>
        </div>
        {outlook && (
          <>
            <div className="title-row tight">
              <span className="stat large">~ {money(Math.round(outlook.remaining / 100) * 100, meta.currency)}</span>
              <small>left over</small>
            </div>
            <Progress value={outlook.share} />
          </>
        )}
      </section>

      <section className="card row">
        <span className="square"><Icon name="calendar_month" /></span>
        <span className="grow">
          <strong>Weekend pattern</strong>
          <small>
            {weekend === null ? 'Not enough data'
              : weekend === 0 ? 'Weekend and weekday spending are the same'
              : `Saturday and Sunday spending is ${Math.abs(weekend)}% ${weekend > 0 ? 'higher' : 'lower'}`}
          </small>
        </span>
        <span className="circle small-circle"><Icon name="trending_up" size={20} /></span>
      </section>

      <p className="label section-label">Quick questions</p>
      <div className="quick">
        {QUICK.map(([icon, text]) => (
          <button key={text} onClick={() => send(text)} disabled={chat.waiting}><Icon name={icon} size={18} />{text}</button>
        ))}
      </div>

      <div className="messages" aria-live="polite">
        {[{ role: 'assistant', content: GREETING }, ...chat.messages].map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            {m.role === 'assistant' && <span className="bot"><Icon name="psychology" size={18} /></span>}
            {/* Rendered as text, never as HTML. */}
            <p>{m.content}</p>
          </div>
        ))}
        {chat.waiting && <p className="muted">The assistant is thinking…</p>}
        <div ref={end} />
      </div>

      {(needsSetup || (!ready && ai.status !== 'loading')) && (
        <div className="card center">
          <button className="button primary" onClick={onSetup}>Set up AI</button>
        </div>
      )}
      {chat.error && <p role="alert">{chat.error}</p>}

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input value={input} maxLength={500} placeholder="Ask the assistant…" aria-label="Question for the assistant"
          onChange={(e) => setInput(e.target.value)} />
        <button className="send" aria-label="Send" disabled={chat.waiting || !input.trim()}>
          <Icon name="arrow_upward" size={20} />
        </button>
      </form>
      {sheet === 'score' && (
        <Sheet title="How the score works" onClose={() => setSheet('')}>
          {!score ? <p>Not enough data yet.</p>
            : !score.penalties.length ? <p>No points were taken off.</p>
            : <ul className="plain">{score.penalties.map((p) => <li key={p.reason}><span className="grow">{p.reason}</span><strong>−{p.points}</strong></li>)}</ul>}
        </Sheet>
      )}
      {sheet === 'subs' && (
        <Sheet title="Subscriptions in the last 30 days" onClose={() => setSheet('')}>
          <OperationList items={subs.items} onSelect={(item) => { setSheet(''); onSelect(item); }} />
        </Sheet>
      )}
    </>
  );
}
