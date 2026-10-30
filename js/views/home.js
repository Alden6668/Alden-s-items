import { allBooks, CATEGORIES, categoryOf, getBook } from '../data.js';
import { store } from '../store.js';
import { icon } from '../icons.js';
import { bookCard, coverHTML, emptyState, ratingHTML, sectionHead } from '../ui.js';
import { escapeHtml, formatMinutes, greeting } from '../utils.js';

const durationBuckets = [
  { id: 'all', label: '全部时长' },
  { id: 'short', label: '5 分钟以内', test: (m) => m <= 5.2 },
  { id: 'medium', label: '5–6 分钟', test: (m) => m > 5.2 && m <= 5.8 },
  { id: 'long', label: '6 分钟以上', test: (m) => m > 5.8 },
];

const difficultyOptions = ['全部难度', '轻松', '适中', '进阶'];

function continueCards() {
  const progress = store.get().progress;
  const items = Object.entries(progress)
    .filter(([, value]) => value.percent > 0.01 && value.percent < 0.995)
    .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
    .slice(0, 3)
    .map(([id, value]) => ({ book: getBook(id), progress: value }))
    .filter((item) => item.book);
  if (!items.length) return '';
  return `
    <section class="continue-section reveal">
      ${sectionHead({
        eyebrow: '接着上次',
        title: '继续收听',
        subtitle: '你已经走了一段路，别让故事停在这里。',
      })}
      <div class="continue-grid">
        ${items
          .map(
            ({ book, progress: value }) => `
          <a class="continue-card" href="#/book/${book.id}/chapters">
            ${coverHTML(book, { size: 'sm' })}
            <div class="continue-card__body">
              <span class="continue-card__kicker">第 ${(value.sectionIndex ?? 0) + 1} 节 · ${Math.round(value.percent * 100)}%</span>
              <h3>${escapeHtml(book.title)}</h3>
              <p>${escapeHtml(book.oneLiner)}</p>
              <div class="continue-card__track"><span style="width:${Math.round(value.percent * 100)}%"></span></div>
            </div>
            <button class="continue-card__play" data-action="play-book" data-book-id="${book.id}" data-resume="true" aria-label="继续收听《${escapeHtml(book.title)}》">${icon('play', 18)}</button>
          </a>`,
          )
          .join('')}
      </div>
    </section>`;
}

