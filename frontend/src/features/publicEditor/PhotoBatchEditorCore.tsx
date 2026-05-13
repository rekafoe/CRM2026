import React from 'react';
import { Button } from '../../components/common';
import { AppIcon } from '../../components/ui/AppIcon';
import type { PhotoBatchDraftItem, PhotoBatchFitMode, PhotoBatchGroup, PhotoBatchSizeOption } from './photoBatchTypes';

type PhotoBatchEditorCoreProps = {
  items: PhotoBatchDraftItem[];
  groups: PhotoBatchGroup[];
  sizeOptions: PhotoBatchSizeOption[];
  defaultSizeId: string;
  totalQuantity: number;
  saving?: boolean;
  footerText?: string;
  saveLabel?: string;
  onDefaultSizeChange: (sizeId: string) => void;
  onApplySizeToAll: () => void;
  onAddPhotoClick: () => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onUpdateItem: (id: string, patch: Partial<PhotoBatchDraftItem>) => void;
  onRemoveItem: (id: string) => void;
  onSave: () => void;
};

export const PhotoBatchEditorCore: React.FC<PhotoBatchEditorCoreProps> = ({
  items,
  groups,
  sizeOptions,
  defaultSizeId,
  totalQuantity,
  saving = false,
  footerText = 'Сохранение запишет пачку фото для дальнейшей печати.',
  saveLabel = 'Сохранить пачку',
  onDefaultSizeChange,
  onApplySizeToAll,
  onAddPhotoClick,
  onDrop,
  onUpdateItem,
  onRemoveItem,
  onSave,
}) => (
  <>
    <section className="photo-batch__toolbar">
      <div>
        <h2>Пачка фото</h2>
        <p>Загрузите любое количество фото, задайте формат и количество для каждого файла.</p>
      </div>
      <div className="photo-batch__actions">
        <select
          className="photo-batch__select"
          value={defaultSizeId}
          onChange={(event) => onDefaultSizeChange(event.target.value)}
        >
          {sizeOptions.map((size) => (
            <option key={size.id} value={size.id}>{size.label}</option>
          ))}
        </select>
        <Button type="button" variant="secondary" onClick={onApplySizeToAll} disabled={items.length === 0}>
          Применить ко всем
        </Button>
        <Button type="button" variant="primary" onClick={onAddPhotoClick}>
          <AppIcon name="plus" size="xs" /> Добавить фото
        </Button>
      </div>
    </section>

    <section className="photo-batch__summary">
      <div><strong>{items.length}</strong><span>файлов</span></div>
      <div><strong>{totalQuantity}</strong><span>отпечатков</span></div>
      {groups.map((group) => (
        <div key={group.groupSizeId}>
          <strong>{group.quantity}</strong><span>{group.groupLabel}</span>
        </div>
      ))}
    </section>

    <section
      className="photo-batch__dropzone"
      onDrop={onDrop}
      onDragOver={(event) => event.preventDefault()}
    >
      <AppIcon name="camera" size="lg" />
      <span>Перетащите фото сюда или нажмите “Добавить фото”</span>
    </section>

    <section className="photo-batch__fit-help" aria-label="Подсказка по вписыванию фото">
      <div>
        <strong>С обрезкой</strong>
        <span>Фото заполняет весь формат, края могут уйти под trim/bleed.</span>
      </div>
      <div>
        <strong>Целиком с полями</strong>
        <span>Фото сохраняется полностью, вокруг могут появиться поля.</span>
      </div>
      <div>
        <strong>Safe-zone</strong>
        <span>Важные лица и текст держите ближе к центру, не у линии реза.</span>
      </div>
    </section>

    <section className="photo-batch__grid" aria-label="Фото в пачке">
      {items.map((item) => (
        <article key={item.id} className="photo-batch-card">
          <div className={`photo-batch-card__preview photo-batch-card__preview--${item.fitMode}`}>
            <img src={item.previewUrl} alt={item.originalName} className="photo-batch-card__image" draggable={false} />
          </div>
          <div className="photo-batch-card__body">
            <strong title={item.originalName}>{item.originalName}</strong>
            <label>
              Размер
              <select value={item.sizeId} onChange={(event) => onUpdateItem(item.id, { sizeId: event.target.value })}>
                {sizeOptions.map((size) => (
                  <option key={size.id} value={size.id}>{size.label}</option>
                ))}
              </select>
            </label>
            <label>
              Кол-во
              <input
                type="number"
                min={1}
                step={1}
                value={item.quantity}
                onChange={(event) => onUpdateItem(item.id, { quantity: Math.max(1, Number(event.target.value) || 1) })}
              />
            </label>
            <label>
              Вписывание
              <select
                value={item.fitMode}
                onChange={(event) => onUpdateItem(item.id, { fitMode: event.target.value as PhotoBatchFitMode })}
              >
                <option value="cover">С обрезкой</option>
                <option value="contain">Целиком с полями</option>
              </select>
            </label>
            <div className="photo-batch-card__row">
              <Button type="button" variant="secondary" onClick={() => onUpdateItem(item.id, { rotation: (item.rotation + 90) % 360 })}>
                Повернуть {item.rotation}°
              </Button>
              <button type="button" className="photo-batch-card__delete" onClick={() => onRemoveItem(item.id)}>
                <AppIcon name="trash" size="xs" /> Удалить
              </button>
            </div>
          </div>
        </article>
      ))}
    </section>

    <footer className="photo-batch__footer">
      <span>{footerText}</span>
      <Button type="button" variant="primary" onClick={onSave} disabled={saving || items.length === 0}>
        {saving ? 'Сохраняем...' : saveLabel}
      </Button>
    </footer>
  </>
);
