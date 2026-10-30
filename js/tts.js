import { store } from './store.js';
import { clamp } from './utils.js';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

const EDGE_VOICES = [
  { uri: 'edge:zh-CN-XiaoxiaoNeural', name: '晓晓 · 温暖女声', lang: 'zh-CN', engine: 'edge' },
  { uri: 'edge:zh-CN-XiaoyiNeural', name: '晓伊 · 活泼女声', lang: 'zh-CN', engine: 'edge' },
  { uri: 'edge:zh-CN-YunxiNeural', name: '云希 · 阳光男声', lang: 'zh-CN', engine: 'edge' },
  { uri: 'edge:zh-CN-YunjianNeural', name: '云健 · 沉稳男声', lang: 'zh-CN', engine: 'edge' },
  { uri: 'edge:zh-CN-YunyangNeural', name: '云扬 · 专业男声', lang: 'zh-CN', engine: 'edge' },
  { uri: 'edge:zh-CN-liaoning-XiaobeiNeural', name: '晓北 · 东北女声', lang: 'zh-CN', engine: 'edge' },
];
const EDGE_PREFIX = 'edge:';
const isEdgeUri = (uri) => String(uri || '').startsWith(EDGE_PREFIX);

function dedupeVoices(list) {
  const seen = new Set();
  return list.filter((voice) => {
    const key = `${voice.engine || 'system'}|${String(voice.name || '').trim().toLowerCase()}|${voice.lang || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function splitIntoChunks(text, maxLength = 78) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const sentences = normalized.match(/[^。！？；!?;\n]+[。！？；!?;]?/g) || [normalized];
  const chunks = [];
  let current = '';
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };
  for (let sentence of sentences) {
    sentence = sentence.trim();
    if (!sentence) continue;
    if (sentence.length > maxLength) {
      push();
      const pieces = sentence.match(/[^，、：,:]+[，、：,:]?/g) || [sentence];
      let part = '';
      for (const piece of pieces) {
        if ((part + piece).length > maxLength && part) {
          chunks.push(part.trim());
          part = '';
        }
        part += piece;
      }
      if (part.trim()) chunks.push(part.trim());
    } else if ((current + sentence).length > maxLength && current) {
      push();
      current = sentence;
    } else {
      current += sentence;
    }
  }
  push();
  return chunks;
}

class Narrator {
  constructor() {
    this.book = null;
    this.units = [];
    this.index = 0;
    this.playing = false;
    this.paused = false;
    this.loading = false;
    this.rate = Number(store.get().settings.rate) || 1;
    this.voiceURI = store.get().settings.voiceURI || '';
    this.voices = [];
    this.token = 0;
    this.speakTimer = null;
    this.timer = null;
    this.utterance = null;
    this.sessionSeconds = 0;
    this.sleepEndsAt = null;
    this.sleepTimer = null;
    this.totalChars = 0;
    this.listeners = new Set();
    this.error = '';
    this.edgeAvailable = null;
    this.edgeVoices = EDGE_VOICES;
    this.forceSystem = false;
    this.audio = null;
    this.audioCache = new Map();
    this.audioPending = new Map();
    this.edgeRatio = 0;
    this.edgePara = -1;
    this.pendingSeekRatio = null;
    this.lastTick = 0;
    this.lastPersist = 0;
    this.loadVoices();
    this.checkEdgeStatus();
    if (synth) {
      const handler = () => {
        this.loadVoices();
        this.emit();
      };
      if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', handler);
      else synth.onvoiceschanged = handler;
    }
  }

  get supported() {
    return this.usingEdge() || Boolean(synth && 'SpeechSynthesisUtterance' in window);
  }

  usingEdge() {
    if (this.forceSystem) return false;
    if (this.edgeAvailable === false) return false;
    if (isEdgeUri(this.voiceURI)) return true;
    if (!this.voiceURI) return true;
    return false;
  }

  edgeShort() {
    if (isEdgeUri(this.voiceURI)) return this.voiceURI.slice(EDGE_PREFIX.length);
    return 'zh-CN-XiaoxiaoNeural';
  }

  async checkEdgeStatus() {
    try {
      const response = await fetch('/api/tts/status', { cache: 'no-store' });
      if (!response.ok) throw new Error('status');
      const data = await response.json();
      this.edgeAvailable = Boolean(data.available);
      if (Array.isArray(data.voices) && data.voices.length) {
        this.edgeVoices = data.voices.map((voice) => ({ ...voice, lang: voice.lang || 'zh-CN', engine: 'edge' }));
      }
      if (this.edgeAvailable && !this.voiceURI) {
        this.voiceURI = 'edge:zh-CN-XiaoxiaoNeural';
        store.setSettings({ voiceURI: this.voiceURI });
      }
      if (!this.edgeAvailable && isEdgeUri(this.voiceURI)) {
        this.forceSystem = true;
        this.voiceURI = this.systemVoiceUri();
        store.setSettings({ voiceURI: this.voiceURI });
      }
    } catch {
      this.edgeAvailable = false;
      if (isEdgeUri(this.voiceURI)) {
        this.forceSystem = true;
        this.voiceURI = this.systemVoiceUri();
      }
    }
    this.loadVoices();
    this.emit();
  }

  loadVoices() {
    try {
      const rawSystem = (synth?.getVoices?.() || []).map((voice) => ({
        uri: voice.voiceURI,
        name: voice.name,
        lang: voice.lang,
        local: voice.localService,
        engine: 'system',
      }));
      rawSystem.sort((a, b) => Number(b.local) - Number(a.local));
      const system = dedupeVoices(rawSystem);
      const edge = this.edgeAvailable === false ? [] : dedupeVoices(this.edgeVoices);
      this.voices = [...edge, ...system];
    } catch {
      this.voices = this.edgeAvailable === false ? [] : this.edgeVoices;
    }
  }

  systemVoices() {
    return this.voices.filter((voice) => voice.engine !== 'edge' && /^zh/i.test(voice.lang));
  }

  systemVoiceUri() {
    const list = this.systemVoices();
    const saved = store.get().settings.voiceURI;
    if (saved && list.some((voice) => voice.uri === saved)) return saved;
    return list[0]?.uri || '';
  }

  chineseVoices() {
    return this.voices.filter((voice) => /^zh/i.test(voice.lang));
  }

  pickVoice() {
    if (this.usingEdge()) {
      if (isEdgeUri(this.voiceURI) && this.voices.some((voice) => voice.uri === this.voiceURI)) return this.voiceURI;
      return this.edgeVoices[0]?.uri || 'edge:zh-CN-XiaoxiaoNeural';
    }
    const list = this.systemVoices();
    if (this.voiceURI && list.some((voice) => voice.uri === this.voiceURI)) return this.voiceURI;
    return list[0]?.uri || '';
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState() {
    const unit = this.units[this.index] || null;
    const isEdge = this.usingEdge();
    let percent = 0;
    let paraIndex = unit?.paraIndex ?? -1;
    if (unit) {
      if (isEdge) {
        percent = clamp((unit.start + this.edgeRatio * unit.text.length) / this.totalChars, 0, 1);
        if (this.edgePara >= 0) paraIndex = this.edgePara;
      } else {
        percent = clamp(unit.start / this.totalChars, 0, 1);
      }
    }
    const current = unit
      ? {
          sectionIndex: unit.sectionIndex,
          paraIndex,
          kind: unit.kind,
          label: unit.label,
          text: unit.text,
        }
      : null;
    return {
      supported: this.supported,
      bookId: this.book?.id || null,
      bookTitle: this.book?.title || '',
      bookAuthor: this.book?.author || '',
      cover: this.book?.cover || null,
      playing: this.playing,
      paused: this.paused,
      loading: this.loading,
      engine: isEdge ? 'edge' : 'system',
      engineLabel: isEdge ? '自然人声' : '系统语音',
      current,
      index: this.index,
      total: this.units.length,
      percent,
      rate: this.rate,
      voiceURI: this.voiceURI,
      voices: this.voices,
      sessionSeconds: this.sessionSeconds,
      totalMinutes: this.book ? Math.round((this.totalChars / 245 / this.rate) * 10) / 10 : 0,
      sleepEndsAt: this.sleepEndsAt,
      error: this.error,
      finished: this.index >= this.units.length && !this.playing,
    };
  }

  emit() {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
    window.dispatchEvent(new CustomEvent('narrator:update', { detail: state }));
  }

  buildUnits(book) {
    return this.usingEdge() ? this.buildEdgeUnits(book) : this.buildSystemUnits(book);
  }

  buildSystemUnits(book) {
    const units = [];
    const add = (text, meta) => {
      for (const chunk of splitIntoChunks(text)) units.push({ text: chunk, ...meta });
    };
    add(`${book.title}，${book.author}。${book.oneLiner}`, { sectionIndex: -1, paraIndex: -2, kind: 'intro', label: '开篇 · 本书精华' });
    add(book.intro, { sectionIndex: -1, paraIndex: -1, kind: 'intro', label: '开篇 · 本书精华' });
    add(`先说这本书为什么值得读。${book.whyRead.join('；')}。`, { sectionIndex: -1, paraIndex: -2, kind: 'intro', label: '开篇 · 为什么读' });
    book.keyIdeas.forEach((idea, index) => {
      add(`${idea.title}。${idea.body}`, { sectionIndex: -1, paraIndex: index, kind: 'idea', label: `核心观点 ${index + 1}` });
    });
    book.sections.forEach((section, sectionIndex) => {
      add(`第 ${sectionIndex + 1} 节，${section.title}`, { sectionIndex, paraIndex: -1, kind: 'heading', label: `第 ${sectionIndex + 1} 节 · ${section.title}` });
      section.paras.forEach((paragraph, paraIndex) => {
        add(paragraph, { sectionIndex, paraIndex, kind: 'para', label: `第 ${sectionIndex + 1} 节 · ${section.title}` });
      });
      add(`本节小结：${section.takeaway}`, { sectionIndex, paraIndex: 99, kind: 'takeaway', label: `第 ${sectionIndex + 1} 节 · 小结` });
    });
    add(`最后，把这本书用起来。${book.actions.join('；')}。`, { sectionIndex: -1, paraIndex: 90, kind: 'outro', label: '收尾 · 把书用起来' });
    add(`也需要保留一点怀疑。${book.debate.body}`, { sectionIndex: -1, paraIndex: 91, kind: 'outro', label: '收尾 · 争议与边界' });
    add(`${book.audience}`, { sectionIndex: -1, paraIndex: 92, kind: 'outro', label: '收尾 · 适合谁读' });
    add(`最后，留三句话给你。${book.quotes.map((quote) => quote.text).join('；')}。`, { sectionIndex: -1, paraIndex: 93, kind: 'outro', label: '收尾 · 值得带走的话' });

    let cursor = 0;
    units.forEach((unit) => {
      unit.start = cursor;
      cursor += unit.text.length;
      unit.end = cursor;
    });
    this.totalChars = cursor || 1;
    return units;
  }

  buildEdgeUnits(book) {
    const blocks = [];
    const addBlock = (text, meta) => {
      const value = String(text || '').replace(/\s+/g, ' ').trim();
      if (!value) return;
      blocks.push({ text: value, ...meta });
    };
    const introLabel = '开篇 · 本书精华';
    addBlock(`《${book.title}》，${book.author}。${book.oneLiner}。`, { sectionIndex: -1, paraIndex: -2, kind: 'intro', label: introLabel, group: 'intro' });
    addBlock(book.intro, { sectionIndex: -1, paraIndex: -1, kind: 'intro', label: introLabel, group: 'intro' });
    addBlock(`为什么值得读：${book.whyRead.join('；')}。`, { sectionIndex: -1, paraIndex: -2, kind: 'intro', label: introLabel, group: 'intro' });

    book.keyIdeas.forEach((idea, index) => {
      addBlock(`${idea.title}。${idea.body}`, {
        sectionIndex: -1,
        paraIndex: index,
        kind: 'idea',
        label: `核心观点 ${index + 1}`,
        group: `idea-${index}`,
      });
    });

    book.sections.forEach((section, sectionIndex) => {
      const label = `第 ${sectionIndex + 1} 节 · ${section.title}`;
      const group = `section-${sectionIndex}`;
      addBlock(`第 ${sectionIndex + 1} 节，${section.title}。`, { sectionIndex, paraIndex: -1, kind: 'heading', label, group });
      section.paras.forEach((paragraph, paraIndex) => {
        addBlock(paragraph, { sectionIndex, paraIndex, kind: 'para', label, group });
      });
      addBlock(`本节小结：${section.takeaway}`, { sectionIndex, paraIndex: 99, kind: 'takeaway', label: `${label} · 小结`, group });
    });

    addBlock(`最后，把这本书用起来。${book.actions.join('；')}。`, { sectionIndex: -1, paraIndex: 90, kind: 'outro', label: '收尾 · 把书用起来', group: 'outro' });
    addBlock(`也需要保留一点怀疑。${book.debate.body}`, { sectionIndex: -1, paraIndex: 91, kind: 'outro', label: '收尾 · 争议与边界', group: 'outro' });
    addBlock(`${book.audience}`, { sectionIndex: -1, paraIndex: 92, kind: 'outro', label: '收尾 · 适合谁读', group: 'outro' });
    addBlock(`最后，留三句话给你。${book.quotes.map((quote) => quote.text).join('；')}。`, { sectionIndex: -1, paraIndex: 93, kind: 'outro', label: '收尾 · 值得带走的话', group: 'outro' });

    const units = [];
    let current = null;
    const flush = () => {
      if (!current) return;
      const firstSpan = current.paraSpans[0];
      if (firstSpan) current.paraIndex = firstSpan.paraIndex;
      else if (current.kind !== 'heading') current.paraIndex = -1;
      units.push(current);
      current = null;
    };
    const append = (block) => {
      if (current && (current.group !== block.group || current.text.length + block.text.length + 1 > 380)) flush();
      if (!current) {
        current = {
          group: block.group,
          sectionIndex: block.sectionIndex,
          paraIndex: block.paraIndex,
          kind: block.kind,
          label: block.label,
          text: '',
          paraSpans: [],
        };
      }
      if (current.text) current.text += '\n';
      const start = current.text.length;
      current.text += block.text;
      const end = current.text.length;
      if (block.kind === 'para' && block.paraIndex >= 0) current.paraSpans.push({ paraIndex: block.paraIndex, start, end });
      if (block.kind === 'heading') current.kind = 'heading';
    };

    blocks.forEach((block) => {
      if (block.text.length <= 380) {
        append(block);
        return;
      }
      const parts = splitIntoChunks(block.text, 300);
      parts.forEach((part) => append({ ...block, text: part }));
    });
    flush();

    let cursor = 0;
    units.forEach((unit) => {
      unit.start = cursor;
      cursor += unit.text.length;
      unit.end = cursor;
    });
    this.totalChars = cursor || 1;
    return units;
  }

  playBook(book, options = {}) {
    if (!book) return;
    this.error = '';
    if (!this.supported) {
      this.error = '当前浏览器不支持语音朗读。';
      this.emit();
      window.dispatchEvent(new CustomEvent('narrator:error', { detail: this.error }));
      return;
    }
    const sameBook = this.book?.id === book.id;
    if (sameBook && this.paused && !options.restart && options.sectionIndex == null) {
      this.resume();
      return;
    }
    if (sameBook && this.playing && !options.restart && options.sectionIndex == null) {
      this.emit();
      return;
    }
    const resume = options.resume ? store.getProgress(book.id) : null;
    if (!sameBook || options.restart || options.sectionIndex != null) {
      this.cancelSpeech();
      if (!sameBook) this.clearAudioCache();
      this.book = book;
      this.units = this.buildUnits(book);
      this.index = 0;
      this.sessionSeconds = options.keepSession ? this.sessionSeconds : 0;
    }
    let target = 0;
    if (options.sectionIndex != null) {
      const found = this.units.findIndex(
        (unit) => unit.sectionIndex === options.sectionIndex && unit.paraIndex >= (options.paraIndex ?? -1),
      );
      target = found >= 0 ? found : 0;
    } else if (resume && !options.fromStart && resume.percent < 0.95) {
      const found = this.units.findIndex(
        (unit) =>
          unit.sectionIndex === resume.sectionIndex &&
          (unit.paraIndex >= (resume.paraIndex ?? 0) || unit.kind === 'heading'),
      );
      target = found >= 0 ? found : 0;
    }
    this.startAt(target);
  }

  startAt(index) {
    if (!this.units.length) return;
    this.cancelSpeech();
    this.index = clamp(index, 0, this.units.length - 1);
    this.playing = true;
    this.paused = false;
    this.error = '';
    this.startTimer();
    this.persistProgress();
    this.emit();
    this.speakCurrent();
  }

  speakCurrent() {
    if (!this.playing) return;
    const unit = this.units[this.index];
    if (!unit) {
      this.finish();
      return;
    }
    if (this.usingEdge()) {
      this.playEdgeUnit();
      return;
    }
    this.speakSystemUnit(unit);
  }

  speakSystemUnit(unit) {
    if (!synth || !('SpeechSynthesisUtterance' in window)) {
      this.error = '当前浏览器不支持系统语音。';
      this.playing = false;
      this.emit();
      return;
    }
    const token = ++this.token;
    const utterance = new SpeechSynthesisUtterance(unit.text);
    utterance.lang = 'zh-CN';
    utterance.rate = this.rate;
    utterance.pitch = 1;
    utterance.volume = 1;
    const voiceURI = this.pickVoice();
    if (voiceURI) {
      const voice = synth.getVoices().find((item) => item.voiceURI === voiceURI);
      if (voice) utterance.voice = voice;
    }
    utterance.onstart = () => {
      if (token !== this.token) return;
      this.error = '';
      this.emit();
    };
    utterance.onend = () => {
      if (token !== this.token || !this.playing) return;
      this.advance();
    };
    utterance.onerror = (event) => {
      if (token !== this.token) return;
      if (['interrupted', 'canceled'].includes(event.error)) return;
      this.error = event.error === 'not-allowed' ? '浏览器阻止了语音播放，请再点击一次播放按钮。' : '语音播放遇到问题，已暂停。';
      this.playing = false;
      this.paused = true;
      this.stopTimer();
      this.emit();
      window.dispatchEvent(new CustomEvent('narrator:error', { detail: this.error }));
    };
    this.utterance = utterance;
    clearTimeout(this.speakTimer);
    this.speakTimer = setTimeout(() => {
      if (token !== this.token) return;
      try {
        synth.speak(utterance);
      } catch {
        this.error = '语音播放失败，请检查系统语音设置。';
        this.playing = false;
        this.emit();
      }
    }, 60);
  }

  async getEdgeAudio(text) {
    const key = `${this.edgeShort()}\u0000${text}`;
    if (this.audioCache.has(key)) return this.audioCache.get(key);
    if (this.audioPending.has(key)) return this.audioPending.get(key);
    const promise = fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice: this.edgeShort(), text }),
    })
      .then(async (response) => {
        if (!response.ok) {
          let message = '自然人声生成失败';
          try {
            const data = await response.json();
            message = data.error?.message || message;
          } catch {}
          throw new Error(message);
        }
        const blob = await response.blob();
        if (blob.size < 500) throw new Error('自然人声没有返回有效音频');
        const url = URL.createObjectURL(blob);
        this.audioCache.set(key, url);
        while (this.audioCache.size > 40) {
          const oldestKey = this.audioCache.keys().next().value;
          const oldUrl = this.audioCache.get(oldestKey);
          this.audioCache.delete(oldestKey);
          if (oldUrl !== this.audio?.src) URL.revokeObjectURL(oldUrl);
        }
        return url;
      })
      .finally(() => this.audioPending.delete(key));
    this.audioPending.set(key, promise);
    return promise;
  }

  async playEdgeUnit() {
    const unit = this.units[this.index];
    if (!unit) {
      this.finish();
      return;
    }
    const token = ++this.token;
    this.clearAudio();
    this.loading = true;
    this.playing = true;
    this.paused = false;
    this.edgeRatio = 0;
    this.edgePara = -1;
    this.startTimer();
    this.persistProgress();
    this.emit();

    let url;
    try {
      url = await this.getEdgeAudio(unit.text);
    } catch (error) {
      if (token !== this.token) return;
      this.loading = false;
      this.fallbackToSystem(error.message || '自然人声暂时不可用');
      return;
    }
    if (token !== this.token || !this.playing) return;

    this.loading = false;
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.playbackRate = this.rate;
    this.audio = audio;
    audio.ontimeupdate = () => this.onEdgeTime(token);
    audio.onended = () => {
      if (token !== this.token) return;
      this.advance();
    };
    audio.onerror = () => {
      if (token !== this.token) return;
      this.fallbackToSystem('自然人声音频播放失败');
    };
    audio.onloadedmetadata = () => {
      if (token !== this.token) return;
      if (this.pendingSeekRatio != null && Number.isFinite(audio.duration)) {
        audio.currentTime = clamp(this.pendingSeekRatio, 0, 1) * audio.duration;
      }
      this.pendingSeekRatio = null;
      this.emit();
    };

    try {
      await audio.play();
    } catch (error) {
      if (token !== this.token) return;
      if (error.name === 'NotAllowedError') {
        this.loading = false;
        this.playing = false;
        this.paused = true;
        this.stopTimer();
        this.error = '浏览器阻止了自动播放，请再点一次播放按钮。';
        this.emit();
        window.dispatchEvent(new CustomEvent('narrator:error', { detail: this.error }));
      } else {
        this.fallbackToSystem('自然人声无法播放');
      }
      return;
    }
    this.error = '';
    this.emit();
    this.prefetchNeighbors();
  }

  prefetchNeighbors() {
    if (!this.usingEdge()) return;
    for (let offset = 1; offset <= 2; offset += 1) {
      const unit = this.units[this.index + offset];
      if (!unit) break;
      this.getEdgeAudio(unit.text).catch(() => {});
    }
  }

  onEdgeTime(token) {
    if (token !== this.token || !this.audio || !this.playing) return;
    const unit = this.units[this.index];
    if (!unit) return;
    const duration = this.audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const ratio = clamp(this.audio.currentTime / duration, 0, 1);
    this.edgeRatio = ratio;
    const position = ratio * unit.text.length;
    let paraIndex = -1;
    for (const span of unit.paraSpans || []) {
      if (position >= span.start && position < span.end) {
        paraIndex = span.paraIndex;
        break;
      }
    }
    if (paraIndex !== this.edgePara) {
      this.edgePara = paraIndex;
      this.lastTick = 0;
    }
    const now = Date.now();
    if (now - this.lastTick > 250) {
      this.lastTick = now;
      this.emit();
    }
    if (now - this.lastPersist > 5000) {
      this.lastPersist = now;
      this.persistProgress();
    }
  }

  clearAudio() {
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio.ontimeupdate = null;
      this.audio.onerror = null;
      this.audio.src = '';
      this.audio = null;
    }
    this.loading = false;
  }

  clearAudioCache() {
    this.audioCache.forEach((url) => URL.revokeObjectURL(url));
    this.audioCache.clear();
    this.audioPending.clear();
  }

  fallbackToSystem(reason) {
    const wasActive = this.playing || this.paused;
    const section = this.currentSectionIndex();
    const para = this.edgePara >= 0 ? this.edgePara : 0;
    this.forceSystem = true;
    this.loading = false;
    this.clearAudio();
    this.token += 1;
    if (isEdgeUri(this.voiceURI)) {
      this.voiceURI = this.systemVoiceUri();
      store.setSettings({ voiceURI: this.voiceURI });
    }
    this.loadVoices();
    this.units = this.book ? this.buildSystemUnits(this.book) : [];
    this.index = 0;
    this.edgeRatio = 0;
    this.edgePara = -1;
    this.error = `${reason || '自然人声不可用'}，已切换到系统语音。`;
    window.dispatchEvent(new CustomEvent('narrator:error', { detail: this.error }));
    if (wasActive && this.book) {
      let target = this.units.findIndex((unit) => unit.sectionIndex === section);
      if (target < 0) target = 0;
      this.playing = true;
      this.paused = false;
      this.startAt(target);
    } else {
      this.playing = false;
      this.paused = false;
      this.emit();
    }
  }

  advance() {
    if (!this.playing) return;
    if (this.index + 1 >= this.units.length) {
      this.finish();
      return;
    }
    this.clearAudio();
    this.index += 1;
    this.persistProgress();
    this.emit();
    this.speakCurrent();
  }

  finish() {
    this.playing = false;
    this.paused = false;
    this.loading = false;
    this.stopTimer();
    this.clearAudio();
    this.book && store.recordProgress(this.book.id, { percent: 1, completed: true });
    this.utterance = null;
    this.emit();
    window.dispatchEvent(new CustomEvent('narrator:finished', { detail: { bookId: this.book?.id } }));
  }

  pause() {
    if (!this.playing && !this.paused) return;
    if (this.usingEdge() && this.audio && !this.loading) {
      this.audio.pause();
      this.playing = false;
      this.paused = true;
      this.stopTimer();
      this.persistProgress();
      this.emit();
      return;
    }
    this.token += 1;
    clearTimeout(this.speakTimer);
    try {
      synth?.pause();
      synth?.cancel();
    } catch {}
    this.clearAudio();
    this.playing = false;
    this.paused = true;
    this.stopTimer();
    this.persistProgress();
    this.emit();
  }

  resume() {
    if (!this.units.length) {
      this.error = '请先选择一本书开始收听。';
      this.emit();
      return;
    }
    if (this.usingEdge() && this.audio && this.audio.src) {
      this.playing = true;
      this.paused = false;
      this.startTimer();
      this.audio.play().catch(() => {
        this.playing = false;
        this.paused = true;
        this.emit();
      });
      this.emit();
      return;
    }
    if (this.index >= this.units.length) this.index = 0;
    this.playing = true;
    this.paused = false;
    this.startTimer();
    this.emit();
    this.speakCurrent();
  }

  toggle() {
    if (this.playing) this.pause();
    else if (this.paused) this.resume();
    else if (this.book) this.playBook(this.book, { resume: true });
  }

  stop(silent = false) {
    this.token += 1;
    clearTimeout(this.speakTimer);
    try {
      synth?.cancel();
    } catch {}
    this.clearAudio();
    this.playing = false;
    this.paused = false;
    this.loading = false;
    this.stopTimer();
    if (!silent) {
      this.persistProgress();
      this.emit();
    }
  }

  close() {
    this.stop(true);
    this.clearAudioCache();
    this.book = null;
    this.units = [];
    this.index = 0;
    this.totalChars = 0;
    this.sessionSeconds = 0;
    this.edgeRatio = 0;
    this.edgePara = -1;
    this.setSleep(0);
    this.emit();
  }

  restartCurrent() {
    if (!this.book) return;
    if (this.playing || this.paused) {
      this.playing = true;
      this.paused = false;
      this.clearAudio();
      this.startTimer();
      this.speakCurrent();
      this.emit();
    }
  }

  cancelSpeech() {
    this.token += 1;
    clearTimeout(this.speakTimer);
    try {
      synth?.cancel();
    } catch {}
    this.clearAudio();
  }

  setRate(rate) {
    this.rate = clamp(Number(rate) || 1, 0.6, 2.2);
    store.setSettings({ rate: this.rate });
    if (this.usingEdge() && this.audio) {
      this.audio.playbackRate = this.rate;
    } else if (this.playing) {
      this.restartCurrent();
    }
    this.emit();
  }

  setVoice(uri) {
    const oldEngine = this.usingEdge() ? 'edge' : 'system';
    const wasPlaying = this.playing;
    const wasPaused = this.paused;
    this.voiceURI = uri || '';
    this.forceSystem = false;
    store.setSettings({ voiceURI: this.voiceURI });

    if (isEdgeUri(uri) && this.edgeAvailable === false) {
      this.edgeAvailable = null;
      this.checkEdgeStatus();
    }
    const newEngine = this.usingEdge() ? 'edge' : 'system';

    if (this.book && (wasPlaying || wasPaused)) {
      const section = this.currentSectionIndex();
      const previousIndex = this.index;
      this.cancelSpeech();
      this.edgeRatio = 0;
      this.edgePara = -1;
      this.pendingSeekRatio = null;

      if (oldEngine !== newEngine) this.units = this.buildUnits(this.book);

      let target = previousIndex;
      if (oldEngine !== newEngine) {
        target = this.units.findIndex((unit) => unit.sectionIndex === section);
      }
      target = clamp(target, 0, Math.max(0, this.units.length - 1));

      if (wasPlaying) {
        this.playing = true;
        this.paused = false;
        this.startAt(target);
      } else {
        this.index = target;
        this.playing = false;
        this.paused = true;
        this.emit();
      }
      return;
    }

    this.emit();
  }

  async previewVoice(uri) {
    if (this.playing || this.paused) this.pause();
    const sample = '你好，我是拾页的导读员。我们一起，把这本书读薄一点。';
    if (isEdgeUri(uri)) {
      try {
        const short = uri.slice(EDGE_PREFIX.length);
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voice: short, text: sample }),
        });
        if (!response.ok) throw new Error('preview');
        const url = URL.createObjectURL(await response.blob());
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play();
        return true;
      } catch {
        return false;
      }
    }
    if (!synth) return false;
    try {
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(sample);
      utterance.lang = 'zh-CN';
      const voice = synth.getVoices().find((item) => item.voiceURI === uri);
      if (voice) utterance.voice = voice;
      synth.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }

  async speakText(text) {
    const cleanText = String(text || '').replace(/\s+/g, ' ').trim();
    if (!cleanText) return false;
    if (this.playing) this.pause();
    if (this.usingEdge()) {
      try {
        const url = await this.getEdgeAudio(cleanText.slice(0, 1200));
        const audio = new Audio(url);
        audio.playbackRate = this.rate;
        await audio.play();
        return true;
      } catch {}
    }
    if (!synth) return false;
    try {
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'zh-CN';
      utterance.rate = this.rate;
      const voice = synth.getVoices().find((item) => item.voiceURI === this.voiceURI);
      if (voice) utterance.voice = voice;
      synth.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }

  nextSection() {
    if (!this.book) return;
    const current = this.units[this.index];
    const base = current?.sectionIndex ?? -1;
    const target = this.units.findIndex((unit) => unit.sectionIndex > base);
    if (target >= 0) this.startAt(target);
    else this.finish();
  }

  previousSection() {
    if (!this.book) return;
    const current = this.units[this.index];
    const base = current?.sectionIndex ?? 0;
    if (base <= 0) {
      this.startAt(0);
      return;
    }
    const target = this.units.findIndex((unit) => unit.sectionIndex === base - 1);
    this.startAt(target >= 0 ? target : 0);
  }

  seekPercent(percent) {
    if (!this.units.length) return;
    const targetChar = clamp(percent, 0, 1) * this.totalChars;
    let index = this.units.findIndex((unit) => targetChar >= unit.start && targetChar < unit.end);
    if (index < 0) index = this.units.length - 1;
    const unit = this.units[index];
    const ratio = unit.text.length ? clamp((targetChar - unit.start) / unit.text.length, 0, 1) : 0;
    if (this.usingEdge()) {
      if (index === this.index && this.audio && Number.isFinite(this.audio.duration)) {
        this.audio.currentTime = ratio * this.audio.duration;
        this.edgeRatio = ratio;
        this.emit();
        return;
      }
      this.pendingSeekRatio = ratio;
    }
    this.startAt(index);
  }

  persistProgress() {
    if (!this.book) return;
    const unit = this.units[this.index];
    if (!unit) return;
    const isEdge = this.usingEdge();
    const percent = isEdge
      ? clamp((unit.start + this.edgeRatio * unit.text.length) / this.totalChars, 0, 0.999)
      : clamp(unit.start / this.totalChars, 0, 0.999);
    const paraIndex = isEdge && this.edgePara >= 0 ? this.edgePara : unit.paraIndex;
    store.recordProgress(this.book.id, {
      sectionIndex: unit.sectionIndex,
      paraIndex: Math.max(0, paraIndex || 0),
      percent,
      seconds: this.sessionSeconds,
    });
  }

  startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (!this.playing) return;
      this.sessionSeconds += 1;
      if (this.sessionSeconds % 5 === 0) {
        store.addListening(5);
        this.emit();
      }
    }, 1000);
    if (this.sessionSeconds === 0) {
      store.addListening(1, { countSession: true });
      this.sessionSeconds = 1;
    }
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setSleep(minutes) {
    clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    if (!minutes) {
      this.sleepEndsAt = null;
      this.emit();
      return;
    }
    this.sleepEndsAt = Date.now() + minutes * 60 * 1000;
    this.sleepTimer = setTimeout(() => {
      this.pause();
      this.sleepEndsAt = null;
      this.emit();
      window.dispatchEvent(new CustomEvent('narrator:sleep'));
    }, minutes * 60 * 1000);
    this.emit();
  }

  currentSectionIndex() {
    return this.units[this.index]?.sectionIndex ?? -1;
  }
}

export const narrator = new Narrator();
