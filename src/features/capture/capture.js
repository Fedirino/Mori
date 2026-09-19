const DEFAULT_STORAGE_KEY = 'mori.core.items.v1';

export const CORE_PROJECTS = [
  'Clip Forge',
  'Produce Guy',
  'Signal Ghost',
  'Clarity',
  'PDP',
  'Mori'
];

const WEEKDAYS = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

const cloneItem = (item) => ({ ...item });

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'item-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function safeRead(storage, key) {
  try {
    const parsed = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function normalizeItem(item, now) {
  const createdAt = item.createdAt || now.toISOString();
  return {
    id: item.id || makeId(),
    type: ['task', 'note', 'reminder'].includes(item.type) ? item.type : 'task',
    title: String(item.title || '').trim(),
    details: String(item.details || '').trim(),
    project: String(item.project || '').trim(),
    dueAt: item.dueAt || null,
    status: item.status === 'done' ? 'done' : 'open',
    source: item.source === 'voice' ? 'voice' : 'text',
    rawText: String(item.rawText || '').trim(),
    createdAt,
    updatedAt: item.updatedAt || createdAt,
    completedAt: item.completedAt || null
  };
}

export function createCoreStore({
  storage = globalThis.localStorage,
  storageKey = DEFAULT_STORAGE_KEY,
  now = () => new Date()
} = {}) {
  let items = safeRead(storage, storageKey)
    .map((item) => normalizeItem(item, now()))
    .filter((item) => item.title);
  const listeners = new Set();

  function persist() {
    storage.setItem(storageKey, JSON.stringify(items));
    listeners.forEach((listener) => listener(items.map(cloneItem)));
  }

  return {
    list() {
      return items
        .map(cloneItem)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
    get(id) {
      const item = items.find((candidate) => candidate.id === id);
      return item ? cloneItem(item) : null;
    },
    add(draft) {
      const item = normalizeItem(draft, now());
      if (!item.title) throw new Error('A title is required.');
      items.unshift(item);
      persist();
      return cloneItem(item);
    },
    update(id, patch) {
      const index = items.findIndex((candidate) => candidate.id === id);
      if (index < 0) return null;
      const next = normalizeItem({
        ...items[index],
        ...patch,
        id,
        updatedAt: now().toISOString()
      }, now());
      if (!next.title) throw new Error('A title is required.');
      items[index] = next;
      persist();
      return cloneItem(next);
    },
    remove(id) {
      const index = items.findIndex((candidate) => candidate.id === id);
      if (index < 0) return null;
      const [removed] = items.splice(index, 1);
      persist();
      return cloneItem(removed);
    },
    restore(item) {
      const restored = normalizeItem(item, now());
      items = items.filter((candidate) => candidate.id !== restored.id);
      items.unshift(restored);
      persist();
      return cloneItem(restored);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractProject(text) {
  for (const project of CORE_PROJECTS) {
    const escaped = escapeRegExp(project);
    const scoped = new RegExp('\\b(?:for|under|in|project)\\s+' + escaped + '\\b', 'i');
    if (scoped.test(text)) {
      return { project, text: text.replace(scoped, ' ') };
    }
  }
  for (const project of CORE_PROJECTS) {
    const direct = new RegExp('\\b' + escapeRegExp(project) + '\\b', 'i');
    if (direct.test(text)) return { project, text };
  }
  return { project: '', text };
}

function schedulingInfo(text, now, type) {
  const target = new Date(now);
  target.setSeconds(0, 0);
  let hasDate = false;
  let hasTime = false;

  if (/\btomorrow\b/i.test(text)) {
    target.setDate(target.getDate() + 1);
    hasDate = true;
  } else if (/\btoday\b/i.test(text) || /\btonight\b/i.test(text)) {
    hasDate = true;
  } else {
    const weekdayMatch = text.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
    if (weekdayMatch) {
      const desired = WEEKDAYS[weekdayMatch[2].toLowerCase()];
      let delta = (desired - target.getDay() + 7) % 7;
      if (weekdayMatch[1] || delta === 0) delta += 7;
      target.setDate(target.getDate() + delta);
      hasDate = true;
    }
  }

  if (/\bnoon\b/i.test(text)) {
    target.setHours(12, 0, 0, 0);
    hasTime = true;
  } else if (/\bmidnight\b/i.test(text)) {
    target.setHours(0, 0, 0, 0);
    hasTime = true;
  } else if (/\btonight\b/i.test(text)) {
    target.setHours(20, 0, 0, 0);
    hasTime = true;
  } else {
    const timeMatch = text.match(/\b(?:at|by)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/i);
    if (timeMatch) {
      let hour = Number(timeMatch[1]);
      const minute = Number(timeMatch[2] || 0);
      const meridiem = (timeMatch[3] || '').toLowerCase().replace(/\./g, '');
      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      if (hour <= 23 && minute <= 59) {
        target.setHours(hour, minute, 0, 0);
        hasTime = true;
      }
    }
  }

  if (hasDate && !hasTime) {
    target.setHours(type === 'reminder' ? 9 : 17, 0, 0, 0);
  }
  if (!hasDate && hasTime && target <= now) target.setDate(target.getDate() + 1);
  return hasDate || hasTime ? target.toISOString() : null;
}

function cleanTitle(text, type) {
  let title = text.trim();
  const prefixes = type === 'reminder'
    ? [
        /^(?:please\s+)?remind\s+me(?:\s+to|\s+that)?\s+/i,
        /^remember\s+to\s+/i,
        /^reminder\s*:\s*/i
      ]
    : type === 'task'
      ? [
          /^(?:please\s+)?(?:add|create|make)\s+(?:a\s+)?(?:task|to-?do)(?:\s+to|\s+for)?\s+/i,
          /^(?:i\s+)?need\s+to\s+/i,
          /^(?:task|to-?do)\s*:\s*/i
        ]
      : [
          /^(?:please\s+)?(?:save|note)\s+(?:this\s+|that\s+)?(?:idea\s+|note\s+)?/i,
          /^remember\s+that\s+/i,
          /^(?:idea|note)\s*:\s*/i
        ];
  prefixes.some((pattern) => {
    if (!pattern.test(title)) return false;
    title = title.replace(pattern, ' ');
    return true;
  });
  title = title
    .replace(/\b(?:on\s+)?(?:today|tomorrow|tonight)\b/gi, ' ')
    .replace(/\b(?:on\s+)?(?:next\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, ' ')
    .replace(/\b(?:at|by)\s+(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?|noon|midnight)\b/gi, ' ')
    .replace(/\b(?:at|by)\s+(?:noon|midnight)\b/gi, ' ')
    .replace(/\s*[:;,\-–—]\s*$/, '')
    .replace(/^\s*[:;,\-–—]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^to\s+/i, '');
  return title;
}

export function parseCaptureIntent(text, now = new Date(), source = 'text') {
  const rawText = String(text || '').trim();
  if (!rawText) return null;
  let type = '';
  if (/^(?:please\s+)?remind\s+me\b/i.test(rawText) || /^remember\s+to\b/i.test(rawText) || /^reminder\s*:/i.test(rawText)) {
    type = 'reminder';
  } else if (/^(?:please\s+)?(?:add|create|make)\s+(?:a\s+)?(?:task|to-?do)\b/i.test(rawText) || /^(?:i\s+)?need\s+to\b/i.test(rawText) || /^(?:task|to-?do)\s*:/i.test(rawText)) {
    type = 'task';
  } else if (/^(?:please\s+)?(?:save|note)\b/i.test(rawText) || /^remember\s+that\b/i.test(rawText) || /^(?:idea|note)\s*:/i.test(rawText)) {
    type = 'note';
  } else {
    return null;
  }

  const extracted = extractProject(rawText);
  const title = cleanTitle(extracted.text, type);
  if (title.length < 2) return null;
  return {
    type,
    title,
    details: '',
    project: extracted.project,
    dueAt: schedulingInfo(rawText, now, type),
    status: 'open',
    source,
    rawText
  };
}

export function parseCoreQuery(text) {
  const value = String(text || '').trim();
  if (!value) return null;

  let match = value.match(/^mark\s+(.+?)\s+(?:complete|done)[.!?]*$/i)
    || value.match(/^(?:complete|finish|check\s+off)\s+(.+?)[.!?]*$/i);
  if (match) return { kind: 'mutation', action: 'complete', term: match[1].trim() };
  match = value.match(/^(?:reopen|restore)\s+(.+?)[.!?]*$/i);
  if (match) return { kind: 'mutation', action: 'reopen', term: match[1].trim() };
  match = value.match(/^(?:delete|remove)\s+(.+?)[.!?]*$/i);
  if (match) return { kind: 'mutation', action: 'delete', term: match[1].trim() };

  if (/\b(?:show|open|list|what(?:'s| is))\b.*\binbox\b/i.test(value)) {
    return { kind: 'query', view: 'inbox' };
  }
  if (/\b(?:what|show|list|tell)\b.*\b(?:need to do|due|tasks?|reminders?|schedule)\b.*\btoday\b/i.test(value)
      || /\b(?:today's|today)\s+(?:tasks?|reminders?|schedule)\b/i.test(value)) {
    return { kind: 'query', view: 'today' };
  }

  const about = value.match(/\b(?:what did i (?:save|say|note|mention)|find|search(?: for)?|show me)\b.*?\babout\s+(.+?)[.!?]*$/i);
  const project = CORE_PROJECTS.find((candidate) => new RegExp('\\b' + escapeRegExp(candidate) + '\\b', 'i').test(value)) || '';
  const type = /\breminders?\b/i.test(value) ? 'reminder'
    : /\btasks?|to-?dos?\b/i.test(value) ? 'task'
      : /\bnotes?|ideas?\b/i.test(value) ? 'note' : '';
  if (about || (project && /\b(?:show|find|what|list)\b/i.test(value))) {
    return {
      kind: 'query',
      view: 'search',
      term: about ? about[2].trim() : '',
      project,
      type
    };
  }
  return null;
}

export function isDueToday(item, now = new Date()) {
  if (!item.dueAt || item.status === 'done') return false;
  const due = new Date(item.dueAt);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return due <= end;
}

export function queryCoreItems(items, query, now = new Date()) {
  const source = Array.isArray(items) ? items : [];
  if (!query || query.view === 'inbox') return source.map(cloneItem);
  if (query.view === 'today') return source.filter((item) => isDueToday(item, now)).map(cloneItem);
  const term = String(query.term || '').toLowerCase();
  const tokens = term.split(/\s+/).filter((token) => token.length > 2);
  return source.filter((item) => {
    if (query.project && item.project.toLowerCase() !== query.project.toLowerCase()) return false;
    if (query.type && item.type !== query.type) return false;
    if (!tokens.length) return true;
    const haystack = [item.title, item.details, item.project, item.rawText].join(' ').toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  }).map(cloneItem);
}

export function findBestItem(items, term) {
  const words = String(term || '').toLowerCase().split(/\s+/)
    .filter((word) => word.length > 2 && !['the', 'that', 'this', 'task', 'note', 'reminder'].includes(word));
  let best = null;
  let bestScore = 0;
  for (const item of items || []) {
    const haystack = [item.title, item.details, item.project, item.rawText].join(' ').toLowerCase();
    const score = words.reduce((total, word) => total + (haystack.includes(word) ? 1 : 0), 0);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return bestScore ? cloneItem(best) : null;
}

export function formatDueAt(dueAt, { includeDate = true } = {}) {
  if (!dueAt) return '';
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return '';
  return due.toLocaleString('en-US', includeDate
    ? { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { hour: 'numeric', minute: '2-digit' });
}
