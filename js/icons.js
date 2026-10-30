const paths = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="7" y="5" width="3.4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.6" y="5" width="3.4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h2.2a1.8 1.8 0 0 1 1.8 1.8v3.4A1.8 1.8 0 0 1 6.2 21H5a1 1 0 0 1-1-1z"/><path d="M20 14h-2.2a1.8 1.8 0 0 0-1.8 1.8v3.4a1.8 1.8 0 0 0 1.8 1.8H19a1 1 0 0 0 1-1z"/>',
  heart: '<path d="M20.8 5.9a5.2 5.2 0 0 0-7.4 0L12 7.3l-1.4-1.4a5.2 5.2 0 0 0-7.4 7.4l8.8 8.8 8.8-8.8a5.2 5.2 0 0 0 0-7.4z"/>',
  'heart-filled': '<path d="M20.8 5.9a5.2 5.2 0 0 0-7.4 0L12 7.3l-1.4-1.4a5.2 5.2 0 0 0-7.4 7.4l8.8 8.8 8.8-8.8a5.2 5.2 0 0 0 0-7.4z" fill="currentColor"/>',
  bookmark: '<path d="M6.5 4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5V21L12 17.4 6.5 21z"/>',
  share: '<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.4 10.8 7.2-4.2M8.4 13.2l7.2 4.2"/>',
  'arrow-left': '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  'chevron-left': '<path d="m15 6-6 6 6 6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  sparkle: '<path d="M12 3.5c.6 4.7 2.3 6.4 7 7-4.7.6-6.4 2.3-7 7-.6-4.7-2.3-6.4-7-7 4.7-.6 6.4-2.3 7-7z"/><path d="M19 16.5c.2 1.7.8 2.3 2.5 2.5-1.7.2-2.3.8-2.5 2.5-.2-1.7-.8-2.3-2.5-2.5 1.7-.2 2.3-.8 2.5-2.5z"/>',
  send: '<path d="m21 3-7.2 18-3.4-7.4L3 10.2z"/><path d="M21 3 10.4 13.6"/>',
  volume: '<path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="M15.4 8.6a5 5 0 0 1 0 6.8M18.2 5.8a9 9 0 0 1 0 12.4"/>',
  'volume-off': '<path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="m16 9 5 6M21 9l-5 6"/>',
  'skip-back': '<path d="M6 5v14"/><path d="M18 6 9 12l9 6z" fill="currentColor" stroke="none"/>',
  'skip-forward': '<path d="M18 5v14"/><path d="M6 6l9 6-9 6z" fill="currentColor" stroke="none"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="m3 3 18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3 3.8M6.2 6.6C3.7 8.4 2 12 2 12s3.6 6 10 6a11 11 0 0 0 4.2-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  gauge: '<path d="M20.2 16.5a9 9 0 1 0-16.4 0"/><path d="m12 14 4.2-4.2"/><circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1" fill="currentColor" stroke="none"/>',
  check: '<path d="m4.5 12.5 5 5L20 6.5"/>',
  trash: '<path d="M4 7h16M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M10 11v6M14 11v6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  quote: '<path d="M9.5 6C6.5 7.5 5 9.8 5 13v5h6v-6H8.2c.1-2 .9-3.4 2.6-4.4zM20 6c-3 1.5-4.5 3.8-4.5 7v5h6v-6h-2.8c.1-2 .9-3.4 2.6-4.4z"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  home: '<path d="m3 10.8 9-7.3 9 7.3V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20z"/><path d="M9 21.5V14h6v7.5"/>',
  library: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h3A1.5 1.5 0 0 1 10 4.5v16H5.5A1.5 1.5 0 0 1 4 19z"/><path d="M10 21h4.5A1.5 1.5 0 0 0 16 19.5V4.5A1.5 1.5 0 0 0 14.5 3h-3"/><path d="m18 4 3 16"/>',
  message: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l2.1-4A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  star: '<path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.4l-5.6 2.9 1.1-6.2L3 9.7l6.2-.9z" fill="currentColor" stroke="none"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>',
  moon: '<path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5 8.7 8.7 0 1 0 20.5 14.2z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  expand: '<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>',
  minimize: '<path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5"/>',
  alert: '<path d="M12 3 2.8 20h18.4z"/><path d="M12 9v5"/><circle cx="12" cy="17.2" r=".9" fill="currentColor" stroke="none"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  flame: '<path d="M12 22c4 0 7-2.8 7-6.8 0-2.8-1.5-5.2-4.2-7.2.2 2-.7 3.2-1.8 4-1-2.8-2.8-5.3-5.2-7-1.1 2.4-2.8 4-3.6 6.6-.5 1.5-.7 2.8-.5 4.1C4.2 19.7 7.5 22 12 22z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.8" r=".9" fill="currentColor" stroke="none"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 4l4 4M14 6l4 4"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 4 5.8 4 9s-1.4 6.4-4 9c-2.6-2.6-4-5.8-4-9s1.4-6.4 4-9z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.7-4.4L3 9"/><path d="M3 4v5h5M4 13a8 8 0 0 0 14.7 4.4L21 15"/><path d="M21 20v-5h-5"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  'arrow-up-right': '<path d="M7 17 17 7M8 7h9v9"/>',
  'book-open': '<path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H10a2 2 0 0 1 2 2v16a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 1 3 16.5z"/><path d="M21 5.5A2.5 2.5 0 0 0 18.5 3H14a2 2 0 0 0-2 2v16a2 2 0 0 1 2-2h4.5a2.5 2.5 0 0 0 2.5-2.5z"/>',
  pauseCircle: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
};

export function icon(name, size = 20, className = '') {
  const body = paths[name] || paths.info;
  return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const logoMark = `
<svg class="logo-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
  <rect x="1" y="1" width="38" height="38" rx="12" fill="currentColor" opacity=".1"/>
  <path d="M11 12.5c4.5-2.2 8-1.5 9 0v17c-1-1.5-4.5-2.2-9 0v-17Z" fill="currentColor"/>
  <path d="M29 12.5c-4.5-2.2-8-1.5-9 0v17c1-1.5 4.5-2.2 9 0v-17Z" fill="currentColor" opacity=".55"/>
  <path d="M20 13v16" stroke="var(--paper, #F6F1E7)" stroke-width="1.3"/>
</svg>`;
