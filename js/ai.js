import { store } from './store.js';

const STOP_WORDS = new Set([
  '我们',
  '你们',
  '他们',
  '这个',
  '那个',
  '一个',
  '一种',
  '没有',
  '就是',
  '不是',
  '什么',
  '怎么',
  '为何',
  '如何',
  '可以',
  '应该',
  '觉得',
  '认为',
  '作者',
  '书里',
  '本书',
  '这本',
  '这本',
  '问题',
  '是不是',
  '有没有',
  '为什么',
  '怎么样',
  '一下子',
  '其实',
  '但是',
  '因为',
  '所以',
  '如果',
  '还是',
  '或者',
  '以及',
  '关于',
  '对于',
  '自己',
  '他们',
  '她们',
  '它们',
  '这样',
  '那样',
  '一些',
  '一点',
  '非常',
  '真的',
  '可能',
  '需要',
  '想要',
  '知道',
  '来说',
  '方面',
]);

const tokenize = (text) => {
  const clean = String(text || '')
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');
  const tokens = new Set();
  for (let i = 0; i < clean.length - 1; i += 1) {
    const pair = clean.slice(i, i + 2);
    if (/^[\u4e00-\u9fa5]{2}$/.test(pair) && !STOP_WORDS.has(pair)) tokens.add(pair);
  }
  (clean.match(/[a-z]{3,}/g) || []).forEach((word) => tokens.add(word));
  return [...tokens];
};

