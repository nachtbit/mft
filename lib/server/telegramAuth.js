// Server only. Validates Telegram Mini App initData and the user allowlist.
import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_AGE_SECONDS = 60 * 60;
const MAX_FUTURE_SECONDS = 60;
const MAX_INIT_DATA_LENGTH = 4096;

// Fails closed: one malformed entry disables the whole list.
export function parseAllowedIds(value) {
  const parts = (value ?? '').split(',').map((part) => part.trim());
  return parts.every((part) => /^[1-9]\d{0,19}$/.test(part)) ? new Set(parts) : new Set();
}

export function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Returns the user ID as a string, or null.
export function verifyInitData(initData, botToken, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!botToken || typeof initData !== 'string') return null;
  if (!initData || initData.length > MAX_INIT_DATA_LENGTH) return null;

  const params = new URLSearchParams(initData);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) return null;

  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;

  const checkString = keys
    .filter((key) => key !== 'hash')
    .sort()
    .map((key) => `${key}=${params.get(key)}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(checkString).digest('hex');
  if (!safeEqual(expected, hash)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate)) return null;
  const age = nowSeconds - authDate;
  if (age > MAX_AGE_SECONDS || age < -MAX_FUTURE_SECONDS) return null;

  try {
    const { id } = JSON.parse(params.get('user'));
    return Number.isSafeInteger(id) && id > 0 ? String(id) : null;
  } catch {
    return null;
  }
}
