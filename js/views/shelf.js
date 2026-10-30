import { allBooks, categoryOf, getBook } from '../data.js';
import { store } from '../store.js';
import { icon } from '../icons.js';
import { coverHTML, emptyState, sectionHead } from '../ui.js';
import { escapeHtml, formatMinutes, greeting, timeAgo } from '../utils.js';

const formatHours = (seconds) => {
  if (!seconds) return '0';
  const hours = seconds / 3600;
  if (hours >= 1) return `${hours.toFixed(1)} 小时`;
  return `${Math.max(1, Math.round(seconds / 60))} 分钟`;
};

function statCard(iconName, value, label, hint) {
  return `<div class="stat-card">
    <span class="stat-card__icon">${icon(iconName, 18)}</span>
    <strong>${value}</strong>
    <span>${label}</span>
    ${hint ? `<small>${hint}</small>` : ''}
  </div>`;
}

function continueItem(book, progress) {
  const percent = Math.round((progress?.percent || 0) * 100);
  return `<article class="shelf-continue">
    <a class="shelf-continue__cover" href="#/book/${book.id}/chapters">${coverHTML(book, { size: 'sm' })}</a>
    <div class="shelf-continue__body">
      <span class="shelf-continue__kicker">${categoryOf(book.category).name} · 第 ${(progress?.sectionIndex ?? 0) + 1} 节</span>
      <h3><a href="#/book/${book.id}">${escapeHtml(book.title)}</a></h3>
      <p>${escapeHtml(book.oneLiner)}</p>
      <div class="shelf-continue__track"><span style="width:${percent}%"></span></div>
      <span class="shelf-continue__percent">已听 ${percent}% · ${percent > 0 ? '继续' : '开始'}</span>
    </div>
    <button class="shelf-continue__play" type="button" data-action="play-book" data-book-id="${book.id}" data-resume="true" aria-label="继续收听《${escapeHtml(book.title)}》">${icon('play', 18)}</button>
  </article>`;
}

