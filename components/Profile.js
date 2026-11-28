import { useState } from 'react';
import { CURRENCIES, CURRENCY_INFO } from '../lib/categories.js';
import { api } from '../lib/client/api.js';
import { parseAmount } from '../lib/ledger.js';
import AiSettings from './AiSettings.js';
import Backup from './Backup.js';
import { Icon, useAction } from './ui.js';

const toInput = (cents) => (cents ? String(cents / 100) : '');
const optionLabel = (c) => `${c} — ${CURRENCY_INFO[c].name}`;

function Budget({ meta, items, ledger, reload }) {
  const [currency, setCurrency] = useState(meta.currency);
  const [extra, setExtra] = useState(meta.extra);
  const [opening, setOpening] = useState(() =>
    Object.fromEntries(Object.entries(meta.opening).map(([c, n]) => [c, toInput(n)])));
  const [limit, setLimit] = useState(toInput(meta.limit));
  const [limitEdited, setLimitEdited] = useState(false);
  const [saved, setSaved] = useState(false);
  const { busy, error, setError, run } = useAction();
  const touch = () => {
    setSaved(false);
    setError('');
  };
  // An untouched limit keeps the currency it was set in.
  const limitCurrency = limitEdited || !meta.limit ? currency : meta.limitCurrency;
  // Wallets that are in use stay editable even if the currency is switched off.
  const wallets = [...new Set([
    currency, ...extra, ...Object.keys(meta.opening), ...items.map((e) => e.currency),
  ])];

  function changeDefault(next) {
    touch();
    // The previous default stays available as an additional currency.
    setExtra([...new Set([...extra, currency])].filter((c) => c !== next));
    setCurrency(next);
  }

  function toggle(c) {
    touch();
    setExtra(extra.includes(c) ? extra.filter((x) => x !== c) : [...extra, c]);
  }

  async function submit(event) {
    event.preventDefault();
    const amount = (text) => (text?.trim() ? parseAmount(text, { allowZero: true }) : 0);
    const balances = Object.entries(opening).map(([c, text]) => [c, amount(text)]);
    const newLimit = limitEdited ? amount(limit) : meta.limit;
    if (newLimit === null || balances.some(([, n]) => n === null)) return setError('Check the amounts.');
    setSaved(await run(async () => {
      await ledger.updateMeta({
        currency, extra, limit: newLimit, limitCurrency,
        opening: Object.fromEntries(balances.filter(([, n]) => n > 0)),
      });
      await reload();
    }));
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Currencies</h2>
      <label>Default currency
        <select value={currency} onChange={(e) => changeDefault(e.target.value)}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{optionLabel(c)}</option>)}
        </select>
      </label>
      <p className="muted small">Totals and analytics are shown in it. Earlier entries keep their own currency.</p>
      <fieldset>
        <legend>Additional currencies</legend>
        <div className="chips">
          {CURRENCIES.filter((c) => c !== currency).map((c) => (
            <button type="button" className="chip" key={c} aria-pressed={extra.includes(c)}
              title={CURRENCY_INFO[c].name} onClick={() => toggle(c)}>
              {c}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="muted small">You can choose these when adding entries or saving money.</p>

      <h2 className="subheading">Balance and budget</h2>
      {wallets.map((c) => (
        <label key={c}>Starting balance, {c}
          <input inputMode="decimal" value={opening[c] ?? ''} placeholder="0"
            onChange={(e) => { touch(); setOpening({ ...opening, [c]: e.target.value }); }} />
        </label>
      ))}
      <label>Monthly spending limit, {limitCurrency}
        <input inputMode="decimal" value={limit} placeholder="Not set"
          onChange={(e) => { touch(); setLimit(e.target.value); setLimitEdited(true); }} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="button primary" disabled={busy}>Save</button>
      <p role="status">{saved ? 'Saved' : ''}</p>
    </form>
  );
}

export default function Profile({ data, backend, ledger, reload, ai, setAi, onClose }) {
  const [access, setAccess] = useState('');

  async function checkAccess() {
    setAccess('Checking…');
    try {
      await api('/api/session', {});
      setAccess('Access confirmed for this account.');
    } catch (error) {
      setAccess(error.message);
    }
  }

  return (
    <div className="profile">
      <header>
        <button className="round" onClick={onClose} aria-label="Back"><Icon name="arrow_back" /></button>
        <h1>Settings</h1>
        <span className="spacer" />
      </header>
      <main>
        <Budget meta={data.meta} items={data.items} ledger={ledger} reload={reload} />
        <AiSettings backend={backend} ai={ai} setAi={setAi} />
        <Backup ledger={ledger} onImported={reload} />
        <div className="card">
          <h2>Server access</h2>
          <button className="button" onClick={checkAccess}>Check access</button>
          <p role="status">{access}</p>
        </div>
      </main>
    </div>
  );
}
