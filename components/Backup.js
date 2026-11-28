import { useState } from 'react';
import { confirmAction } from '../lib/client/telegram.js';

export default function Backup({ ledger, onImported }) {
  const [exported, setExported] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const run = async (task) => {
    setBusy(true);
    setMessage('Working…');
    try {
      setMessage(await task());
    } catch (error) {
      setMessage(error.message);
    }
    setBusy(false);
  };

  // Copy and paste works even where Telegram blocks file downloads.
  const exportAll = () => run(async () => {
    const data = await ledger.exportData();
    if (!data.goals.length && !Object.keys(data.months).length) return 'Nothing to export yet.';
    setExported(JSON.stringify(data));
    return 'Backup ready. Copy it and keep it somewhere private.';
  });

  const copy = () => run(async () => {
    await navigator.clipboard.writeText(exported).catch(() => {
      throw new Error('Could not copy. Select the text and copy it yourself.');
    });
    return 'Copied. The clipboard now contains your financial data.';
  });

  const importAll = () => run(async () => {
    const plan = await ledger.planImport(input.trim());
    if (!plan.count) return 'Nothing new to import.';
    if (!(await confirmAction(`Add missing records (${plan.count})? Existing ones will not be changed.`))) {
      return 'Import cancelled.';
    }
    try {
      const added = await plan.apply();
      setInput('');
      await onImported();
      return `Records added: ${added}.`;
    } catch (error) {
      throw new Error(`Import stopped: ${error.message} It is safe to import the same backup again.`);
    }
  });

  const readFile = (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5_000_000) return setMessage('That file is too large.');
    run(async () => {
      setInput(await file.text());
      return 'File loaded. Press Import to check it.';
    });
  };

  return (
    <div className="card">
      <h2>Backup</h2>
      <button className="button" onClick={exportAll} disabled={busy}>Export</button>
      {exported && (
        <>
          <textarea readOnly rows={4} value={exported} onFocus={(e) => e.target.select()} aria-label="Backup text" />
          <button className="button" onClick={copy} disabled={busy}>Copy</button>
        </>
      )}
      <label>
        Paste a backup to import
        <textarea rows={4} value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} />
      </label>
      <label>
        Or choose a file
        <input type="file" accept=".json,application/json" onChange={readFile} disabled={busy} />
      </label>
      <button className="button" onClick={importAll} disabled={busy || !input.trim()}>Import</button>
      <p role="status">{message}</p>
    </div>
  );
}
