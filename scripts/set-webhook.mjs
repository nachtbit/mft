// Sets up the bot: the webhook, and a menu button that opens the app. Run on your own computer:
//   node --env-file=.env.local scripts/set-webhook.mjs
const { BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, APP_URL } = process.env;

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
}

const url = new URL('/api/telegram', APP_URL).href;
await telegram('setWebhook', {
  url,
  secret_token: TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ['message'],
  drop_pending_updates: true,
});
console.log(`Webhook set to ${url}`);

// Without chat_id this sets the default menu button of every private chat with the bot.
await telegram('setChatMenuButton', {
  menu_button: { type: 'web_app', text: 'Open', web_app: { url: new URL(APP_URL).href } },
});
console.log('Menu button set: "Open" now opens the app.');
