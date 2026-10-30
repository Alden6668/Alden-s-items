import { allBooks } from '../data.js';
import { store } from '../store.js';
import { aiStatus, hasApiKey } from '../ai.js';
import { analyzeBook } from '../analyze.js';
import { icon } from '../icons.js';
import { openSettings } from '../settings.js';
import { toast } from '../ui.js';
import { escapeHtml } from '../utils.js';

let activeFlowController = null;
let activeCatalogAbort = null;
let successTimer = null;
let settingsListener = null;

const formatBytes = (bytes) => {
  if (!bytes) return '';
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const sourceBadge = (result) => {
  if (result.hasFullText) return `<span class="import-badge import-badge--full">公版全文</span>`;
  if (result.source === 'douban') return `<span class="import-badge">书目信息</span>`;
  return `<span class="import-badge">公开简介</span>`;
};

function catalogCard(result, index) {
  const initial = (result.title || '书').trim().slice(0, 1);
  const tags = (result.subjects || []).slice(0, 3);
  return `<article class="catalog-card">
    <div class="catalog-card__cover" aria-hidden="true"><span>${escapeHtml(initial)}</span></div>
    <div class="catalog-card__body">
      <div class="catalog-card__kicker">
        <span>${escapeHtml(result.sourceLabel || '公开书库')}</span>
        ${sourceBadge(result)}
        ${result.downloads ? `<span>${Number(result.downloads).toLocaleString('zh-CN')} 次下载</span>` : ''}
      </div>
      <h3>${escapeHtml(result.title)}</h3>
      <p class="catalog-card__by">${escapeHtml(result.author || '作者未知')}${result.year ? ` · ${escapeHtml(String(result.year))}` : ''}${result.languages?.length ? ` · ${escapeHtml(result.languages.join(' / ').toUpperCase())}` : ''}</p>
      ${result.description ? `<p class="catalog-card__desc">${escapeHtml(result.description)}</p>` : ''}
      ${tags.length ? `<div class="catalog-card__tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
      <div class="catalog-card__actions">
        ${result.hasFullText ? `<button class="btn btn--primary btn--sm" type="button" data-catalog-full="${index}">${icon('book-open', 14)} 读取全文并解读</button>` : ''}
        <button class="btn btn--ghost btn--sm" type="button" data-catalog-meta="${index}">${icon('sparkle', 14)} ${result.source === 'douban' ? '用书目资料解读' : '仅用简介解读'}</button>
      </div>
    </div>
  </article>`;
}

export function renderImport(query = '') {
  const status = aiStatus();
  const importedCount = allBooks().filter((book) => book.isImported).length;
  return `<div class="page page--import">
    <div class="import-head">
      <a class="back-link" href="#/">${icon('arrow-left', 16)} 返回发现</a>
      <p class="eyebrow"><span class="eyebrow__line"></span>ADD A BOOK</p>
      <h1>把你想读的书，<br>丢进来。</h1>
      <p class="import-head__lead">上传你合法拥有的 EPUB/TXT，或从在线书库找一本。AI 会读完全书，整理成能听、能聊的精华导读。</p>
      <div class="import-head__meta">
        <span>${icon('book-open', 14)} EPUB / TXT / Markdown / HTML · 在线书目</span>
        <span>${icon('headphones', 14)} 导入后可听可讨论</span>
        <span>${icon('library', 14)} 已导入 ${importedCount} 本</span>
      </div>
    </div>

    <div class="import-ai-banner ${status.mode === 'ai' ? 'is-ready' : ''}" id="import-ai-banner">
      <span class="import-ai-banner__icon">${icon(status.mode === 'ai' ? 'sparkle' : 'key', 18)}</span>
      <div>
        <strong>${status.mode === 'ai' ? `AI 已就绪 · ${escapeHtml(store.get().settings.model)}` : '还差一步：接入 AI'}</strong>
        <p>${status.mode === 'ai' ? '整书分析会调用你配置的模型，可能会产生 API 费用。' : '整书分析需要一个 AI 模型。配置 API Key 后即可开始；没有 Key 仍可使用内置 14 本书。'}</p>
      </div>
      <button class="btn btn--ghost btn--sm" type="button" data-action="open-settings">${status.mode === 'ai' ? '模型设置' : '去配置 AI'}</button>
    </div>

    <div class="import-layout">
      <section class="import-main">
        <div class="import-work" id="import-work">
          <nav class="import-tabs" role="tablist" aria-label="添加书籍方式">
            <button class="import-tab is-active" type="button" role="tab" aria-selected="true" data-import-tab="file">${icon('book-open', 15)} 上传电子书</button>
            <button class="import-tab" type="button" role="tab" aria-selected="false" data-import-tab="search">${icon('search', 15)} 在线找书</button>
            <button class="import-tab" type="button" role="tab" aria-selected="false" data-import-tab="paste">${icon('edit', 15)} 粘贴正文</button>
          </nav>

          <div class="import-panel" data-import-panel="file">
            <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="选择 EPUB 或 TXT 文件">
              <span class="dropzone__icon">${icon('book-open', 28)}</span>
              <strong>把 EPUB 或 TXT 拖到这里</strong>
              <span>或者点击选择文件 · 最大 30MB</span>
              <small>不会破解 DRM；请只导入你有权阅读的文件</small>
              <input type="file" id="file-input" accept=".epub,.txt,.md,.markdown,.html,.htm" hidden>
            </div>
            <div class="selected-file" id="selected-file" hidden>
              <span class="selected-file__icon">${icon('check', 16)}</span>
              <div><strong id="selected-file-name"></strong><span id="selected-file-size"></span></div>
              <button class="icon-btn icon-btn--sm" type="button" id="remove-file" aria-label="移除文件">${icon('close', 16)}</button>
            </div>
            <div class="import-fields import-fields--two">
              <label class="field"><span>书名（可选）</span><input id="file-title" type="text" maxlength="120" placeholder="留空则从文件中读取"></label>
              <label class="field"><span>作者（可选）</span><input id="file-author" type="text" maxlength="80" placeholder="留空则从文件中读取"></label>
            </div>
            <div class="import-actions">
              <button class="btn btn--primary" type="button" id="file-analyze" disabled>${icon('sparkle', 16)} 开始 AI 解读</button>
              <span>分析一本长篇书通常需要 1–3 分钟</span>
            </div>
            <p class="import-note">${icon('info', 13)} 暂不支持 PDF 与受 DRM 保护的电子书。需要先转换为 EPUB/TXT；文件只在本机服务器解析，正文会发送给你配置的 AI 服务商进行分析。</p>
          </div>

          <div class="import-panel" data-import-panel="search" hidden>
            <form class="catalog-search" id="catalog-form">
              <span>${icon('search', 18)}</span>
              <input id="catalog-input" type="search" placeholder="搜索书名或作者，例如：Pride and Prejudice" value="${escapeHtml(query)}" autocomplete="off">
              <button class="btn btn--primary btn--sm" type="submit">搜索公版书</button>
            </form>
            <div class="catalog-source-note">
              <span>${icon('globe', 13)} 古登堡计划可读全文 · 豆瓣读书 / Google Books / Open Library 提供公开书目与简介</span>
              <a href="https://www.gutenberg.org/" target="_blank" rel="noreferrer">了解公版书库 ${icon('arrow-up-right', 11)}</a>
            </div>
            <button class="catalog-quick-title" type="button" id="quick-title">
              ${icon('sparkle', 13)} 找不到全文？直接用书名让 AI 解读
            </button>
            <div id="catalog-results" class="catalog-results"></div>

            <div class="direct-book">
              <div class="direct-book__mark">${icon('sparkle', 20)}</div>
              <div class="direct-book__head">
                <h3>没有找到？直接给我书名</h3>
                <p>AI 会基于书名、作者与公开知识写一份导读。因为没读全文，具体细节可能不完整，适合先快速了解一本书。</p>
              </div>
              <div class="import-fields import-fields--two">
                <label class="field"><span>书名 *</span><input id="direct-title" type="text" maxlength="120" placeholder="例如：人类简史"></label>
                <label class="field"><span>作者</span><input id="direct-author" type="text" maxlength="80" placeholder="尤瓦尔·赫拉利"></label>
              </div>
              <label class="field"><span>补充简介（可选）</span><textarea id="direct-description" rows="3" maxlength="3000" placeholder="粘贴书籍简介、目录或你记得的内容，会让分析更贴近这本书"></textarea></label>
              <button class="btn btn--primary btn--sm" type="button" id="direct-analyze">${icon('sparkle', 14)} 让 AI 按书名解读</button>
            </div>
          </div>

          <div class="import-panel" data-import-panel="paste" hidden>
            <div class="import-fields import-fields--two">
              <label class="field"><span>书名 *</span><input id="paste-title" type="text" maxlength="120" placeholder="例如：你想读的书"></label>
              <label class="field"><span>作者</span><input id="paste-author" type="text" maxlength="80" placeholder="作者"></label>
            </div>
            <label class="field">
              <span>正文 *</span>
              <textarea id="paste-text" rows="14" maxlength="300000" placeholder="把书的正文粘贴到这里。可以是全文，也可以是较长节选；内容越长，分析越完整。"></textarea>
              <small><span id="paste-counter">0</span> 字 · 建议至少 3,000 字，最多 300,000 字</small>
            </label>
            <div class="import-actions">
              <button class="btn btn--primary" type="button" id="paste-analyze">${icon('sparkle', 16)} 开始 AI 解读</button>
              <span>适合没有电子书文件、但能复制正文的情况</span>
            </div>
          </div>

          <div class="import-progress" id="import-progress" hidden>
            <div class="import-progress__top">
              <span class="import-progress__pulse">${icon('sparkle', 22)}</span>
              <div>
                <p class="eyebrow">AI READING</p>
                <h2 id="progress-title">正在读一本书</h2>
                <p id="progress-message">正在准备书稿…</p>
              </div>
              <button class="btn btn--ghost btn--sm" type="button" id="cancel-import">取消</button>
            </div>
            <div class="progress-track"><span id="progress-bar"></span></div>
            <div class="progress-meta"><span id="progress-count"></span><span id="progress-percent">0%</span></div>
            <div class="progress-log" id="progress-log" aria-live="polite"></div>
            <p class="import-note">${icon('info', 13)} 长篇书会分成多段送给模型，可能产生多次调用费用。请保持页面打开；完成后自动进入导读。</p>
          </div>

          <div class="import-error" id="import-error" hidden>
            <span class="import-error__icon">${icon('alert', 22)}</span>
            <div>
              <h3>这次没有成功</h3>
              <p id="import-error-message"></p>
            </div>
            <button class="btn btn--ghost btn--sm" type="button" id="retry-import">重新开始</button>
          </div>
        </div>
      </section>

      <aside class="import-aside">
        <section class="import-aside__card">
          <p class="eyebrow">HOW IT WORKS</p>
          <h3>三步，把一本书读薄</h3>
          <ol class="import-steps">
            <li><span>01</span><div><strong>放进书稿</strong><p>上传文件、找公版书，或粘贴正文。</p></div></li>
            <li><span>02</span><div><strong>AI 通读</strong><p>长书自动分段阅读，再汇总成全书脉络。</p></div></li>
            <li><span>03</span><div><strong>开始听与聊</strong><p>生成导读、金句和问题，直接进入听书页。</p></div></li>
          </ol>
        </section>
        <section class="import-aside__card import-aside__card--warm">
          <h3>为什么不直接接入微信读书？</h3>
          <p>微信读书、Kindle 等平台的正文受版权与 DRM 保护，没有公开接口允许第三方读取。绕过 DRM 既违反平台条款，也可能侵权，所以拾页选择了两条合法路径：</p>
          <ul>
            <li>导入你合法拥有、无 DRM 的文件</li>
            <li>读取古登堡计划等公共领域全文</li>
            <li>搜索豆瓣读书等平台的公开书目与简介</li>
          </ul>
        </section>
        <section class="import-aside__card">
          <h3>你的书稿去哪了？</h3>
          <p>文件在本机解析，不存进云端；分析时，正文会发送给你在设置里填写的 AI 服务商。AI 生成的内容可能有偏差，请以原书为准。</p>
          <button class="text-link" type="button" data-action="open-settings">查看 AI 设置 ${icon('arrow-right', 14)}</button>
        </section>
      </aside>
    </div>
  </div>`;
}

function setProgress(root, { percent, message, count }) {
  const bar = root.querySelector('#progress-bar');
  if (bar) bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  const messageEl = root.querySelector('#progress-message');
  if (messageEl && message) messageEl.textContent = message;
  const percentEl = root.querySelector('#progress-percent');
  if (percentEl) percentEl.textContent = `${Math.round(percent)}%`;
  const countEl = root.querySelector('#progress-count');
  if (countEl && count != null) countEl.textContent = count;
  if (message) {
    const log = root.querySelector('#progress-log');
    if (log) {
      const line = document.createElement('span');
      line.textContent = message;
      log.appendChild(line);
      while (log.children.length > 4) log.removeChild(log.firstElementChild);
    }
  }
}

function showProgress(root, title) {
  root.querySelector('#import-work').querySelectorAll('.import-tabs, .import-panel, .import-error').forEach((el) => {
    el.hidden = true;
  });
  const progress = root.querySelector('#import-progress');
  progress.hidden = false;
  root.querySelector('#progress-title').textContent = title || '正在读一本书';
  root.querySelector('#progress-log').innerHTML = '';
  setProgress(root, { percent: 2, message: '正在准备书稿…', count: '' });
  progress.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function restoreTabs(root, activeTab = 'file') {
  const work = root.querySelector('#import-work');
  if (!work) return;
  work.querySelectorAll('.import-tabs, .import-panel').forEach((el) => el.hidden = false);
  work.querySelectorAll('.import-panel').forEach((el) => {
    el.hidden = el.dataset.importPanel !== activeTab;
  });
  work.querySelectorAll('.import-tab').forEach((tab) => {
    const active = tab.dataset.importTab === activeTab;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  work.querySelector('#import-progress').hidden = true;
  work.querySelector('#import-error').hidden = true;
}

function showError(root, message, activeTab = 'file') {
  root.querySelector('#import-progress').hidden = true;
  restoreTabs(root, activeTab);
  const error = root.querySelector('#import-error');
  error.hidden = false;
  root.querySelector('#import-error-message').textContent = message || '未知错误';
  error.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function refreshAiBanner(root) {
  const current = root.querySelector('#import-ai-banner');
  if (!current) return;
  const status = aiStatus();
  const ready = status.mode === 'ai';
  current.classList.toggle('is-ready', ready);
  current.innerHTML = `
    <span class="import-ai-banner__icon">${icon(ready ? 'sparkle' : 'key', 18)}</span>
    <div>
      <strong>${ready ? `AI 已就绪 · ${escapeHtml(store.get().settings.model)}` : '还差一步：接入 AI'}</strong>
      <p>${ready ? '整书分析会调用你配置的模型，可能会产生 API 费用。' : '整书分析需要一个 AI 模型。配置 API Key 后即可开始；没有 Key 仍可使用内置 14 本书。'}</p>
    </div>
    <button class="btn btn--ghost btn--sm" type="button" data-action="open-settings">${ready ? '模型设置' : '去配置 AI'}</button>`;
}

export function initImport(root, query = '') {
  cleanupImport();
  refreshAiBanner(root);
  settingsListener = () => refreshAiBanner(root);
  window.addEventListener('settings:updated', settingsListener);
  let activeTab = 'file';

  const tabs = Array.from(root.querySelectorAll('[data-import-tab]'));
  const panels = Array.from(root.querySelectorAll('[data-import-panel]'));
  const fileInput = root.querySelector('#file-input');
  const dropzone = root.querySelector('#dropzone');
  const selectedFileEl = root.querySelector('#selected-file');
  const selectedFileName = root.querySelector('#selected-file-name');
  const selectedFileSize = root.querySelector('#selected-file-size');
  const fileAnalyze = root.querySelector('#file-analyze');
  const fileTitle = root.querySelector('#file-title');
  const fileAuthor = root.querySelector('#file-author');
  const catalogInput = root.querySelector('#catalog-input');
  const catalogForm = root.querySelector('#catalog-form');
  const catalogResults = root.querySelector('#catalog-results');
  const directTitle = root.querySelector('#direct-title');
  const directAuthor = root.querySelector('#direct-author');
  const directDescription = root.querySelector('#direct-description');
  const directAnalyze = root.querySelector('#direct-analyze');
  const quickTitle = root.querySelector('#quick-title');
  const pasteTitle = root.querySelector('#paste-title');
  const pasteAuthor = root.querySelector('#paste-author');
  const pasteText = root.querySelector('#paste-text');
  const pasteCounter = root.querySelector('#paste-counter');
  const pasteAnalyze = root.querySelector('#paste-analyze');
  const progress = root.querySelector('#import-progress');
  const cancelButton = root.querySelector('#cancel-import');
  const retryButton = root.querySelector('#retry-import');
  let selectedFile = null;
  let catalogData = [];
  let flowController = null;
  let lastFlow = null;

  const switchTab = (name) => {
    activeTab = name;
    tabs.forEach((tab) => {
      const active = tab.dataset.importTab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.importPanel !== name;
    });
  };

  const requireKey = () => {
    if (hasApiKey()) return true;
    toast('整书分析需要先配置 AI 模型。', { type: 'error' });
    openSettings();
    return false;
  };

  const updateFromAnalysis = (payload) => {
    const percent =
      payload.stage === 'reading'
        ? 5 + (payload.total ? (payload.completed / payload.total) * 82 : 8)
        : payload.stage === 'synthesis'
          ? 90
          : payload.stage === 'done'
            ? 100
            : 8;
    setProgress(root, {
      percent,
      message: payload.message,
      count: payload.total ? `${payload.completed}/${payload.total} 段` : '',
    });
  };

  const runFlow = async ({ label, prepare }) => {
    if (!requireKey() || flowController) return;
    lastFlow = { label, prepare };
    flowController = new AbortController();
    activeFlowController = flowController;
    const controller = flowController;
    showProgress(root, label);
    try {
      setProgress(root, { percent: 3, message: '正在准备书稿…', count: '' });
      const prepared = await prepare(controller.signal);
      if (!prepared?.text && prepared?.sourceType !== 'metadata') throw new Error('没有读到正文。');
      setProgress(root, { percent: 6, message: prepared?.text ? `已读取 ${(prepared.text.length / 10000).toFixed(1)} 万字，开始分析…` : '正在整理公开资料…', count: '' });
      const book = await analyzeBook({
        ...prepared,
        signal: controller.signal,
        onProgress: updateFromAnalysis,
      });
      if (!root.isConnected) return;
      store.addImportedBook(book);
      setProgress(root, { percent: 100, message: `《${book.title}》的导读已生成，正在打开…`, count: '' });
      toast('AI 导读已生成');
      clearTimeout(successTimer);
      successTimer = setTimeout(() => {
        if (root.isConnected) location.hash = `#/book/${book.id}/ideas`;
      }, 700);
    } catch (error) {
      if (!root.isConnected) return;
      if (error.name === 'AbortError') {
        toast('已取消分析');
        restoreTabs(root, activeTab);
      } else {
        showError(root, error.message || '分析失败，请稍后再试。', activeTab);
      }
    } finally {
      flowController = null;
      activeFlowController = null;
      cancelButton.disabled = false;
    }
  };

  const extractFile = async (file, signal) => {
    if (!file) throw new Error('请先选择一个 EPUB 或 TXT 文件。');
    if (file.size > 30 * 1024 * 1024) throw new Error('文件超过 30MB，请换一个更小的版本。');
    setProgress(root, { percent: 4, message: `正在本机解析 ${file.name}…`, count: '' });
    const response = await fetch('/api/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Filename': encodeURIComponent(file.name),
      },
      body: await file.arrayBuffer(),
      signal,
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error?.message || '文件解析失败。');
    const format = (data.format || '').toUpperCase();
    return {
      text: data.text,
      title: fileTitle.value.trim() || data.title || file.name.replace(/\.[^.]+$/, ''),
      author: fileAuthor.value.trim() || data.author || '',
      sourceType: 'file',
      sourceLabel: `上传 · ${format || '文件'}`,
    };
  };

  const pickFile = (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['epub', 'txt', 'md', 'markdown', 'html', 'htm'].includes(ext)) {
      toast('只支持 EPUB、TXT、Markdown 和 HTML 文件。', { type: 'error' });
      return;
    }
    selectedFile = file;
    selectedFileName.textContent = file.name;
    selectedFileSize.textContent = `${formatBytes(file.size)} · 等待解析`;
    selectedFileEl.hidden = false;
    fileAnalyze.disabled = false;
    dropzone.classList.add('has-file');
  };

  dropzone.addEventListener('click', (event) => {
    if (event.target === fileInput) return;
    fileInput.click();
  });
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragging');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragging'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragging');
    pickFile(event.dataTransfer.files?.[0]);
  });
  fileInput.addEventListener('change', () => pickFile(fileInput.files?.[0]));

  root.querySelector('#remove-file').addEventListener('click', (event) => {
    event.stopPropagation();
    selectedFile = null;
    fileInput.value = '';
    selectedFileEl.hidden = true;
    fileAnalyze.disabled = true;
    dropzone.classList.remove('has-file');
  });

  fileAnalyze.addEventListener('click', () => {
    if (!selectedFile) return;
    const file = selectedFile;
    runFlow({
      label: `正在读《${fileTitle.value.trim() || file.name.replace(/\.[^.]+$/, '')}》`,
      prepare: (signal) => extractFile(file, signal),
    });
  });

  const renderCatalog = (data) => {
    catalogData = data.results || [];
    if (!catalogData.length) {
      catalogResults.innerHTML = `<div class="catalog-empty">${icon('search', 22)}<p>没有找到这本书。可以换个关键词，或直接用书名让 AI 解读。</p><button class="btn btn--ghost btn--sm" type="button" data-use-title>${icon('sparkle', 13)} 用「${escapeHtml(catalogInput.value.trim() || '这本书')}」让 AI 解读</button></div>`;
      catalogResults.querySelector('[data-use-title]')?.addEventListener('click', focusDirectTitle);
      return;
    }
    catalogResults.innerHTML = `<div class="catalog-results__head"><span>找到 ${catalogData.length} 本书</span><span>来自在线书库</span></div>${catalogData.map(catalogCard).join('')}`;
    catalogResults.querySelectorAll('[data-catalog-full]').forEach((button) => {
      button.addEventListener('click', () => {
        const result = catalogData[Number(button.dataset.catalogFull)];
        if (!result) return;
        runFlow({
          label: `正在读《${result.title}》`,
          prepare: async (signal) => {
            setProgress(root, { percent: 4, message: '正在下载公版全文…', count: '' });
            const response = await fetch(`/api/catalog/text?id=${encodeURIComponent(result.id)}`, { signal });
            let payload = {};
            try { payload = await response.json(); } catch {}
            if (!response.ok) throw new Error(payload.error?.message || '全文下载失败。');
            return {
              text: payload.text,
              title: result.title || payload.title,
              author: result.author || payload.author,
              sourceType: 'gutenberg',
              sourceLabel: '公版全文 · 古登堡计划',
            };
          },
        });
      });
    });
    catalogResults.querySelectorAll('[data-catalog-meta]').forEach((button) => {
      button.addEventListener('click', () => {
        const result = catalogData[Number(button.dataset.catalogMeta)];
        if (!result) return;
        runFlow({
          label: `正在读《${result.title}》`,
          prepare: async (signal) => {
            let description = result.description || '';
            let sourceLabel = result.source === 'gutenberg' ? '公开简介 · 古登堡计划' : `${result.sourceLabel || '在线书库'} · 公开简介`;
            if (result.source === 'douban' && result.detailId) {
              setProgress(root, { percent: 4, message: '正在读取豆瓣公开简介…', count: '' });
              try {
                const response = await fetch(`/api/douban/detail?id=${encodeURIComponent(result.detailId)}`, { signal });
                const data = await response.json();
                if (response.ok) description = data.description || description;
              } catch {}
              if (!description) sourceLabel = '豆瓣读书 · 书目信息';
            }
            return {
              title: result.title,
              author: result.author,
              description,
              sourceType: 'metadata',
              sourceLabel,
            };
          },
        });
      });
    });
  };

  const searchCatalog = async () => {
    const q = catalogInput.value.trim();
    if (!q) { catalogInput.focus(); return; }
    activeCatalogAbort?.abort();
    activeCatalogAbort = new AbortController();
    catalogResults.innerHTML = `<div class="catalog-loading"><span class="spinner"></span><p>正在公开书库中找「${escapeHtml(q)}」…</p></div>`;
    try {
      const response = await fetch(`/api/catalog?q=${encodeURIComponent(q)}`, { signal: activeCatalogAbort.signal });
      let data = {};
      try { data = await response.json(); } catch {}
      if (!response.ok) throw new Error(data.error?.message || '公版书库暂时不可用。');
      renderCatalog(data);
    } catch (error) {
      if (error.name === 'AbortError') return;
      catalogResults.innerHTML = `<div class="catalog-empty catalog-empty--error">${icon('alert', 22)}<p>${escapeHtml(error.message || '搜索失败。')}</p><span>你仍然可以上传文件，或使用下方的“直接给书名”。</span><button class="btn btn--ghost btn--sm" type="button" data-use-title>${icon('sparkle', 13)} 用书名让 AI 解读</button></div>`;
      catalogResults.querySelector('[data-use-title]')?.addEventListener('click', focusDirectTitle);
    }
  };

  catalogForm.addEventListener('submit', (event) => {
    event.preventDefault();
    searchCatalog();
  });

  const focusDirectTitle = () => {
    directTitle.value = catalogInput.value.trim() || directTitle.value;
    directTitle.scrollIntoView({ behavior: 'smooth', block: 'center' });
    directTitle.focus();
  };

  quickTitle?.addEventListener('click', focusDirectTitle);

  directAnalyze.addEventListener('click', () => {
    const title = directTitle.value.trim();
    if (!title) {
      toast('先告诉我书名吧。', { type: 'error' });
      directTitle.focus();
      return;
    }
    runFlow({
      label: `正在读《${title}》`,
      prepare: async () => ({
        title,
        author: directAuthor.value.trim(),
        description: directDescription.value.trim(),
        sourceType: 'metadata',
        sourceLabel: '书名 + 公开知识',
      }),
    });
  });

  pasteText.addEventListener('input', () => {
    pasteCounter.textContent = pasteText.value.trim().length.toLocaleString('zh-CN');
  });

  pasteAnalyze.addEventListener('click', () => {
    const title = pasteTitle.value.trim();
    const text = pasteText.value.trim();
    if (!title) {
      toast('给这段文字取一个书名吧。', { type: 'error' });
      pasteTitle.focus();
      return;
    }
    if (text.length < 300) {
      toast('正文太短，至少粘贴 300 字。', { type: 'error' });
      pasteText.focus();
      return;
    }
    runFlow({
      label: `正在读《${title}》`,
      prepare: async () => ({
        text,
        title,
        author: pasteAuthor.value.trim(),
        sourceType: 'text',
        sourceLabel: '粘贴文本',
      }),
    });
  });

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.importTab));
  });

  cancelButton.addEventListener('click', () => {
    flowController?.abort();
  });

  retryButton.addEventListener('click', () => {
    restoreTabs(root, activeTab);
  });

  if (query) {
    switchTab('search');
    catalogInput.value = query;
    directTitle.value = query;
    setTimeout(searchCatalog, 250);
  }
}

export function cleanupImport() {
  if (settingsListener) {
    window.removeEventListener('settings:updated', settingsListener);
    settingsListener = null;
  }
  if (activeFlowController) {
    activeFlowController.abort();
    activeFlowController = null;
  }
  if (activeCatalogAbort) {
    activeCatalogAbort.abort();
    activeCatalogAbort = null;
  }
  clearTimeout(successTimer);
}
