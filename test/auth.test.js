import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { parseAllowedIds, verifyInitData } from '../lib/server/telegramAuth.js';

// Fake values, for tests only.
const TOKEN = '123456:TEST-TOKEN';
const NOW = 1_800_000_000;

function sign(fields, token = TOKEN) {
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
const fields = (extra = {}) => ({ auth_date: String(NOW), user: '{"id":111}', signature: 'abc', ...extra });

test('accepts correctly signed data', () => {
  assert.equal(verifyInitData(sign(fields()), TOKEN, NOW), '111');
});

test('rejects tampering, wrong token, bad age and malformed data', () => {
  const good = sign(fields());
  const bad = [
    good.replace('111', '222'),
    sign(fields(), '999:OTHER'),
    sign(fields({ auth_date: String(NOW - 3601) })),
    sign(fields({ auth_date: String(NOW + 61) })),
    sign(fields({ user: 'not json' })),
    sign(fields({ user: '{"id":"111"}' })),
    `${good}&user=%7B%22id%22%3A222%7D`,
    good.replace(/&?hash=[0-9a-f]+/, ''),
    '',
    null,
    'x'.repeat(5000),
  ];
  for (const data of bad) assert.equal(verifyInitData(data, TOKEN, NOW), null, String(data).slice(0, 80));
  assert.equal(verifyInitData(good, '', NOW), null);
});

test('allowlist fails closed', () => {
  assert.deepEqual([...parseAllowedIds('111, 222')], ['111', '222']);
  for (const value of [undefined, '', '111,', '111,abc', '*', '-1']) {
    assert.equal(parseAllowedIds(value).size, 0, String(value));
  }
});
