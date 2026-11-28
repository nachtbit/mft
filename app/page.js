'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Analytics from '../components/Analytics.js';
import Assistant from '../components/Assistant.js';
import EntrySheet from '../components/EntrySheet.js';
import { DepositSheet, GoalForm, GoalSheet } from '../components/GoalSheets.js';
import Home from '../components/Home.js';
import NameForm from '../components/NameForm.js';
import { AllOperations, OperationSheet } from '../components/Operations.js';
import Profile from '../components/Profile.js';
import Savings from '../components/Savings.js';
import { Header, Icon, Logo, RatesCredit } from '../components/ui.js';
import { CURRENCY_INFO } from '../lib/categories.js';
import { loadRates } from '../lib/client/rates.js';
import { loadKey } from '../lib/client/secureKey.js';
import { createBackend, webApp } from '../lib/client/telegram.js';
import { applyTheme, cachedTheme } from '../lib/client/theme.js';
import { enabledCurrencies } from '../lib/currency.js';
import { today } from '../lib/dates.js';
import { createLedger } from '../lib/ledger.js';
import { view } from '../lib/view.js';

const TABS = [
  ['home', 'Home', 'dashboard'],
  ['analytics', 'Analytics', 'stacked_line_chart'],
  ['savings', 'Savings', 'savings'],
  ['assistant', 'Assistant', 'robot_2'],
];

