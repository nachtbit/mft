// Server only. The only code that talks to Ollama. The host is fixed.
import { HttpError } from './http.js';

const BASE = 'https://ollama.com/api';
const MODELS_TTL_MS = 60 * 60 * 1000;
let cache = null;

export async function listModels() {
  if (cache && Date.now() - cache.at < MODELS_TTL_MS) return cache.models;
  let models;
  try {
    const response = await fetch(`${BASE}/tags`, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('bad status');
    const data = await response.json();
    models = data.models
      .filter((m) => !m.capabilities || m.capabilities.includes('completion'))
      .map((m) => m.name)
      .filter((name) => typeof name === 'string' && name.length <= 100)
      .sort();
    if (models.length === 0) throw new Error('empty');
  } catch {
    throw new HttpError(502, 'models_unavailable');
  }
  cache = { at: Date.now(), models };
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

export async function assertModel(model) {
  if (!(await listModels()).includes(model)) throw new HttpError(400, 'bad_model');
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
