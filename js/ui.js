import { icon } from './icons.js';
import { escapeHtml, formatCount, formatMinutes } from './utils.js';

export function coverHTML(book, options = {}) {
  const size = options.size || 'md';
  const extra = options.className || '';
  return `
    <div class="cover cover--${size} ${extra}" style="--cover-a:${book.cover.a};--cover-b:${book.cover.b};--cover-ink:${book.cover.ink}" role="img" aria-label="《${escapeHtml(book.title)}》封面">
      <span class="cover__spine" aria-hidden="true"></span>
      <span class="cover__grain" aria-hidden="true"></span>
      <span class="cover__top"><span>拾页</span><span>SHIYE · ${book.cover.no}</span></span>
      <span class="cover__motif motif--${book.cover.motif}" aria-hidden="true"></span>
      <span class="cover__content">
        <span class="cover__en">${escapeHtml(book.enTitle)}</span>
        <span class="cover__title">${escapeHtml(book.title)}</span>
        <span class="cover__rule" aria-hidden="true"></span>
        <span class="cover__author">${escapeHtml(book.author)}</span>
      </span>
      <span class="cover__seal">精华</span>
    </div>`;
}

export function ratingHTML(book, { compact = false } = {}) {
  if (!book.rating) {
    return `<span class="rating rating--ai">${icon('sparkle', compact ? 11 : 13)} <span>AI 解读</span></span>`;
  }
  return `<span class="rating" title="${formatCount(book.ratings)}">
    ${icon('star', compact ? 12 : 14, 'rating__star')}
    <span>${book.rating.toFixed(1)}</span>
    ${compact ? '' : `<span class="rating__count">${formatCount(book.ratings)}</span>`}
  </span>`;
}

export function bookCard(book, category, options = {}) {
  const progress = options.progress;
  return `
    <article class="book-card reveal" data-book-card="${book.id}">
      <a class="book-card__cover-link" href="#/book/${book.id}" aria-label="打开《${escapeHtml(book.title)}》">
        ${coverHTML(book, { size: 'md' })}
        <span class="book-card__play" data-action="play-book" data-book-id="${book.id}" role="button" tabindex="0" aria-label="播放《${escapeHtml(book.title)}》">
          ${icon('play', 18)}
          <span>听精华</span>
        </span>
        <button class="book-card__fav ${options.favorite ? 'is-active' : ''}" data-action="toggle-fav" data-book-id="${book.id}" aria-label="${options.favorite ? '取消收藏' : '收藏'}" aria-pressed="${options.favorite ? 'true' : 'false'}">
          ${icon(options.favorite ? 'heart-filled' : 'heart', 17)}
        </button>
        ${progress ? `<span class="book-card__progress"><span style="width:${Math.round(progress * 100)}%"></span></span>` : ''}
      </a>
      <div class="book-card__body">
        <div class="book-card__kicker">
          <span class="cat-dot" style="--dot:${category.color}"></span>
          <span>${category.name}</span>
          <span class="book-card__rating">${book.rating ? `${icon('star', 11)} ${book.rating.toFixed(1)}` : `${icon('sparkle', 11)} AI`}</span>
        </div>
        <h3 class="book-card__title"><a href="#/book/${book.id}">${escapeHtml(book.title)}</a></h3>
        <p class="book-card__author">${escapeHtml(book.author)}</p>
        <p class="book-card__line">${escapeHtml(book.oneLiner)}</p>
        <div class="book-card__meta">
          <span>${icon('headphones', 13)} ${formatMinutes(book.listenMinutes)}</span>
          <span class="book-card__difficulty">${escapeHtml(book.difficulty)}</span>
        </div>
      </div>
    </article>`;
}

export function progressRing(percent = 0, size = 44, stroke = 3) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(1, percent)));
  return `<span class="progress-ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    <span class="progress-ring__label">${Math.round(percent * 100) > 0 ? `${Math.round(percent * 100)}%` : ''}</span>
  </span>`;
}

export function sectionHead({ eyebrow, title, subtitle, action, align = 'left' }) {
  return `<header class="section-head section-head--${align}">
    <div>
      ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}
      <h2 class="section-head__title">${title}</h2>
      ${subtitle ? `<p class="section-head__sub">${subtitle}</p>` : ''}
    </div>
    ${action || ''}
  </header>`;
}

export function emptyState({ iconName = 'book-open', title, text, action = '' }) {
  return `<div class="empty-state">
    <span class="empty-state__icon">${icon(iconName, 26)}</span>
    <h3>${title}</h3>
    <p>${text}</p>
    ${action}
  </div>`;
}

let toastTimer = null;

export function toast(message, options = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  root.innerHTML = '';
  const el = document.createElement('div');
  el.className = `toast toast--${options.type || 'default'}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <span class="toast__icon">${icon(options.icon || (options.type === 'error' ? 'alert' : 'check'), 16)}</span>
    <span class="toast__text">${escapeHtml(message)}</span>
    ${options.actionLabel ? `<button class="toast__action" type="button">${escapeHtml(options.actionLabel)}</button>` : ''}
  `;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  const action = el.querySelector('.toast__action');
  action?.addEventListener('click', () => {
    options.onAction?.();
    dismiss();
  });
  const dismiss = () => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 220);
    clearTimeout(toastTimer);
  };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(dismiss, options.duration || 2800);
}

let activeModal = null;

export function openModal({ title, subtitle, content, footer = '', className = '', onMount, onClose }) {
  closeModal(true);
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal ${className}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || '对话框')}">
      <div class="modal__head">
        <div>
          ${title ? `<h2 class="modal__title">${title}</h2>` : ''}
          ${subtitle ? `<p class="modal__subtitle">${subtitle}</p>` : ''}
        </div>
        <button class="icon-btn modal__close" type="button" aria-label="关闭">${icon('close', 20)}</button>
      </div>
      <div class="modal__body">${content}</div>
      ${footer ? `<div class="modal__footer">${footer}</div>` : ''}
    </div>`;
  root.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-visible'));
  document.body.classList.add('has-modal');

  const previousFocus = document.activeElement;
  const close = () => {
    overlay.classList.remove('is-visible');
    document.body.classList.remove('has-modal');
    setTimeout(() => overlay.remove(), 200);
    document.removeEventListener('keydown', onKeyDown);
    activeModal = null;
    previousFocus?.focus?.();
    onClose?.();
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = overlay.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKeyDown);
  activeModal = { overlay, close };
  setTimeout(() => {
    const target = overlay.querySelector('[autofocus], input, textarea, select, button:not(.modal__close)');
    target?.focus?.();
    onMount?.(overlay, close);
  }, 60);
  return { overlay, close };
}

export function closeModal(immediate = false) {
  if (!activeModal) return;
  if (immediate) {
    activeModal.overlay.remove();
    document.body.classList.remove('has-modal');
    activeModal = null;
  } else {
    activeModal.close();
  }
}

export function settingsRow(label, hint, control) {
  return `<div class="setting-row">
    <div class="setting-row__text">
      <span class="setting-row__label">${label}</span>
      ${hint ? `<span class="setting-row__hint">${hint}</span>` : ''}
    </div>
    <div class="setting-row__control">${control}</div>
  </div>`;
}

export function categoryPill(category) {
  return `<span class="category-pill" style="--pill:${category.color};--pill-tint:${category.tint}">${category.name}</span>`;
}
