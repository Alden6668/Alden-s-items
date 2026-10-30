#!/usr/bin/env node
/**
 * 拾页本地服务：静态文件 + 同源 AI 代理。
 * 不依赖任何 npm 包。
 */
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { delimiter, extname, join, normalize, resolve, sep, posix } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT || 4321);
const HOST = process.env.HOST || '127.0.0.1';
const LOCAL_ONLY = HOST === '127.0.0.1' || HOST === 'localhost';

function lanAddresses() {
  const found = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const info of addresses || []) {
      if (info.family === 'IPv4' && !info.internal) found.push({ name, address: info.address });
    }
  }
  const score = (item) => (item.name === 'en0' ? 0 : item.name.startsWith('en') ? 1 : item.name.startsWith('utun') ? 3 : 2);
  found.sort((a, b) => score(a) - score(b));
  return found.filter((item, index, list) => list.findIndex((other) => other.address === item.address) === index);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...securityHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}


function readRawBody(req, limit = 30 * 1024 * 1024) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('文件超过 30MB，请压缩或换一本。'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function decodeTextBuffer(buffer) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer).replace(/^\uFEFF/, '');
  const bad = (utf8.match(/\uFFFD/g) || []).length;
  if (bad > Math.max(3, utf8.length * 0.002)) {
    try {
      const gb = new TextDecoder('gb18030', { fatal: false }).decode(buffer).replace(/^\uFEFF/, '');
      if (gb.length > utf8.length * 0.6) return gb;
    } catch {}
  }
  return utf8;
}

const namedEntities = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ldquo: '“', rdquo: '”',
  lsquo: '‘', rsquo: '’', hellip: '…', mdash: '—', ndash: '–', middot: '·', bull: '•',
  copy: '©', reg: '®', trade: '™', times: '×', divide: '÷', deg: '°', laquo: '«', raquo: '»',
};

function decodeEntities(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return ''; }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try { return String.fromCodePoint(Number(dec)); } catch { return ''; }
    })
    .replace(/&([a-z]+);/gi, (match, name) => namedEntities[name.toLowerCase()] ?? match);
}

function cleanText(value) {
  return String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function htmlToText(html) {
  const withoutHead = String(html)
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const spaced = withoutHead
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote|pre|figcaption)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ');
  return cleanText(decodeEntities(spaced).replace(/[ \t]+/g, ' '));
}

function readZipEntries(buffer) {
  let eocd = -1;
  const minimum = Math.max(0, buffer.length - 65558);
  for (let i = buffer.length - 22; i >= minimum; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('无法读取 EPUB 压缩包。');
  const total = buffer.readUInt16LE(eocd + 10);
  let pointer = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let index = 0; index < total; index += 1) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const uncompressedSize = buffer.readUInt32LE(pointer + 24);
    if (uncompressedSize > 50 * 1024 * 1024) {
      pointer += 46 + buffer.readUInt16LE(pointer + 28) + buffer.readUInt16LE(pointer + 30) + buffer.readUInt16LE(pointer + 32);
      continue;
    }
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.subarray(pointer + 46, pointer + 46 + nameLength).toString('utf8');
    pointer += 46 + nameLength + extraLength + commentLength;
    if (!name || name.endsWith('/')) continue;
    if (!/\.(xml|opf|xhtml|html|htm|ncx)$/i.test(name)) continue;
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    try {
      let data;
      if (method === 0) data = Buffer.from(compressed);
      else if (method === 8) data = inflateRawSync(compressed);
      else continue;
      entries.set(name.replace(/^\.\//, ''), data);
    } catch {
      // 忽略无法解压的条目
    }
  }
  return entries;
}

function parseAttributes(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*["']([^"']*)["']/g)) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2]);
  }
  return attrs;
}

