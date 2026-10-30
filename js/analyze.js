import { completeChat, ChatError, hasApiKey } from './ai.js';
import { computeBookMetrics } from './data.js';
import { store } from './store.js';

const CHUNK_SIZE = 20000;
const MAX_CHUNKS = 12;
const MAX_SOURCE_CHARS = 1_500_000;

const COVER_PALETTES = [
  ['#1F4A3D', '#34705B', '#F3E9D2', 'orbit'],
  ['#2E3F5F', '#4C6690', '#F4EAD7', 'grid'],
  ['#6B3F2A', '#A2633E', '#F8EFDD', 'sun'],
  ['#3A4A2E', '#7C7A3F', '#F5EACD', 'moon'],
  ['#5A2E2A', '#8C4A3C', '#F4E6CE', 'arch'],
  ['#3F4A6B', '#65769B', '#EEF0E2', 'eclipse'],
  ['#5A4332', '#9A7351', '#F8EDD9', 'leaf'],
  ['#20465A', '#3C7E8C', '#F2ECDD', 'lines'],
];

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const hashString = (value) => {
  let hash = 0;
  for (const char of String(value)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
};

const unique = (values) => [...new Set(values.map(clean).filter(Boolean))];

function ensureActive(signal) {
  if (signal?.aborted) {
    const error = new Error('已取消分析');
    error.name = 'AbortError';
    throw error;
  }
}

function makeCover(seed) {
  const [a, b, ink, motif] = COVER_PALETTES[hashString(seed) % COVER_PALETTES.length];
  return { a, b, ink, motif, no: 'AI' };
}

function splitForAnalysis(text, size = CHUNK_SIZE, maxChunks = MAX_CHUNKS) {
  const source = String(text || '').trim().slice(0, MAX_SOURCE_CHARS);
  if (!source) return [];
  if (source.length <= size) {
    return [{ text: source, start: 0, end: source.length }];
  }
  if (source.length <= size * maxChunks) {
    const chunks = [];
    let start = 0;
    while (start < source.length) {
      let end = Math.min(source.length, start + size);
      if (end < source.length) {
        const boundary = source.lastIndexOf('\n', end);
        if (boundary > start + size * 0.55) end = boundary;
      }
      chunks.push({ text: source.slice(start, end), start, end });
      start = end;
    }
    return chunks;
  }
  const chunks = [];
  for (let index = 0; index < maxChunks; index += 1) {
    const start = Math.round((index * (source.length - size)) / Math.max(1, maxChunks - 1));
    let end = Math.min(source.length, start + size);
    if (end < source.length) {
      const boundary = source.lastIndexOf('\n', end);
      if (boundary > start + size * 0.55) end = boundary;
    }
    chunks.push({ text: source.slice(start, end), start, end });
  }
  return chunks;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function extractJson(raw) {
  let text = String(raw || '').trim();
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('没有找到 JSON');
  return JSON.parse(text.slice(start, end + 1));
}

function stringArray(value, fallback = [], limit = 8) {
  const list = Array.isArray(value) ? value : [];
  const result = unique(list.map((item) => (typeof item === 'string' ? item : item?.text || '')));
  return (result.length ? result : fallback).slice(0, limit);
}

function asObject(value, fallback) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function normalizeAnalysis(raw, meta, progress) {
  const title = clean(meta.title) || '未命名书稿';
  const author = clean(meta.author) || '未知作者';
  const oneLiner = clean(raw.oneLiner) || '这本书值得慢慢读，也值得认真想一想。';
  const intro = clean(raw.intro) || oneLiner;

  let keyIdeas = (Array.isArray(raw.keyIdeas) ? raw.keyIdeas : [])
    .map((item) => ({ title: clean(item?.title), body: clean(item?.body) }))
    .filter((item) => item.title && item.body)
    .slice(0, 6);
  if (keyIdeas.length < 3) {
    keyIdeas = [
      ...keyIdeas,
      { title: '先抓住作者的问题', body: oneLiner },
      { title: '把观点放回生活', body: '读完之后，找一个能立刻尝试的小动作。' },
      { title: '保留自己的判断', body: '书里的答案不一定适合你，重要的是继续追问。' },
    ].slice(0, 4);
  }

  let sections = (Array.isArray(raw.sections) ? raw.sections : [])
    .map((section) => ({
      title: clean(section?.title) || '核心章节',
      paras: stringArray(section?.paras, [], 4).map((text) => text.slice(0, 600)),
      takeaway: clean(section?.takeaway) || '',
    }))
    .filter((section) => section.paras.length)
    .slice(0, 7);
  if (!sections.length) {
    sections = keyIdeas.slice(0, 4).map((idea, index) => ({
      title: idea.title,
      paras: [idea.body],
      takeaway: index === 0 ? oneLiner : idea.title,
    }));
  }
  sections = sections.map((section, index) => ({
    ...section,
    paras: section.paras.length ? section.paras : [keyIdeas[index % keyIdeas.length].body],
    takeaway: section.takeaway || keyIdeas[index % keyIdeas.length].title,
  }));

  const whyRead = stringArray(
    raw.whyRead,
    keyIdeas.slice(0, 3).map((idea) => `看见「${idea.title}」背后的关键问题`),
    5,
  );
  const quotes = (Array.isArray(raw.quotes) ? raw.quotes : [])
    .map((quote) => ({
      text: clean(typeof quote === 'string' ? quote : quote?.text).slice(0, 80),
      source: clean(typeof quote === 'object' ? quote?.source : '') || 'AI 摘录',
    }))
    .filter((quote) => quote.text)
    .slice(0, 5);
  const finalQuotes = quotes.length
    ? quotes
    : keyIdeas.slice(0, 3).map((idea) => ({ text: idea.body.slice(0, 60), source: '导读' }));

  const actions = stringArray(
    raw.actions,
    ['选一个书里的观点，写下你最近的亲身例子。', '用一句话复述这本书，并讲给一个没读过的人听。', '记录一个你不同意的地方，再去找反证。'],
    5,
  );
  const questions = stringArray(
    raw.questions,
    ['这本书最打动你的判断是什么？', '哪一个观点你并不同意？', '如果只带走一个行动，会是什么？', '它和你最近的生活有什么关系？'],
    5,
  );
  const debate = asObject(raw.debate, {});
  const debateTitle = clean(debate.title) || '这本书的边界';
  const debateBody =
    clean(debate.body) ||
    'AI 导读基于有限的材料生成，可能遗漏了书里的细节。把它当作阅读的入口，而不是结论本身。';

  const aiTags = stringArray(raw.tags, [], 4);
  const tags = unique([...(meta.sourceType === 'metadata' ? ['公开资料'] : ['AI 精读']), ...aiTags]).slice(0, 4);

  const id = `imported-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
  const metrics = computeBookMetrics({ oneLiner, intro, whyRead, keyIdeas, sections, actions, debate: { body: debateBody }, audience: clean(raw.audience), quotes: finalQuotes });
  const source = {
    type: meta.sourceType || 'text',
    label: meta.sourceLabel || '我的导入',
    originalChars: meta.originalChars || meta.text?.length || 0,
    analyzedChars: meta.analyzedChars || meta.text?.length || 0,
    coverage: meta.coverage || '',
    disclaimer:
      meta.sourceType === 'metadata'
        ? '未读取全文，基于公开简介与模型知识生成'
        : 'AI 生成，请以原书为准',
    model: store.get().settings.model,
    createdAt: Date.now(),
    chunks: meta.chunkCount || 0,
  };

  return {
    id,
    title,
    enTitle: 'AI READING NOTE',
    author,
    authorBio: clean(raw.authorBio) || (meta.sourceType === 'metadata'
      ? '这本书由你从公开书库中找到，AI 基于公开简介与模型知识生成了这份导读。'
      : '这本书由你导入，AI 基于书稿原文生成了这份导读。'),
    category: 'imported',
    tags,
    year: new Date().getFullYear(),
    rating: 0,
    ratings: 0,
    difficulty: 'AI 解读',
    cover: makeCover(`${title}-${author}`),
    tagline: oneLiner,
    oneLiner,
    intro,
    whyRead,
    keyIdeas,
    sections,
    quotes: finalQuotes,
    actions,
    audience: clean(raw.audience) || '愿意带着问题阅读，也愿意质疑作者的人。',
    debate: { title: debateTitle, body: debateBody },
    questions,
    related: [],
    isImported: true,
    source,
    index: 1000 + (hashString(id) % 100000),
    chars: metrics.chars,
    listenMinutes: metrics.listenMinutes,
    readMinutes: metrics.readMinutes,
  };
}

async function repairJson(raw, signal) {
  const repaired = await completeChat({
    messages: [
      {
        role: 'system',
        content: '你是 JSON 修复器。只输出合法 JSON，不要解释，不要使用 Markdown 代码块。保持原有字段和中文内容。',
      },
      { role: 'user', content: `请把下面这段内容修复为严格合法的 JSON：\n\n${String(raw).slice(0, 24000)}` },
    ],
    temperature: 0,
    maxTokens: 5000,
    signal,
  });
  return extractJson(repaired);
}

function finalPrompt(meta, notes) {
  const mode =
    meta.sourceType === 'metadata'
      ? '这次只有公开简介与书名/作者信息，没有全文。请只基于简介与公认背景做判断；不确定的地方要写明“据公开资料/可能”，不要编造具体页码、原文长句或虚构情节。'
      : '以下是从原书（或原文节选）整理出的分段阅读笔记。请严格依据这些笔记归纳，不要引入笔记之外的具体事实。';
  return `请为下面这本书写一份中文精华导读。
书名：${meta.title}
作者：${meta.author || '未知'}
${mode}

【阅读材料】
${notes}

请只输出一个 JSON 对象，不要 Markdown，不要解释。字段必须完整：
{
  "oneLiner": "一句话读懂，40字以内",
  "intro": "120-220字导读",
  "whyRead": ["为什么值得读，3条，每条30字以内"],
  "keyIdeas": [{"title":"核心观点标题","body":"80-140字解释"}],
  "sections": [{"title":"章节标题","paras":["120-220字","80-160字"],"takeaway":"一句小结"}],
  "quotes": [{"text":"不超过40字的短句或意译","source":"原文/意译/AI 摘录"}],
  "actions": ["可执行的小练习，3-4条"],
  "audience": "适合谁读，40-80字",
  "debate": {"title":"争议与边界标题","body":"60-120字，指出这本书可能的局限"},
  "questions": ["值得讨论的问题，4条"],
  "tags": ["3个标签"],
  "authorBio": "50字以内的作者/来源说明"
}
要求：
- keyIdeas 4-5 条；sections 4-6 个；quotes 3 条。
- 用自然、具体的中文，不要空泛鸡汤；不要写“这本书告诉我们”这种套话。
- 不要大段复制原文；引用短句不超过40字，无法确认原文时标注“意译”。
- 每个 section 的 paras 写 2 段，段落之间要有推进，不要重复。
- 如果材料不足以支持某个判断，就诚实写“材料有限，无法确认”，不要补写。`;
}

export async function analyzeBook({ title, author, text, description, sourceType, sourceLabel, signal, onProgress }) {
  if (!hasApiKey()) throw new ChatError('NO_KEY');
  const progress = (payload) => {
    try { onProgress?.(payload); } catch {}
  };
  ensureActive(signal);
  const originalTitle = clean(title) || '未命名书稿';
  const originalAuthor = clean(author) || '';
  const originalChars = String(text || description || '').length;
  const meta = {
    title: originalTitle,
    author: originalAuthor,
    sourceType: sourceType || 'text',
    sourceLabel: sourceLabel || '我的导入',
    originalChars,
    text: String(text || ''),
  };

  let notes = '';
  let chunkCount = 0;
  let analyzedChars = 0;

  if (sourceType === 'metadata') {
    progress({ stage: 'reading', completed: 0, total: 1, message: '正在整理公开资料与模型知识…' });
    notes = `书名：${originalTitle}\n作者：${originalAuthor || '未知'}\n公开简介：${clean(description) || '（没有可用的公开简介）'}`;
    analyzedChars = String(description || '').length;
    meta.coverage = '公开简介';
  } else {
    const sourceText = String(text || '').trim();
    if (sourceText.length < 300) throw new ChatError('正文太短，至少需要 300 个字符才能分析。');
    const chunks = splitForAnalysis(sourceText);
    chunkCount = chunks.length;
    analyzedChars = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
    meta.chunkCount = chunkCount;
    meta.analyzedChars = analyzedChars;
    meta.coverage =
      sourceText.length > 0
        ? `${Math.round((analyzedChars / Math.min(sourceText.length, MAX_SOURCE_CHARS)) * 100)}%`
        : '';

    progress({
      stage: 'reading',
      completed: 0,
      total: chunkCount,
      message: `正在拆解书稿：共 ${chunkCount} 段，准备逐段阅读…`,
    });

    let completed = 0;
    const chunkNotes = await mapLimit(chunks, 2, async (chunk, index) => {
      ensureActive(signal);
      const content = await completeChat({
        messages: [
          {
            role: 'system',
            content:
              '你是一位严谨的中文读书编辑。你的任务是阅读书稿片段，提炼内容笔记，而不是写书评。只输出中文笔记，不要客套话，不要 Markdown 标题。',
          },
          {
            role: 'user',
            content: `书名：${originalTitle}\n作者：${originalAuthor || '未知'}\n这是全书第 ${index + 1}/${chunkCount} 段（可能有前后文缺失）：\n\n${chunk.text}\n\n请写 450-700 字阅读笔记，包含：\n1. 这一段在讨论什么核心问题；\n2. 作者的关键论点、概念或例子；\n3. 值得记住的短句（不超过30字，无法确认原文就写“意译”）。\n不要复述全文，不要编造没有出现的内容。`,
          },
        ],
        temperature: 0.35,
        maxTokens: 1000,
        signal,
      });
      completed += 1;
      progress({
        stage: 'reading',
        completed,
        total: chunkCount,
        message: `正在阅读第 ${completed}/${chunkCount} 段原文…`,
      });
      return `【第 ${index + 1}/${chunkCount} 段笔记】\n${content.trim()}`;
    });
    notes = chunkNotes.join('\n\n');
  }

  ensureActive(signal);
  progress({ stage: 'synthesis', completed: chunkCount, total: chunkCount, message: '正在把零散笔记整理成一本书的脉络…' });
  const prompt = finalPrompt(meta, notes.slice(0, 28000));
  let raw = await completeChat({
    messages: [
      {
        role: 'system',
        content: '你是一位中文读书编辑，擅长把复杂内容整理成清晰、有洞察、可行动的导读。你只输出合法 JSON，不输出其他内容。',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.6,
    maxTokens: 5000,
    signal,
  });

  let parsed;
  try {
    parsed = extractJson(raw);
  } catch {
    progress({ stage: 'synthesis', completed: chunkCount, total: chunkCount, message: '正在整理文字格式…' });
    parsed = await repairJson(raw, signal);
  }
  ensureActive(signal);
  const book = normalizeAnalysis(parsed, meta, progress);
  progress({ stage: 'done', completed: chunkCount, total: chunkCount, message: '导读已生成' });
  return book;
}
