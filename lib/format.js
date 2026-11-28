import { CURRENCY_INFO } from './categories.js';

const SPACE = ' ';

// 34820000 -> "348,200". Cents show only when present.
export function number(cents) {
  const abs = Math.abs(Math.round(cents));
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+$)/g, ',');
  const rest = abs % 100 ? `.${String(abs % 100).padStart(2, '0')}` : '';
  return `${cents < 0 ? '−' : ''}${whole}${rest}`;
}

export const money = (cents, currency) => `${number(cents)}${SPACE}${CURRENCY_INFO[currency].symbol}`;
export const percent = (value) => `${Math.round(value * 10) / 10}%`;