function parseEpub(buffer, fallbackTitle) {
  const entries = readZipEntries(buffer);
  const container = entries.get('META-INF/container.xml')?.toString('utf8');
  if (!container) throw new Error('这个 EPUB 缺少 container.xml，文件可能已损坏。');
  const rootMatch = container.match(/<rootfile\b[^>]*>/i);
  const rootPath = rootMatch ? parseAttributes(rootMatch[0])['full-path'] : '';
  if (!rootPath) throw new Error('无法定位 EPUB 的书籍内容。');
  const opfBuffer = entries.get(rootPath) || entries.get(rootPath.replace(/^\/+/, ''));
  if (!opfBuffer) throw new Error('EPUB 的 OPF 文件缺失。');
  const opf = opfBuffer.toString('utf8');
  const titleMatch = opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
  const authorMatch = opf.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
  const title = cleanText(decodeEntities((titleMatch?.[1] || fallbackTitle).replace(/<[^>]+>/g, ' '))).replace(/\s+/g, ' ').slice(0, 180);
  const author = cleanText(decodeEntities(authorMatch?.[1] || '')).replace(/\s+/g, ' ').slice(0, 120);

  const manifest = new Map();
  for (const itemMatch of opf.matchAll(/<item\b[^>]*\/?>/gi)) {
    const attrs = parseAttributes(itemMatch[0]);
    if (!attrs.id || !attrs.href) continue;
    if (/xhtml|html/i.test(attrs['media-type'] || '')) manifest.set(attrs.id, attrs.href);
  }
  const spineIds = [...opf.matchAll(/<itemref\b[^>]*\/?>/gi)].map((match) => parseAttributes(match[0]).idref).filter(Boolean);
  const spineFiles = spineIds.map((id) => manifest.get(id)).filter(Boolean);
  const files = spineFiles.length ? spineFiles : [...manifest.values()];
  const base = posix.dirname(rootPath.replace(/^\/+/, ''));
  const parts = [];
  const seen = new Set();
  for (const href of files) {
    const cleanHref = href.split('#')[0];
    if (!cleanHref) continue;
    let decoded = cleanHref;
    try { decoded = decodeURIComponent(cleanHref); } catch {}
    const path = posix.normalize(posix.join(base, decoded)).replace(/^\/+/, '');
    if (seen.has(path)) continue;
    seen.add(path);
    const data = entries.get(path) || entries.get(path.replace(/^\/+/, ''));
    if (!data) continue;
    const html = data.toString('utf8');
    if (/\.(xhtml|html|htm)$/i.test(path)) {
      const text = htmlToText(html);
      if (text.length > 20) parts.push(text);
    }
  }
  return { title: title || fallbackTitle, author, text: cleanText(parts.join('\n\n')), format: 'epub' };
}

async function handleExtract(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: { message: '仅支持 POST' } });
  let buffer;
  try {
    buffer = await readRawBody(req);
  } catch (error) {
    return sendJson(res, 413, { error: { message: error.message || '文件读取失败' } });
  }
  if (!buffer.length) return sendJson(res, 400, { error: { message: '文件是空的' } });
  if (buffer.subarray(0, 5).toString() === '%PDF-') {
    return sendJson(res, 415, { error: { message: '暂不支持 PDF。请先转换为 EPUB 或 TXT，再把文件拖进来。' } });
  }
  let filename = 'book.txt';
  try { filename = decodeURIComponent(req.headers['x-filename'] || 'book.txt'); } catch {}
  const ext = extname(filename).toLowerCase() || '.txt';
  const fallbackTitle = filename.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').slice(0, 160);

  try {
    let result;
    if (ext === '.epub') {
      result = parseEpub(buffer, fallbackTitle);
    } else if (['.txt', '.md', '.markdown', '.text', '.html', '.htm'].includes(ext)) {
      const raw = decodeTextBuffer(buffer);
      const isHtml = ['.html', '.htm'].includes(ext);
      const titleMatch = isHtml ? raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) : null;
      result = {
        title: cleanText(decodeEntities(titleMatch?.[1] || fallbackTitle)).slice(0, 180),
        author: '',
        text: isHtml ? htmlToText(raw) : cleanText(raw),
        format: isHtml ? 'html' : ext.replace('.', ''),
      };
    } else if (['.pdf', '.mobi', '.azw', '.azw3'].includes(ext)) {
      return sendJson(res, 415, { error: { message: `暂不支持 ${ext}。请转换为 EPUB 或 TXT 后导入。` } });
    } else {
      return sendJson(res, 415, { error: { message: '只支持 EPUB、TXT、Markdown 和 HTML 文件。' } });
    }
    if (!result.text || result.text.length < 300) {
      return sendJson(res, 422, { error: { message: '没有读到足够的正文。请确认文件没有加密，或换一个 EPUB/TXT 文件。' } });
    }
    result.text = result.text.slice(0, 1_500_000);
    return sendJson(res, 200, {
      ...result,
      filename,
      chars: result.text.length,
    });
  } catch (error) {
    console.error('解析电子书失败：', error);
    return sendJson(res, 422, { error: { message: error.message || '电子书解析失败' } });
  }
}