export default function Page() {
  const [app, setApp] = useState(null);
  const [data, setData] = useState(null);
  const [problem, setProblem] = useState('');
  const [tab, setTab] = useState('home');
  const [profile, setProfile] = useState(false);
  // One sheet at a time: { type, ... }
  const [sheet, setSheet] = useState(null);
  const [ai, setAi] = useState({ key: '', model: '', status: 'loading' });
  // The chat is kept in memory only.
  const [chat, setChat] = useState({ messages: [], waiting: false, error: '' });
  const [display, setDisplay] = useState('');
  const [table, setTable] = useState(null);
  const [ratesFailed, setRatesFailed] = useState(false);

  const start = useCallback(async () => {
    setProblem('');
    const backend = createBackend();
    if (!backend) {
      setProblem('Open MFT from your Telegram bot. An up-to-date Telegram app is required.');
      return;
    }
    const telegram = webApp();
    telegram?.ready();
    telegram?.expand();
    applyTheme(cachedTheme());
    const ledger = createLedger(backend);
    try {
      setData(await ledger.loadAll());
    } catch (error) {
      setProblem(error.message);
      return;
    }
    setApp({ backend, ledger });
    // AI setup loads separately so tracking never waits for it.
    const [stored, saved] = await Promise.all([
      loadKey(),
      backend.getItems(['ai_model']).catch(() => ({})),
    ]);
    setAi({ key: stored.key ?? '', model: saved.ai_model ?? '', status: stored.status });
  }, []);

  useEffect(() => {
    start();
  }, [start]);

  const currency = data?.meta.currency;

  const fetchRates = useCallback(() => {
    if (!currency) return;
    setRatesFailed(false);
    loadRates(currency).then(setTable).catch(() => setRatesFailed(true));
  }, [currency]);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  const theme = data && (data.meta.theme ?? 'light');

  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  // Figures in the default currency, for display only.
  const shownData = useMemo(() => data && view(data, table, today()), [data, table]);

  if (problem) {
    return (
      <main className="problem">
        <Logo large />
        <p role="alert">{problem}</p>
        <button className="button primary" onClick={start}>Retry</button>
      </main>
    );
  }
  if (!app || !data) return <main className="problem"><Logo large /><p>Loading…</p></main>;

  const { ledger, backend } = app;
  const reload = async () => setData(await ledger.loadAll());

  // First run: ask for the name used in the greeting.
  if (!data.meta.name?.trim()) {
    return (
      <main className="problem welcome">
        <Logo large />
        <h2>Welcome to MFT</h2>
        <NameForm ledger={ledger} reload={reload} button="Continue" />
      </main>
    );
  }
  const close = () => setSheet(null);
  const select = (item) => setSheet({ type: 'operation', item });
  // Sheets that change data work with the stored amounts, not the converted ones.
  const shared = { ledger, reload, table, onClose: close, meta: data.meta, goals: data.goals, items: data.items };
  const base = data.meta.currency;
  // A currency switched off in settings can no longer be picked for display.
  const shownCurrency = enabledCurrencies(data.meta).includes(display) ? display : '';
  const foreign = data.items.some((e) => e.currency !== base) || data.goals.some((g) => g.currency !== base) ||
    Object.keys(data.meta.opening).some((c) => c !== base);
  const openGoal = sheet?.goalId && data.goals.find((g) => g.id === sheet.goalId);

  if (profile) {
    return (
      <Profile data={data} backend={backend} ledger={ledger} reload={reload} ai={ai} setAi={setAi}
        onClose={() => setProfile(false)} />
    );
  }

  return (
    <>
      <Header title={TABS.find(([key]) => key === tab)[1]} greetingName={tab === 'home' ? data.meta.name : ''}
        onProfile={() => setProfile(true)}>
        {tab === 'savings' && (
          <select className="currency" aria-label="Display currency" value={shownCurrency || base}
            onChange={(e) => setDisplay(e.target.value === base ? '' : e.target.value)}>
            {enabledCurrencies(data.meta).map((c) => <option key={c} value={c}>{CURRENCY_INFO[c].symbol} {c}</option>)}
          </select>
        )}
      </Header>
      <main>
        {ratesFailed && (foreign || data.meta.extra.length > 0) && (
          <p role="alert">
            Exchange rates are unavailable{shownData.missing ? ', so totals are incomplete' : ''}.{' '}
            <button className="text-button" onClick={fetchRates}>Retry</button>
          </p>
        )}
        {tab === 'home' && (
          <Home data={shownData} raw={data} table={table} onAdd={(kind) => setSheet({ type: 'entry', kind })} onDeposit={() => setSheet({ type: 'deposit' })}
            onAll={() => setSheet({ type: 'all' })} onSelect={select} />
        )}
        {tab === 'analytics' && <Analytics data={shownData} onSetLimit={() => setProfile(true)} />}
        {tab === 'savings' && (
          <Savings data={shownData} raw={data} display={shownCurrency} table={table} ledger={ledger} reload={reload}
            onNew={() => setSheet({ type: 'goalForm' })} onOpen={(goal) => setSheet({ type: 'goal', goalId: goal.id })} />
        )}
        {tab === 'assistant' && (
          <Assistant data={shownData} ai={ai} chat={chat} setChat={setChat} onSetup={() => setProfile(true)} />
        )}
        {foreign && (tab === 'analytics' || tab === 'assistant') && <p className="center"><RatesCredit /></p>}
      </main>
      <nav>
        {TABS.map(([key, name, icon]) => (
          <button key={key} aria-current={tab === key ? 'page' : undefined}
            onClick={() => { setTab(key); window.scrollTo(0, 0); }}>
            <Icon name={icon} />{name}
          </button>
        ))}
      </nav>

      {sheet?.type === 'entry' && <EntrySheet kind={sheet.kind} {...shared} />}
      {sheet?.type === 'operation' && <OperationSheet item={sheet.item} {...shared} />}
      {sheet?.type === 'all' && <AllOperations items={shownData.items} onSelect={select} onClose={close} />}
      {sheet?.type === 'deposit' && <DepositSheet {...shared} onNewGoal={() => setSheet({ type: 'goalForm' })} />}
      {sheet?.type === 'goalForm' && <GoalForm {...shared} goal={openGoal || undefined} />}
      {sheet?.type === 'goal' && openGoal && (
        <GoalSheet {...shared} goal={openGoal} onEdit={() => setSheet({ type: 'goalForm', goalId: openGoal.id })} />
      )}
    </>
  );
}
