import { parseRoute } from './utils.js';

let lastKey = '';

export function syncSpeaking(state) {
  document.querySelectorAll('.is-speaking').forEach((el) => el.classList.remove('is-speaking'));
  document.querySelectorAll('.chapter-block.is-live').forEach((el) => el.classList.remove('is-live'));

  const route = parseRoute();
  const indicator = document.getElementById('listen-now');
  if (!state?.bookId || route.name !== 'book' || route.id !== state.bookId) {
    if (indicator) indicator.hidden = true;
    lastKey = '';
    return;
  }

  const current = state.current;
  if (!current) {
    if (indicator) indicator.hidden = true;
    return;
  }

  if (indicator) {
    indicator.hidden = false;
    indicator.classList.toggle('is-paused', !state.playing);
    const label = document.getElementById('listen-now-label');
    if (label) label.textContent = current.label;
  }

  if (current.sectionIndex >= 0) {
    const chapter = document.querySelector(`[data-chapter="${current.sectionIndex}"]`);
    chapter?.classList.add('is-live');

    if (current.paraIndex >= 0 && current.paraIndex < 99) {
      const paragraph = document.querySelector(
        `[data-para="${current.sectionIndex}-${current.paraIndex}"]`,
      );
      if (paragraph) {
        paragraph.classList.add('is-speaking');
        const key = `${state.bookId}-${current.sectionIndex}-${current.paraIndex}`;
        if (state.playing && key !== lastKey) {
          paragraph.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        lastKey = key;
      }
    }
  }
}