const TTS_VOICES = [
  { uri: 'edge:zh-CN-XiaoxiaoNeural', name: '晓晓 · 温暖女声', short: 'zh-CN-XiaoxiaoNeural' },
  { uri: 'edge:zh-CN-XiaoyiNeural', name: '晓伊 · 活泼女声', short: 'zh-CN-XiaoyiNeural' },
  { uri: 'edge:zh-CN-YunxiNeural', name: '云希 · 阳光男声', short: 'zh-CN-YunxiNeural' },
  { uri: 'edge:zh-CN-YunjianNeural', name: '云健 · 沉稳男声', short: 'zh-CN-YunjianNeural' },
  { uri: 'edge:zh-CN-YunyangNeural', name: '云扬 · 专业男声', short: 'zh-CN-YunyangNeural' },
  { uri: 'edge:zh-CN-liaoning-XiaobeiNeural', name: '晓北 · 东北女声', short: 'zh-CN-liaoning-XiaobeiNeural' },
];
const TTS_CACHE = new Map();
const TTS_CACHE_LIMIT = 48;
let ttsAvailablePromise = null;
let activeTts = 0;
const ttsQueue = [];

function pythonCommand() {
  if (process.env.PYTHON) return process.env.PYTHON;
  for (const candidate of ['python3', '/usr/bin/python3', '/opt/homebrew/bin/python3', '/usr/local/bin/python3']) {
    return candidate;
  }
  return 'python3';
}

function ttsEnv() {
  return {
    ...process.env,
    PYTHONPATH: [join(ROOT, 'vendor', 'edge-tts'), process.env.PYTHONPATH].filter(Boolean).join(delimiter),
    PYTHONIOENCODING: 'utf-8',
  };
}

function checkTtsAvailability() {
  if (ttsAvailablePromise) return ttsAvailablePromise;
  ttsAvailablePromise = new Promise((resolveCheck) => {
    try {
      const result = spawnSync(pythonCommand(), ['-c', 'import edge_tts'], {
        cwd: ROOT,
        env: ttsEnv(),
        timeout: 12000,
        encoding: 'utf8',
      });
      if (result.status === 0) resolveCheck(true);
      else {
        console.error('Edge TTS 不可用：', (result.stderr || '').trim().slice(0, 300));
        ttsAvailablePromise = null;
        resolveCheck(false);
      }
    } catch (error) {
      console.error('Edge TTS 检查失败：', error.message);
      ttsAvailablePromise = null;
      resolveCheck(false);
    }
  });
  return ttsAvailablePromise;
}

function acquireTtsSlot() {
  if (activeTts < 2) {
    activeTts += 1;
    return Promise.resolve();
  }
  return new Promise((resolveSlot) => ttsQueue.push(resolveSlot));
}

function releaseTtsSlot() {
  const next = ttsQueue.shift();
  if (next) next();
  else activeTts = Math.max(0, activeTts - 1);
}

