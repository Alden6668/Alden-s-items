import { categoryOf, getBook } from '../data.js';
import { store } from '../store.js';
import { icon } from '../icons.js';
import { coverHTML, ratingHTML } from '../ui.js';
import {
  escapeHtml,
  formatMinutes,
  timeAgo,
} from '../utils.js';
import { chatHTML, cleanupChat, initChat } from './chat.js';
import { syncSpeaking } from '../highlight.js';
import { narrator } from '../tts.js';

const TABS = [
  { id: 'ideas', label: '精华解读', icon: 'sparkle' },
  { id: 'chapters', label: '章节听书', icon: 'headphones' },
  { id: 'quotes', label: '金句笔记', icon: 'quote' },
  { id: 'chat', label: '和书讨论', icon: 'message' },
];

const validTab = (tab) => (TABS.some((item) => item.id === tab) ? tab : 'ideas');

const sectionMinutes = (section) => {
  const chars = [section.title, ...section.paras, section.takeaway].join('').length;
  return Math.max(1, Math.round((chars / 245) * 10) / 10);
};

function progressInfo(book) {
  const progress = store.getProgress(book.id);
  const percent = progress?.percent || 0;
  return {
    progress,
    percent,
    inProgress: percent > 0.02 && percent < 0.98,
    finished: percent >= 0.98,
  };
}

function primaryListenButton(book, { small = false } = {}) {
  const info = progressInfo(book);
  const label = info.inProgress
    ? `继续收听 · ${Math.round(info.percent * 100)}%`
    : info.finished
      ? '再听一遍'
      : `听精华 · ${formatMinutes(book.listenMinutes)}`;
  return `<button class="btn btn--primary ${small ? 'btn--sm' : ''}" type="button" data-action="play-book" data-book-id="${book.id}" data-resume="${info.inProgress}" data-expand="true">
    ${icon('play', small ? 15 : 16)} <span>${label}</span>
  </button>`;
}

