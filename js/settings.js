import { store } from './store.js';
import { narrator } from './tts.js';
import { icon } from './icons.js';
import { openModal, toast } from './ui.js';
import { applyTheme } from './theme.js';
import { clamp, escapeHtml } from './utils.js';

const themeChoices = [
  { id: 'light', label: '浅色', icon: 'sun' },
  { id: 'dark', label: '深色', icon: 'moon' },
  { id: 'auto', label: '跟随系统', icon: 'monitor' },
];

function voiceSelect(settings) {
  const seen = new Set();
  const source = narrator.chineseVoices().length ? narrator.chineseVoices() : narrator.voices;
  const list = source.filter((voice) => {
    const key = `${voice.engine || 'system'}|${String(voice.name || '').trim().toLowerCase()}|${voice.lang || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!list.length) {
    return `<select id="voice-input" disabled><option>暂未检测到可用语音</option></select>`;
  }
  const edge = list.filter((voice) => voice.engine === 'edge');
  const system = list.filter((voice) => voice.engine !== 'edge');
  const option = (voice) =>
    `<option value="${escapeHtml(voice.uri)}" ${voice.uri === settings.voiceURI ? 'selected' : ''}>${escapeHtml(voice.name)}${voice.engine === 'edge' ? ' · 自然人声' : ''}</option>`;
  return `<select id="voice-input">
    <option value="">自动（自然人声优先）</option>
    ${edge.length ? `<optgroup label="自然人声 · 微软 Edge（需联网）">${edge.map(option).join('')}</optgroup>` : ''}
    ${system.length ? `<optgroup label="系统语音 · 离线">${system.map(option).join('')}</optgroup>` : ''}
  </select>`;
}

export function openSettings() {
  const settings = { ...store.get().settings };
  const originalTheme = settings.theme;
  const initialRate = Number(settings.rate) || 1;
  let saved = false;

  const content = `
    <form id="settings-form" class="settings-form">
      <section class="settings-section">
        <header class="settings-section__head">
          <span class="settings-section__icon">${icon('headphones', 17)}</span>
          <div><h3>听书</h3><p>声音与节奏，按你的习惯来。</p></div>
        </header>
        <div class="setting-row">
          <div class="setting-row__text">
            <span class="setting-row__label">朗读速度</span>
            <span class="setting-row__hint">推荐 1.0×，通勤时可调到 1.25×</span>
          </div>
          <div class="setting-row__control setting-rate">
            <input type="range" id="rate-input" min="0.8" max="2" step="0.05" value="${initialRate}">
            <output id="rate-output">${initialRate.toFixed(2).replace(/0$/, '')}×</output>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-row__text">
            <span class="setting-row__label">朗读声音</span>
            <span class="setting-row__hint">自然人声由微软 Edge 在线合成，文本会发送给微软；系统语音完全离线</span>
          </div>
          <div class="setting-row__control setting-voice">
            ${voiceSelect(settings)}
            <button class="voice-preview" type="button" id="preview-voice" aria-label="试听当前声音">${icon('volume', 14)} 试听</button>
          </div>
        </div>
      </section>

      <section class="settings-section settings-section--device">
        <header class="settings-section__head">
          <span class="settings-section__icon">${icon('globe', 17)}</span>
          <div><h3>手机、平板与安装</h3><p>在同一个 Wi-Fi 下打开，或把拾页装成 App。</p></div>
        </header>
        <div class="settings-device">
          <div class="settings-device__row">
            <div class="settings-device__copy">
              <strong>局域网访问</strong>
              <small id="network-status">正在检测网络…</small>
              <div class="settings-network-actions" id="network-actions"></div>
            </div>
            <span class="settings-device__badge">${icon('globe', 13)} 同一 Wi-Fi</span>
          </div>
          <div class="settings-device__row">
            <div class="settings-device__copy">
              <strong>安装到桌面 / 主屏幕</strong>
              <small>iPhone 用 Safari「分享 → 添加到主屏幕」；Android 用浏览器菜单里的「安装应用」或「添加到主屏幕」。</small>
            </div>
            <button class="btn btn--ghost btn--sm" type="button" id="install-app">${icon('monitor', 14)} 安装</button>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <header class="settings-section__head">
          <span class="settings-section__icon">${icon('sparkle', 17)}</span>
          <div><h3>AI 深度讨论</h3><p>配置后，导读员会调用你的模型进行自由对话。</p></div>
        </header>
        <div class="settings-ai-status ${settings.apiKey ? 'is-on' : ''}">
          <span class="status-dot"></span>
          <div><strong>${settings.apiKey ? '已配置 AI 讨论' : '当前为本地导读'}</strong><span>${settings.apiKey ? '回答将由你配置的模型生成' : '回答基于本书内容，在本机生成'}</span></div>
        </div>
        <div class="settings-grid">
          <label class="field">
            <span>API 地址</span>
            <input id="api-base" type="url" value="${escapeHtml(settings.apiBase)}" placeholder="https://api.deepseek.com/v1" spellcheck="false">
          </label>
          <label class="field">
            <span>模型名称</span>
            <input id="api-model" type="text" value="${escapeHtml(settings.model)}" placeholder="deepseek-chat" spellcheck="false">
          </label>
        </div>
        <label class="field">
          <span>API Key</span>
          <div class="password-field">
            <input id="api-key" type="password" value="${escapeHtml(settings.apiKey)}" placeholder="sk-..." autocomplete="off" spellcheck="false">
            <button type="button" class="password-field__toggle" id="toggle-key" aria-label="显示或隐藏密钥">${icon('eye', 16)}</button>
          </div>
          <small>仅保存在本机浏览器，并随请求发送给你填写的 API 地址。请勿在公共设备上填写。</small>
        </label>
        <div class="settings-preset">
          <span>快速填入：</span>
          <button type="button" id="preset-deepseek">DeepSeek</button>
          <button type="button" id="preset-ollama">Ollama 本地</button>
          <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">获取 Key ${icon('arrow-up-right', 11)}</a>
        </div>
      </section>

      <section class="settings-section">
        <header class="settings-section__head">
          <span class="settings-section__icon">${icon('sun', 17)}</span>
          <div><h3>外观</h3><p>夜里读书，给眼睛一点余地。</p></div>
        </header>
        <div class="theme-choices" role="radiogroup" aria-label="外观主题">
          ${themeChoices
            .map(
              (choice) => `
            <label class="theme-choice ${settings.theme === choice.id ? 'is-active' : ''}">
              <input type="radio" name="theme" value="${choice.id}" ${settings.theme === choice.id ? 'checked' : ''}>
              <span>${icon(choice.icon, 17)}</span>
              <em>${choice.label}</em>
            </label>`,
            )
            .join('')}
        </div>
      </section>

      <section class="settings-section settings-section--data">
        <header class="settings-section__head">
          <span class="settings-section__icon">${icon('lock', 17)}</span>
          <div><h3>你的数据</h3><p>收藏、进度、笔记与讨论都保存在本机。</p></div>
        </header>
        <div class="settings-data-actions">
          <button type="button" class="btn btn--ghost btn--sm" id="export-data">${icon('copy', 14)} 导出数据</button>
          <button type="button" class="btn btn--danger-ghost btn--sm" id="clear-data">${icon('trash', 14)} 清空本机数据</button>
        </div>
      </section>
    </form>`;

  openModal({
    title: '设置',
    subtitle: '让拾页更合你的习惯。',
    className: 'modal--settings',
    content,
    footer: `<button class="btn btn--ghost btn--sm" type="button" data-settings-cancel>取消</button><button class="btn btn--primary btn--sm" type="submit" form="settings-form">${icon('check', 15)} 保存设置</button>`,
    onClose: () => {
      if (!saved && store.get().settings.theme !== originalTheme) applyTheme(originalTheme);
    },
    onMount: (overlay, close) => {
      const form = overlay.querySelector('#settings-form');
      const rateInput = overlay.querySelector('#rate-input');
      const rateOutput = overlay.querySelector('#rate-output');

      const networkStatus = overlay.querySelector('#network-status');
      const networkActions = overlay.querySelector('#network-actions');
      const copyNetwork = async (url) => {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
          } else {
            const field = document.createElement('textarea');
            field.value = url;
            field.setAttribute('readonly', '');
            field.style.position = 'fixed';
            field.style.opacity = '0';
            document.body.appendChild(field);
            field.select();
            document.execCommand('copy');
            field.remove();
          }
          toast('访问地址已复制');
        } catch {
          toast('复制失败，请手动记下地址', { type: 'error' });
        }
      };
      fetch('/api/network')
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error('network'))))
        .then((data) => {
          if (!networkStatus || !networkActions) return;
          const address = data.addresses?.[0]?.address;
          const url = data.urls?.[0] || (address ? `http://${address}:${data.port}/` : '');
          if (!url) {
            networkStatus.textContent = '没有检测到局域网地址，请确认电脑已连接 Wi-Fi。';
            return;
          }
          if (data.localOnly) {
            networkStatus.textContent = '当前只允许本机访问。关闭服务后双击 start-lan.command，重启后用手机打开：';
            networkActions.innerHTML = `<code class="network-address">${escapeHtml(url)}</code><button class="btn btn--ghost btn--sm" type="button" data-copy-network="${escapeHtml(url)}">${icon('copy', 12)} 复制</button>`;
          } else {
            networkStatus.textContent = '手机和电脑连同一个 Wi-Fi，用浏览器打开：';
            networkActions.innerHTML = `<code class="network-address">${escapeHtml(url)}</code><button class="btn btn--ghost btn--sm" type="button" data-copy-network="${escapeHtml(url)}">${icon('copy', 12)} 复制</button>`;
          }
          networkActions.querySelector('[data-copy-network]')?.addEventListener('click', () => copyNetwork(url));
        })
        .catch(() => {
          if (networkStatus) networkStatus.textContent = '无法读取网络状态；请确认是通过本地服务打开的拾页。';
        });

      overlay.querySelector('#install-app')?.addEventListener('click', async () => {
        if (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone) {
          toast('拾页已经在 App 模式中打开');
          return;
        }
        const prompt = window.__shiyeInstallPrompt;
        if (prompt) {
          prompt.prompt();
          const choice = await prompt.userChoice;
          window.__shiyeInstallPrompt = null;
          if (choice?.outcome === 'accepted') toast('安装完成后，可以从桌面图标打开拾页');
          else toast('已取消安装');
          return;
        }
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        toast(
          isIOS
            ? 'iPhone：用 Safari 打开，点底部「分享」→「添加到主屏幕」'
            : /Android/.test(navigator.userAgent)
              ? 'Android：点浏览器右上角菜单 →「安装应用」或「添加到主屏幕」'
              : '电脑 Chrome：点地址栏右侧的安装图标，或菜单「安装拾页」',
          { duration: 6500, icon: 'monitor' },
        );
      });
      const rateLabel = (value) => `${Number(value).toFixed(2).replace(/0$/, '')}×`;

      rateInput.addEventListener('input', () => {
        rateOutput.textContent = rateLabel(rateInput.value);
      });

      overlay.querySelectorAll('input[name="theme"]').forEach((radio) => {
        radio.addEventListener('change', () => {
          overlay.querySelectorAll('.theme-choice').forEach((choice) => choice.classList.remove('is-active'));
          radio.closest('.theme-choice').classList.add('is-active');
          applyTheme(radio.value);
        });
      });

      const voiceInput = overlay.querySelector('#voice-input');
      overlay.querySelector('#preview-voice')?.addEventListener('click', async () => {
        const uri = voiceInput?.value || narrator.getState().voiceURI || narrator.pickVoice();
        const button = overlay.querySelector('#preview-voice');
        if (button) {
          button.disabled = true;
          button.textContent = '生成中…';
        }
        const ok = await narrator.previewVoice(uri);
        if (button) {
          button.disabled = false;
          button.innerHTML = `${icon('volume', 14)} 试听`;
        }
        if (!ok) toast('试听失败，可能需要在设置里重新选择声音。', { type: 'error' });
      });

      const keyInput = overlay.querySelector('#api-key');
      overlay.querySelector('#toggle-key').addEventListener('click', () => {
        keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
      });

      overlay.querySelector('#preset-deepseek').addEventListener('click', () => {
        overlay.querySelector('#api-base').value = 'https://api.deepseek.com/v1';
        overlay.querySelector('#api-model').value = 'deepseek-chat';
        toast('已填入 DeepSeek 配置，请补充 API Key');
      });

      overlay.querySelector('#preset-ollama').addEventListener('click', () => {
        overlay.querySelector('#api-base').value = 'http://127.0.0.1:11434/v1';
        overlay.querySelector('#api-model').value = 'qwen2.5:7b';
        const key = overlay.querySelector('#api-key');
        if (!key.value.trim()) key.value = 'ollama';
        toast('已填入 Ollama 本地配置，请确认已安装并拉取模型');
      });

      overlay.querySelector('[data-settings-cancel]').addEventListener('click', close);

      overlay.querySelector('#export-data').addEventListener('click', async () => {
        const snapshot = JSON.parse(JSON.stringify(store.get()));
        if (snapshot.settings) snapshot.settings.apiKey = '';
        const data = JSON.stringify(snapshot, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `shiye-data-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        toast('数据已导出（已排除 API Key）');
      });

      overlay.querySelector('#clear-data').addEventListener('click', () => {
        openModal({
          title: '清空本机数据？',
          subtitle: '收藏、进度、笔记、讨论与密钥都会被删除。',
          content: `<p class="modal-copy">这个操作无法撤销。若想保留记录，请先导出数据。</p>`,
          footer: `<button class="btn btn--ghost btn--sm" type="button" data-cancel>取消</button><button class="btn btn--danger btn--sm" type="button" data-confirm>确认清空</button>`,
          onMount: (inner, innerClose) => {
            inner.querySelector('[data-cancel]').addEventListener('click', innerClose);
            inner.querySelector('[data-confirm]').addEventListener('click', () => {
              store.clearAll();
              location.hash = '#/';
              location.reload();
            });
          },
        });
      });

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const apiBase = overlay.querySelector('#api-base').value.trim().replace(/\/+$/, '');
        const model = overlay.querySelector('#api-model').value.trim();
        const apiKey = overlay.querySelector('#api-key').value.trim();
        const theme = overlay.querySelector('input[name="theme"]:checked')?.value || 'auto';
        const rate = clamp(Number(rateInput.value), 0.6, 2.2);
        const voiceURI = overlay.querySelector('#voice-input')?.value || '';

        if (apiBase && !/^https?:\/\//i.test(apiBase)) {
          toast('API 地址需要以 http:// 或 https:// 开头', { type: 'error' });
          return;
        }
        if (apiKey && (!apiBase || !model)) {
          toast('请同时填写 API 地址与模型名称', { type: 'error' });
          return;
        }

        store.setSettings({ theme, rate, voiceURI, apiBase, model, apiKey });
        applyTheme(theme);
        if (Math.abs(rate - initialRate) > 0.001) narrator.setRate(rate);
        if (voiceURI !== settings.voiceURI) narrator.setVoice(voiceURI);
        saved = true;
        close();
        window.dispatchEvent(new CustomEvent('settings:updated'));
        toast(apiKey ? '设置已保存，AI 讨论已启用' : '设置已保存');
      });
    },
  });
}