function synthesizeEdge(text, voice) {
  const key = `${voice}\u0000${text}`;
  const cached = TTS_CACHE.get(key);
  if (cached) return Promise.resolve(cached);

  return acquireTtsSlot().then(
    () =>
      new Promise((resolveAudio, rejectAudio) => {
        const child = spawn(pythonCommand(), ['tools/edge_tts_cli.py', voice], {
          cwd: ROOT,
          env: ttsEnv(),
        });
        const chunks = [];
        const errors = [];
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill('SIGKILL');
          rejectAudio(new Error('自然人声生成超时'));
        }, 70000);

        child.stdin.on('error', () => {});
        child.stdout.on('data', (chunk) => chunks.push(chunk));
        child.stderr.on('data', (chunk) => {
          if (errors.length < 4) errors.push(chunk.toString('utf8'));
        });
        child.on('error', (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          rejectAudio(error);
        });
        child.on('close', (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (code !== 0) {
            rejectAudio(new Error((errors.join('').trim() || `Edge TTS 退出码 ${code}`).slice(0, 300)));
            return;
          }
          const audio = Buffer.concat(chunks);
          if (audio.length < 500) {
            rejectAudio(new Error('自然人声服务没有返回音频'));
            return;
          }
          TTS_CACHE.set(key, audio);
          while (TTS_CACHE.size > TTS_CACHE_LIMIT) {
            TTS_CACHE.delete(TTS_CACHE.keys().next().value);
          }
          resolveAudio(audio);
        });
        child.stdin.write(text);
        child.stdin.end();
      }).finally(releaseTtsSlot),
  );
}

async function handleTtsStatus(req, res) {
  const available = await checkTtsAvailability();
  return sendJson(res, 200, {
    available,
    provider: available ? 'Microsoft Edge neural TTS' : 'browser speech synthesis',
    voices: available ? TTS_VOICES.map(({ uri, name }) => ({ uri, name, lang: 'zh-CN', engine: 'edge' })) : [],
  });
}

async function handleTts(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: { message: '仅支持 POST' } });
  let payload;
  try {
    payload = JSON.parse(await readBody(req, 64 * 1024));
  } catch {
    return sendJson(res, 400, { error: { message: '请求格式错误' } });
  }
  const text = String(payload.text || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return sendJson(res, 400, { error: { message: '文本不能为空' } });
  if (text.length > 3000) return sendJson(res, 413, { error: { message: '单段文本过长' } });
  const voiceEntry = TTS_VOICES.find((voice) => voice.short === payload.voice);
  if (!voiceEntry) return sendJson(res, 400, { error: { message: '声音不存在' } });
  if (!(await checkTtsAvailability())) {
    return sendJson(res, 503, { error: { message: '自然人声服务不可用，已回退到系统语音' } });
  }

  try {
    const audio = await synthesizeEdge(text, voiceEntry.short);
    res.writeHead(200, {
      ...securityHeaders,
      'Content-Type': 'audio/mpeg',
      'Content-Length': audio.length,
      'Cache-Control': 'private, max-age=3600',
    });
    res.end(audio);
  } catch (error) {
    console.error('自然人声生成失败：', error.message);
    return sendJson(res, 502, { error: { message: '自然人声暂时不可用，已回退到系统语音' } });
  }
}

const catalogCache = new Map();

function catalogCacheGet(key) {
  const hit = catalogCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data;
  if (hit) catalogCache.delete(key);
  return null;
}

async function fetchJson(url, options = {}, timeout = 12000) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': 'Shiye/1.0 (local reading app)',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`书库接口返回 ${response.status}`);
  return response.json();
}

function gutenbergTextUrl(formats) {
  const entries = Object.entries(formats || {}).filter(([mime, url]) => /^text\/plain/i.test(mime) && /^https?:/i.test(url) && !/\.zip$/i.test(url));
  if (!entries.length) return '';
  entries.sort(([a], [b]) => {
    const score = (mime) => (/utf-8/i.test(mime) ? 0 : /us-ascii/i.test(mime) ? 1 : 2);
    return score(a) - score(b);
  });
  try {
    const url = new URL(entries[0][1]);
    if (!url.hostname.endsWith('gutenberg.org')) return '';
    return url.href;
  } catch {
    return '';
  }
}