function ideasTab(book) {
  const related = (book.related || []).map(getBook).filter(Boolean);
  const notes = store.get().notes.filter((note) => note.bookId === book.id);
  return `
    <div class="tab-panel tab-panel--ideas">
      <section class="idea-lead reveal">
        <div class="idea-lead__mark">${icon('quote', 26)}</div>
        <div>
          <p class="eyebrow">一句话读懂</p>
          <p class="idea-lead__quote">${escapeHtml(book.oneLiner)}</p>
          <p class="idea-lead__intro">${escapeHtml(book.intro)}</p>
        </div>
      </section>

      <div class="why-grid">
        ${book.whyRead
          .map(
            (reason, index) => `
          <div class="why-card reveal" style="--delay:${index * 70}ms">
            <span class="why-card__num">0${index + 1}</span>
            <p>${escapeHtml(reason)}</p>
          </div>`,
          )
          .join('')}
      </div>

      <section class="content-section">
        <header class="content-section__head">
          <div>
            <p class="eyebrow">THE BIG IDEAS</p>
            <h2>核心观点</h2>
          </div>
          <span class="content-section__note">读完这一页，你会记住什么</span>
        </header>
        <div class="key-ideas">
          ${book.keyIdeas
            .map(
              (idea, index) => `
            <article class="key-idea reveal">
              <span class="key-idea__index">${String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3>${escapeHtml(idea.title)}</h3>
                <p>${escapeHtml(idea.body)}</p>
              </div>
            </article>`,
            )
            .join('')}
        </div>
      </section>

      <section class="content-section">
        <header class="content-section__head">
          <div>
            <p class="eyebrow">THE PATH</p>
            <h2>章节脉络</h2>
          </div>
          <button class="text-link" type="button" data-book-tab="chapters">去听完整解读 ${icon('arrow-right', 14)}</button>
        </header>
        <div class="chapter-map">
          ${book.sections
            .map(
              (section, index) => `
            <div class="chapter-map__row reveal">
              <span class="chapter-map__num">${String(index + 1).padStart(2, '0')}</span>
              <div class="chapter-map__body">
                <h3>${escapeHtml(section.title)}</h3>
                <p>${escapeHtml(section.takeaway)}</p>
              </div>
              <button class="chapter-map__play" type="button" data-action="play-section" data-book-id="${book.id}" data-section="${index}" aria-label="播放第 ${index + 1} 节">
                ${icon('play', 14)}
              </button>
            </div>`,
            )
            .join('')}
        </div>
      </section>

      <div class="insight-grid">
        <section class="content-section action-card">
          <header class="content-section__head">
            <div>
              <p class="eyebrow">TRY IT</p>
              <h2>把书用起来</h2>
            </div>
          </header>
          <ol class="action-list">
            ${book.actions
              .map(
                (action, index) => `
              <li>
                <span class="action-list__check">${icon('check', 13)}</span>
                <span>${escapeHtml(action)}</span>
                <em>0${index + 1}</em>
              </li>`,
              )
              .join('')}
          </ol>
        </section>

        <section class="content-section debate-card">
          <header class="content-section__head">
            <div>
              <p class="eyebrow">STAY CURIOUS</p>
              <h2>${escapeHtml(book.debate.title)}</h2>
            </div>
          </header>
          <p>${escapeHtml(book.debate.body)}</p>
          <button class="text-link" type="button" data-book-tab="chat">带着疑问去讨论 ${icon('arrow-right', 14)}</button>
        </section>
      </div>

      <section class="content-section audience-card">
        <div class="audience-card__icon">${icon('book-open', 22)}</div>
        <div class="audience-card__body">
          <p class="eyebrow">WHO IS IT FOR</p>
          <h2>适合谁读</h2>
          <p>${escapeHtml(book.audience)}</p>
        </div>
        <div class="audience-card__author">
          <span class="audience-card__avatar">${escapeHtml(book.author.slice(0, 1))}</span>
          <div>
            <strong>${escapeHtml(book.author)}</strong>
            <span>作者</span>
          </div>
        </div>
      </section>

      <section class="content-section author-bio">
        <p class="eyebrow">ABOUT THE AUTHOR</p>
        <h2>关于作者</h2>
        <p>${escapeHtml(book.authorBio)}</p>
      </section>

      ${
        notes.length
          ? `<section class="content-section book-notes">
              <header class="content-section__head">
                <div><p class="eyebrow">YOUR NOTES</p><h2>你在这本书里留下的</h2></div>
                <span class="content-section__note">${notes.length} 条</span>
              </header>
              <div class="mini-note-list">
                ${notes
                  .slice(0, 3)
                  .map(
                    (note) => `<div class="mini-note">
                      <p>${escapeHtml(note.text)}</p>
                      <span>${timeAgo(note.at)}</span>
                    </div>`,
                  )
                  .join('')}
              </div>
              <button class="text-link" type="button" data-book-tab="quotes">查看全部笔记 ${icon('arrow-right', 14)}</button>
            </section>`
          : ''
      }

      ${
        related.length
          ? `<section class="content-section related-section">
              <header class="content-section__head">
                <div><p class="eyebrow">READ NEXT</p><h2>读完这本，还可以读</h2></div>
              </header>
              <div class="related-grid">
                ${related
                  .map(
                    (item) => `
                  <a class="related-card" href="#/book/${item.id}">
                    ${coverHTML(item, { size: 'xs' })}
                    <div>
                      <span>${categoryOf(item.category).name}</span>
                      <h3>${escapeHtml(item.title)}</h3>
                      <p>${escapeHtml(item.oneLiner)}</p>
                    </div>
                  </a>`,
                  )
                  .join('')}
              </div>
            </section>`
          : ''
      }
    </div>`;
}

function chaptersTab(book) {
  const info = progressInfo(book);
  return `
    <div class="tab-panel tab-panel--chapters">
      <section class="listen-head">
        <div>
          <p class="eyebrow">FULL AUDIO ESSAY</p>
          <h2>完整听书</h2>
          <p>包含开篇、核心观点、${book.sections.length} 个章节与收尾，约 ${formatMinutes(book.listenMinutes)}。朗读时当前段落会自动高亮。</p>
        </div>
        ${primaryListenButton(book)}
      </section>
      <div class="listen-now" id="listen-now" hidden>
        <span class="listen-now__bars"><i></i><i></i><i></i></span>
        <span class="listen-now__text">正在朗读</span>
        <span class="listen-now__label" id="listen-now-label"></span>
      </div>
      <div class="chapter-list">
        ${book.sections
          .map(
            (section, index) => `
          <article class="chapter-block" data-chapter="${index}" id="chapter-${index}">
            <header class="chapter-block__head">
              <span class="chapter-block__num">${String(index + 1).padStart(2, '0')}</span>
              <div class="chapter-block__title">
                <h3>${escapeHtml(section.title)}</h3>
                <p>约 ${sectionMinutes(section)} 分钟 · 第 ${index + 1} 节</p>
              </div>
              <button class="chapter-block__play" type="button" data-action="play-section" data-book-id="${book.id}" data-section="${index}" aria-label="播放第 ${index + 1} 节">
                ${icon('play', 15)}<span>听本节</span>
              </button>
            </header>
            <div class="chapter-block__content">
              ${section.paras
                .map(
                  (paragraph, paraIndex) =>
                    `<p data-para="${index}-${paraIndex}">${escapeHtml(paragraph)}</p>`,
                )
                .join('')}
              <p class="chapter-block__takeaway"><span>本节小结</span>${escapeHtml(section.takeaway)}</p>
            </div>
          </article>`,
          )
          .join('')}
      </div>
      <p class="listen-footnote">${icon('info', 14)} 自然人声由微软 Edge 在线合成，首次播放约需几秒；断网时可切换到系统语音。</p>
    </div>`;
}

function quotesTab(book) {
  const notes = store.get().notes.filter((note) => note.bookId === book.id);
  return `
    <div class="tab-panel tab-panel--quotes">
      <section class="quotes-head">
        <div>
          <p class="eyebrow">LINES TO KEEP</p>
          <h2>值得带走的句子</h2>
          <p>短句用于评论与记忆；除标注“原文”外，均为意译或导读。</p>
        </div>
        <button class="btn btn--ghost btn--sm" type="button" data-action="add-note" data-book-id="${book.id}">
          ${icon('edit', 15)} 写一条笔记
        </button>
      </section>
      <div class="quote-grid">
        ${book.quotes
          .map(
            (quote, index) => `
          <article class="quote-card reveal" style="--delay:${index * 60}ms">
            <span class="quote-card__mark">“</span>
            <p>${escapeHtml(quote.text)}</p>
            <div class="quote-card__foot">
              <span>${escapeHtml(quote.source)}</span>
              <div>
                <button type="button" class="icon-btn icon-btn--sm" data-action="copy-text" data-text="${escapeHtml(quote.text)}" aria-label="复制这句话">${icon('copy', 15)}</button>
                <button type="button" class="icon-btn icon-btn--sm" data-action="save-quote" data-book-id="${book.id}" data-text="${escapeHtml(quote.text)}" data-source="${escapeHtml(quote.source)}" aria-label="保存到笔记">${icon('bookmark', 15)}</button>
              </div>
            </div>
          </article>`,
          )
          .join('')}
      </div>

      <section class="my-notes">
        <header class="my-notes__head">
          <div><p class="eyebrow">MARGIN NOTES</p><h2>我的笔记</h2></div>
          <span>${notes.length} 条</span>
        </header>
        ${
          notes.length
            ? `<div class="note-list">
                ${notes
                  .map(
                    (note) => `
                  <article class="note-item">
                    <p>${escapeHtml(note.text)}</p>
                    <footer>
                      <span>${escapeHtml(note.source || '个人笔记')} · ${timeAgo(note.at)}</span>
                      <button type="button" class="icon-btn icon-btn--sm" data-action="remove-note" data-note-id="${note.id}" aria-label="删除笔记">${icon('trash', 14)}</button>
                    </footer>
                  </article>`,
                  )
                  .join('')}
              </div>`
            : `<div class="notes-empty">
                ${icon('quote', 20)}
                <p>还没有笔记。听书时遇到触动你的句子，就把它留在这里。</p>
              </div>`
        }
      </section>
    </div>`;
}

function asideHTML(book) {
  const related = book.related.map(getBook).filter(Boolean).slice(0, 2);
  return `
    <aside class="book-aside">
      <section class="aside-card">
        <div class="aside-card__head">
          <span>章节目录</span><span>${book.sections.length} 节</span>
        </div>
        <ol class="aside-toc">
          ${book.sections
            .map(
              (section, index) => `
            <li>
              <button type="button" data-jump-chapter="${index}">
                <span>${String(index + 1).padStart(2, '0')}</span>
                <em>${escapeHtml(section.title)}</em>
              </button>
            </li>`,
            )
            .join('')}
        </ol>
      </section>

      <section class="aside-card aside-card--quote">
        <span class="aside-card__mark">“</span>
        <p>${escapeHtml(book.quotes[0].text)}</p>
        <span class="aside-card__source">${escapeHtml(book.quotes[0].source)}</span>
      </section>

      <section class="aside-card aside-card--listen">
        <p class="eyebrow">NOW LISTENING</p>
        <h3>用耳朵读一遍</h3>
        <p>${formatMinutes(book.listenMinutes)} · 自然人声</p>
        ${primaryListenButton(book, { small: true })}
      </section>

      ${
        related.length
          ? `<section class="aside-card">
              <div class="aside-card__head"><span>相关阅读</span><span>READ NEXT</span></div>
              <div class="aside-related">
                ${related
                  .map(
                    (item) => `
                  <a href="#/book/${item.id}">
                    ${coverHTML(item, { size: 'xxs' })}
                    <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.author)}</span></div>
                  </a>`,
                  )
                  .join('')}
              </div>
            </section>`
          : ''
      }
    </aside>`;
}

export function renderBook(book, tab = 'ideas') {
  const info = progressInfo(book);
  const activeTab = validTab(tab);
  const category = categoryOf(book.category);
  const favorite = store.isFavorite(book.id);
  const sourceTag = book.isImported
    ? book.source?.type === 'metadata'
      ? '公开简介'
      : book.source?.type === 'gutenberg'
        ? '公版全文'
        : '全文导入'
    : book.year;
  const importedHint = book.isImported
    ? [book.source?.label || '由你导入', book.source?.type === 'metadata' ? '未读取全文' : book.source?.coverage ? `原文覆盖约 ${book.source.coverage}` : '', 'AI 生成，请以原书为准']
        .filter(Boolean)
        .join(' · ')
    : '';

  return `
    <div class="page page--book" data-current-book="${book.id}">
      <div class="book-topbar">
        <a class="back-link" href="#/">${icon('arrow-left', 16)} 返回发现</a>
        <span class="book-topbar__crumb">${category.name} <i>/</i> ${escapeHtml(book.title)}</span>
      </div>

      <section class="book-hero" style="--ba:${book.cover.a};--bb:${book.cover.b};--bink:${book.cover.ink}">
        <div class="book-hero__noise" aria-hidden="true"></div>
        <div class="book-hero__orb" aria-hidden="true"></div>
        <div class="book-hero__inner">
          <div class="book-hero__cover">
            ${coverHTML(book, { size: 'xl' })}
            ${
              info.percent > 0.01
                ? `<span class="book-hero__progress"><span style="width:${Math.round(info.percent * 100)}%"></span></span>`
                : ''
            }
          </div>
          <div class="book-hero__main">
            <div class="book-hero__kicker">
              <span class="book-hero__cat">${category.name}</span>
              <span>${book.isImported ? 'AI 分析' : '精华解读'}</span>
              <span>${sourceTag}</span>
            </div>
            <h1>${escapeHtml(book.title)}</h1>
            <p class="book-hero__author">${escapeHtml(book.author)} <span>著</span></p>
            <p class="book-hero__tagline">“${escapeHtml(book.tagline)}”</p>
            <div class="book-hero__meta">
              ${ratingHTML(book)}
              <span class="dot">·</span>
              <span>${icon('headphones', 14)} ${formatMinutes(book.listenMinutes)}</span>
              ${book.isImported ? '' : `<span class="dot">·</span><span>${escapeHtml(book.difficulty)}</span>`}
              <span class="dot">·</span>
              <span>${book.sections.length} 个章节</span>
            </div>
            <div class="book-hero__tags">
              ${book.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}
            </div>
            <div class="book-hero__actions">
              ${primaryListenButton(book)}
              <button class="btn btn--glass ${favorite ? 'is-active' : ''}" type="button" data-action="toggle-fav" data-book-id="${book.id}" aria-pressed="${favorite}">
                ${icon(favorite ? 'heart-filled' : 'heart', 16)} <span>${favorite ? '已收藏' : '收藏'}</span>
              </button>
              <button class="icon-btn icon-btn--glass" type="button" data-action="share-book" data-book-id="${book.id}" aria-label="分享这本书">${icon('share', 17)}</button>
              ${book.isImported ? `<button class="icon-btn icon-btn--glass" type="button" data-action="delete-import" data-book-id="${book.id}" aria-label="移除这本导入的书" title="移除导入">${icon('trash', 16)}</button>` : ''}
            </div>
            ${
              book.isImported
                ? `<p class="book-hero__hint">${escapeHtml(importedHint)}</p>`
                : info.inProgress
                  ? `<p class="book-hero__hint">上次听到第 ${(info.progress.sectionIndex ?? 0) + 1} 节 · ${Math.round(info.percent * 100)}%，已为你记住进度。</p>`
                  : info.finished
                    ? `<p class="book-hero__hint">你已听完这本精华 · 随时可以再听一遍。</p>`
                    : `<p class="book-hero__hint">可以先听 5 分钟，再决定要不要深读。</p>`
            }
          </div>
        </div>
      </section>

      <div class="book-body">
        <div class="book-content">
          <nav class="book-tabs" role="tablist" aria-label="书籍内容">
            ${TABS.map(
              (item) => `
              <button class="book-tab ${item.id === activeTab ? 'is-active' : ''}" type="button" role="tab" aria-selected="${item.id === activeTab}" data-book-tab="${item.id}">
                ${icon(item.icon, 15)} <span>${item.label}</span>
                ${item.id === 'chat' ? '<i class="tab-dot"></i>' : ''}
              </button>`,
            ).join('')}
          </nav>
          <div id="book-tab-content">
            ${activeTab === 'ideas' ? ideasTab(book) : ''}
            ${activeTab === 'chapters' ? chaptersTab(book) : ''}
            ${activeTab === 'quotes' ? quotesTab(book) : ''}
            ${activeTab === 'chat' ? chatHTML(book) : ''}
          </div>
        </div>
        ${asideHTML(book)}
      </div>
    </div>`;
}

export function initBook(book, tab, root) {
  let currentTab = validTab(tab);
  const content = root.querySelector('#book-tab-content');
  const tabButtons = Array.from(root.querySelectorAll('[data-book-tab]'));
  const tabBar = root.querySelector('.book-tabs');

  const scrollToTabs = () => {
    const top = tabBar.getBoundingClientRect().top + window.scrollY - (window.innerWidth <= 760 ? 74 : 84);
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  const renderTab = (nextTab, { scroll = false } = {}) => {
    cleanupChat();
    currentTab = nextTab;
    tabButtons.forEach((button) => {
      const active = button.dataset.bookTab === nextTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    content.innerHTML =
      nextTab === 'ideas'
        ? ideasTab(book)
        : nextTab === 'chapters'
          ? chaptersTab(book)
          : nextTab === 'quotes'
            ? quotesTab(book)
            : chatHTML(book);
    history.replaceState(null, '', `#/book/${book.id}/${nextTab}`);
    if (nextTab === 'chat') initChat(book, content);
    if (nextTab === 'chapters') {
      syncSpeaking(narrator.getState());
    }
    if (nextTab === 'ideas') {
      content.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
    }
    if (scroll) scrollToTabs();
  };

  tabBar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-book-tab]');
    if (!button || !tabBar.contains(button)) return;
    const nextTab = button.dataset.bookTab;
    if (nextTab === currentTab) return;
    renderTab(nextTab, { scroll: true });
  });

  root.addEventListener('click', (event) => {
    const tabTrigger = event.target.closest('[data-book-tab]');
    if (tabTrigger && !tabBar.contains(tabTrigger)) {
      event.preventDefault();
      renderTab(tabTrigger.dataset.bookTab, { scroll: true });
      return;
    }
    const jump = event.target.closest('[data-jump-chapter]');
    if (jump) {
      const index = Number(jump.dataset.jumpChapter);
      if (currentTab !== 'chapters') renderTab('chapters');
      setTimeout(() => {
        const section = root.querySelector(`#chapter-${index}`);
        if (section) {
          const top = section.getBoundingClientRect().top + window.scrollY - 96;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      }, 80);
    }
  });

  if (currentTab === 'chat') initChat(book, content);
  if (currentTab === 'chapters') syncSpeaking(narrator.getState());
}
