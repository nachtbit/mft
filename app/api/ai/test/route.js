import { handle, json, rateLimit, readJson, requireUser } from '../../../../lib/server/http.js';
import { assertModel, chat, parseCredentials } from '../../../../lib/server/ollama.js';

export const maxDuration = 90;

export const POST = handle(async (request) => {
  const userId = requireUser(request);
  rateLimit(`test:${userId}`, 5);
  const { key, model } = parseCredentials(await readJson(request, 2048));
  await assertModel(model);
  await chat({ key, model, messages: [{ role: 'user', content: 'Reply with OK.' }], maxTokens: 5 });
  return json({ ok: true });
});
