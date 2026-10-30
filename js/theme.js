import { store } from './store.js';
import { resolveTheme } from './utils.js';

const media = window.matchMedia?.('(prefers-color-scheme: dark)');

export function applyTheme(theme = store.get().settings.theme) {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#121512' : '#F6F1E7');
  window.dispatchEvent(new CustomEvent('theme:applied', { detail: resolved }));
}

export function initTheme() {
  applyTheme();
  media?.addEventListener?.('change', () => {
    if (store.get().settings.theme === 'auto') applyTheme('auto');
  });
}

export function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  store.setSettings({ theme: next });
  applyTheme(next);
  return next;
}