export function renderShelf() {
  const state = store.get();
  const stats = store.getStats();
  const progressEntries = Object.entries(state.progress)
    .filter(([, value]) => value.percent > 0.01 && value.percent < 0.995)
    .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
  const continueList = progressEntries.map(([id, value]) => ({ book: getBook(id), progress: value })).filter((item) => item.book);
  const favorites = state.favorites.map(getBook).filter(Boolean);
  const imported = allBooks()
    .filter((book) => book.isImported)
    .sort((a, b) => (b.source?.createdAt || 0) - (a.source?.createdAt || 0));
  const notes = state.notes.slice().sort((a, b) => b.at - a.at);
  const history = state.history
    .map((item) => ({ ...item, book: getBook(item.bookId) }))
    .filter((item) => item.book)
    .slice(0, 8);

  return `<div class="page page--shelf">
    <section class="shelf-hero">
      <div class="shelf-hero__copy">
        <p class="eyebrow"><span class="eyebrow__line"></span>MY LIBRARY</p>
        <h1>${greeting()}，<br>你的书架在等你。</h1>
        <p>听过的书、留下的句子，和那些还没想明白的问题，都在这里。</p>
      </div>
      <div class="shelf-stats">
        ${statCard('headphones', formatHours(stats.totalSeconds), '累计收听', stats.todaySeconds ? `今天 ${Math.max(1, Math.round(stats.todaySeconds / 60))} 分钟` : '从今天开始')}
        ${statCard('book-open', stats.completedCount, '听完的精华', `在听 ${stats.listeningCount} 本`)}
        ${statCard('quote', stats.noteCount, '条笔记', '留给未来的自己')}
        ${statCard('flame', stats.streak, '天连续收听', stats.streak ? '保持这个节奏' : '今天读一本就点亮')}
      </div>
    </section>

    ${
      continueList.length
        ? `<section class="shelf-section">
            ${sectionHead({ eyebrow: 'CONTINUE', title: '继续收听', subtitle: '进度已自动保存，接着上次的位置。', action: `<span class="section-head__count">${continueList.length} 本在听</span>` })}
            <div class="shelf-continue-grid">
              ${continueList.map(({ book, progress }) => continueItem(book, progress)).join('')}
            </div>
          </section>`
        : ''
    }

    ${
      imported.length
        ? `<section class="shelf-section">
            ${sectionHead({
              eyebrow: 'IMPORTED',
              title: '我的导入',
              subtitle: '你放进来的书，AI 已经读完了。',
              action: `<a class="text-link" href="#/import">再导入一本 ${icon('plus', 14)}</a>`,
            })}
            <div class="favorite-grid">
              ${imported
                .map(
                  (book) => `<a class="favorite-item" href="#/book/${book.id}">
                    ${coverHTML(book, { size: 'xs' })}
                    <div>
                      <span>AI 分析 · ${escapeHtml(book.source?.type === 'metadata' ? '公开资料' : book.source?.type === 'gutenberg' ? '公版全文' : '全文导入')}</span>
                      <h3>${escapeHtml(book.title)}</h3>
                      <p>${escapeHtml(book.author || '作者未知')}</p>
                      <em>${icon('headphones', 12)} ${formatMinutes(book.listenMinutes)}</em>
                    </div>
                  </a>`,
                )
                .join('')}
            </div>
          </section>`
        : ''
    }

    <section class="shelf-section">
      ${sectionHead({
        eyebrow: 'FAVORITES',
        title: '我的收藏',
        subtitle: favorites.length ? '你标记为想再读一遍的书。' : '遇到喜欢的书，点一下爱心，它就会留在这里。',
        action: `<a class="text-link" href="#/">去发现 ${icon('arrow-right', 14)}</a>`,
      })}
      ${
        favorites.length
          ? `<div class="favorite-grid">
              ${favorites
                .map(
                  (book) => `<a class="favorite-item" href="#/book/${book.id}">
                    ${coverHTML(book, { size: 'xs' })}
                    <div>
                      <span>${categoryOf(book.category).name}</span>
                      <h3>${escapeHtml(book.title)}</h3>
                      <p>${escapeHtml(book.author)}</p>
                      <em>${icon('headphones', 12)} ${formatMinutes(book.listenMinutes)}</em>
                    </div>
                  </a>`,
                )
                .join('')}
            </div>`
          : `<div class="shelf-empty">${emptyState({
              iconName: 'heart',
              title: '收藏夹还是空的',
              text: '在书库里遇见想重读的书，点一下爱心。',
              action: '<a class="btn btn--ghost btn--sm" href="#/">去逛逛书库</a>',
            })}</div>`
      }
    </section>

    <section class="shelf-section">
      ${sectionHead({
        eyebrow: 'MARGIN NOTES',
        title: '我的笔记',
        subtitle: notes.length ? '你与书之间，真正发生过的对话。' : '金句和想法，都值得被留下来。',
        action: notes.length ? `<span class="section-head__count">${notes.length} 条</span>` : '',
      })}
      ${
        notes.length
          ? `<div class="shelf-notes">
              ${notes
                .map((note) => {
                  const book = getBook(note.bookId);
                  if (!book) return '';
                  return `<article class="shelf-note">
                    <a class="shelf-note__book" href="#/book/${book.id}">
                      ${coverHTML(book, { size: 'xxs' })}
                      <div><strong>${escapeHtml(book.title)}</strong><span>${escapeHtml(note.source || '个人笔记')}</span></div>
                    </a>
                    <p>${escapeHtml(note.text)}</p>
                    <footer>
                      <span>${timeAgo(note.at)}</span>
                      <button type="button" class="icon-btn icon-btn--sm" data-action="remove-note" data-note-id="${note.id}" aria-label="删除笔记">${icon('trash', 14)}</button>
                    </footer>
                  </article>`;
                })
                .join('')}
            </div>`
          : `<div class="shelf-empty">${emptyState({
              iconName: 'quote',
              title: '还没有留下笔记',
              text: '打开一本书，在“金句笔记”里写下第一句话。',
              action: '<a class="btn btn--ghost btn--sm" href="#/book/atomic-habits/quotes">从《原子习惯》开始</a>',
            })}</div>`
      }
    </section>

    ${
      history.length
        ? `<section class="shelf-section">
            ${sectionHead({ eyebrow: 'RECENTLY', title: '最近看过', subtitle: '' })}
            <div class="history-row">
              ${history
                .map(
                  (item) => `<a class="history-chip" href="#/book/${item.book.id}">
                    ${coverHTML(item.book, { size: 'xxs' })}
                    <span><strong>${escapeHtml(item.book.title)}</strong><small>${timeAgo(item.at)}</small></span>
                  </a>`,
                )
                .join('')}
            </div>
          </section>`
        : ''
    }

    <section class="shelf-quote">
      <p>“书不会替你生活，但它会在你需要的时候，递来一句话。”</p>
      <span>拾页 · 阅读不是逃离，是准备</span>
    </section>
  </div>`;
}
