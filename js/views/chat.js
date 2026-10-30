import { aiStatus, generateLocalReply, hasApiKey, streamChat, ChatError } from '../ai.js';
import { narrator } from '../tts.js';
import { icon } from '../icons.js';
import { openModal, toast } from '../ui.js';
import { store } from '../store.js';
import { escapeHtml, renderMarkdown, uid } from '../utils.js';

let activeAbort = null;
let pendingTimer = null;

const sourceLabel = (source) => (source === 'ai' ? 'AI 深度讨论' : '本地导读');

function messageHTML(message) {
  const isUser = message.role === 'user';
  if (isUser) {
    return `
      <div class="message message--user" data-message-id="${message.id}">
        <div class="message__bubble">${renderMarkdown(message.content)}</div>
      </div>`;
  }
  return `
    <div class="message message--assistant" data-message-id="${message.id}">
      <span class="message__avatar">拾</span>
      <div class="message__main">
        <div class="message__meta">
          <strong>拾页导读员</strong>
          <span class="message__tag ${message.source === 'ai' ? 'is-ai' : ''}">${sourceLabel(message.source)}</span>
        </div>
        <div class="message__bubble">
          ${message.pending && !message.content ? '<span class="typing"><i></i><i></i><i></i></span>' : renderMarkdown(message.content)}
        </div>
        ${
          message.pending
            ? ''
            : `<div class="message__actions">
                <button type="button" data-msg-copy="${message.id}">${icon('copy', 13)} 复制</button>
                <button type="button" data-msg-speak="${message.id}">${icon('volume', 13)} 朗读</button>
              </div>`
        }
      </div>
    </div>`;
}

export function chatHTML(book) {
  const status = aiStatus();
  const messages = store.getChat(book.id);
  return `
    <div class="tab-panel tab-panel--chat">
      <div class="chat-layout">
        <aside class="chat-context">
          <div class="chat-context__book">
            <div class="chat-context__cover" style="--ca:${book.cover.a};--cb:${book.cover.b}">
              <span>${escapeHtml(book.title.slice(0, 1))}</span>
            </div>
            <div>
              <p>正在讨论</p>
              <h3>${escapeHtml(book.title)}</h3>
              <span>${escapeHtml(book.author)}</span>
            </div>
          </div>
          <div class="chat-context__status ${status.mode === 'ai' ? 'is-ai' : ''}">
            <span class="status-dot"></span>
            <div><strong>${status.label}</strong><span>${status.detail}</span></div>
          </div>
          <p class="chat-context__lead">${escapeHtml(book.oneLiner)}</p>
          <div class="chat-context__questions">
            <p>可以这样开始</p>
            ${book.questions
              .slice(0, 4)
              .map(
                (question, index) => `
              <button type="button" data-chat-starter="${escapeHtml(question)}">
                <span>0${index + 1}</span>${escapeHtml(question)}
              </button>`,
              )
              .join('')}
          </div>
          ${
            status.mode === 'local'
              ? `<button class="chat-context__setup" type="button" data-action="open-settings">${icon('key', 14)} 配置 AI 深度讨论</button>`
              : `<span class="chat-context__secure">${icon('lock', 12)} 密钥仅保存在本机</span>`
          }
        </aside>

        <section class="chat-shell">
          <header class="chat-head">
            <div class="chat-head__identity">
              <span class="chat-head__avatar">拾</span>
              <div>
                <strong>和《${escapeHtml(book.title)}》聊聊</strong>
                <span><i class="status-dot ${status.mode === 'ai' ? 'is-live' : ''}"></i>${status.label} · 基于本书内容</span>
              </div>
            </div>
            <button class="chat-head__clear" type="button" data-chat-clear ${messages.length ? '' : 'hidden'}>${icon('trash', 14)} 清空</button>
          </header>

          ${
            status.mode === 'local'
              ? `<div class="chat-banner">
                  <span>${icon('sparkle', 15)}</span>
                  <p>现在是<strong>本地导读模式</strong>：回答由本书内容生成。配置 API Key 后，可以进行更自由的深度追问。</p>
                  <button type="button" data-action="open-settings">去配置</button>
                </div>`
              : ''
          }

          <div class="chat-scroll" id="chat-scroll">
            <div class="chat-welcome">
              <span class="chat-welcome__avatar">拾</span>
              <div class="chat-welcome__body">
                <p class="chat-welcome__hello">你好，我是这本书的导读员。</p>
                <p>书里最让我在意的一句话是：</p>
                <blockquote>“${escapeHtml(book.oneLiner)}”</blockquote>
                <p>你可以问我书里的观点，可以不同意作者，也可以把它套进你最近的困惑。这里没有标准答案。</p>
              </div>
            </div>
            <div class="chat-messages" id="chat-messages" aria-live="polite">
              ${messages.map(messageHTML).join('')}
            </div>
          </div>

          <div class="chat-starters" id="chat-starters" ${messages.length ? 'hidden' : ''}>
            ${book.questions
              .slice(0, 3)
              .map(
                (question) =>
                  `<button type="button" data-chat-starter="${escapeHtml(question)}">${escapeHtml(question)}</button>`,
              )
              .join('')}
          </div>

          <form class="chat-composer" id="chat-form">
            <textarea id="chat-input" rows="1" maxlength="1200" placeholder="说说你的想法，或问一个具体的问题…" aria-label="输入讨论内容"></textarea>
            <div class="chat-composer__bar">
              <span class="chat-composer__hint">Enter 发送 · Shift + Enter 换行</span>
              <button class="chat-send" type="submit" aria-label="发送">
                ${icon('send', 17)}
              </button>
            </div>
          </form>
          <p class="chat-footnote">${icon('info', 12)} 讨论内容由 AI 或本地导读生成，请保留自己的判断。</p>
        </section>
      </div>
    </div>`;
}

