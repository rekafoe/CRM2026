import type { JSONContent } from '@tiptap/react';
import type { KnowledgeContent } from './types';

export const EMPTY_KNOWLEDGE_CONTENT: KnowledgeContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

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