async function searchGutenberg(query) {
  const data = await fetchJson(`https://gutendex.com/books/?search=${encodeURIComponent(query)}&page=1`, {}, 6000);
  return (data.results || []).slice(0, 8).map((book) => {
    const authors = (book.authors || []).map((author) => author.name).filter(Boolean);
    const textUrl = gutenbergTextUrl(book.formats);
    return {
      id: String(book.id),
      source: 'gutenberg',
      sourceLabel: '古登堡计划',
      title: book.title || '未命名',
      authors,
      author: authors.join(' / '),
      description: (book.summaries || [])[0] || (book.subjects || []).slice(0, 3).join(' · '),
      subjects: (book.subjects || []).slice(0, 6),
      languages: book.languages || [],
      downloads: book.download_count || 0,
      hasFullText: Boolean(textUrl),
      year: null,
    };
  });
}

async function searchGoogleBooks(query) {
  const data = await fetchJson(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10&printType=books`,
    {},
    6000,
  );
  return (data.items || [])
    .map((item) => {
      const info = item.volumeInfo || {};
      const authors = info.authors || [];
      return {
        id: `google-${item.id}`,
        source: 'google',
        sourceLabel: 'Google Books',
        title: info.title || '未命名',
        authors,
        author: authors.join(' / '),
        description: cleanText(decodeEntities(String(info.description || '').replace(/<[^>]+>/g, ' '))).slice(0, 700),
        subjects: (info.categories || []).slice(0, 5),
        languages: info.language ? [info.language] : [],
        downloads: 0,
        hasFullText: false,
        year: info.publishedDate ? String(info.publishedDate).slice(0, 4) : null,
        pageCount: info.pageCount || null,
        infoLink: info.infoLink || '',
        thumbnail: info.imageLinks?.thumbnail || '',
      };
    })
    .filter((item) => item.title && item.title !== '未命名');
}

async function searchOpenLibrary(query) {
  const data = await fetchJson(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10&fields=key,title,author_name,first_publish_year,subject,edition_count,language`,
    {},
    6000,
  );
  return (data.docs || [])
    .map((doc) => ({
      id: `openlibrary-${doc.key || doc.title}`,
      source: 'openlibrary',
      sourceLabel: 'Open Library',
      title: doc.title || '未命名',
      authors: doc.author_name || [],
      author: (doc.author_name || []).join(' / '),
      description: (doc.subject || []).slice(0, 4).join(' · '),
      subjects: (doc.subject || []).slice(0, 6),
      languages: doc.language || [],
      downloads: doc.edition_count || 0,
      hasFullText: false,
      year: doc.first_publish_year || null,
    }))
    .filter((item) => item.title && item.title !== '未命名');
}

