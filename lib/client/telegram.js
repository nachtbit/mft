// Browser only. Access window.Telegram only inside these functions.
const TIMEOUT_MS = 15_000;

export const webApp = () => window.Telegram?.WebApp;

export function insideTelegram() {
  const app = webApp();
  return Boolean(app?.initData && app.isVersionAtLeast('6.9'));
}

// Turns Telegram's (error, result) callbacks into a promise that cannot hang.
export function call(run, timeout = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Telegram did not respond.')), timeout);
    try {
      run((error, ...results) => {
        clearTimeout(timer);
        if (error) reject(new Error(String(error)));
        else resolve(results);
      });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

function cloudBackend() {
  const cloud = webApp().CloudStorage;
  const one = async (run) => (await call(run))[0];
  return {
    getKeys: () => one((cb) => cloud.getKeys(cb)),
    getItems: (keys) => one((cb) => cloud.getItems(keys, cb)),
    setItem: async (key, value) => {
      if (!(await one((cb) => cloud.setItem(key, value, cb)))) throw new Error('Not saved.');
    },
    removeItem: async (key) => {
      if (!(await one((cb) => cloud.removeItem(key, cb)))) throw new Error('Not removed.');
    },
  };
}

// For development outside Telegram only.
function localBackend() {
  const P = 'mft-dev:';
  return {
    getKeys: async () =>
      Object.keys(localStorage).filter((k) => k.startsWith(P)).map((k) => k.slice(P.length)),
    getItems: async (keys) =>
      Object.fromEntries(keys.map((k) => [k, localStorage.getItem(P + k) ?? ''])),
    setItem: async (key, value) => localStorage.setItem(P + key, value),
    removeItem: async (key) => localStorage.removeItem(P + key),
  };
}

// Returns null when the app is opened somewhere it cannot store data safely.
export function createBackend() {
  if (insideTelegram()) return cloudBackend();
  return process.env.NODE_ENV === 'development' ? localBackend() : null;
}

export function confirmAction(message) {
  const app = webApp();
  if (app?.initData && app.isVersionAtLeast('6.2')) {
    return new Promise((resolve) => app.showConfirm(message, resolve));
  }
  return Promise.resolve(window.confirm(message));
}
