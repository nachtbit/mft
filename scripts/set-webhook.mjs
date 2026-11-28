// Sets up the bot: the webhook, and a menu button that opens the app. Run on your own computer:
//   node --env-file=.env.local scripts/set-webhook.mjs
import { parseAllowedIds } from '../lib/server/telegramAuth.js';

const { BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, APP_URL, ALLOWED_IDS } = process.env;

if (!BOT_TOKEN || !/^[A-Za-z0-9_-]{32,256}$/.test(TELEGRAM_WEBHOOK_SECRET ?? '') || !APP_URL?.startsWith('https://')) {
  console.error('Set BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (32-256 of A-Z a-z 0-9 _ -) and APP_URL (https://).');
  process.exit(1);
}

async function telegram(method, body) {
  let result;
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    result = await response.json();
  } catch {
    // The error is not printed: the request URL contains the token.
    console.error('Could not reach Telegram.');
    process.exit(1);
  }
  if (!result.ok) {
    console.error(`Telegram refused ${method}: ${result.description}`);
    process.exit(1);
  }
  return result.result;
}

const url = new URL('/api/telegram', APP_URL).href;
await telegram('setWebhook', {
  url,
  secret_token: TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ['message'],
  drop_pending_updates: true,
});
console.log(`Webhook set to ${url}`);

const menuButton = { type: 'web_app', text: 'Open', web_app: { url: new URL(APP_URL).href } };

// Sets the button, then reads it back: an accepted request alone does not show what Telegram stored.
async function setMenuButton(label, chat) {
  await telegram('setChatMenuButton', { ...chat, menu_button: menuButton });
  const stored = await telegram('getChatMenuButton', chat);
  const ok = stored?.type === 'web_app';
  console.log(`${label}: ${ok ? `OK, "${stored.text}" opens the app` : `NOT set, Telegram reports "${stored?.type}"`}`);
  return ok;
}

await setMenuButton('Default menu button', {});

// Also set it in each allowed user's own chat. That user must have sent the bot a message before.
const users = [...parseAllowedIds(ALLOWED_IDS)];
if (!users.length) {
  console.error('ALLOWED_IDS is missing or invalid, so no chat could be set up.');
  process.exit(1);
}
let failed = 0;
for (const [index, id] of users.entries()) {
  if (!(await setMenuButton(`Chat of allowed user ${index + 1}`, { chat_id: Number(id) }))) failed++;
}
process.exitCode = failed ? 1 : 0;
