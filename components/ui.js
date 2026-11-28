import { useEffect, useRef, useState } from 'react';
import { CURRENCY_INFO } from '../lib/categories.js';
import { ICONS } from '../lib/icons.js';

export function Icon({ name, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Header({ title, onProfile, children }) {
  return (
    <header>
      <h1><Icon name="account_balance_wallet" size={22} />{title}</h1>
      <div className="header-actions">
        {children}
        <button className="avatar" onClick={onProfile} aria-label="Profile and settings">
          <Icon name="person" size={22} />
        </button>
      </div>
    </header>
  );
}

// Drawn as SVG attributes, which the Content Security Policy always allows.
export function Progress({ value, tone = 'dark' }) {
  const width = Math.max(0, Math.min(100, (value || 0) * 100));
  return (
    <svg className={`bar ${tone}`} viewBox="0 0 100 1" preserveAspectRatio="none" aria-hidden="true">
      <rect className="track" width="100" height="1" />
      <rect className="fill" width={width} height="1" />
    </svg>
  );
}

export function Sheet({ title, onClose, children }) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="round" onClick={onClose} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CurrencyChips({ options, value, onChange, disabled, label = 'Currency' }) {
  return (
    <div className="chips currency-chips" role="group" aria-label={label}>
      {options.map((c) => (
        <button type="button" className="chip" key={c} aria-pressed={value === c} disabled={disabled}
          onClick={() => onChange(c)}>
          {CURRENCY_INFO[c].symbol === c ? c : `${CURRENCY_INFO[c].symbol} ${c}`}
        </button>
      ))}
    </div>
  );
}

export function RatesCredit() {
  return (
    <a className="credit" href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">
      Rates By Exchange Rate API
    </a>
  );
}

// Runs one action at a time and reports its error.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  async function run(task) {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError('');
    let ok = false;
    try {
      await task();
      ok = true;
    } catch (e) {
      if (alive.current) setError(e.message);
    }
    running.current = false;
    if (alive.current) setBusy(false);
    return ok;
  }
  return { busy, error, setError, run };
}