async function searchDoubanPage(query) {
  const response = await fetch(
    `https://book.douban.com/subject_search?search_text=${encodeURIComponent(query)}&cat=1001`,
    {
      headers: {
        'User-Agent': 'Shiye/1.0 (local reading app)',
        Referer: 'https://book.douban.com/',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) throw new Error(`豆瓣搜索返回 ${response.status}`);
  const html = await response.text();
  const marker = 'window.__DATA__ = ';
  const startIndex = html.indexOf(marker);
  if (startIndex < 0) return [];
  const jsonStart = startIndex + marker.length;
  const newline = html.indexOf('\n', jsonStart);
  if (newline < 0) return [];
  let rawJson = html.slice(jsonStart, newline).trim();
  if (rawJson.endsWith(';')) rawJson = rawJson.slice(0, -1);
  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return [];
  }
  return (payload.items || [])
    .filter((item) => item.tpl_name === 'search_subject' && item.id)
    .slice(0, 12)
    .map((item) => {
      const abstract = String(item.abstract || '');
      const parts = abstract.split(' / ').map((part) => part.trim()).filter(Boolean);
      const yearMatch = abstract.match(/(?:19|20)\d{2}/);
      return {
        id: `douban-${item.id}`,
        source: 'douban',
        sourceLabel: '豆瓣读书',
        title: item.title || '未命名',
        authors: parts[0] ? [parts[0]] : [],
        author: parts[0] || '作者未知',
        description: '',
        subjects: [],
        languages: ['zh'],
        downloads: 0,
        hasFullText: false,
        year: yearMatch ? yearMatch[0] : null,
        detailId: String(item.id),
        cover: item.cover_url || '',
        url: item.url || '',
      };
    });
}

async function searchDouban(query) {
  // 单字查询用豆瓣搜索页更可靠；suggest 接口对单字经常直接返回空。
  if (String(query).trim().length <= 1) {
    try {
      const pageItems = await searchDoubanPage(query);
      if (pageItems.length) return pageItems;
    } catch {}
  }
  const data = await fetchJson(
    `https://book.douban.com/j/subject_suggest?q=${encodeURIComponent(query)}`,
    {
      headers: {
        Referer: 'https://book.douban.com/',
        Accept: 'application/json, text/plain, */*',
      },
    },
    5000,
  );
  const suggestions = Array.isArray(data) ? data : [];
  let items = suggestions
    .filter((item) => item.type === 'b' && item.id)
    .slice(0, 8)
    .map((item) => ({
      id: `douban-${item.id}`,
      source: 'douban',
      sourceLabel: '豆瓣读书',
      title: item.title || '未命名',
      authors: item.author_name ? [item.author_name] : [],
      author: item.author_name || '作者未知',
      description: '',
      subjects: [],
      languages: ['zh'],
      downloads: 0,
      hasFullText: false,
      year: item.year || null,
      detailId: String(item.id),
      cover: item.pic || '',
      url: item.url || '',
    }));

  // 豆瓣的 suggest 对单字/很短的关键词经常返回空；退回到搜索页，
  // 这样输入「沙」「三」「活」也能先看到候选书，而不是必须打全名。
  if (!items.length) {
    try {
      items = await searchDoubanPage(query);
    } catch {
      items = [];
    }
  }
  return items;
}

async function handleDoubanDetail(req, res, url) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: { message: '仅支持 GET' } });
  const id = (url.searchParams.get('id') || '').trim();
  if (!/^\d+$/.test(id)) return sendJson(res, 400, { error: { message: '书目编号无效' } });
  const cacheKey = `douban-detail-${id}`;
  const cached = catalogCacheGet(cacheKey);
  if (cached) return sendJson(res, 200, cached);
  try {
    const response = await fetch(`https://book.douban.com/subject/${id}/`, {
      headers: {
        'User-Agent': 'Shiye/1.0 (local reading app)',
        Referer: 'https://book.douban.com/',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) throw new Error(`豆瓣返回 ${response.status}`);
    const html = await response.text();
    const descriptionMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([\s\S]*?)["']\s*\/?>/i);
    const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([\s\S]*?)["']\s*\/?>/i);
    const description = cleanText(decodeEntities(descriptionMatch?.[1] || '').replace(/<[^>]+>/g, ' ')).slice(0, 900);
    const title = cleanText(decodeEntities(titleMatch?.[1] || '')).slice(0, 180);
    if (!description) throw new Error('没有读到公开简介');
    const payload = { title, description, source: 'douban', sourceId: id };
    catalogCache.set(cacheKey, { at: Date.now(), data: payload });
    return sendJson(res, 200, payload);
  } catch (error) {
    return sendJson(res, 502, { error: { message: '读取豆瓣书目简介失败，你仍然可以只按书名和作者解读。' } });
  }
}

async function handleCatalog(req, res, url) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: { message: '仅支持 GET' } });
  const query = (url.searchParams.get('q') || '').trim();
  if (!query) return sendJson(res, 400, { error: { message: '请输入书名或作者' } });
  const cacheKey = query.toLowerCase();
  const cached = catalogCacheGet(cacheKey);
  if (cached) return sendJson(res, 200, cached);

  const sources = [searchGutenberg, searchGoogleBooks, searchOpenLibrary, searchDouban];
  const buckets = sources.map(() => []);
  const tasks = sources.map((search, index) =>
    search(query)
      .then((items) => { buckets[index] = items || []; })
      .catch(() => {}),
  );
  const allDone = Promise.all(tasks);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const flatten = () => {
    const merged = [];
    const seen = new Set();
    for (const items of buckets) {
      for (const result of items) {
        const key = `${result.title}`.toLowerCase().replace(/\s+/g, '') + '|' + `${result.author}`.toLowerCase().replace(/\s+/g, '');
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(result);
      }
    }
    return merged;
  };

  // 豆瓣通常最快；先等 2.5 秒，拿到结果就返回，不再被连接超时的外部书库拖住。
  await Promise.race([allDone, wait(2500)]);
  let merged = flatten();
  if (!merged.length) {
    await Promise.race([allDone, wait(4000)]);
    merged = flatten();
  }
  if (!merged.length) {
    return sendJson(res, 502, {
      error: { message: '暂时无法连接在线书库。可以直接上传电子书，或用书名 + 作者让 AI 解读。' },
    });
  }
  merged.sort((a, b) => Number(b.hasFullText) - Number(a.hasFullText));
  const payload = {
    results: merged.slice(0, 15),
    source: 'multi',
    note: '古登堡计划可读取全文；豆瓣读书、Google Books / Open Library 仅提供公开书目与简介。',
    errors: 0,
  };
  catalogCache.set(cacheKey, { at: Date.now(), data: payload });
  return sendJson(res, 200, payload);
}

