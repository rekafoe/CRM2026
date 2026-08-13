import React, { useEffect, useMemo, useState } from 'react';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { knowledgeApi } from '../api';
import { getTableOfContents } from '../content';
import type { KnowledgeContent as KnowledgeContentValue } from '../types';

export function assetIdFromSrc(src: unknown): number | null {
  if (typeof src !== 'string') return null;
  const match = /^kb-asset:\/\/(\d+)$/.exec(src);
  return match ? Number(match[1]) : null;
}

const AuthenticatedImageView: React.FC<NodeViewProps> = ({ node, selected }) => {
  const canonicalSrc = String(node.attrs.src ?? '');
  const assetId = assetIdFromSrc(canonicalSrc);
  const [resolvedSrc, setResolvedSrc] = useState(assetId ? '' : canonicalSrc);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!assetId) {
      setResolvedSrc(canonicalSrc);
      return;
    }
    let objectUrl = '';
    let active = true;
    setFailed(false);
    knowledgeApi.getAssetContent(assetId)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setResolvedSrc(objectUrl);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, canonicalSrc]);

  return (
    <NodeViewWrapper className={`kb-image-node${selected ? ' is-selected' : ''}`}>
      {failed ? (
        <span className="kb-image-error">Изображение недоступно</span>
      ) : resolvedSrc ? (
        <img src={resolvedSrc} alt={String(node.attrs.alt ?? '')} title={String(node.attrs.title ?? '')} />
      ) : (
        <span className="kb-image-loading">Загрузка изображения…</span>
      )}
    </NodeViewWrapper>
  );
};

export const AuthenticatedImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AuthenticatedImageView);
  },
});

export function createKnowledgeExtensions(placeholder?: string) {
  return [
    StarterKit.configure({ link: false, underline: false }),
    AuthenticatedImage.configure({ allowBase64: false }),
    Link.configure({ openOnClick: true, autolink: true, defaultProtocol: 'https' }),
    Underline,
    Highlight,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: placeholder ?? 'Начните писать статью…' }),
  ];
}

interface KnowledgeContentProps {
  content: KnowledgeContentValue;
  className?: string;
  onReady?: () => void;
}

export const KnowledgeContent: React.FC<KnowledgeContentProps> = ({ content, className = '', onReady }) => {
  const extensions = useMemo(() => createKnowledgeExtensions(), []);
  const toc = useMemo(() => getTableOfContents(content), [content]);
  const editor = useEditor({
    extensions,
    content,
    editable: false,
    editorProps: { attributes: { class: 'kb-prose' } },
  });

  useEffect(() => {
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  useEffect(() => {
    if (!editor) return;
    const frame = requestAnimationFrame(() => {
      const root = editor.view.dom;
      root.querySelectorAll('h1, h2, h3, h4').forEach((heading, index) => {
        heading.id = toc[index]?.id ?? `section-${index + 1}`;
      });
      const targetId = decodeURIComponent(window.location.hash.slice(1));
      if (targetId) document.getElementById(targetId)?.scrollIntoView({ block: 'center' });
      onReady?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, onReady, toc]);

  if (!editor) return <div className="kb-state">Подготавливаем статью…</div>;
  return <EditorContent editor={editor} className={`kb-content ${className}`} />;
};
