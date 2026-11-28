import { useState } from 'react';
import { MAX_NAME } from '../lib/categories.js';
import { useAction } from './ui.js';

// Used on first run and in settings.
export default function NameForm({ initial = '', ledger, reload, button }) {
  const [name, setName] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { busy, error, setError, run } = useAction();

  async function submit(event) {
    event.preventDefault();
    const value = name.trim().replace(/\s+/g, ' ');
    if (!value) return setError('Enter your full name.');
    setSaved(await run(async () => {
      await ledger.updateMeta({ name: value });
      await reload();
    }));
  }

  return (
    <form onSubmit={submit}>
      <label>
        Full name
        <input value={name} maxLength={MAX_NAME} autoComplete="name" autoCapitalize="words" disabled={busy}
          onChange={(e) => { setName(e.target.value); setSaved(false); setError(''); }} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="button primary" disabled={busy || !name.trim()}>{button}</button>
      {saved && <p role="status">Saved</p>}
    </form>
  );
}