async function handleCatalogText(req, res, url) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: { message: '仅支持 GET' } });
  const id = (url.searchParams.get('id') || '').trim();
  if (!/^\d+$/.test(id)) return sendJson(res, 400, { error: { message: '书籍编号无效' } });
  const cacheKey = `text-${id}`;
  const cached = catalogCacheGet(cacheKey);
  if (cached) return sendJson(res, 200, cached);
  try {
    const book = await fetchJson(`https://gutendex.com/books/${id}/`);
    const textUrl = gutenbergTextUrl(book.formats || {});
    if (!textUrl) return sendJson(res, 422, { error: { message: '这本书没有可直接读取的纯文本版本。' } });
    const response = await fetch(textUrl, {
      headers: { 'User-Agent': 'Shiye/1.0 (local reading app)', Accept: 'text/plain' },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('全文下载失败');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 20 * 1024 * 1024) return sendJson(res, 413, { error: { message: '这本书的全文过大。' } });
    const raw = decodeTextBuffer(buffer);
    let text = cleanText(raw);
    const startMarker = text.indexOf('*** START OF');
    if (startMarker >= 0) {
      const nextLine = text.indexOf('\n', startMarker);
      if (nextLine >= 0) text = text.slice(nextLine + 1);
    }
    const endMarker = text.indexOf('*** END OF');
    if (endMarker > 0) text = text.slice(0, endMarker);
    text = text.trim().slice(0, 1_500_000);
    if (text.length < 300) return sendJson(res, 422, { error: { message: '没有读到正文。' } });
    const authors = (book.authors || []).map((author) => author.name).filter(Boolean);
    const payload = {
      title: book.title || `古登堡 #${id}`,
      author: authors.join(' / '),
      authors,
      text,
      chars: text.length,
      source: 'gutenberg',
      sourceId: id,
      format: 'txt',
    };
    catalogCache.set(cacheKey, { at: Date.now(), data: payload });
    return sendJson(res, 200, payload);
  } catch (error) {
    return sendJson(res, 502, { error: { message: error.message === '全文下载失败' ? '全文下载失败，请稍后再试。' : '无法读取公版书全文，请检查网络。' } });
  }
}

