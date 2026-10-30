import { getBook } from './data.js';
import { store } from './store.js';
import { icon, logoMark } from './icons.js';
import { copyText, escapeHtml, observeReveals, parseRoute } from './utils.js';
import { openSearch, closeSearch } from './search.js';
import { closeModal, openModal, toast } from './ui.js';
import { narrator } from './tts.js';
import { closePlayerPanel, initPlayer, openPlayerPanel } from './player.js';
import { openSettings } from './settings.js';
import { initTheme, toggleTheme } from './theme.js';
import { renderHome, initHome } from './views/home.js';
import { renderBook, initBook } from './views/book.js';
import { renderShelf } from './views/shelf.js';
import { renderImport, initImport, cleanupImport } from './views/import.js';
import { cleanupChat } from './views/chat.js';
import { syncSpeaking } from './highlight.js';

let view;
let header;
let lastScroll = 0;

function shellHTML() {
  const year = new Date().getFullYear();
  return `
    <header class="site-header" id="site-header">
      <div class="header-inner">
        <a class="brand" href="#/" aria-label="拾页首页">
          ${logoMark}
          <span class="brand__word">拾页<small>SHIYE</small></span>
        </a>
        <nav class="main-nav" aria-label="主导航">
          <a href="#/" data-nav="home">发现</a>
          <a href="#/shelf" data-nav="shelf">我的书架</a>
          <a href="#/import" data-nav="import">导入书籍</a>
        </nav>
        <div class="header-actions">
          <button class="header-search" type="button" data-action="open-search" aria-label="搜索书库">
            ${icon('search', 17)}
            <span>搜索书名 / 在线找书</span>
            <kbd>⌘ K</kbd>
          </button>
          <button class="icon-btn header-icon" type="button" data-action="toggle-theme" aria-label="切换深浅色">${icon('moon', 18)}</button>
          <button class="icon-btn header-icon" type="button" data-action="open-settings" aria-label="设置">${icon('settings', 18)}</button>
        </div>
      </div>
    </header>

    <main class="site-main" id="view"></main>

    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-brand">
          <a class="brand brand--footer" href="#/">${logoMark}<span class="brand__word">拾页<small>SHIYE</small></span></a>
          <p>把书读薄，把世界读厚。<br>给每一个想读得少一点、懂得多一点的人。</p>
        </div>
        <div class="footer-links">
          <div><span>浏览</span><a href="#/">发现好书</a><a href="#/shelf">我的书架</a><a href="#/import">导入书籍</a></div>
          <div><span>关于</span><button type="button" data-action="open-settings">偏好设置</button><button type="button" data-action="open-search">搜索书库</button></div>
        </div>
        <div class="footer-note">
          <p>书摘与解读为原创内容，短句引用仅用于评论。语音由系统合成。</p>
          <span>© ${year} 拾页 SHIYE · MADE FOR SLOW READING</span>
        </div>
      </div>
    </footer>

    <nav class="mobile-nav" aria-label="移动端导航">
      <a href="#/" data-nav="home">${icon('home', 20)}<span>发现</span></a>
      <button type="button" data-action="open-search">${icon('search', 20)}<span>搜索</span></button>
      <a href="#/import" data-nav="import">${icon('plus', 20)}<span>导入</span></a>
      <a href="#/shelf" data-nav="shelf">${icon('library', 20)}<span>书架</span></a>
    </nav>`;
}

function updateNav(route) {
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const active = link.dataset.nav === (route.name === 'book' ? 'home' : route.name);
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.body.dataset.page = route.name;
}

function updateThemeButton() {
  const button = document.querySelector('[data-action="toggle-theme"]');
  if (!button) return;
  const dark = document.documentElement.dataset.theme === 'dark';
  button.innerHTML = icon(dark ? 'sun' : 'moon', 18);
  button.setAttribute('aria-label', dark ? '切换到浅色模式' : '切换到深色模式');
}

function updateFavoriteUI(bookId, active) {
  document.querySelectorAll(`[data-action="toggle-fav"][data-book-id="${bookId}"]`).forEach((button) => {
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    const hasLabel = Boolean(button.querySelector('span'));
    button.innerHTML = `${icon(active ? 'heart-filled' : 'heart', hasLabel ? 16 : 17)}${hasLabel ? `<span>${active ? '已收藏' : '收藏'}</span>` : ''}`;
  });
}

