import { narrator } from './tts.js';
import { getBook } from './data.js';
import { icon } from './icons.js';
import { coverHTML, toast } from './ui.js';
import { clamp, escapeHtml } from './utils.js';

let root = null;
let builtBookId = null;
let open = false;
let seeking = false;
let lastVoicesKey = '';
let lastFocus = null;

const waveformBars = Array.from({ length: 32 }, (_, index) => {
  const height = 16 + ((index * 37) % 64);
  return `<i style="--h:${height}%;--d:${(index % 9) * 0.11}s"></i>`;
}).join('');

function voiceOptions(state) {
  const seen = new Set();
  const voices = state.voices
    .filter((voice) => /^zh/i.test(voice.lang))
    .filter((voice) => {
      const key = `${voice.engine || 'system'}|${String(voice.name || '').trim().toLowerCase()}|${voice.lang || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const list = voices.length ? voices : state.voices;
  if (!list.length) return '<option value="">系统默认声音</option>';
  const edge = list.filter((voice) => voice.engine === 'edge');
  const system = list.filter((voice) => voice.engine !== 'edge');
  const option = (voice) =>
    `<option value="${escapeHtml(voice.uri)}" ${voice.uri === state.voiceURI ? 'selected' : ''}>${escapeHtml(voice.name)}${voice.engine === 'edge' ? ' · 自然人声' : ''}</option>`;
  return `<option value="">自动（自然人声优先）</option>
    ${edge.length ? `<optgroup label="自然人声 · 微软 Edge">${edge.map(option).join('')}</optgroup>` : ''}
    ${system.length ? `<optgroup label="系统语音 · 离线">${system.map(option).join('')}</optgroup>` : ''}`;
}

function buildShell(state) {
  const book = narrator.book;
  if (!book) {
    root.innerHTML = '';
    document.body.classList.remove('has-player');
    builtBookId = null;
    return;
  }
  builtBookId = book.id;
  document.body.classList.add('has-player');
  root.innerHTML = `
    <div class="player-bar" aria-label="听书播放器">
      <button class="player-bar__cover" type="button" data-p-action="open" aria-label="展开播放器">
        ${coverHTML(book, { size: 'xxs' })}
      </button>
      <div class="player-bar__info">
        <a class="player-bar__title" href="#/book/${book.id}">${escapeHtml(book.title)}</a>
        <span class="player-bar__label" id="bar-label">${escapeHtml(state.current?.label || '准备播放')}</span>
      </div>
      <div class="player-bar__center">
        <button class="player-bar__skip" type="button" data-p-action="prev" aria-label="上一节">${icon('skip-back', 17)}</button>
        <button class="player-bar__toggle" type="button" data-p-action="toggle" aria-label="播放/暂停" id="bar-toggle">${icon(state.playing ? 'pause' : 'play', 18)}</button>
        <button class="player-bar__skip" type="button" data-p-action="next" aria-label="下一节">${icon('skip-forward', 17)}</button>
      </div>
      <div class="player-bar__progress">
        <button class="player-bar__track" type="button" data-p-action="seek-track" aria-label="调整播放进度"><span id="bar-progress"></span></button>
        <div class="player-bar__time"><span id="bar-percent">0%</span><span id="bar-remain"></span></div>
      </div>
      <button class="player-bar__expand" type="button" data-p-action="open" aria-label="展开播放器">${icon('expand', 17)}</button>
      <button class="player-bar__close" type="button" data-p-action="close-bar" aria-label="关闭播放器">${icon('close', 16)}</button>
    </div>

    <div class="player-full" style="--pa:${book.cover.a};--pb:${book.cover.b}" role="dialog" aria-modal="true" aria-label="听书播放器" aria-hidden="true">
      <div class="player-full__wash"></div>
      <div class="player-full__noise"></div>
      <div class="player-full__panel" tabindex="-1">
        <header class="player-full__head">
          <button class="icon-btn icon-btn--glass" type="button" data-p-action="close" aria-label="收起播放器">${icon('chevron-down', 21)}</button>
          <span class="player-full__eyebrow">正在收听 · 拾页精华</span>
          <button class="icon-btn icon-btn--glass" type="button" data-action="open-settings" aria-label="播放设置">${icon('settings', 18)}</button>
        </header>
        <div class="player-full__content">
          <div class="player-full__art">
            <span class="player-full__halo" aria-hidden="true"></span>
            <span class="player-full__ring" aria-hidden="true"></span>
            ${coverHTML(book, { size: 'xl' })}
            <span class="player-full__art-caption">${icon('headphones', 13)} SHIYE AUDIO ESSAY</span>
          </div>
          <div class="player-full__details">
            <p class="eyebrow">NOW LISTENING</p>
            <h2><a href="#/book/${book.id}">${escapeHtml(book.title)}</a></h2>
            <p class="player-full__author">${escapeHtml(book.author)}</p>
            <p class="player-full__current" id="full-current">${escapeHtml(state.current?.label || '')}</p>

            <div class="waveform" id="waveform" aria-hidden="true">${waveformBars}</div>

            <div class="player-seek">
              <input type="range" min="0" max="1000" value="0" step="1" id="player-seek" aria-label="播放进度">
              <div class="player-seek__labels">
                <span id="seek-percent">0%</span>
                <span id="seek-remain"></span>
              </div>
            </div>

            <div class="player-controls">
              <button class="player-controls__skip" type="button" data-p-action="prev" aria-label="上一节">${icon('skip-back', 22)}</button>
              <button class="player-controls__main" type="button" data-p-action="toggle" aria-label="播放/暂停" id="full-toggle">${icon(state.playing ? 'pause' : 'play', 26)}</button>
              <button class="player-controls__skip" type="button" data-p-action="next" aria-label="下一节">${icon('skip-forward', 22)}</button>
            </div>

            <div class="player-options">
              <div class="rate-chips" role="group" aria-label="播放速度">
                ${[0.8, 1, 1.25, 1.5, 2]
                  .map(
                    (rate) =>
                      `<button type="button" data-p-rate="${rate}" class="${Math.abs(rate - state.rate) < 0.01 ? 'is-active' : ''}">${rate}×</button>`,
                  )
                  .join('')}
              </div>
              <div class="player-selects">
                <label class="mini-select">
                  <span>${icon('volume', 14)} 声音</span>
                  <select id="voice-select">${voiceOptions(state)}</select>
                </label>
                <label class="mini-select">
                  <span>${icon('moon', 14)} 定时</span>
                  <select id="sleep-select">
                    <option value="0">不定时</option>
                    <option value="15">15 分钟</option>
                    <option value="30">30 分钟</option>
                    <option value="60">60 分钟</option>
                    <option value="90">90 分钟</option>
                  </select>
                </label>
              </div>
            </div>
            <p class="player-full__tip" id="player-tip">${icon('info', 13)} 自然人声由微软 Edge 在线合成，首次生成约需几秒；断网时可切换系统语音。</p>
          </div>
        </div>
      </div>
    </div>`;

  lastVoicesKey = `${state.voices.length}-${state.voiceURI}`;
  root.querySelector('.player-full').classList.toggle('is-open', open);
  root.querySelector('.player-full').setAttribute('aria-hidden', String(!open));
  document.body.classList.toggle('player-open', open);
  document.body.classList.toggle('is-playing', state.playing);
}

function remainText(state) {
  const remaining = Math.max(1, Math.round((state.totalMinutes || 0) * (1 - state.percent)));
  return `剩余约 ${remaining} 分钟`;
}

function update(state) {
  if (!root) return;
  if (!state.bookId) {
    buildShell(state);
    closeFull();
    return;
  }
  if (state.bookId !== builtBookId) buildShell(state);
  if (!builtBookId) return;

  const barLabel = root.querySelector('#bar-label');
  if (barLabel) barLabel.textContent = state.loading ? '正在生成自然人声…' : state.current?.label || '准备播放';
  root.querySelector('.player-bar')?.classList.toggle('is-loading', Boolean(state.loading));
  root.querySelector('.player-full')?.classList.toggle('is-loading', Boolean(state.loading));
  const barToggle = root.querySelector('#bar-toggle');
  if (barToggle) barToggle.innerHTML = icon(state.playing ? 'pause' : 'play', 18);
  const barProgress = root.querySelector('#bar-progress');
  if (barProgress) barProgress.style.width = `${Math.round(state.percent * 1000) / 10}%`;
  const barPercent = root.querySelector('#bar-percent');
  if (barPercent) barPercent.textContent = `${Math.round(state.percent * 100)}%`;
  const barRemain = root.querySelector('#bar-remain');
  if (barRemain) barRemain.textContent = remainText(state);

  const fullToggle = root.querySelector('#full-toggle');
  if (fullToggle) fullToggle.innerHTML = icon(state.playing ? 'pause' : 'play', 26);
  const fullCurrent = root.querySelector('#full-current');
  if (fullCurrent) fullCurrent.textContent = state.loading ? '正在生成自然人声，请稍候…' : state.current?.label || '准备播放';
  const waveform = root.querySelector('#waveform');
  if (waveform) waveform.classList.toggle('is-playing', state.playing && !state.loading);
  document.body.classList.toggle('is-playing', state.playing);

  const seek = root.querySelector('#player-seek');
  if (seek && !seeking) seek.value = String(Math.round(state.percent * 1000));
  const seekPercent = root.querySelector('#seek-percent');
  if (seekPercent) seekPercent.textContent = `${Math.round(state.percent * 100)}%`;
  const seekRemain = root.querySelector('#seek-remain');
  if (seekRemain) seekRemain.textContent = remainText(state);

  root.querySelectorAll('[data-p-rate]').forEach((button) => {
    button.classList.toggle('is-active', Math.abs(Number(button.dataset.pRate) - state.rate) < 0.01);
  });

  const voicesKey = `${state.voices.length}-${state.voiceURI}`;
  const voiceSelect = root.querySelector('#voice-select');
  if (voiceSelect && voicesKey !== lastVoicesKey) {
    voiceSelect.innerHTML = voiceOptions(state);
    lastVoicesKey = voicesKey;
  }
}

function openFull() {
  if (!narrator.book || !root) return;
  open = true;
  lastFocus = document.activeElement;
  const panel = root.querySelector('.player-full');
  panel?.classList.add('is-open');
  panel?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('player-open');
  setTimeout(() => {
    const panel = root.querySelector('.player-full__panel');
    panel?.focus({ preventScroll: true });
  }, 80);
}

function closeFull() {
  open = false;
  if (!root) return;
  const panel = root.querySelector('.player-full');
  panel?.classList.remove('is-open');
  panel?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('player-open');
  lastFocus?.focus?.();
}

function seekFromTrack(track, event) {
  const rect = track.getBoundingClientRect();
  return clamp((event.clientX - rect.left) / rect.width, 0, 1);
}

export function openPlayerPanel() {
  openFull();
}

export function closePlayerPanel() {
  if (open) closeFull();
}

export function initPlayer() {
  root = document.getElementById('player-root');
  if (!root) return;
  narrator.subscribe(update);
  update(narrator.getState());

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-p-action]');
    if (!button) return;
    const action = button.dataset.pAction;
    if (action === 'open') {
      openFull();
    } else if (action === 'close') {
      closeFull();
    } else if (action === 'close-bar') {
      closeFull();
      narrator.close();
    } else if (action === 'toggle') {
      narrator.toggle();
    } else if (action === 'prev') {
      narrator.previousSection();
    } else if (action === 'next') {
      narrator.nextSection();
    } else if (action === 'seek-track') {
      const ratio = seekFromTrack(button, event);
      narrator.seekPercent(ratio);
    }
  });

  root.addEventListener('click', (event) => {
    const rate = event.target.closest('[data-p-rate]');
    if (rate) narrator.setRate(Number(rate.dataset.pRate));
  });

  root.addEventListener('change', (event) => {
    if (event.target.id === 'voice-select') {
      narrator.setVoice(event.target.value);
      toast('已切换朗读声音');
    }
    if (event.target.id === 'sleep-select') {
      const minutes = Number(event.target.value);
      narrator.setSleep(minutes);
      toast(minutes ? `将在 ${minutes} 分钟后暂停播放` : '已取消定时关闭', {
        icon: minutes ? 'moon' : 'check',
      });
    }
  });

  const seek = () => root.querySelector('#player-seek');
  root.addEventListener('pointerdown', (event) => {
    if (event.target.id === 'player-seek') {
      seeking = true;
    }
  });
  root.addEventListener('input', (event) => {
    if (event.target.id !== 'player-seek') return;
    seeking = true;
    const value = Number(event.target.value) / 1000;
    const percent = root.querySelector('#seek-percent');
    if (percent) percent.textContent = `${Math.round(value * 100)}%`;
    const state = narrator.getState();
    const remain = root.querySelector('#seek-remain');
    if (remain) {
      remain.textContent = `剩余约 ${Math.max(1, Math.round((state.totalMinutes || 0) * (1 - value)))} 分钟`;
    }
  });
  root.addEventListener('change', (event) => {
    if (event.target.id !== 'player-seek') return;
    seeking = false;
    narrator.seekPercent(Number(event.target.value) / 1000);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      if (document.body.classList.contains('has-modal') || document.body.classList.contains('has-search')) return;
      event.preventDefault();
      closeFull();
    }
  });

  window.addEventListener('narrator:finished', (event) => {
    const book = getBook(event.detail?.bookId);
    toast(book ? `《${book.title}》听完了，去聊聊你的想法？` : '本书已听完', {
      icon: 'sparkle',
      actionLabel: '去讨论',
      onAction: () => {
        if (book) location.hash = `#/book/${book.id}/chat`;
      },
      duration: 5000,
    });
  });
  window.addEventListener('narrator:sleep', () => {
    toast('定时结束，播放已暂停', { icon: 'moon' });
  });
  window.addEventListener('narrator:error', (event) => {
    toast(event.detail || '语音播放遇到问题', { type: 'error' });
  });

}
