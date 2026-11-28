// Dates are "YYYY-MM-DD" strings in the user's local calendar. Arithmetic uses UTC
// so that daylight saving never shifts a day.
const pad = (n) => String(n).padStart(2, '0');
const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const toIso = (date) => date.toISOString().slice(0, 10);

export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function addDays(iso, n) {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + n);
  return toIso(date);
}

export const diffDays = (from, to) => Math.round((toDate(to) - toDate(from)) / 86_400_000);
export const weekday = (iso) => (toDate(iso).getUTCDay() + 6) % 7; // 0 = Monday

export function daysIn(month) {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

export function addMonths(month, n) {
  const [year, m] = month.split('-').map(Number);
  return toIso(new Date(Date.UTC(year, m - 1 + n, 1))).slice(0, 7);
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((name) => name.slice(0, 3));

export function greeting(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Good night';
}

export const shortDate = (iso) => `${Number(iso.slice(8))} ${SHORT[Number(iso.slice(5, 7)) - 1]}`;

export function whenLabel(iso, minutes, now = today()) {
  if (iso === now) return minutes >= 0 ? `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}` : 'Today';
  if (iso === addDays(now, -1)) return 'Yesterday';
  return shortDate(iso) + (iso.slice(0, 4) === now.slice(0, 4) ? '' : ` ${iso.slice(0, 4)}`);
}