export function renderHome() {
  const books = allBooks();
  const featured = getBook('atomic-habits') || books[0];
  const totalMinutes = Math.round(books.reduce((sum, book) => sum + book.listenMinutes, 0));
  const visibleCategories = CATEGORIES.filter(
    (category) => category.id !== 'imported' || books.some((book) => book.category === 'imported'),
  );
  const domainCount = CATEGORIES.filter(
    (category) => category.id !== 'imported' && books.some((book) => book.category === category.id),
  ).length;

  return `
    <div class="page page--home">
      <section class="hero">
        <div class="hero__copy">
          <p class="eyebrow"><span class="eyebrow__line"></span>${greeting()}，今天读点什么</p>
          <h1 class="hero__title">把书读薄，<br>把世界读<span class="mark">厚</span>。</h1>
          <p class="hero__lead">用一杯咖啡的时间，听完一本书的精华；<br class="desktop-only">再和导读员认真聊一聊你的想法。</p>
          <button class="hero-search" type="button" data-action="open-search">
            <span class="hero-search__icon">${icon('search', 20)}</span>
            <span class="hero-search__placeholder">搜索书名、作者，或在线找书</span>
            <kbd>⌘ K</kbd>
          </button>
          <div class="hero__tags">
            <span>正在流行</span>
            ${['原子习惯', '心流', '活着', '三体']
              .map(
                (term) =>
                  `<button type="button" data-search-term="${term}">${term}</button>`,
              )
              .join('')}
          </div>
          <div class="hero__stats">
            <span><strong>${books.length}</strong> 本精华</span>
            <span><strong>${domainCount}</strong> 个领域</span>
            <span><strong>${totalMinutes}</strong> 分钟精华</span>
          </div>
        </div>

        <div class="hero__visual">
          <div class="hero__sun" aria-hidden="true"></div>
          <div class="hero__card">
            <div class="hero__card-top">
              <span class="hero__card-label">${icon('sparkle', 13)} 今日精选</span>
              <span class="hero__card-no">SHIYE / 01</span>
            </div>
            <div class="hero__feature">
              <a class="hero__cover" href="#/book/${featured.id}" aria-label="打开《${escapeHtml(featured.title)}》">
                ${coverHTML(featured, { size: 'lg' })}
              </a>
              <div class="hero__feature-info">
                <span class="hero__category">${categoryOf(featured.category).name}</span>
                <h2>${escapeHtml(featured.title)}</h2>
                <p class="hero__author">${escapeHtml(featured.author)}</p>
                <p class="hero__quote">“${escapeHtml(featured.oneLiner)}”</p>
                <div class="hero__feature-actions">
                  <button class="btn btn--primary btn--sm" type="button" data-action="play-book" data-book-id="${featured.id}" data-resume="true">
                    ${icon('play', 15)} 听精华
                  </button>
                  <a class="text-link" href="#/book/${featured.id}">看解读 ${icon('arrow-right', 14)}</a>
                </div>
                <div class="hero__meta">${ratingHTML(featured)} <span>·</span> <span>${formatMinutes(featured.listenMinutes)}</span></div>
              </div>
            </div>
            <div class="hero__card-foot">
              <span>${icon('headphones', 13)} 适合通勤、散步与睡前</span>
              <span>每周更新</span>
            </div>
          </div>
          <div class="hero__note">
            <span class="hero__note-mark">“</span>
            <p>你不是缺少自律，<br>你只是没有设计环境。</p>
            <span class="hero__note-source">— 《原子习惯》导读</span>
          </div>
        </div>
      </section>

      <div class="feature-strip reveal">
        <div class="feature-strip__item"><span>${icon('headphones', 18)}</span><div><strong>精华听书</strong><small>自然人声 · 自动高亮</small></div></div>
        <div class="feature-strip__item"><span>${icon('message', 18)}</span><div><strong>AI 导读</strong><small>不是总结，是对话</small></div></div>
        <div class="feature-strip__item"><span>${icon('quote', 18)}</span><div><strong>金句笔记</strong><small>边听边留下想法</small></div></div>
        <div class="feature-strip__item"><span>${icon('library', 18)}</span><div><strong>严选书库</strong><small>${books.length} 本 · 持续更新</small></div></div>
      </div>

      ${continueCards()}

      <section class="library" id="library">
        ${sectionHead({
          eyebrow: 'THE LIBRARY',
          title: '全部精华',
          subtitle: '挑一本，先听 5 分钟，再决定要不要深读。',
          action: `<span class="section-head__count" id="library-count">${books.length} 本</span>`,
        })}

        <div class="filter-bar">
          <div class="filter-chips" role="group" aria-label="按领域筛选">
            <button class="filter-chip is-active" type="button" data-filter-category="all">全部 <span>${books.length}</span></button>
            ${visibleCategories.map((category) => {
              const count = books.filter((book) => book.category === category.id).length;
              return `<button class="filter-chip" type="button" data-filter-category="${category.id}">${category.name} <span>${count}</span></button>`;
            }).join('')}
          </div>
          <div class="filter-controls">
            <label class="select-wrap">
              <span class="sr-only">时长</span>
              <select id="filter-duration">
                ${durationBuckets.map((bucket) => `<option value="${bucket.id}">${bucket.label}</option>`).join('')}
              </select>
              ${icon('chevron-down', 14)}
            </label>
            <label class="select-wrap">
              <span class="sr-only">难度</span>
              <select id="filter-difficulty">
                ${difficultyOptions.map((option) => `<option value="${option === '全部难度' ? 'all' : option}">${option}</option>`).join('')}
              </select>
              ${icon('chevron-down', 14)}
            </label>
            <label class="select-wrap">
              <span class="sr-only">排序</span>
              <select id="filter-sort">
                <option value="featured">推荐排序</option>
                <option value="rating">评分最高</option>
                <option value="short">时长最短</option>
                <option value="new">出版较新</option>
              </select>
              ${icon('chevron-down', 14)}
            </label>
            <button class="filter-reset" id="filter-reset" type="button" hidden>重置</button>
          </div>
        </div>

        <div class="filter-summary" id="filter-summary" hidden>
          <span id="filter-summary-text"></span>
          <button type="button" id="filter-clear">清除筛选 ${icon('close', 12)}</button>
        </div>

        <div class="book-grid" id="book-grid"></div>
        <div class="empty-wrap" id="library-empty" hidden>
          ${emptyState({
            iconName: 'search',
            title: '没有找到合适的书',
            text: '换一个领域或时长试试，或者直接搜索书名。',
            action: '<button class="btn btn--ghost btn--sm" type="button" data-action="open-search">搜索全书库</button>',
          })}
        </div>
        <div class="import-invite reveal">
          <span class="import-invite__icon">${icon('book-open', 22)}</span>
          <div><strong>想读的书不在书库？</strong><p>导入你自己的 EPUB/TXT，或从公版书库找一本，让 AI 读完整理。</p></div>
          <a class="btn btn--ghost btn--sm" href="#/import">导入一本书 ${icon('arrow-right', 14)}</a>
        </div>
      </section>

      <section class="quote-band reveal">
        <div class="quote-band__inner">
          <span class="quote-band__mark">“</span>
          <p>我们读书，不是为了记住每一页，<br>而是为了让某一句话，在需要的时候回来。</p>
          <span class="quote-band__caption">拾页 · 写给每一个想读得少一点、懂得多一点的人</span>
        </div>
        <div class="quote-band__action">
          <span>今天想从哪本书开始？</span>
          <button class="btn btn--light btn--sm" type="button" data-action="open-search">去找一本书 ${icon('arrow-right', 14)}</button>
        </div>
      </section>
    </div>`;
}

