// Telegram webhook.
import { botReply } from '../../../lib/server/bot.js';
import { HttpError, handle, json, readJson } from '../../../lib/server/http.js';
import { parseAllowedIds, safeEqual } from '../../../lib/server/telegramAuth.js';

export const POST = handle(async (request) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  const allowed = parseAllowedIds(process.env.ALLOWED_IDS);
  if (secret.length < 32 || allowed.size === 0) {
    throw new HttpError(503, 'not_configured');
  }
  const given = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!safeEqual(given, secret)) throw new HttpError(401, 'unauthorized');

  const update = await readJson(request, 64 * 1024);
  return json(botReply(update, allowed) ?? { ok: true });
});
