import React, { useEffect, useMemo } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
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

const assetBlobCache = new Map<number, Blob>();
const MAX_CACHED_ASSETS = 20;

export function primeKnowledgeAssetBlob(assetId: number, blob: Blob): void {
  if (!Number.isInteger(assetId) || assetId <= 0 || !blob.type.startsWith('image/')) return;
  assetBlobCache.delete(assetId);
  assetBlobCache.set(assetId, blob);
  while (assetBlobCache.size > MAX_CACHED_ASSETS) {
    const oldestId = assetBlobCache.keys().next().value;
    if (typeof oldestId !== 'number') break;
    assetBlobCache.delete(oldestId);
  }
}

export function assetIdFromSrc(src: unknown): number | null {
  if (typeof src !== 'string') return null;
  const normalized = src.trim();
  const match = /^kb-asset:(?:\/\/)?\/?(\d+)\/?$/i.exec(normalized)
    ?? /\/knowledge\/assets\/(\d+)\/content(?:[?#].*)?$/i.exec(normalized);
  return match ? Number(match[1]) : null;
}

interface KnowledgeImageOptions {
  editableControls?: boolean;
  onReplaceImage?: (position: number) => void;
}

function createAuthenticatedImage(options: KnowledgeImageOptions = {}) {
  return Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      alignment: { default: 'center' },
      width: { default: 100 },
      wrap: { default: 'none' },
      caption: { default: '' },
    };
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.className = 'kb-image-node';
      dom.contentEditable = 'false';
      const media = document.createElement('div');
      media.className = 'kb-image-media';
      const caption = document.createElement('div');
      caption.className = 'kb-image-caption';
      const controls = document.createElement('div');
      controls.className = 'kb-image-controls';
      const resizeHandle = document.createElement('button');
      resizeHandle.type = 'button';
      resizeHandle.className = 'kb-image-resize-handle';
      resizeHandle.title = 'Потяните, чтобы изменить размер';
      resizeHandle.setAttribute('aria-label', 'Изменить размер изображения');
      dom.append(media, caption);
      if (options.editableControls) dom.append(controls, resizeHandle);

      let active = true;
      let generation = 0;
      let objectUrl = '';
      let lastSignature = '';
      let currentNode = node;

      const revokeObjectUrl = () => {
        if (!objectUrl) return;
        URL.revokeObjectURL(objectUrl);
        objectUrl = '';
      };

      const showStatus = (text: string, failed = false) => {
        const status = document.createElement('span');
        status.className = failed ? 'kb-image-error' : 'kb-image-loading';
        status.textContent = text;
        media.replaceChildren(status);
      };

      const showImage = (src: string, alt: string, title: string) => {
        const image = document.createElement('img');
        image.src = src;
        image.alt = alt;
        image.title = title;
        image.draggable = true;
        image.addEventListener('error', () => showStatus('Изображение недоступно', true), { once: true });
        media.replaceChildren(image);
      };

      const nodePosition = (): number | null => {
        const position = typeof getPos === 'function' ? getPos() : undefined;
        return typeof position === 'number' ? position : null;
      };

      const updateAttributes = (patch: Record<string, unknown>) => {
        const position = nodePosition();
        if (position == null) return;
        const actualNode = editor.state.doc.nodeAt(position);
        if (!actualNode) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, {
          ...actualNode.attrs,
          ...patch,
        }));
      };

      const createControl = (
        text: string,
        title: string,
        patch: Record<string, unknown> | (() => void),
        activeWhen?: () => boolean,
      ) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        button.title = title;
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (typeof patch === 'function') patch();
          else updateAttributes(patch);
          editor.commands.focus();
        });
        controls.append(button);
        return { button, activeWhen };
      };

      const controlEntries = options.editableControls ? [
        createControl('←', 'По левому краю', { alignment: 'left', wrap: 'none' }, () => currentNode.attrs.wrap === 'none' && currentNode.attrs.alignment === 'left'),
        createControl('↔', 'По центру', { alignment: 'center', wrap: 'none' }, () => currentNode.attrs.wrap === 'none' && currentNode.attrs.alignment === 'center'),
        createControl('→', 'По правому краю', { alignment: 'right', wrap: 'none' }, () => currentNode.attrs.wrap === 'none' && currentNode.attrs.alignment === 'right'),
        createControl('▧L', 'Изображение слева, текст справа', { wrap: 'left', width: 50 }, () => currentNode.attrs.wrap === 'left'),
        createControl('R▧', 'Изображение справа, текст слева', { wrap: 'right', width: 50 }, () => currentNode.attrs.wrap === 'right'),
        ...[25, 50, 75, 100].map((width) =>
          createControl(`${width}%`, `Ширина ${width}%`, { width }, () => Number(currentNode.attrs.width) === width)),
      ] : [];

      let captionInput: HTMLInputElement | null = null;
      if (options.editableControls) {
        captionInput = document.createElement('input');
        captionInput.type = 'text';
        captionInput.className = 'kb-image-caption-input';
        captionInput.placeholder = 'Подпись к изображению';
        captionInput.maxLength = 500;
        captionInput.addEventListener('click', (event) => event.stopPropagation());
        captionInput.addEventListener('change', () => updateAttributes({ caption: captionInput?.value.trim() ?? '' }));
        controls.append(captionInput);
        createControl('Заменить', 'Заменить изображение', () => {
          const position = nodePosition();
          if (position != null) options.onReplaceImage?.(position);
        });
        createControl('Удалить', 'Удалить изображение', () => {
          const position = nodePosition();
          if (position == null) return;
          editor.view.dispatch(editor.state.tr.delete(position, position + currentNode.nodeSize));
        });
      }

      const applyLayout = () => {
        const width = Math.min(100, Math.max(20, Number(currentNode.attrs.width) || 100));
        const alignment = ['left', 'center', 'right'].includes(currentNode.attrs.alignment)
          ? currentNode.attrs.alignment
          : 'center';
        const wrap = ['none', 'left', 'right'].includes(currentNode.attrs.wrap)
          ? currentNode.attrs.wrap
          : 'none';
        dom.style.width = `${width}%`;
        dom.dataset.alignment = alignment;
        dom.dataset.wrap = wrap;
        const captionText = String(currentNode.attrs.caption ?? '').trim();
        caption.textContent = captionText;
        caption.hidden = !captionText;
        if (captionInput && captionInput !== document.activeElement) captionInput.value = captionText;
        controlEntries.forEach(({ button, activeWhen }) => button.classList.toggle('active', Boolean(activeWhen?.())));
      };

      const render = (updatedNode: typeof node) => {
        currentNode = updatedNode;
        applyLayout();
        const canonicalSrc = String(updatedNode.attrs.src ?? '').trim();
        const alt = String(updatedNode.attrs.alt ?? '');
        const title = String(updatedNode.attrs.title ?? '');
        const signature = JSON.stringify([canonicalSrc, alt, title]);
        if (signature === lastSignature) return;
        lastSignature = signature;
        const currentGeneration = ++generation;
        revokeObjectUrl();
        const assetId = assetIdFromSrc(canonicalSrc);
        if (!assetId) {
          showImage(canonicalSrc, alt, title);
          return;
        }

        showStatus('Загрузка изображения…');
        const cachedBlob = assetBlobCache.get(assetId);
        const blobPromise = cachedBlob
          ? Promise.resolve(cachedBlob)
          : knowledgeApi.getAssetContent(assetId).then((blob) => {
            primeKnowledgeAssetBlob(assetId, blob);
            return blob;
          });
        blobPromise
          .then((blob) => {
            if (!active || currentGeneration !== generation) return;
            if (!blob.type.startsWith('image/')) throw new Error('Некорректный тип изображения');
            objectUrl = URL.createObjectURL(blob);
            showImage(objectUrl, alt, title);
          })
          .catch(() => {
            if (active && currentGeneration === generation) {
              showStatus('Изображение недоступно', true);
            }
          });
      };

      if (options.editableControls) {
        resizeHandle.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const parentWidth = dom.parentElement?.clientWidth || dom.getBoundingClientRect().width;
          const startX = event.clientX;
          const startWidth = dom.getBoundingClientRect().width;
          const onMove = (moveEvent: PointerEvent) => {
            const width = Math.min(100, Math.max(20, ((startWidth + moveEvent.clientX - startX) / parentWidth) * 100));
            dom.style.width = `${width}%`;
          };
          const onUp = (upEvent: PointerEvent) => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            const width = Math.round(Math.min(100, Math.max(20, ((startWidth + upEvent.clientX - startX) / parentWidth) * 100)));
            updateAttributes({ width });
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp, { once: true });
        });
      }

      render(node);
      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type !== node.type) return false;
          render(updatedNode);
          return true;
        },
        selectNode() {
          dom.classList.add('is-selected');
        },
        deselectNode() {
          dom.classList.remove('is-selected');
        },
        destroy() {
          active = false;
          generation += 1;
          revokeObjectUrl();
        },
        stopEvent(event) {
          return controls.contains(event.target as Node) || resizeHandle.contains(event.target as Node);
        },
        ignoreMutation() {
          return true;
        },
      };
    };
  },
  });
}

export function createKnowledgeExtensions(placeholder?: string, imageOptions: KnowledgeImageOptions = {}) {
  return [
    StarterKit.configure({ link: false, underline: false }),
    createAuthenticatedImage(imageOptions).configure({ allowBase64: false }),
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
