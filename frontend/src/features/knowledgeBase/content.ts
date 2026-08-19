import type { JSONContent } from '@tiptap/react';
import type { KnowledgeContent } from './types';

export const EMPTY_KNOWLEDGE_CONTENT: KnowledgeContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const allowedAttrsByNode: Record<string, Set<string>> = {
  paragraph: new Set(['textAlign']),
  heading: new Set(['level', 'textAlign']),
  image: new Set(['src', 'alt', 'title', 'alignment', 'width', 'wrap', 'caption']),
  orderedList: new Set(['start', 'type']),
  taskItem: new Set(['checked']),
  codeBlock: new Set(['language']),
  tableHeader: new Set(['colspan', 'rowspan', 'colwidth', 'align']),
  tableCell: new Set(['colspan', 'rowspan', 'colwidth', 'align']),
};

const allowedLinkAttrs = new Set(['href', 'target', 'rel', 'class', 'title']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAbsent(value: unknown): boolean {
  return value == null || value === '';
}

function sanitizeAttrs(type: string, attrs: unknown): Record<string, unknown> | undefined {
  if (!isRecord(attrs)) return undefined;
  const allowed = allowedAttrsByNode[type];
  if (!allowed) return undefined;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (isAbsent(value) || !allowed.has(key)) continue;
    next[key] = value;
  }
  return Object.keys(next).length ? next : undefined;
}

function sanitizeMarks(marks: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(marks) || !marks.length) return undefined;
  return marks.map((mark) => {
    if (!isRecord(mark) || typeof mark.type !== 'string') return isRecord(mark) ? mark : {};
    const next: Record<string, unknown> = { type: mark.type };
    if (!isRecord(mark.attrs)) return next;
    const allowed = mark.type === 'link' ? allowedLinkAttrs : null;
    const attrs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(mark.attrs)) {
      if (isAbsent(value)) continue;
      if (allowed && !allowed.has(key)) continue;
      attrs[key] = value;
    }
    if (Object.keys(attrs).length) next.attrs = attrs;
    return next;
  });
}

function sanitizeNode(node: unknown): unknown {
  if (!isRecord(node) || typeof node.type !== 'string') return node;
  const next: Record<string, unknown> = { type: node.type };
  if (typeof node.text === 'string') next.text = node.text;
  const attrs = sanitizeAttrs(node.type, node.attrs);
  if (attrs) next.attrs = attrs;
  const marks = sanitizeMarks(node.marks);
  if (marks?.length) next.marks = marks as JSONContent['marks'];
  if (Array.isArray(node.content)) next.content = node.content.map(sanitizeNode);
  return next;
}

/** Убирает null/unknown attrs TipTap 3, из‑за которых API базы знаний отвечает 400. */
export function sanitizeKnowledgeContentForApi(value: unknown): KnowledgeContent {
  if (!isRecord(value)) return EMPTY_KNOWLEDGE_CONTENT;
  return sanitizeNode(value) as KnowledgeContent;
}

export function parseKnowledgeContent(value: unknown): KnowledgeContent {
  if (value && typeof value === 'object') return value as KnowledgeContent;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') return parsed as KnowledgeContent;
    } catch {
      return {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
      };
    }
  }
  return EMPTY_KNOWLEDGE_CONTENT;
}

export function plainTextFromContent(content: KnowledgeContent): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const item = node as { text?: unknown; content?: unknown };
    if (typeof item.text === 'string') parts.push(item.text);
    if (Array.isArray(item.content)) {
      item.content.forEach(walk);
      parts.push('\n');
    }
  };
  walk(content);
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function slugifyHeading(value: string, index: number): string {
  const slug = value
    .toLocaleLowerCase('ru')
    .trim()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-|-$/g, '');
  return `section-${slug || index + 1}-${index + 1}`;
}

export function getTableOfContents(content: KnowledgeContent): TocItem[] {
  const result: TocItem[] = [];
  const textOf = (node: JSONContent): string =>
    (node.content ?? []).map((child) => child.text ?? textOf(child)).join('');
  const walk = (node: JSONContent) => {
    if (node.type === 'heading') {
      const text = textOf(node).trim();
      if (text) result.push({ id: slugifyHeading(text, result.length), text, level: Number(node.attrs?.level) || 2 });
    }
    node.content?.forEach(walk);
  };
  walk(content as JSONContent);
  return result;
}
