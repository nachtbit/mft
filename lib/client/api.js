import { webApp } from './telegram.js';

const MESSAGES = {
  not_configured: 'The server is missing its settings. Check the Vercel variables and redeploy.',
  unauthorized: 'Sign-in expired or invalid. Close the app and open it again from your bot.',
  forbidden: 'This Telegram account is not allowed.',
  slow_down: 'Too many requests. Wait a minute and try again.',
  bad_key: 'That does not look like an API key.',
  bad_model: 'That model is not available. Choose another.',
  bad_data: 'Could not prepare your data for the assistant.',
  bad_message: 'The message is empty or too long.',
  models_unavailable: 'Could not load the model list.',
  key_rejected: 'Ollama rejected the API key.',
  no_credit: 'Your Ollama account needs usage credit. Add it at ollama.com, then try again.',
  access_denied: 'Ollama denied access to this model.',
  model_unavailable: 'Ollama could not find this model.',
  usage_limit: 'Ollama usage limit reached. Try again later.',
  ai_unreachable: 'Could not reach Ollama, or it took too long.',
  ai_empty: 'The model returned no answer. Try again.',
};

export async function api(path, body) {
  let response;
  let data;
  try {
    const initData = webApp()?.initData;
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(initData && { Authorization: `tma ${initData}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(90_000),
    });
    data = await response.json();
  } catch {
    throw new Error('Connection failed. Try again.');
  }
  if (!response.ok) throw new Error(MESSAGES[data.error] ?? 'Something went wrong. Try again.');
  return data;
}
