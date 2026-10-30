import { allBooks, CATEGORIES, categoryOf, searchBooks } from './data.js';
import { icon } from './icons.js';
import { coverHTML } from './ui.js';
import { escapeHtml, highlight, snippet } from './utils.js';

const RECENT_KEY = 'shiye.recent.v1';
let overlay = null;
let previousFocus = null;
let onlineTimer = null;
let onlineAbort = null;
let onlineToken = 0;

const getRecent = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(saved) ? saved.slice(0, 6) : [];
  } catch {
    return [];
  }
};

const addRecent = (term) => {
  const clean = String(term || '').trim();
  if (!clean) return;
  const next = [clean, ...getRecent().filter((item) => item !== clean)].slice(0, 6);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
};

function defaultBody() {
  const recent = getRecent();
  const books = allBooks();
  const categories = CATEGORIES.filter(
    (category) => category.id !== 'imported' || books.some((book) => book.category === 'imported'),
  );
  const picks = ['atomic-habits', 'flow', 'to-live', 'three-body']
    .map((id) => books.find((book) => book.id === id))
    .filter(Boolean);
  return `
    <section class="search-online-callout">
      <span class="search-online-callout__icon">${icon('globe', 18)}</span>
      <div>
        <strong>输入书名，同时搜索在线书库</strong>
        <p>豆瓣读书 · 古登堡计划 · Google Books · Open Library，找不到本地的书也不用换页面。</p>
      </div>
    </section>
    ${
      recent.length
        ? `<section class="search-block">
            <div class="search-block__head"><span>最近搜索</span><button type="button" data-clear-recent>清除</button></div>
            <div class="search-chips">
              ${recent.map((term) => `<button type="button" data-search-chip="${escapeHtml(term)}">${icon('clock', 13)} ${escapeHtml(term)}</button>`).join('')}
            </div>
          </section>`
        : ''
    }
    <section class="search-block">
      <div class="search-block__head"><span>按领域浏览</span><span>${books.length} 本精华</span></div>
      <div class="search-categories">
        ${categories.map(
          (category) => `<button type="button" data-search-category="${category.name}">
            <span class="cat-dot" style="--dot:${category.color}"></span>
            ${category.name}
            <em>${books.filter((book) => book.category === category.id).length}</em>
          </button>`,
        ).join('')}
      </div>
    </section>
    <section class="search-block">
      <div class="search-block__head"><span>不妨从这里开始</span><span>编辑推荐</span></div>
      <div class="search-picks">
        ${picks
          .map(
            (book) => `<a class="search-pick" href="#/book/${book.id}" data-search-result>
              ${coverHTML(book, { size: 'xxs' })}
              <div><strong>${escapeHtml(book.title)}</strong><span>${escapeHtml(book.oneLiner)}</span></div>
            </a>`,
          )
          .join('')}
      </div>
    </section>
    <button class="search-online search-online--quiet" type="button" data-search-online="">
      <span>${icon('plus', 15)} 书库里没有？</span>
      <span>导入自己的电子书，或让 AI 按书名解读</span>
      ${icon('arrow-right', 15)}
    </button>`;
}

function localResultsHTML(results, query) {
  if (!results.length) {
    return `<div class="search-local-empty">${icon('library', 15)} 本地书库里没有「${escapeHtml(query)}」，正在在线书库中查找。</div>`;
  }
  return `
    <div class="search-result-meta"><span>本地找到 <strong>${results.length}</strong> 本精华</span><span>按相关度排序</span></div>
    <div class="search-results" role="listbox" aria-label="本地搜索结果">
      ${results
        .map((book, index) => {
          const matchedIdea = book.keyIdeas.find(
            (idea) => idea.title.includes(query) || idea.body.includes(query),
          );
          const sourceText = matchedIdea ? matchedIdea.body : book.intro;
          return `<a class="search-result ${index === 0 ? 'is-selected' : ''}" href="#/book/${book.id}" role="option" data-search-result data-index="${index}" aria-selected="${index === 0}">
            ${coverHTML(book, { size: 'xxs' })}
            <div class="search-result__body">
              <div class="search-result__top">
                <h3>${highlight(book.title, query)}</h3>
                <span>${categoryOf(book.category).name}</span>
              </div>
              <p class="search-result__by">${highlight(book.author, query)} · ${book.rating ? `${book.rating.toFixed(1)} 分` : 'AI 导入解读'}</p>
              <p class="search-result__snippet">${snippet(sourceText, query, 50)}</p>
            </div>
            <span class="search-result__arrow">${icon('arrow-up-right', 16)}</span>
          </a>`;
        })
        .join('')}
    </div>`;
}

