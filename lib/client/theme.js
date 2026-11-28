// The choice is saved with the ledger. A copy in this browser avoids a light flash on start.
import { webApp } from './telegram.js';

const CACHE = 'mft-theme';

export function cachedTheme() {
  try {
    return localStorage.getItem(CACHE) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(CACHE, theme);
  } catch {
    // Only the early paint depends on this.
  }
  // Match Telegram's own bars to the app.
  const app = webApp();
  if (!app?.initData) return;
  const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  app.setHeaderColor(color);
  app.setBackgroundColor(color);
  if (app.isVersionAtLeast('7.10')) app.setBottomBarColor(color);
}