function openNoteComposer(bookId, preset = '') {
  const book = getBook(bookId);
  if (!book) return;
  openModal({
    title: '写一条笔记',
    subtitle: `《${escapeHtml(book.title)}》 · ${escapeHtml(book.author)}`,
    className: 'modal--note',
    content: `<form id="note-form">
      <label class="field">
        <span>你的想法</span>
        <textarea id="note-text" rows="7" maxlength="500" placeholder="这句话让我想到……">${escapeHtml(preset)}</textarea>
        <small>笔记只保存在本机，也可以从书架随时回看。</small>
      </label>
    </form>`,
    footer: `<button class="btn btn--ghost btn--sm" type="button" data-note-cancel>取消</button><button class="btn btn--primary btn--sm" type="submit" form="note-form">${icon('check', 15)} 保存笔记</button>`,
    onMount: (overlay, close) => {
      const form = overlay.querySelector('#note-form');
      const textarea = overlay.querySelector('#note-text');
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const text = textarea.value.trim();
        if (!text) {
          toast('写下一点什么再保存吧。', { type: 'error' });
          textarea.focus();
          return;
        }
        store.addNote({ bookId, text, source: '个人笔记' });
        close();
        toast('笔记已保存到书架');
        renderRoute({ preserveScroll: true });
      });
      overlay.querySelector('[data-note-cancel]').addEventListener('click', close);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }, 80);
    },
  });
}

function notFoundHTML() {
  return `<div class="page page--notfound">
    <div class="notfound-card">
      <span class="notfound-card__mark">404</span>
      <p class="eyebrow">PAGE NOT FOUND</p>
      <h1>这一页，好像被翻过去了。</h1>
      <p>这本书可能不在书库里，或者链接已经改变。回到发现页，重新挑一本吧。</p>
      <div class="notfound-card__actions">
        <a class="btn btn--primary btn--sm" href="#/">${icon('arrow-left', 15)} 返回发现</a>
        <button class="btn btn--ghost btn--sm" type="button" data-action="open-search">${icon('search', 15)} 搜索书库</button>
      </div>
    </div>
  </div>`;
}

function renderRoute(options = {}) {
  const route = parseRoute();
  const scrollY = window.scrollY;
  cleanupChat();
  cleanupImport();

  if (route.name === 'book') {
    const book = getBook(route.id);
    if (!book) {
      view.innerHTML = notFoundHTML();
      document.title = '没有找到这本书 · 拾页';
      updateNav(route);
      window.scrollTo(0, 0);
      return;
    }
    view.innerHTML = renderBook(book, route.tab);
    initBook(book, route.tab, view);
    store.addHistory(book.id);
    document.title = `《${book.title}》精华 · 拾页`;
  } else if (route.name === 'shelf') {
    view.innerHTML = renderShelf();
    document.title = '我的书架 · 拾页';
  } else if (route.name === 'import') {
    view.innerHTML = renderImport(route.query);
    initImport(view, route.query);
    document.title = '导入一本书 · 拾页';
  } else {
    view.innerHTML = renderHome();
    initHome(view);
    document.title = '拾页 · 把书读薄，把世界读厚';
  }

  updateNav(route);
  const bookTab = route.name === 'book' ? route.tab : 'ideas';
  if (route.name === 'book' && ['chapters', 'quotes', 'chat'].includes(bookTab)) {
    requestAnimationFrame(() => {
      const tabs = view.querySelector('.book-tabs');
      if (!tabs) return;
      const top = tabs.getBoundingClientRect().top + window.scrollY - (window.innerWidth <= 760 ? 76 : 86);
      window.scrollTo(0, Math.max(0, top));
    });
  }
  if (options.preserveScroll) {
    window.scrollTo(0, scrollY);
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
      observeReveals(view);
    });
  } else {
    window.scrollTo(0, 0);
    requestAnimationFrame(() => observeReveals(view));
  }
  view.classList.remove('page-enter');
  void view.offsetWidth;
  view.classList.add('page-enter');
  syncSpeaking(narrator.getState());
  updateThemeButton();
  closeModal();
}

function initShell() {
  const app = document.getElementById('app');
  app.innerHTML = shellHTML();
  view = document.getElementById('view');
  header = document.getElementById('site-header');
  updateThemeButton();
}

function handlePlayBook(button) {
  const book = getBook(button.dataset.bookId);
  if (!book) return;
  let resume = button.dataset.resume === 'true';
  if (!resume && button.dataset.restart !== 'true') {
    const progress = store.getProgress(book.id);
    if (progress?.percent > 0.02 && progress.percent < 0.98) resume = true;
  }
  narrator.playBook(book, {
    resume,
    restart: button.dataset.restart === 'true',
  });
  if (button.dataset.expand === 'true') {
    setTimeout(() => openPlayerPanel(), 90);
  }
}

function handlePlaySection(button) {
  const book = getBook(button.dataset.bookId);
  if (!book) return;
  narrator.playBook(book, {
    sectionIndex: Number(button.dataset.section) || 0,
    restart: true,
  });
}