function renderOnlineResults(block, results, query) {
  if (!results.length) {
    block.innerHTML = `
      <div class="search-online-head"><span>${icon('globe', 13)} 在线书库</span><span>没有找到匹配项</span></div>
      <div class="search-online-empty">
        <p>在线书库也没有找到「${escapeHtml(query)}」。</p>
        <a class="btn btn--ghost btn--sm" href="#/import/${encodeURIComponent(query)}" data-online-result>${icon('sparkle', 13)} 直接用书名让 AI 解读</a>
      </div>`;
    block.querySelectorAll('[data-online-result]').forEach((link) => {
      link.addEventListener('click', () => closeSearch());
    });
    return;
  }
  block.innerHTML = `
    <div class="search-online-head"><span>${icon('globe', 13)} 在线书库</span><span>${results.length} 本 · 豆瓣 / 古登堡 / Google Books / Open Library</span></div>
    <div class="search-online-results">
      ${results
        .map(
          (result) => `<a class="search-online-result" href="#/import/${encodeURIComponent(result.title || query)}" data-online-result>
            <span class="search-online-result__orbit">${escapeHtml((result.title || '书').slice(0, 1))}</span>
            <div class="search-online-result__body">
              <div class="search-online-result__top">
                <strong>${highlight(result.title || '未命名', query)}</strong>
                <span class="search-online-result__source">${escapeHtml(result.sourceLabel || '在线书库')}</span>
              </div>
              <p>${escapeHtml(result.author || '作者未知')}${result.year ? ` · ${escapeHtml(String(result.year))}` : ''}</p>
              <small>${escapeHtml(result.description || (result.subjects || []).slice(0, 3).join(' · ') || '公开书目信息')}</small>
            </div>
            <span class="search-online-result__tag">${result.hasFullText ? '公版全文' : result.source === 'douban' ? '书目信息' : '公开简介'}</span>
            ${icon('chevron-right', 15)}
          </a>`,
        )
        .join('')}
    </div>
    <a class="search-online-more" href="#/import/${encodeURIComponent(query)}" data-online-result>在完整找书页查看全部 ${icon('arrow-right', 13)}</a>`;
  block.querySelectorAll('[data-online-result]').forEach((link) => {
    link.addEventListener('click', () => {
      addRecent(query);
      closeSearch();
    });
  });
}

function loadOnlineResults(query, dialog) {
  clearTimeout(onlineTimer);
  onlineAbort?.abort();
  onlineToken += 1;
  const token = onlineToken;
  const block = dialog.querySelector('#search-online-block');
  if (!block) return;
  if (!query.trim()) {
    block.innerHTML = '';
    return;
  }
  block.innerHTML = `<div class="search-online-head"><span>${icon('globe', 13)} 在线书库</span><span>同时搜索中</span></div><div class="search-online-loading"><span class="spinner"></span><p>正在豆瓣、古登堡、Google Books 和 Open Library 中找…</p></div>`;
  onlineTimer = setTimeout(async () => {
    const controller = new AbortController();
    onlineAbort = controller;
    try {
      const response = await fetch(`/api/catalog?q=${encodeURIComponent(query)}`, { signal: controller.signal });
      let data = {};
      try { data = await response.json(); } catch {}
      if (token !== onlineToken) return;
      if (!dialog.isConnected || dialog.querySelector('#search-input')?.value.trim() !== query) return;
      if (!response.ok) throw new Error(data.error?.message || '在线书库暂时不可用。');
      renderOnlineResults(block, data.results || [], query);
    } catch (error) {
      if (error.name === 'AbortError' || token !== onlineToken) return;
      block.innerHTML = `
        <div class="search-online-head"><span>${icon('globe', 13)} 在线书库</span><span>连接失败</span></div>
        <div class="search-online-empty">
          <p>${escapeHtml(error.message || '在线书库暂时连不上。')}</p>
          <a class="btn btn--ghost btn--sm" href="#/import/${encodeURIComponent(query)}" data-online-result>${icon('sparkle', 13)} 用书名让 AI 解读</a>
        </div>`;
      block.querySelectorAll('[data-online-result]').forEach((link) => {
        link.addEventListener('click', () => closeSearch());
      });
    }
  }, 350);
}

function renderResults(query, dialog) {
  const body = dialog.querySelector('#search-body');
  const results = searchBooks(query);
  body.innerHTML = `${localResultsHTML(results, query)}
    <section class="search-online-block" id="search-online-block" aria-live="polite"></section>`;
  bindResultActions(dialog);
  loadOnlineResults(query, dialog);
}

function bindResultActions(dialog) {
  dialog.querySelectorAll('[data-search-result]').forEach((link) => {
    link.addEventListener('click', () => {
      const input = dialog.querySelector('#search-input');
      addRecent(input.value);
      closeSearch();
    });
  });
  dialog.querySelectorAll('[data-search-online]').forEach((button) => {
    button.addEventListener('click', () => {
      const term = button.dataset.searchOnline || dialog.querySelector('#search-input')?.value || '';
      closeSearch();
      location.hash = term ? `#/import/${encodeURIComponent(term)}` : '#/import';
    });
  });
}