async function speakMessage(text) {
  const clean = text
    .replace(/\*\*/g, '')
    .replace(/[#>`]/g, '')
    .replace(/^\s*[-•]\s*/gm, '')
    .trim();
  if (!clean) return;
  toast('正在生成朗读', { icon: 'volume', duration: 1600 });
  const ok = await narrator.speakText(clean);
  if (!ok) toast('朗读失败，请检查声音设置。', { type: 'error' });
}

export function initChat(book, root) {
  const shell = root.querySelector('.chat-shell');
  if (!shell) return;
  cleanupChat();

  const scroller = root.querySelector('#chat-scroll');
  const messagesEl = root.querySelector('#chat-messages');
  const starters = root.querySelector('#chat-starters');
  const form = root.querySelector('#chat-form');
  const input = root.querySelector('#chat-input');
  const sendButton = form.querySelector('.chat-send');
  const clearButton = root.querySelector('[data-chat-clear]');
  const messages = store.getChat(book.id).slice();
  let streaming = false;

  const save = () => {
    store.saveChat(
      book.id,
      messages.map(({ id, role, content, at, source }) => ({
        id,
        role,
        content,
        at,
        source,
      })),
    );
  };

  const isNearBottom = () =>
    scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140;

  const scrollBottom = (smooth = false) => {
    requestAnimationFrame(() => {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
  };

  const autoGrow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  };

  const setStreaming = (value) => {
    streaming = value;
    sendButton.classList.toggle('is-stop', value);
    sendButton.innerHTML = value ? icon('pause', 16) : icon('send', 17);
    sendButton.setAttribute('aria-label', value ? '停止生成' : '发送');
    input.disabled = false;
  };

  const updateAssistant = (id, content, { pending = false, source = 'ai' } = {}) => {
    const bubble = messagesEl.querySelector(`[data-message-id="${id}"] .message__bubble`);
    if (!bubble) return;
    bubble.innerHTML = pending && !content ? '<span class="typing"><i></i><i></i><i></i></span>' : renderMarkdown(content);
    const meta = messagesEl.querySelector(`[data-message-id="${id}"] .message__tag`);
    if (meta) meta.textContent = sourceLabel(source);
    const msg = messages.find((item) => item.id === id);
    if (msg) {
      msg.content = content;
      msg.pending = pending;
      msg.source = source;
    }
    if (isNearBottom()) scrollBottom();
  };

  const finishAssistant = (id) => {
    const msg = messages.find((item) => item.id === id);
    if (!msg) return;
    msg.pending = false;
    const node = messagesEl.querySelector(`[data-message-id="${id}"]`);
    if (node) {
      node.outerHTML = messageHTML(msg);
    }
    save();
    scrollBottom();
  };

  const send = async (rawText) => {
    if (streaming) return;
    const text = String(rawText || input.value).trim();
    if (!text) return;
    if (text.length > 1200) {
      toast('一次最多输入 1200 个字。', { type: 'error' });
      return;
    }

    const userMessage = {
      id: uid(),
      role: 'user',
      content: text,
      at: Date.now(),
    };
    messages.push(userMessage);
    messagesEl.insertAdjacentHTML('beforeend', messageHTML(userMessage));
    input.value = '';
    input.style.height = 'auto';
    starters.hidden = true;
    scrollBottom(true);

    const assistant = {
      id: uid(),
      role: 'assistant',
      content: '',
      at: Date.now(),
      source: hasApiKey() ? 'ai' : 'local',
      pending: true,
    };
    messages.push(assistant);
    messagesEl.insertAdjacentHTML('beforeend', messageHTML(assistant));
    scrollBottom(true);
    save();
    setStreaming(true);

    const finish = () => {
      finishAssistant(assistant.id);
      setStreaming(false);
      activeAbort = null;
    };

    if (!hasApiKey()) {
      pendingTimer = setTimeout(() => {
        const reply = generateLocalReply(book, text, messages.slice(0, -1));
        updateAssistant(assistant.id, reply, { pending: false, source: 'local' });
        assistant.pending = false;
        assistant.content = reply;
        finish();
        input.focus();
      }, 520);
      return;
    }

    const controller = new AbortController();
    activeAbort = controller;
    const conversation = messages.slice(0, -1).map(({ role, content }) => ({ role, content }));
    try {
      const reply = await streamChat({
        book,
        messages: conversation,
        signal: controller.signal,
        onDelta: (delta, full) => {
          updateAssistant(assistant.id, full, { pending: true, source: 'ai' });
        },
      });
      updateAssistant(assistant.id, reply, { pending: false, source: 'ai' });
      assistant.pending = false;
      assistant.content = reply;
      finish();
    } catch (error) {
      if (error.name === 'AbortError' || controller.signal.aborted) {
        if (assistant.content?.trim()) {
          assistant.pending = false;
          finish();
        } else {
          messages.pop();
          const node = messagesEl.querySelector(`[data-message-id="${assistant.id}"]`);
          node?.remove();
          save();
          setStreaming(false);
        }
        return;
      }
      const message = error instanceof ChatError ? error.message : 'AI 暂时没有回应。';
      toast(message, { type: 'error' });
      const fallback = generateLocalReply(book, text, messages.slice(0, -1));
      const note = assistant.content?.trim()
        ? `${assistant.content}\n\n（连接中断，以下切换到本地导读）\n\n${fallback}`
        : `连接 AI 时遇到问题：${message}\n\n先用本地导读回应你：\n\n${fallback}`;
      updateAssistant(assistant.id, note, { pending: false, source: 'local' });
      assistant.pending = false;
      assistant.content = note;
      assistant.source = 'local';
      finish();
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (streaming) {
      activeAbort?.abort();
      return;
    }
    send();
  });

  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (streaming) return;
      send();
    }
  });

  root.querySelectorAll('[data-chat-starter]').forEach((button) => {
    button.addEventListener('click', () => {
      if (streaming) return;
      const question = button.dataset.chatStarter;
      input.value = question;
      autoGrow();
      input.focus();
      send(question);
    });
  });

  messagesEl.addEventListener('click', async (event) => {
    const copy = event.target.closest('[data-msg-copy]');
    if (copy) {
      const message = messages.find((item) => item.id === copy.dataset.msgCopy);
      if (!message) return;
      try {
        await navigator.clipboard.writeText(message.content);
        toast('已复制这段回答');
      } catch {
        toast('复制失败，请手动选择文字。', { type: 'error' });
      }
      return;
    }
    const speak = event.target.closest('[data-msg-speak]');
    if (speak) {
      const message = messages.find((item) => item.id === speak.dataset.msgSpeak);
      if (message) speakMessage(message.content);
    }
  });

  clearButton?.addEventListener('click', () => {
    const modal = openModal({
      title: '清空这段讨论？',
      subtitle: '对话会从本机删除，无法恢复。',
      content: `<p class="modal-copy">你仍然可以重新开始。书里的观点和你的笔记不会受影响。</p>`,
      footer: `<button class="btn btn--ghost btn--sm" type="button" data-modal-cancel>再想想</button><button class="btn btn--danger btn--sm" type="button" data-modal-confirm>清空讨论</button>`,
      onMount: (overlay, close) => {
        overlay.querySelector('[data-modal-cancel]').addEventListener('click', close);
        overlay.querySelector('[data-modal-confirm]').addEventListener('click', () => {
          store.clearChat(book.id);
          close();
          const route = window.location.hash;
          window.dispatchEvent(new CustomEvent('app:rerender', { detail: { route } }));
        });
      },
    });
    return modal;
  });

  if (messages.length) scrollBottom();
  autoGrow();
}

export function cleanupChat() {
  if (activeAbort) {
    activeAbort.abort();
    activeAbort = null;
  }
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}