async function handleChat(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: { message: '仅支持 POST' } });
    return;
  }
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (error) {
    sendJson(res, 400, { error: { message: error.message || '请求体不是合法 JSON' } });
    return;
  }

  const { apiBase, apiKey, model, messages, stream = true } = payload || {};
  if (!apiKey || typeof apiKey !== 'string') {
    sendJson(res, 401, { error: { message: '缺少 API Key' } });
    return;
  }
  if (!apiBase || typeof apiBase !== 'string') {
    sendJson(res, 400, { error: { message: '缺少 API 地址' } });
    return;
  }
  let endpoint;
  try {
    const base = new URL(apiBase);
    if (!['https:', 'http:'].includes(base.protocol)) throw new Error('协议不支持');
    if (/\/chat\/completions\/?$/i.test(base.pathname)) {
      endpoint = base;
    } else {
      endpoint = new URL('chat/completions', base.href.endsWith('/') ? base.href : `${base.href}/`);
    }
  } catch {
    sendJson(res, 400, { error: { message: 'API 地址无效' } });
    return;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    sendJson(res, 400, { error: { message: '消息不能为空' } });
    return;
  }

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  let upstream;
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages,
        stream: Boolean(stream),
        temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.75,
        max_tokens: Number(payload.max_tokens) > 0 ? Math.min(Number(payload.max_tokens), 8000) : 1200,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    sendJson(res, 502, {
      error: { message: error.name === 'AbortError' ? '请求已取消' : '无法连接 AI 服务，请检查网络或 API 地址' },
    });
    return;
  }

  res.writeHead(upstream.status, {
    ...securityHeaders,
    'Content-Type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'X-Accel-Buffering': 'no',
  });

  if (!upstream.body) {
    res.end();
    return;
  }
  try {
    for await (const chunk of upstream.body) {
      res.write(chunk);
    }
  } catch {
    // 客户端中断或上游中断
  } finally {
    res.end();
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const relative = normalize(pathname).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  const filePath = resolve(join(ROOT, relative));
  if (!filePath.startsWith(ROOT + sep) && filePath !== ROOT) {
    sendJson(res, 403, { error: { message: '禁止访问' } });
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    const ext = extname(filePath).toLowerCase();
    const headers = {
      ...securityHeaders,
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=0, must-revalidate',
      'Service-Worker-Allowed': '/',
    };
    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      res.end();
      return;
    }
    res.writeHead(200, headers);
    createReadStream(filePath).pipe(res);
  } catch {
    if (req.method === 'GET' || req.method === 'HEAD') {
      try {
        const fallback = await readFile(join(ROOT, 'index.html'));
        res.writeHead(200, {
          ...securityHeaders,
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': fallback.length,
        });
        res.end(req.method === 'HEAD' ? undefined : fallback);
      } catch {
        sendJson(res, 404, { error: { message: 'Not found' } });
      }
    } else {
      sendJson(res, 404, { error: { message: 'Not found' } });
    }
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/chat') {
      await handleChat(req, res);
      return;
    }
    if (url.pathname === '/api/extract') {
      await handleExtract(req, res);
      return;
    }
    if (url.pathname === '/api/catalog') {
      await handleCatalog(req, res, url);
      return;
    }
    if (url.pathname === '/api/catalog/text') {
      await handleCatalogText(req, res, url);
      return;
    }
    if (url.pathname === '/api/douban/detail') {
      await handleDoubanDetail(req, res, url);
      return;
    }
    if (url.pathname === '/api/tts/status') {
      await handleTtsStatus(req, res);
      return;
    }
    if (url.pathname === '/api/tts') {
      await handleTts(req, res);
      return;
    }
    if (url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, service: 'shiye', version: '1.0.0' });
      return;
    }
    if (url.pathname === '/api/network') {
      sendJson(res, 200, {
        host: HOST,
        port: PORT,
        localOnly: LOCAL_ONLY,
        addresses: lanAddresses().map((item) => ({ name: item.name, address: item.address })),
        urls: lanAddresses().map((item) => `http://${item.address}:${PORT}`),
      });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: { message: 'Method not allowed' } });
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    console.error('服务错误：', error);
    if (!res.headersSent) sendJson(res, 500, { error: { message: '服务器内部错误' } });
    else res.end();
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n  端口 ${PORT} 已被占用。请换一个端口，例如：PORT=${PORT + 1} node server.mjs\n`);
  } else {
    console.error('服务启动失败：', error);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const addresses = lanAddresses();
  console.log(`\n  拾页已启动  →  http://127.0.0.1:${PORT}\n`);
  if (!LOCAL_ONLY) {
    for (const item of addresses) {
      console.log(`  手机/平板访问  →  http://${item.address}:${PORT}  (${item.name})`);
    }
    console.log('  注意：同一 Wi-Fi 下才能访问；请在家庭网络中开启，不要暴露到公共网络。');
  } else {
    console.log('  其他设备访问：双击 start-lan.command 后，用上面的局域网地址打开。');
  }
  console.log(`  本地 AI 代理 →  POST /api/chat`);
  console.log(`  按 Ctrl+C 停止服务\n`);
});