function bindBody(dialog) {
  dialog.querySelectorAll('[data-search-chip]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = dialog.querySelector('#search-input');
      input.value = button.dataset.searchChip;
      input.focus();
      input.dispatchEvent(new Event('input'));
    });
  });
  dialog.querySelectorAll('[data-search-category]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = dialog.querySelector('#search-input');
      input.value = button.dataset.searchCategory;
      input.focus();
      input.dispatchEvent(new Event('input'));
    });
  });
  dialog.querySelector('[data-clear-recent]')?.addEventListener('click', () => {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {}
    dialog.querySelector('#search-body').innerHTML = defaultBody();
    bindBody(dialog);
  });
  bindResultActions(dialog);
}

function updateSelection(dialog, direction) {
  const items = Array.from(dialog.querySelectorAll('.search-result'));
  if (!items.length) return;
  let index = items.findIndex((item) => item.classList.contains('is-selected'));
  index = index < 0 ? 0 : index;
  index = (index + direction + items.length) % items.length;
  items.forEach((item, itemIndex) => {
    const selected = itemIndex === index;
    item.classList.toggle('is-selected', selected);
    item.setAttribute('aria-selected', String(selected));
  });
  items[index].scrollIntoView({ block: 'nearest' });
}

export function openSearch(initialQuery = '') {
  if (overlay) {
    const input = overlay.querySelector('#search-input');
    if (initialQuery) {
      input.value = initialQuery;
      input.dispatchEvent(new Event('input'));
    }
    input.focus();
    return;
  }
  previousFocus = document.activeElement;
  overlay = document.createElement('div');
  overlay.className = 'search-overlay';
  overlay.innerHTML = `
    <div class="search-backdrop" data-close-search></div>
    <div class="search-dialog" role="dialog" aria-modal="true" aria-label="搜索书库">
      <div class="search-bar">
        <span class="search-bar__icon">${icon('search', 20)}</span>
        <input id="search-input" type="text" autocomplete="off" spellcheck="false" placeholder="搜索书名、作者，同时查在线书库…" aria-label="搜索书名、作者，同时查在线书库" value="${escapeHtml(initialQuery)}">
        <button class="search-bar__clear" type="button" aria-label="清空" hidden>${icon('close', 16)}</button>
        <kbd>ESC</kbd>
      </div>
      <div class="search-body" id="search-body"></div>
      <div class="search-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> 选择 <kbd>↵</kbd> 打开</span>
        <span>${icon('globe', 12)} 本地没有，就去在线书库</span>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('has-search');
  requestAnimationFrame(() => overlay.classList.add('is-visible'));

  const dialog = overlay.querySelector('.search-dialog');
  const input = overlay.querySelector('#search-input');
  const body = overlay.querySelector('#search-body');
  const clear = overlay.querySelector('.search-bar__clear');
  body.innerHTML = defaultBody();
  bindBody(dialog);

  const render = () => {
    const query = input.value.trim();
    clear.hidden = !query;
    if (!query) {
      cancelOnline();
      body.innerHTML = defaultBody();
      bindBody(dialog);
    } else {
      renderResults(query, dialog);
    }
  };

  input.addEventListener('input', render);
  clear.addEventListener('click', () => {
    input.value = '';
    input.focus();
    render();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (input.value.trim()) updateSelection(dialog, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (input.value.trim()) updateSelection(dialog, -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = dialog.querySelector('.search-result.is-selected') || dialog.querySelector('.search-result');
      const online = dialog.querySelector('.search-online-result');
      const target = selected || online;
      const term = input.value.trim();
      if (target) {
        addRecent(term);
        location.hash = target.getAttribute('href');
        closeSearch();
      } else if (term) {
        addRecent(term);
        location.hash = `#/import/${encodeURIComponent(term)}`;
        closeSearch();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeSearch();
    }
  });
  overlay.addEventListener('mousedown', (event) => {
    if (event.target.closest('[data-close-search]')) closeSearch();
  });
  document.addEventListener('keydown', onGlobalKey);
  setTimeout(() => input.focus(), 40);
  if (initialQuery) render();
}

function onGlobalKey(event) {
  if (event.key === 'Escape') closeSearch();
}

function cancelOnline() {
  clearTimeout(onlineTimer);
  onlineTimer = null;
  onlineAbort?.abort();
  onlineAbort = null;
  onlineToken += 1;
}

export function closeSearch() {
  if (!overlay) return;
  cancelOnline();
  const current = overlay;
  overlay = null;
  document.removeEventListener('keydown', onGlobalKey);
  document.body.classList.remove('has-search');
  current.classList.remove('is-visible');
  setTimeout(() => current.remove(), 180);
  previousFocus?.focus?.();
}
