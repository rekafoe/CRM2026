import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppIcon } from '../../../components/ui/AppIcon';
import { useToastNotifications } from '../../../components/Toast';
import { useCurrentUser } from '../../../hooks/useCurrentUser';
import { knowledgeApi } from '../api';
import { EMPTY_KNOWLEDGE_CONTENT, sanitizeKnowledgeContentForApi } from '../content';
import { getAxiosErrorMessage } from '../../../utils/errorUtils';
import { knowledgeKeys, useKnowledgeArticle, useKnowledgeCategories } from '../hooks';
import {
  createKnowledgeExtensions,
  KnowledgeContent,
  primeKnowledgeAssetBlob,
} from '../components/KnowledgeContent';
import { KnowledgeShell } from '../components/KnowledgeShell';
import type { KnowledgeArticleInput, KnowledgeContent as KnowledgeContentValue } from '../types';
import { useQueryClient } from '@tanstack/react-query';

const ToolbarButton: React.FC<{
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, disabled, title, onClick, children }) => (
  <button className={active ? 'active' : ''} disabled={disabled} title={title} type="button" onClick={onClick}>{children}</button>
);

export const KnowledgeEditorPage: React.FC = () => {
  const params = useParams();
  const initialArticleId = Number(params.id) || 0;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToastNotifications();
  const currentUser = useCurrentUser();
  const articleQuery = useKnowledgeArticle(initialArticleId);
  const categories = useKnowledgeCategories();
  const [articleId, setArticleId] = useState(initialArticleId);
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tagsInput, setTagsInput] = useState('');
  const [proposalNote, setProposalNote] = useState('');
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const initializedRef = useRef(false);
  const createdArticleIdRef = useRef(initialArticleId);
  const draftCreationRef = useRef<Promise<number> | null>(null);
  const uploadPromiseRef = useRef<Promise<void> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceImagePositionRef = useRef<number | null>(null);
  const uploadFilesRef = useRef<(files: File[]) => void>(() => undefined);
  const extensions = useMemo(() => createKnowledgeExtensions(
    'Расскажите всё, что важно знать команде…',
    {
      editableControls: true,
      onReplaceImage: (position) => {
        replaceImagePositionRef.current = position;
        fileInputRef.current?.click();
      },
    },
  ), []);

  const editor = useEditor({
    extensions,
    content: EMPTY_KNOWLEDGE_CONTENT,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'kb-prose kb-prose--editable' },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        replaceImagePositionRef.current = null;
        uploadFilesRef.current(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        replaceImagePositionRef.current = null;
        uploadFilesRef.current(files);
        return true;
      },
    },
  });

  useEffect(() => {
    const article = articleQuery.data;
    if (!article || initializedRef.current || !editor) return;
    initializedRef.current = true;
    setTitle(article.title);
    setExcerpt(article.excerpt);
    setCategoryId(article.categoryId);
    setTagsInput(article.tags.join(', '));
    editor.commands.setContent(article.contentJson);
  }, [articleQuery.data, editor]);

  const article = articleQuery.data;
  const canEditDirectly = !article || Boolean(currentUser && (currentUser.role === 'admin' || article.authorUserId === currentUser.id));
  const parseTags = () => Array.from(new Set(tagsInput.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean)));
  const makeInput = (): KnowledgeArticleInput => ({
    title: title.trim() || 'Новая статья',
    excerpt: excerpt.trim(),
    categoryId,
    tags: parseTags(),
    contentJson: sanitizeKnowledgeContentForApi(editor?.getJSON() ?? EMPTY_KNOWLEDGE_CONTENT),
    contentPlain: editor?.getText({ blockSeparator: '\n\n' }) ?? '',
    status: article?.status ?? 'draft',
    baseRevisionId: article?.currentRevisionId ?? undefined,
  });

  const ensureArticleId = useCallback(async (): Promise<number> => {
    if (articleId || createdArticleIdRef.current) return articleId || createdArticleIdRef.current;
    if (!draftCreationRef.current) {
      draftCreationRef.current = (async () => {
        const created = await knowledgeApi.createArticle({ ...makeInput(), status: 'draft' });
        createdArticleIdRef.current = created.id;
        setArticleId(created.id);
        initializedRef.current = true;
        queryClient.setQueryData(knowledgeKeys.article(created.id), created);
        navigate(`/knowledge/articles/${created.id}/edit`, { replace: true });
        toast.info('Черновик создан', 'Теперь изображения можно безопасно прикреплять к статье.');
        return created.id;
      })();
    }
    try {
      return await draftCreationRef.current;
    } finally {
      draftCreationRef.current = null;
    }
  }, [articleId, categoryId, editor, excerpt, navigate, queryClient, tagsInput, title, toast]);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!editor || !files.length) return;
    const previousUpload = uploadPromiseRef.current;
    const uploadTask = (async () => {
      if (previousUpload) await previousUpload;
      setUploading(true);
      const id = await ensureArticleId();
      for (const [index, file] of files.entries()) {
        const asset = await knowledgeApi.uploadAsset(id, file);
        if (!asset.id) throw new Error('Сервер не вернул ID файла');
        primeKnowledgeAssetBlob(asset.id, file);
        const replacementPosition = replaceImagePositionRef.current;
        const replacementNode = replacementPosition == null ? null : editor.state.doc.nodeAt(replacementPosition);
        if (index === 0 && replacementPosition != null && replacementNode?.type.name === 'image') {
          editor.view.dispatch(editor.state.tr.setNodeMarkup(replacementPosition, undefined, {
            ...replacementNode.attrs,
            src: `kb-asset://${asset.id}`,
            alt: file.name,
          }));
          replaceImagePositionRef.current = null;
        } else {
          editor.chain().focus().setImage({
            src: `kb-asset://${asset.id}`,
            alt: file.name,
          }).run();
        }
      }
      toast.success(files.length > 1 ? 'Изображения добавлены' : 'Изображение добавлено');
    })();
    uploadPromiseRef.current = uploadTask;
    try {
      await uploadTask;
    } catch (error: any) {
      toast.error('Не удалось загрузить изображение', getAxiosErrorMessage(error, error?.message));
    } finally {
      if (uploadPromiseRef.current === uploadTask) {
        uploadPromiseRef.current = null;
        setUploading(false);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
      replaceImagePositionRef.current = null;
    }
  }, [editor, ensureArticleId, toast]);
  uploadFilesRef.current = (files) => void uploadFiles(files);

  const save = async (publish = false) => {
    if (!title.trim()) {
      toast.warning('Добавьте название статьи');
      return;
    }
    setSaving(true);
    try {
      if (uploadPromiseRef.current) await uploadPromiseRef.current;
      const input = makeInput();
      let savedId = articleId;
      if (!savedId) {
        savedId = await ensureArticleId();
      } else if (canEditDirectly) {
        await knowledgeApi.updateArticle(savedId, input);
      } else {
        await knowledgeApi.createProposal(savedId, { ...input, note: proposalNote.trim() || undefined });
        toast.success('Предложение отправлено', 'Автор статьи получит ваши изменения на проверку.');
        navigate(`/knowledge/articles/${savedId}`);
        return;
      }
      if (publish) await knowledgeApi.publishArticle(savedId);
      await queryClient.invalidateQueries({ queryKey: knowledgeKeys.all });
      toast.success(publish ? 'Статья опубликована' : 'Черновик сохранён');
      navigate(`/knowledge/articles/${savedId}`);
    } catch (error: any) {
      toast.error('Не удалось сохранить статью', getAxiosErrorMessage(error, error?.message));
    } finally {
      setSaving(false);
    }
  };

  if (initialArticleId && articleQuery.isLoading) return <KnowledgeShell><div className="kb-state"><span className="kb-spinner" /> Загружаем редактор…</div></KnowledgeShell>;
  if (initialArticleId && articleQuery.isError) return <KnowledgeShell><div className="kb-state kb-state--error"><h2>Статья не найдена</h2><button className="kb-button" onClick={() => navigate('/knowledge')}>В каталог</button></div></KnowledgeShell>;

  const setLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes('link').href as string | undefined;
    const href = window.prompt('Адрес ссылки', previous ?? 'https://');
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
  };

  return (
    <KnowledgeShell>
      <div className="kb-editor-page">
        <header className="kb-editor-header">
          <div>
            <button className="kb-link-button" onClick={() => navigate(articleId ? `/knowledge/articles/${articleId}` : '/knowledge')}>
              <AppIcon name="arrow-left" size="sm" /> Назад
            </button>
            <h1>{canEditDirectly ? (articleId ? 'Редактирование статьи' : 'Новая статья') : 'Предложить изменения'}</h1>
            <p>{canEditDirectly ? 'Изменения сохраняются как новая версия.' : 'Автор увидит исходную и предложенную версии рядом.'}</p>
          </div>
          <div className="kb-editor-actions">
            <button className="kb-button" type="button" onClick={() => setPreview(true)}><AppIcon name="search" size="sm" /> Предпросмотр</button>
            <button className="kb-button" type="button" disabled={saving} onClick={() => save(false)}><AppIcon name="save" size="sm" /> {canEditDirectly ? 'Сохранить' : 'Отправить правку'}</button>
            {canEditDirectly && (
              <button className="kb-button kb-button--primary" type="button" disabled={saving} onClick={() => save(true)}><AppIcon name="check" size="sm" /> Опубликовать</button>
            )}
          </div>
        </header>

        <div className="kb-editor-layout">
          <section className="kb-editor-card">
            <input className="kb-title-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Название статьи" maxLength={180} />
            <textarea className="kb-excerpt-input" value={excerpt} onChange={(event) => setExcerpt(event.target.value)} placeholder="Коротко опишите, что читатель узнает из статьи" rows={2} />

            <div className="kb-editor-toolbar" role="toolbar" aria-label="Форматирование текста">
              <select
                aria-label="Стиль текста"
                value={editor?.isActive('heading', { level: 1 }) ? 'h1' : editor?.isActive('heading', { level: 2 }) ? 'h2' : editor?.isActive('heading', { level: 3 }) ? 'h3' : 'p'}
                onChange={(event) => {
                  if (!editor) return;
                  if (event.target.value === 'p') editor.chain().focus().setParagraph().run();
                  else editor.chain().focus().toggleHeading({ level: Number(event.target.value.slice(1)) as 1 | 2 | 3 }).run();
                }}
              >
                <option value="p">Обычный текст</option><option value="h1">Заголовок 1</option><option value="h2">Заголовок 2</option><option value="h3">Заголовок 3</option>
              </select>
              <span className="kb-toolbar-group">
                <ToolbarButton title="Жирный" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}><strong>B</strong></ToolbarButton>
                <ToolbarButton title="Курсив" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></ToolbarButton>
                <ToolbarButton title="Подчёркнутый" active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()}><u>U</u></ToolbarButton>
                <ToolbarButton title="Выделение" active={editor?.isActive('highlight')} onClick={() => editor?.chain().focus().toggleHighlight().run()}>◩</ToolbarButton>
              </span>
              <span className="kb-toolbar-group">
                <ToolbarButton title="Маркированный список" active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}>• Список</ToolbarButton>
                <ToolbarButton title="Нумерованный список" active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>1. Список</ToolbarButton>
                <ToolbarButton title="Список задач" active={editor?.isActive('taskList')} onClick={() => editor?.chain().focus().toggleTaskList().run()}>☑</ToolbarButton>
                <ToolbarButton title="Цитата" active={editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>❝</ToolbarButton>
              </span>
              <span className="kb-toolbar-group">
                <ToolbarButton title="Ссылка" active={editor?.isActive('link')} onClick={setLink}><AppIcon name="link" size="xs" /></ToolbarButton>
                <ToolbarButton title="По левому краю" active={editor?.isActive({ textAlign: 'left' })} onClick={() => editor?.chain().focus().setTextAlign('left').run()}>≡</ToolbarButton>
                <ToolbarButton title="По центру" active={editor?.isActive({ textAlign: 'center' })} onClick={() => editor?.chain().focus().setTextAlign('center').run()}>≡</ToolbarButton>
                <ToolbarButton title="Таблица" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦</ToolbarButton>
                <ToolbarButton title="Изображение" disabled={uploading} onClick={() => {
                  replaceImagePositionRef.current = null;
                  fileInputRef.current?.click();
                }}><AppIcon name="image" size="xs" /></ToolbarButton>
              </span>
              <span className="kb-toolbar-group">
                <ToolbarButton title="Отменить" onClick={() => editor?.chain().focus().undo().run()}>↶</ToolbarButton>
                <ToolbarButton title="Повторить" onClick={() => editor?.chain().focus().redo().run()}>↷</ToolbarButton>
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (!files.length) replaceImagePositionRef.current = null;
                  else void uploadFiles(files);
                }}
              />
            </div>
            {uploading && <div className="kb-uploading"><span className="kb-spinner" /> Загружаем изображение…</div>}
            <EditorContent editor={editor} className="kb-editor-content" />
          </section>

          <aside className="kb-editor-sidebar">
            <div className="kb-settings-card">
              <h2>Параметры</h2>
              <label>Категория
                <select value={categoryId ?? ''} onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : null)}>
                  <option value="">Без категории</option>
                  {categories.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label>Теги
                <input value={tagsInput} onChange={(event) => setTagsInput(event.target.value)} placeholder="печать, касса, доставка" />
                <small>Разделяйте теги запятыми</small>
              </label>
              {!canEditDirectly && (
                <label>Комментарий автору
                  <textarea rows={4} value={proposalNote} onChange={(event) => setProposalNote(event.target.value)} placeholder="Почему это изменение полезно?" />
                </label>
              )}
            </div>
            <div className="kb-editor-tip">
              <AppIcon name="info" size="sm" />
              <div><strong>Быстрая вставка</strong><p>Перетащите изображение в текст или вставьте его из буфера обмена.</p></div>
            </div>
          </aside>
        </div>
      </div>

      {preview && (
        <div className="kb-modal-backdrop" onMouseDown={() => setPreview(false)}>
          <div className="kb-preview-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span className="kb-eyebrow">Предпросмотр</span><h1>{title || 'Без названия'}</h1></div><button className="kb-icon-button" onClick={() => setPreview(false)}><AppIcon name="x" size="sm" /></button></header>
            {excerpt && <p className="kb-article-lead">{excerpt}</p>}
            <KnowledgeContent content={(editor?.getJSON() ?? EMPTY_KNOWLEDGE_CONTENT) as KnowledgeContentValue} />
          </div>
        </div>
      )}
    </KnowledgeShell>
  );
};

export default KnowledgeEditorPage;