const hashPick = (list, seed) => {
  if (!list.length) return '';
  let hash = 0;
  for (const char of String(seed)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return list[hash % list.length];
};

const truncate = (text, length = 120) => {
  const clean = String(text || '').trim();
  return clean.length > length ? `${clean.slice(0, length)}…` : clean;
};

const findRelevant = (book, question) => {
  const queryTokens = tokenize(question);
  let best = { score: 0, sectionIndex: -1, section: null, paragraph: '' };
  book.sections.forEach((section, sectionIndex) => {
    const titleText = section.title;
    const takeawayText = section.takeaway;
    let sectionScore = 0;
    let bestPara = '';
    let bestParaScore = 0;
    section.paras.forEach((para) => {
      let score = 0;
      queryTokens.forEach((token) => {
        if (titleText.includes(token)) score += 5;
        if (para.includes(token)) score += 2;
        if (takeawayText.includes(token)) score += 3;
      });
      if (score > bestParaScore) {
        bestParaScore = score;
        bestPara = para;
      }
      sectionScore += score;
    });
    if (sectionScore > best.score) {
      best = { score: sectionScore, sectionIndex, section, paragraph: bestPara || section.paras[0] };
    }
  });

  let idea = null;
  let ideaScore = 0;
  book.keyIdeas.forEach((item) => {
    let score = 0;
    queryTokens.forEach((token) => {
      if (item.title.includes(token)) score += 3;
      if (item.body.includes(token)) score += 2;
    });
    if (score > ideaScore) {
      ideaScore = score;
      idea = item;
    }
  });

  return { ...best, idea, ideaScore, queryTokens };
};

const followUp = (book, seed) => hashPick(book.questions, seed);

export function generateLocalReply(book, question, history = []) {
  const text = String(question || '').trim();
  if (!text) return '我在。你想从哪个问题开始？';
  const seed = `${text}-${history.length}`;
  const q = text.toLowerCase();
  const relevant = findRelevant(book, text);

  if (/^(你好|hi|hello|嗨|在吗|早上好|中午好|晚上好|哈喽)/.test(q) && text.length < 16) {
    return `你好，我是《${book.title}》的导读员。我们可以从三个方向聊：书里的核心观点、它和你的生活有什么关系，或者你不同意作者的地方。你想从哪儿开始？`;
  }
  if (/谢谢|感谢|受益|明白了/.test(q) && text.length < 24) {
    return `不客气。读书最珍贵的时刻，往往不是“我懂了”，而是“我想试试”。如果只带走一件小事，你希望是什么？`;
  }
  if (/总结|概括|讲了什么|主要内容|核心|一句话|大意|梳理/.test(q)) {
    const ideas = book.keyIdeas.slice(0, 3);
    return `如果只用一句话：${book.oneLiner}\n\n书里反复展开的是这三点：\n1. ${ideas[0].title}——${ideas[0].body}\n2. ${ideas[1].title}——${ideas[1].body}\n3. ${ideas[2].title}——${ideas[2].body}\n\n你最想先深入哪一点？`;
  }
  if (/金句|摘抄|句子|原文|引用|语录/.test(q)) {
    const quote = hashPick(book.quotes, seed);
    return `我想到的是这一句：\n\n“${quote.text}”\n\n它打动我的地方在于，它没有把问题停在道理上，而是把选择交回给读者。你读到这句时，想到的是哪件事？`;
  }
  if (/怎么做|如何做|怎么用|实践|行动|练习|落地|建议|改变/.test(q)) {
    const actions = book.actions.slice(0, 2);
    return `先别追求“彻底改变”，从最小的一步开始：\n\n1. ${actions[0]}\n2. ${actions[1]}\n\n书里的方法只有落到具体动作上才算数。你愿意先试哪一个？如果觉得太大，我们把它再拆小一点。`;
  }
  if (/不同意|反对|质疑|批评|局限|反驳|不认同|漏洞|问题在哪|是否太/.test(q)) {
    return `这个质疑很重要。书里其实也留了边界：${book.debate.body}\n\n所以更准确的说法也许是：它提供了一个有用的视角，但不是唯一答案。你更担心的是哪一部分被过度简化了？`;
  }
  if (/作者|谁写|背景|经历/.test(q) && text.length < 40) {
    return `${book.author}。${book.authorBio}\n\n了解作者的经历，有助于理解这本书为什么会长成这样。你更想聊作者的时代背景，还是书里的观点？`;
  }
  if (/难过|焦虑|迷茫|痛苦|孤独|累|压力|内耗/.test(q)) {
    const idea = relevant.idea || book.keyIdeas[0];
    return `先不急着解决。你愿意把现在的感受说具体一点吗？是发生了什么，还是持续了很久？\n\n书里有一个视角也许能陪你一会儿：${idea.title}——${idea.body}\n\n它不一定能立刻解决问题，但也许能帮你把问题看得更清楚一点。`;
  }
  if (/结局|结尾|最后|死了|为什么死/.test(q) && ['to-live', 'solitude', 'little-prince'].includes(book.id)) {
    const last = book.sections[book.sections.length - 1];
    return `关于结尾，书里最后一节是这样收束的：${truncate(last.takeaway, 80)}\n\n${truncate(last.paras[last.paras.length - 1], 140)}\n\n你读完结尾时，第一反应是什么？是释然、愤怒，还是空落落的？`;
  }

  const hasRelevant = relevant.score >= 4 || relevant.ideaScore >= 4;
  if (hasRelevant && relevant.section) {
    const topic = relevant.section.title;
    const takeaway = relevant.section.takeaway;
    const para = truncate(relevant.paragraph, 150);
    const bridge = hashPick(
      [
        `我的理解是，这一节其实在说：${takeaway}`,
        `如果把它翻译成一句更直白的话：${takeaway}`,
        `这一节最关键的提醒，是${takeaway}`,
      ],
      seed,
    );
    return `你问的这一点，书里在第 ${relevant.sectionIndex + 1} 节「${topic}」讲得很集中。\n\n${para}\n\n${bridge}\n\n${followUp(book, seed)}`;
  }

  if (relevant.idea && relevant.ideaScore >= 3) {
    return `可以借书里的一个核心观点来回应：**${relevant.idea.title}**。${relevant.idea.body}\n\n不过，这只是书里的读法，不一定是标准答案。把它放到你的处境里，你觉得哪一部分成立，哪一部分不太成立？`;
  }

  const idea = hashPick(book.keyIdeas, seed);
  return `这个问题可以换个角度想。书里有一个核心观点：**${idea.title}**——${idea.body}\n\n我的读法是，它真正想提醒我们的是：${book.oneLiner}\n\n你愿意多说一点你的具体情境吗？这样我们可以聊得更贴近你，而不是停在抽象的道理上。`;
}

export const hasApiKey = () => Boolean(store.get().settings.apiKey?.trim());

export function aiStatus() {
  if (hasApiKey()) {
    return { mode: 'ai', label: 'AI 深度讨论', detail: '已连接你的模型' };
  }
  return { mode: 'local', label: '本地导读', detail: '配置 API Key 可解锁 AI 讨论' };
}

function buildSystemPrompt(book) {
  const ideas = book.keyIdeas.map((item) => `- ${item.title}：${item.body}`).join('\n');
  const sections = book.sections
    .map((section, index) => `- 第${index + 1}节 ${section.title}：${section.takeaway}`)
    .join('\n');
  return `你是「拾页」的 AI 导读员，正在和用户讨论《${book.title}》（${book.author}）。

【本书一句话】${book.oneLiner}
【导读】${book.intro}
【核心观点】
${ideas}
【章节脉络】
${sections}
【适合谁读】${book.audience}
【争议与边界】${book.debate.title}：${book.debate.body}

你的任务：
1. 用自然、温和、有洞察的中文对谈，像一位读过很多遍这本书的朋友，而不是客服或老师。
2. 优先回应用户的具体问题；引用书中观点时，用“书里提到/作者的意思是”来转述，不要伪造原文引号。
3. 回答控制在 120–260 字，最多追问一个问题。不要连续使用大段列表，除非用户明确要求总结。
4. 当用户不同意时，先复述他的质疑，再回应，不要急于辩护。
5. 把抽象观点落到具体例子或一个可尝试的小动作上，避免空泛鸡汤。
6. 不要使用 Markdown 标题；可以使用加粗强调关键词。
7. 如果问题超出本书范围，可以诚实说明，并把它和书里的某个观点连接起来。`;
}

export class ChatError extends Error {}

async function readStream(response, onDelta) {
  const reader = response.body?.getReader();
  if (!reader) {
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const lines = part.split('\n').filter((line) => line.trim().startsWith('data:'));
      for (const line of lines) {
        const payload = line.replace(/^data:\s*/, '').trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || '';
          if (delta) {
            full += delta;
            onDelta?.(delta, full);
          }
        } catch {
          // 忽略不完整的 SSE 数据块
        }
      }
    }
  }
  return full;
}

