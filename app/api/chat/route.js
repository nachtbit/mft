import { buildMessages, parseSnapshot, parseTurns } from '../../../lib/server/assistant.js';
import { HttpError, handle, json, rateLimit, readJson, requireUser } from '../../../lib/server/http.js';
import { assertModel, chat, parseCredentials } from '../../../lib/server/ollama.js';

export const maxDuration = 90;

export const POST = handle(async (request) => {
  const userId = requireUser(request);
  rateLimit(`chat:${userId}`, 10);
  // Eight turns of non-Latin text can take about 40 KB.
  const body = await readJson(request, 64 * 1024);
  const { key, model } = parseCredentials(body);
  const messages = buildMessages(parseSnapshot(body.data), parseTurns(body.messages));
  await assertModel(model);
  // Room for models that think even when asked not to.
  const reply = await chat({ key, model, messages, maxTokens: 1500 });
  if (!reply) throw new HttpError(502, 'ai_empty');
  return json({ reply: reply.slice(0, 4000) });
});