function bindGlobalEvents() {
  document.addEventListener('click', async (event) => {
    const searchTerm = event.target.closest('[data-search-term]');
    if (searchTerm) {
      event.preventDefault();
      openSearch(searchTerm.dataset.searchTerm);
      return;
    }

    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (action === 'open-search') {
      event.preventDefault();
      openSearch();
      return;
    }
    if (action === 'open-settings') {
      event.preventDefault();
      openSettings();
      return;
    }
    if (action === 'toggle-theme') {
      event.preventDefault();
      const next = toggleTheme();
      updateThemeButton();
      toast(next === 'dark' ? '已切换到夜读模式' : '已切换到日间模式', { icon: next === 'dark' ? 'moon' : 'sun' });
      return;
    }
    if (action === 'toggle-fav') {
      event.preventDefault();
      event.stopPropagation();
      const bookId = actionEl.dataset.bookId;
      const active = store.toggleFavorite(bookId);
      updateFavoriteUI(bookId, active);
      toast(active ? '已收入你的书架' : '已取消收藏', { icon: active ? 'heart-filled' : 'heart' });
      if (parseRoute().name === 'shelf') renderRoute({ preserveScroll: true });
      return;
    }
    if (action === 'play-book') {
      event.preventDefault();
      event.stopPropagation();
      handlePlayBook(actionEl);
      return;
    }
    if (action === 'play-section') {
      event.preventDefault();
      handlePlaySection(actionEl);
      return;
    }
    if (action === 'share-book') {
      event.preventDefault();
      const bookId = actionEl.dataset.bookId;
      const url = `${location.origin}${location.pathname}#/book/${bookId}`;
      try {
        await copyText(url);
        toast('分享链接已复制，去发给朋友吧');
      } catch {
        toast('复制失败，请手动复制地址栏链接。', { type: 'error' });
      }
      return;
    }
    if (action === 'copy-text') {
      event.preventDefault();
      try {
        await copyText(actionEl.dataset.text || '');
        toast('已复制这句话');
      } catch {
        toast('复制失败，请手动选择文字。', { type: 'error' });
      }
      return;
    }
    if (action === 'save-quote') {
      event.preventDefault();
      store.addNote({
        bookId: actionEl.dataset.bookId,
        text: actionEl.dataset.text,
        source: actionEl.dataset.source || '金句',
      });
      toast('已存入笔记，随时可以在书架回看');
      if (parseRoute().name === 'book') renderRoute({ preserveScroll: true });
      return;
    }
    if (action === 'add-note') {
      event.preventDefault();
      openNoteComposer(actionEl.dataset.bookId, actionEl.dataset.text || '');
      return;
    }
    if (action === 'remove-note') {
      event.preventDefault();
      const noteId = actionEl.dataset.noteId;
      store.removeNote(noteId);
      toast('笔记已删除');
      renderRoute({ preserveScroll: true });
      return;
    }
    if (action === 'delete-import') {
      event.preventDefault();
      const bookId = actionEl.dataset.bookId;
      const book = getBook(bookId);
      if (!book?.isImported) return;
      openModal({
        title: '移除这本导入的书？',
        subtitle: `《${escapeHtml(book.title)}》的 AI 导读、笔记、收藏和收听进度都会从本机删除。`,
        content: '<p class="modal-copy">原始书稿本来就没有保存在拾页里，因此不会被删除。</p>',
        footer: '<button class="btn btn--ghost btn--sm" type="button" data-cancel>取消</button><button class="btn btn--danger btn--sm" type="button" data-confirm>移除导入</button>',
        onMount: (overlay, close) => {
          overlay.querySelector('[data-cancel]').addEventListener('click', close);
          overlay.querySelector('[data-confirm]').addEventListener('click', () => {
            store.removeImportedBook(bookId);
            if (narrator.book?.id === bookId) narrator.close();
            close();
            toast('已移除这本导入的书');
            if (parseRoute().name === 'book') location.hash = '#/';
            else renderRoute({ preserveScroll: true });
          });
        },
      });
      return;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-action][role="button"]')) {
      event.preventDefault();
      event.target.click();
      return;
    }
    const active = document.activeElement;
    const typing =
      active &&
      (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) || active.isContentEditable);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
      return;
    }
    if (event.key === '/' && !typing && !document.body.classList.contains('has-modal')) {
      event.preventDefault();
      openSearch();
    }
  });

  window.addEventListener('hashchange', () => {
    closePlayerPanel();
    renderRoute();
  });

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    header?.classList.toggle('is-scrolled', y > 16);
    header?.classList.toggle('is-scrolling-down', y > lastScroll && y > 160);
    lastScroll = y;
  }, { passive: true });

  window.addEventListener('app:rerender', () => renderRoute({ preserveScroll: true }));
  window.addEventListener('theme:applied', updateThemeButton);

  narrator.subscribe((state) => {
    syncSpeaking(state);
  });

  window.addEventListener('error', (event) => {
    console.warn('拾页运行时错误：', event.message);
  });
}

function boot() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    window.__shiyeInstallPrompt = event;
  });
  window.addEventListener('appinstalled', () => {
    window.__shiyeInstallPrompt = null;
  });
  initTheme();
  initShell();
  initPlayer();
  bindGlobalEvents();
  if (!location.hash) history.replaceState(null, '', '#/');
  renderRoute();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
