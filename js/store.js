import { debounce } from './utils.js';

const STORAGE_KEY = 'shiye.store.v1';
const RECENT_KEY = 'shiye.recent.v1';

const dayKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const defaultSettings = {
  rate: 1,
  voiceURI: '',
  theme: 'auto',
  apiBase: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  apiKey: '',
  sleepMinutes: 0,
  autoNext: true,
};

const defaults = () => ({
  version: 1,
  favorites: [],
  progress: {},
  history: [],
  notes: [],
  chats: {},
  importedBooks: [],
  settings: { ...defaultSettings },
  stats: {
    listenedSeconds: 0,
    sessions: 0,
    daily: {},
    days: [],
  },
});

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    const base = defaults();
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      stats: { ...base.stats, ...(parsed.stats || {}) },
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
      importedBooks: Array.isArray(parsed.importedBooks) ? parsed.importedBooks : [],
      progress: parsed.progress && typeof parsed.progress === 'object' ? parsed.progress : {},
      chats: parsed.chats && typeof parsed.chats === 'object' ? parsed.chats : {},
    };
  } catch (error) {
    console.warn('拾页：本地数据读取失败，已使用默认状态。', error);
    return defaults();
  }
}

let state = load();
const listeners = new Set();

const persist = debounce(() => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('拾页：本地数据保存失败。', error);
  }
}, 220);

export function flush() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function emit() {
  listeners.forEach((listener) => listener(state));
}

export const store = {
  get() {
    return state;
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  update(mutator) {
    const result = mutator(state);
    persist();
    emit();
    return result;
  },

  isFavorite(bookId) {
    return state.favorites.includes(bookId);
  },

  toggleFavorite(bookId) {
    return this.update((draft) => {
      const index = draft.favorites.indexOf(bookId);
      if (index >= 0) {
        draft.favorites.splice(index, 1);
        return false;
      }
      draft.favorites.unshift(bookId);
      return true;
    });
  },

  addHistory(bookId) {
    this.update((draft) => {
      draft.history = [{ bookId, at: Date.now() }, ...draft.history.filter((h) => h.bookId !== bookId)].slice(0, 40);
    });
  },

  recordProgress(bookId, patch) {
    this.update((draft) => {
      const previous = draft.progress[bookId] || {};
      draft.progress[bookId] = { ...previous, ...patch, updatedAt: Date.now() };
      if (patch.percent >= 0.95 && !draft.progress[bookId].completed) {
        draft.progress[bookId].completed = true;
      }
    });
  },

  getProgress(bookId) {
    return state.progress[bookId] || null;
  },

  addNote({ bookId, text, source = '', page = '' }) {
    const clean = String(text || '').trim();
    if (!bookId || !clean) return null;
    const exists = state.notes.find((note) => note.bookId === bookId && note.text === clean);
    if (exists) return exists;
    const note = {
      id: `note-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      bookId,
      text: clean,
      source,
      page,
      at: Date.now(),
    };
    this.update((draft) => {
      draft.notes.unshift(note);
    });
    return note;
  },

  removeNote(id) {
    this.update((draft) => {
      draft.notes = draft.notes.filter((note) => note.id !== id);
    });
  },

  getChat(bookId) {
    return state.chats[bookId] || [];
  },

  saveChat(bookId, messages) {
    this.update((draft) => {
      draft.chats[bookId] = messages.slice(-80);
    });
  },

  clearChat(bookId) {
    this.update((draft) => {
      delete draft.chats[bookId];
    });
  },

  setSettings(patch) {
    this.update((draft) => {
      draft.settings = { ...draft.settings, ...patch };
    });
  },

  addListening(seconds, { countSession = false } = {}) {
    if (!seconds || seconds < 0) return;
    const today = dayKey();
    this.update((draft) => {
      draft.stats.listenedSeconds = (draft.stats.listenedSeconds || 0) + seconds;
      draft.stats.daily = draft.stats.daily || {};
      draft.stats.daily[today] = (draft.stats.daily[today] || 0) + seconds;
      if (!draft.stats.days.includes(today)) draft.stats.days.push(today);
      if (countSession) draft.stats.sessions = (draft.stats.sessions || 0) + 1;
    });
  },

  getStats() {
    const today = dayKey();
    const days = new Set(state.stats.days || []);
    let streak = 0;
    const cursor = new Date();
    if (!days.has(today)) cursor.setDate(cursor.getDate() - 1);
    for (;;) {
      const key = dayKey(cursor);
      if (!days.has(key)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    const listeningBooks = Object.entries(state.progress).filter(([, p]) => p.percent > 0 && !p.completed);
    const completed = Object.values(state.progress).filter((p) => p.completed);
    return {
      totalSeconds: state.stats.listenedSeconds || 0,
      todaySeconds: state.stats.daily?.[today] || 0,
      streak,
      listeningCount: listeningBooks.length,
      completedCount: completed.length,
      noteCount: state.notes.length,
      favoriteCount: state.favorites.length,
      sessions: state.stats.sessions || 0,
    };
  },

  addImportedBook(book) {
    if (!book?.id) return null;
    this.update((draft) => {
      draft.importedBooks = [book, ...(draft.importedBooks || []).filter((item) => item.id !== book.id)].slice(0, 60);
    });
    flush();
    return book;
  },

  removeImportedBook(id) {
    this.update((draft) => {
      draft.importedBooks = (draft.importedBooks || []).filter((book) => book.id !== id);
      draft.favorites = draft.favorites.filter((bookId) => bookId !== id);
      draft.notes = draft.notes.filter((note) => note.bookId !== id);
      draft.history = draft.history.filter((item) => item.bookId !== id);
      delete draft.progress[id];
      delete draft.chats[id];
    });
    flush();
  },

  getImportedBook(id) {
    return (state.importedBooks || []).find((book) => book.id === id) || null;
  },

  clearAll() {
    state = defaults();
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(RECENT_KEY);
    } catch {}
    emit();
    persist();
  },

  async exportData() {
    const snapshot = JSON.parse(JSON.stringify(state));
    if (snapshot.settings) snapshot.settings.apiKey = '';
    return JSON.stringify(snapshot, null, 2);
  },
};

window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});

export { defaultSettings };