export async function streamChat({ book, messages, onDelta, signal }) {
  const settings = store.get().settings;
  if (!settings.apiKey?.trim()) {
    throw new ChatError('NO_KEY');
  }

  const apiMessages = [
    { role: 'system', content: buildSystemPrompt(book) },
    ...messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-12)
      .map((message) => ({ role: message.role, content: message.content })),
  ];

  let response;
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiBase: settings.apiBase,
        apiKey: settings.apiKey,
        model: settings.model,
        messages: apiMessages,
        stream: true,
      }),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ChatError('连接失败，请检查本地服务是否在运行，或网络是否可用。');
  }

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data.error?.message || data.message || '';
    } catch {}
    if (response.status === 401) throw new ChatError('API Key 无效或已过期，请到设置中检查。');
    if (response.status === 404) throw new ChatError('未找到 AI 接口，请检查 API 地址与模型名称。');
    throw new ChatError(detail || `AI 接口返回错误（${response.status}）。`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    const full = data.choices?.[0]?.message?.content || '';
    if (!full) throw new ChatError('AI 没有返回内容，请稍后再试。');
    onDelta?.(full, full);
    return full;
  }

  const full = await readStream(response, onDelta);
  if (!full.trim()) throw new ChatError('AI 没有返回内容，请稍后再试。');
  return full;
}

export async function completeChat({ messages, temperature = 0.45, maxTokens = 1800, signal } = {}) {
  const settings = store.get().settings;
  if (!settings.apiKey?.trim()) throw new ChatError('NO_KEY');
  if (!Array.isArray(messages) || !messages.length) throw new ChatError('消息不能为空。');

  let timeoutSignal = null;
  try {
    timeoutSignal = AbortSignal.timeout(240000);
  } catch {}
  let combined = signal || timeoutSignal;
  if (signal && timeoutSignal && typeof AbortSignal.any === 'function') {
    combined = AbortSignal.any([signal, timeoutSignal]);
  }

  let response;
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiBase: settings.apiBase,
        apiKey: settings.apiKey,
        model: settings.model,
        messages,
        stream: false,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: combined,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      if (signal?.aborted) throw error;
      throw new ChatError('AI 响应超时，请稍后再试；如果书很长，可以少选几段。');
    }
    throw new ChatError('连接 AI 失败，请检查网络、API 地址或本地服务是否运行。');
  }

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data.error?.message || data.message || '';
    } catch {}
    if (response.status === 401) throw new ChatError('API Key 无效或已过期，请到设置中检查。');
    if (response.status === 404) throw new ChatError('未找到 AI 接口，请检查 API 地址与模型名称。');
    throw new ChatError(detail || `AI 接口返回错误（${response.status}）。`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new ChatError('AI 返回了无法解析的内容。');
  }
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new ChatError('AI 没有返回内容，请稍后再试。');
  return content;
}
