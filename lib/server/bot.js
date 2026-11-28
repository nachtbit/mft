// Server only. Bot logic. The reply is returned in the webhook response itself,
// so this code never needs to call Telegram with the bot token.
export function botReply(update, allowed, appUrl) {
  const message = update?.message;
  if (!message || message.chat?.type !== 'private') return null;
  // Strangers get no reply at all.
  if (!allowed.has(String(message.from?.id)) || message.chat.id !== message.from.id) return null;

  const command = typeof message.text === 'string' ? message.text.split(/[\s@]/)[0] : '';
  const text =
    command === '/start'
      ? 'Welcome to MFT. Open the app to track your finances.'
      : command === '/help'
        ? 'Use the button below. Entries are added in the app, not in this chat.'
        : 'Open MFT to add or view your entries.';

  return {
    method: 'sendMessage',
    chat_id: message.chat.id,
    text,
    reply_markup: { inline_keyboard: [[{ text: 'Open MFT', web_app: { url: appUrl } }]] },
  };
}
