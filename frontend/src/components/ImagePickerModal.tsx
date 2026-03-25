import React, { useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AppIcon } from './ui/AppIcon';
import { filterLikelyImageFiles } from '../utils/imageFile';
import '../styles/utilities.css';
import './ImagePickerModal.css';

const IMAGE_PICKER_MAX_SELECT = 500;

export interface ImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (files: File[]) => void;
  /** Файлы, переданные при открытии (например, с drop) — сразу попадают в выбранные */
  initialFiles?: File[];
}

const TABS = [
  { id: 'my-files', label: 'Мои файлы' },
  { id: 'photobank', label: 'Фотобанк' },
  { id: 'vk', label: 'ВКонтакте' },
  { id: 'yandex', label: 'Яндекс.Диск' },
] as const;

export const ImagePickerModal: React.FC<ImagePickerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  initialFiles = [],
}) => {
  const [activeTab, setActiveTab] = useState<'my-files' | 'photobank' | 'vk' | 'yandex'>('my-files');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Актуальный список для слияния при выборе с диска (до следующего рендера) */
  const selectedFilesRef = useRef<File[]>([]);
  selectedFilesRef.current = selectedFiles;

  /**
   * После выбора в системном диалоге сразу передаём файлы в редактор и закрываем модалку.
   * Иначе пользователь жмёт «Открыть» и не понимает, что нужна ещё кнопка «Выбрать» внизу.
   */
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = '';
      if (files.length === 0) return;
      const images = filterLikelyImageFiles(files, { trustOsPicker: true });
      if (images.length === 0) return;
      const merged = [...selectedFilesRef.current, ...images].slice(-IMAGE_PICKER_MAX_SELECT);
      onSelect(merged);
      setSelectedFiles([]);
      // После onSelect дать родителю применить setState, затем закрыть модалку
      queueMicrotask(() => {
        onClose();
      });
    },
    [onSelect, onClose],
  );

  const handleUploadFromComputer = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleUploadFromPhone = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleConfirm = useCallback(() => {
    onSelect(selectedFiles);
    setSelectedFiles([]);
    queueMicrotask(() => {
      onClose();
    });
  }, [onSelect, onClose, selectedFiles]);

  const handleClose = useCallback(() => {
    setSelectedFiles([]);
    setActiveTab('my-files');
    onClose();
  }, [onClose]);

  const wasOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setSelectedFiles([...initialFiles]);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, initialFiles]);

  React.useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', onEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleClose]);

  const remaining = IMAGE_PICKER_MAX_SELECT - selectedFiles.length;

  const overlay = isOpen ? (
    <div className="image-picker-overlay" onClick={handleClose}>
          <div className="image-picker-modal" onClick={(e) => e.stopPropagation()}>
        <header className="image-picker-header">
          <ul className="image-picker-tabs" role="tablist">
            {TABS.map((tab) => (
              <li key={tab.id}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`image-picker-tab ${activeTab === tab.id ? 'image-picker-tab--active' : ''}`}
                  onClick={() => tab.id === 'my-files' && setActiveTab(tab.id)}
                  disabled={tab.id !== 'my-files'}
                >
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="image-picker-close" onClick={handleClose} aria-label="Закрыть">
            <AppIcon name="x" size="sm" />
          </button>
        </header>

        <div className="image-picker-body">
          <aside className="image-picker-sidebar">
            <section className="image-picker-sidebar-section">
              <h3 className="image-picker-sidebar-title">Дата загрузки файлов</h3>
              <ul className="image-picker-sidebar-list">
                <li>
                  <span className="image-picker-sidebar-item">Все мои файлы (срок хранения фотографий до 1 месяца)</span>
                  <span className="image-picker-sidebar-count">0</span>
                </li>
                <li>
                  <span className="image-picker-sidebar-item">Новые загрузки</span>
                  <span className="image-picker-sidebar-count">0</span>
                </li>
                <li>
                  <span className="image-picker-sidebar-item">Загруженные сегодня</span>
                  <span className="image-picker-sidebar-count">0</span>
                </li>
                <li>
                  <span className="image-picker-sidebar-item">Без альбома</span>
                  <span className="image-picker-sidebar-count">0</span>
                </li>
              </ul>
            </section>
            <section className="image-picker-sidebar-section">
              <h3 className="image-picker-sidebar-title">
                Мои альбомы
                <button type="button" className="image-picker-sidebar-add" aria-label="Добавить альбом">
                  <AppIcon name="plus" size="xs" />
                </button>
              </h3>
              <p className="image-picker-sidebar-empty">Вы еще не создали ни одного альбома</p>
            </section>
          </aside>

          <main className="image-picker-main">
            <div className="image-picker-toolbar">
              <div className="image-picker-search-wrap">
                <AppIcon name="search" size="sm" className="image-picker-search-icon" />
                <input type="search" className="image-picker-search" placeholder="Поиск изображений" aria-label="Поиск изображений" />
              </div>
              <button type="button" className="image-picker-btn image-picker-btn--secondary" disabled>
                Переместить файлы в альбом
              </button>
              <div className="image-picker-toolbar-right">
                <label className="image-picker-checkbox">
                  <input type="checkbox" /> Группировка
                </label>
                <button type="button" className="image-picker-icon-btn" aria-label="Ещё">⋯</button>
                <button type="button" className="image-picker-icon-btn" aria-label="Сортировка">↓↑</button>
                <label className="image-picker-checkbox">
                  <input type="checkbox" /> Выделить все файлы
                </label>
              </div>
            </div>

            <div className="image-picker-content">
              {selectedFiles.length === 0 ? (
                <div className="image-picker-upload-zone">
                  <button type="button" className="image-picker-upload-option" onClick={handleUploadFromComputer}>
                    <span className="image-picker-upload-icon image-picker-upload-icon--computer" aria-hidden />
                    <span>Загрузить с компьютера</span>
                  </button>
                  <button type="button" className="image-picker-upload-option" onClick={handleUploadFromPhone}>
                    <span className="image-picker-upload-icon image-picker-upload-icon--phone" aria-hidden />
                    <span>Загрузить с телефона</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="image-picker-upload-zone image-picker-upload-zone--inline">
                    <button type="button" className="image-picker-upload-option image-picker-upload-option--small" onClick={handleUploadFromComputer}>
                      Загрузить с компьютера
                    </button>
                    <button type="button" className="image-picker-upload-option image-picker-upload-option--small" onClick={handleUploadFromPhone}>
                      Загрузить с телефона
                    </button>
                  </div>
                  <ul className="image-picker-selected-list">
                    {selectedFiles.map((file, i) => (
                      <li key={`${file.name}-${i}`} className="image-picker-selected-item">
                        <span className="image-picker-selected-name" title={file.name}>{file.name}</span>
                        <button type="button" className="image-picker-selected-remove" onClick={() => handleRemoveFile(i)} aria-label="Удалить">
                          <AppIcon name="x" size="xs" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </main>
        </div>

        <footer className="image-picker-footer">
          <div className="image-picker-footer-left">
            <button type="button" className="image-picker-icon-btn" aria-label="Удалить выбранные" disabled={selectedFiles.length === 0}>
              <AppIcon name="trash" size="sm" />
            </button>
            <button type="button" className="image-picker-btn image-picker-btn--primary" onClick={handleUploadFromComputer}>
              <AppIcon name="download" size="sm" /> Загрузить файлы
            </button>
          </div>
          <div className="image-picker-footer-right">
            <span className="image-picker-remaining">Можно выбрать еще: {remaining} файлов</span>
            <button type="button" className="image-picker-btn image-picker-btn--primary" onClick={handleConfirm}>
              Выбрать
            </button>
          </div>
        </footer>
      </div>
    </div>
  ) : null;

  return (
    <>
      {createPortal(
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
          aria-hidden
          tabIndex={-1}
        />,
        document.body,
      )}
      {overlay != null && createPortal(overlay, document.body)}
    </>
  );
};
