// Registers the bot webhook. Run on your own computer:
//   node --env-file=.env.local scripts/set-webhook.mjs
const { BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, APP_URL } = process.env;

if (!BOT_TOKEN || !/^[A-Za-z0-9_-]{32,256}$/.test(TELEGRAM_WEBHOOK_SECRET ?? '') || !APP_URL?.startsWith('https://')) {
  console.error('Set BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (32-256 of A-Z a-z 0-9 _ -) and APP_URL (https://).');
  process.exit(1);
}

const url = new URL('/api/telegram', APP_URL).href;
try {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      secret_token: TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message'],
      drop_pending_updates: true,
    }),
  });
  const result = await response.json();
  console.log(result.ok ? `Webhook set to ${url}` : `Telegram refused: ${result.description}`);
  process.exitCode = result.ok ? 0 : 1;
} catch {
  // The error is not printed: the request URL contains the token.
  console.error('Could not reach Telegram.');
  process.exitCode = 1;
}
