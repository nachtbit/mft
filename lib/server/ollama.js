// Server only. The only code that talks to Ollama. The host is fixed.
import { HttpError } from './http.js';

const BASE = 'https://ollama.com/api';
const MODELS_TTL_MS = 60 * 60 * 1000;
let cache = null;

// Only ":cloud" names are offered. The model list does not use them, so each one is
// confirmed with Ollama; not every model family has one.
const CLOUD_NAME = /^[a-z0-9._-]{1,80}:cloud$/;

async function ollamaPublic(path, body) {
  return fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
}

// The ":cloud" form of every listed model family, not yet confirmed.
async function candidates() {
  const response = await ollamaPublic('/tags');
  if (!response.ok) throw new Error('bad status');
  const names = (await response.json()).models
    .filter((m) => !m.capabilities || m.capabilities.includes('completion'))
    .map((m) => `${String(m.name).split(':')[0]}:cloud`)
    .filter((name) => CLOUD_NAME.test(name));
  return [...new Set(names)].sort();
}

// true or false when Ollama answers clearly; throws otherwise.
async function exists(model) {
  const response = await ollamaPublic('/show', { model });
  if (response.ok) return true;
  if (response.status === 404) return false;
  throw new Error('bad status');
}

export async function listModels() {
  if (cache && Date.now() - cache.at < MODELS_TTL_MS) return cache.models;
  let results;
  try {
    const names = await candidates();
    results = await Promise.allSettled(names.map(async (name) => ((await exists(name)) ? name : null)));
  } catch {
    throw new HttpError(502, 'models_unavailable');
  }
  const models = results.map((r) => r.value).filter(Boolean);
  if (!models.length) throw new HttpError(502, 'models_unavailable');
  // A list with failed checks is incomplete, so it is not kept.
  if (results.every((r) => r.status === 'fulfilled')) cache = { at: Date.now(), models };
  return models;
}

export function parseCredentials(body) {
  const { key, model } = body ?? {};
  // Printable ASCII without spaces, so the key cannot alter request headers.
  if (typeof key !== 'string' || !/^[\x21-\x7e]{8,256}$/.test(key)) {
    throw new HttpError(400, 'bad_key');
  }
  if (typeof model !== 'string' || model.length > 100) throw new HttpError(400, 'bad_model');
  return { key, model };
}

// Checks one model without confirming the whole list.
export async function assertModel(model) {
  if (!CLOUD_NAME.test(model)) throw new HttpError(400, 'bad_model');
  if (cache?.models.includes(model)) return;
  let valid;
  try {
    valid = (await candidates()).includes(model) && (await exists(model));
  } catch {
    throw new HttpError(502, 'models_unavailable');
  }
  if (!valid) throw new HttpError(400, 'bad_model');
}

const STATUS_CODES = {
  401: 'key_rejected',
  402: 'no_credit',
  403: 'access_denied',
  404: 'model_unavailable',
  429: 'usage_limit',
};

// Upstream error bodies are never passed on to the browser.
export async function chat({ key, model, messages, maxTokens }) {
  let response;
  let data;
  try {
    response = await fetch(`${BASE}/chat`, {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(75_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        think: false,
        options: { num_predict: maxTokens },
      }),
    });
    if (response.ok) data = await response.json();
  } catch {
    throw new HttpError(502, 'ai_unreachable');
  }
  if (!response.ok) throw new HttpError(502, STATUS_CODES[response.status] ?? 'ai_error');
  return typeof data?.message?.content === 'string' ? data.message.content.trim() : '';
}
