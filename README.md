# MFT

A Telegram Mini App for personal finance with an optional AI assistant. The interface is in English.

## Screens

- **Home:** balance, converted totals, income, expense and savings actions, recent entries.
- **Analytics:** week, month and year spending, limit, category chart, daily chart.
- **Savings:** savings goals, quick and monthly deposits, round-up and cashback.
- **Assistant:** score, subscriptions, forecast, weekend pattern and AI chat.
- **Profile button:** currencies, opening balances, limit, AI setup, backup, access check.

## Currencies

The app supports AZN, USD, TRY, EUR and GBP. AZN is the initial default. Settings hold one default
currency and any of the others as additional ones. Entries and custom savings amounts let you pick
among them.

- An entry keeps its own currency and amount. It also saves its value in the default currency of
  that moment, which history, limits and charts use.
- Total funds convert what you hold in each currency at the latest rate.
- Each savings goal has one currency. Amounts added in another are converted when you add them.
- Changing the default currency rewrites no stored amounts. Older values may then be converted at
  the latest rate.
- Saving in the default currency works without rates. Converting needs them.
- Currency exchange between your wallets is not a separate operation yet.

The app has no bank connection. Entries are typed in, savings are bookkeeping only (no money
moves), and cashback is entered by hand. Monthly deposits are recorded when the app is opened,
for the current month only. The score, forecast and patterns are simple calculations in
[lib/stats.js](lib/stats.js). Voice input uses the phone keyboard's dictation.

## How it works

- **Data:** Telegram CloudStorage, one separate ledger per Telegram account. There is no database.
- **App and API:** Next.js on Vercel.
- **AI:** Ollama Cloud, using each user's own API key, entered in Settings.
- **Bot:** replies to allowed users with a button that opens the app.

## Vercel variables

| Name | Value |
|---|---|
| `BOT_TOKEN` | Token from @BotFather |
| `ALLOWED_IDS` | Numeric Telegram user IDs, separated by commas |
| `TELEGRAM_WEBHOOK_SECRET` | Output of `openssl rand -hex 32` |
| `APP_URL` | Production URL, starting with `https://` |

Redeploy after changing them.

## Register the bot webhook

After deploying, put `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` and `APP_URL` in `.env.local`
(same values as Vercel), then run:

```bash
node --env-file=.env.local scripts/set-webhook.mjs
```

This discards bot messages that are still waiting. While a webhook is set, `getUpdates` does not work.

Set the menu button in @BotFather with `/setmenubutton`.

## Development

```bash
npm install
npm run dev
npm test
```

Outside Telegram, development mode keeps entries in `localStorage`. Production builds only run
inside Telegram. Use test data only in development.

## Security

- `/api/session`, `/api/ai/test` and `/api/chat` require signed Telegram `initData`, less than
  one hour old, from a user in `ALLOWED_IDS`. Missing or malformed settings refuse every request.
- The webhook requires Telegram's secret header and ignores everyone not in `ALLOWED_IDS`.
- The AI receives chat messages (limited in number and length), plus balance, limit, savings
  totals and monthly sums by category. Entry titles and goal names are not added. Anything typed
  into the chat is sent. The server writes the system prompt and only contacts `https://ollama.com`.
- The Ollama key is kept in Telegram SecureStorage, or in memory where that is unavailable.
  It passes through the server on AI requests. The app code does not store or log it.
- A Content Security Policy limits which scripts run and where the page can connect.
- Exchange rates come straight from [ExchangeRate-API](https://www.exchangerate-api.com) to the
  browser. It receives a currency code and, like any website, the device's IP address.

### Limits

- The page and `/api/ai/models` are public. They contain no user data.
- Rate limits are per server instance, so they are not a spending cap.
- The app does not encrypt ledger data. Do not assume CloudStorage is end-to-end encrypted.
- The app trusts Telegram's script, Telegram, Vercel, Ollama and its npm packages.
- Backups are unencrypted text. Keep them private.

## Credits

- Rates By [Exchange Rate API](https://www.exchangerate-api.com)
- Icons: Material Symbols by Google, Apache License 2.0
- Font: Inter

## License

MIT
