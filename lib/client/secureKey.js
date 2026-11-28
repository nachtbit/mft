// The Ollama key goes to Telegram SecureStorage or stays in memory.
// It is never written to CloudStorage or localStorage.
import { call, insideTelegram, webApp } from './telegram.js';

const NAME = 'ollama_key';

function store() {
  const app = webApp();
  return insideTelegram() && app.isVersionAtLeast('9.0') ? app.SecureStorage : null;
}

// { status: 'found' | 'restorable' | 'empty' | 'unsupported', key? }
export async function loadKey() {
  const secure = store();
  if (!secure) return { status: 'unsupported' };
  try {
    const [value, canRestore] = await call((cb) => secure.getItem(NAME, cb), 5000);
    if (value) return { status: 'found', key: value };
    return { status: canRestore ? 'restorable' : 'empty' };
  } catch {
    return { status: 'unsupported' };
  }
}

export async function restoreKey() {
  const [value] = await call((cb) => store().restoreItem(NAME, cb), 60_000);
  return value;
}

// Returns false if the key could only be kept in memory.
export async function saveKey(key) {
  const secure = store();
  if (!secure) return false;
  try {
    const [stored] = await call((cb) => secure.setItem(NAME, key, cb), 5000);
    return Boolean(stored);
  } catch {
    return false;
  }
}

// Throws if a stored key may still be there.
export async function removeKey() {
  const secure = store();
  if (secure) await call((cb) => secure.removeItem(NAME, cb), 5000);
}