export function initHome(root) {
  const grid = root.querySelector('#book-grid');
  const empty = root.querySelector('#library-empty');
  const count = root.querySelector('#library-count');
  const summary = root.querySelector('#filter-summary');
  const summaryText = root.querySelector('#filter-summary-text');
  const resetButton = root.querySelector('#filter-reset');
  const chips = Array.from(root.querySelectorAll('[data-filter-category]'));
  const durationSelect = root.querySelector('#filter-duration');
  const difficultySelect = root.querySelector('#filter-difficulty');
  const sortSelect = root.querySelector('#filter-sort');

  const state = { category: 'all', duration: 'all', difficulty: 'all', sort: 'featured' };

  const filtered = () => {
    let list = [...allBooks()];
    if (state.category !== 'all') list = list.filter((book) => book.category === state.category);
    const bucket = durationBuckets.find((item) => item.id === state.duration);
    if (bucket?.test) list = list.filter((book) => bucket.test(book.listenMinutes));
    if (state.difficulty !== 'all') list = list.filter((book) => book.difficulty === state.difficulty);
    switch (state.sort) {
      case 'rating':
        list.sort((a, b) => b.rating - a.rating);
        break;
      case 'short':
        list.sort((a, b) => a.listenMinutes - b.listenMinutes);
        break;
      case 'new':
        list.sort((a, b) => b.year - a.year);
        break;
      default:
        list.sort((a, b) => a.index - b.index);
    }
    return list;
  };

  const render = () => {
    const list = filtered();
    const favoriteSet = new Set(store.get().favorites);
    grid.innerHTML = list
      .map((book) =>
        bookCard(book, categoryOf(book.category), {
          favorite: favoriteSet.has(book.id),
          progress: store.getProgress(book.id)?.percent,
        }),
      )
      .join('');
    count.textContent = `${list.length} 本`;
    empty.hidden = list.length > 0;

    chips.forEach((chip) => {
      const active = chip.dataset.filterCategory === state.category;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', String(active));
    });

    const labels = [];
    if (state.category !== 'all') labels.push(categoryOf(state.category).name);
    if (state.duration !== 'all') labels.push(durationBuckets.find((item) => item.id === state.duration).label);
    if (state.difficulty !== 'all') labels.push(`难度 ${state.difficulty}`);
    const isFiltered = labels.length > 0 || state.sort !== 'featured';
    resetButton.hidden = !isFiltered;
    summary.hidden = !isFiltered;
    summaryText.textContent = labels.length
      ? `已筛选 ${list.length} 本 · ${labels.join(' · ')}`
      : `已按${sortSelect.options[sortSelect.selectedIndex].text}`;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    grid.querySelectorAll('.book-card').forEach((card, index) => {
      card.style.animationDelay = `${Math.min(index * 35, 280)}ms`;
      card.classList.add('card-in');
    });
  };

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      state.category = chip.dataset.filterCategory;
      render();
    });
  });
  durationSelect.addEventListener('change', () => {
    state.duration = durationSelect.value;
    render();
  });
  difficultySelect.addEventListener('change', () => {
    state.difficulty = difficultySelect.value;
    render();
  });
  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value;
    render();
  });
  const reset = () => {
    state.category = 'all';
    state.duration = 'all';
    state.difficulty = 'all';
    state.sort = 'featured';
    durationSelect.value = 'all';
    difficultySelect.value = 'all';
    sortSelect.value = 'featured';
    render();
  };
  resetButton.addEventListener('click', reset);
  root.querySelector('#filter-clear').addEventListener('click', reset);

  render();
}
