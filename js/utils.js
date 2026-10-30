export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export const escapeAttr = escapeHtml;

export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function formatMinutes(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return '';
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded >= 60) {
    const h = Math.floor(rounded / 60);
    const m = rounded % 60;
    return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
  }
  return `${rounded} 分钟`;
}

export function formatCount(count) {
  if (count >= 10000) return `${(count / 10000).toFixed(1).replace('.0', '')} 万人评分`;
  return `${count.toLocaleString('zh-CN')} 人评分`;
}

export function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 2 * day) return '昨天';
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 19) return '下午好';
  return '晚上好';
}

export function highlight(text, query) {
  const safe = escapeHtml(text);
  const q = query.trim();
  if (!q) return safe;
  const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(`(${escapedQuery})`, 'gi'), '<mark>$1</mark>');
}

export function snippet(text, query, radius = 48) {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return escapeHtml(text.slice(0, radius * 2)) + (text.length > radius * 2 ? '…' : '');
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + query.length + radius);
  return (
    (start > 0 ? '…' : '') +
    highlight(text.slice(start, end), query) +
    (end < text.length ? '…' : '')
  );
}

export function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function renderMarkdown(text = '') {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const blocks = [];
  let list = null;
  let listType = '';
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${inlineMarkdown(paragraph.join('<br>'))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push(`<${listType}>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</${listType}>`);
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const bullet = line.match(/^[-•·]\s+(.*)$/);
    const ordered = line.match(/^\d+[.、)]\s+(.*)$/);
    if (bullet || ordered) {
      flushParagraph();
      const type = bullet ? 'ul' : 'ol';
      if (list && listType !== type) flushList();
      listType = type;
      list = list || [];
      list.push((bullet || ordered)[1]);
      continue;
    }
    flushList();
    if (line.startsWith('#')) {
      flushParagraph();
      blocks.push(`<p class="md-heading">${inlineMarkdown(line.replace(/^#+\s*/, ''))}</p>`);
    } else if (line.startsWith('>')) {
      flushParagraph();
      blocks.push(`<blockquote>${inlineMarkdown(line.replace(/^>\s?/, ''))}</blockquote>`);
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks.join('');
}

export function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (!hash) return { name: 'home', parts: [] };
  const parts = hash.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'book' && parts[1]) {
    return { name: 'book', id: parts[1], tab: parts[2] || 'ideas', parts };
  }
  if (parts[0] === 'shelf') return { name: 'shelf', parts };
  if (parts[0] === 'import') return { name: 'import', query: parts[1] || '', parts };
  return { name: 'home', parts };
}

export const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function observeReveals(root = document) {
  const items = $$('.reveal', root);
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
  );
  items.forEach((el) => observer.observe(el));
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
  return Promise.resolve();
}

export function resolveTheme(theme) {
  if (theme === 'dark' || theme === 'light') return theme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function estimateVoiceMinutes(chars, rate = 1) {
  return Math.max(1, Math.round(chars / 245 / rate));
}
