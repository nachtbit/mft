import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/client/api.js';
import { loadKey, removeKey, restoreKey, saveKey } from '../lib/client/secureKey.js';
import { confirmAction, webApp } from '../lib/client/telegram.js';

const PREFERRED_MODEL = 'gemma4:31b';

export default function AiSettings({ backend, ai, setAi }) {
  const [models, setModels] = useState(null);
  const [modelsError, setModelsError] = useState('');
  const [search, setSearch] = useState('');
  const [choice, setChoice] = useState('');
  const [draft, setDraft] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const loadModels = useCallback(async () => {
    setModelsError('');
    try {
      setModels((await api('/api/ai/models')).models);
    } catch (error) {
      setModelsError(error.message);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const preferred = ai.model || PREFERRED_MODEL;
  const selected = choice || (models?.includes(preferred) ? preferred : '');
  const matches = (models ?? []).filter((m) => m.toLowerCase().includes(search.trim().toLowerCase()));
  const key = draft.trim() || ai.key;

  async function testAndSave(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('Testing…');
    try {
      await api('/api/ai/test', { key, model: selected });
    } catch (error) {
      setMessage(`${error.message} Your previous settings are unchanged.`);
      setBusy(false);
      return;
    }
    // Only a new key is written; otherwise the stored one stays as it is.
    const stored = draft.trim() ? await saveKey(key) : ai.status === 'found';
    // If the new key was not stored, drop any old one so it does not come back later.
    if (draft.trim() && !stored) await removeKey().catch(() => {});
    let modelSaved = true;
    await backend.setItem('ai_model', selected).catch(() => { modelSaved = false; });
    setAi({ key, model: selected, status: stored ? 'found' : ai.status === 'unsupported' ? 'unsupported' : 'empty' });
    setDraft('');
    setShow(false);
    setMessage([
      'AI is ready.',
      !stored && 'The key could not be stored securely, so enter it again after closing the app.',
      !modelSaved && 'The model choice could not be saved.',
    ].filter(Boolean).join(' '));
    setBusy(false);
  }

  async function remove() {
    if (!(await confirmAction('Remove the API key from this device? This does not revoke it in Ollama.'))) return;
    setBusy(true);
    try {
      await removeKey();
      setAi({ ...ai, key: '', status: (await loadKey()).status });
      setMessage('Key removed.');
    } catch {
      setMessage('Could not remove the key. Try again, or revoke it in Ollama.');
    }
    setBusy(false);
  }

  async function restore() {
    setBusy(true);
    try {
      const value = await restoreKey();
      if (!value) throw new Error('empty');
      setAi({ ...ai, key: value, status: 'found' });
      setMessage('Key restored.');
    } catch {
      setMessage('The key was not restored.');
    }
    setBusy(false);
  }

  const openKeys = (event) => {
    if (!webApp()?.initData) return;
    event.preventDefault();
    webApp().openLink('https://ollama.com/settings/keys');
  };

  return (
    <form className="card" onSubmit={testAndSave}>
      <h2>AI</h2>
      <p className="muted small">Provider: Ollama Cloud</p>
      <label>
        API key
        <input type={show ? 'text' : 'password'} value={draft} maxLength={256} autoComplete="off"
          autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={busy}
          placeholder={ai.key ? 'Key set. Type to replace it' : 'Paste your key'}
          onChange={(e) => setDraft(e.target.value)} />
      </label>
      <div className="row">
        <button type="button" onClick={() => setShow(!show)} disabled={!draft} className="text-button">{show ? 'Hide' : 'Show'}</button>
        <a href="https://ollama.com/settings/keys" target="_blank" rel="noreferrer" onClick={openKeys}>Get a key ↗</a>
      </div>
      {ai.status === 'restorable' && !ai.key && (
        <button type="button" className="button" onClick={restore} disabled={busy}>Restore key</button>
      )}
      {ai.status === 'unsupported' && (
        <p className="muted small">Secure storage is not available here. The key will be kept only until you close the app.</p>
      )}
      <label>
        Search models
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} disabled={busy} />
      </label>
      <label>
        Model
        <select value={matches.includes(selected) ? selected : ''} disabled={busy || !models}
          onChange={(e) => setChoice(e.target.value)}>
          <option value="" disabled>
            {!models ? 'Loading…' : matches.length ? 'Select a model' : 'No matches'}
          </option>
          {matches.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      {selected && <p className="muted small">Selected: {selected}</p>}
      {models && ai.model && !models.includes(ai.model) && (
        <p role="alert">Your saved model is no longer listed. Choose another.</p>
      )}
      {modelsError && (
        <>
          <p role="alert">{modelsError}</p>
          <button type="button" className="button" onClick={loadModels}>Retry</button>
        </>
      )}
      <button className="button primary" disabled={busy || !key || !selected}>Test and save</button>
      <p className="muted small">
        The test may use a little credit. Your key passes through this app’s server, which is written not to store or log it.
      </p>
      <p role="status">{message}</p>
      {(ai.key || ai.status === 'found') && (
        <button type="button" className="button danger" onClick={remove} disabled={busy}>Remove key</button>
      )}
    </form>
  );
}
