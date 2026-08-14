import React, { useRef } from 'react';
import type { SouvenirSelectedObject } from './types';

type Props = {
  selected: SouvenirSelectedObject | null;
  anchor: { x: number; y: number } | null;
  onTextChange: (patch: { text?: string; fill?: string; fontSize?: number }) => void;
  onOpacityChange: (opacity: number) => void;
  onScale: (factor: number) => void;
  onRotate: (deltaDegrees: number) => void;
  onReplacePhoto: (file: File) => void;
  onCrop: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onDelete: () => void;
};

function GestureButton({
  className,
  title,
  label,
  onDelta,
}: {
  className: string;
  title: string;
  label: string;
  onDelta: (dx: number, dy: number) => void;
}) {
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  return (
    <button
      type="button"
      className={className}
      title={title}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        lastRef.current = { x: event.clientX, y: event.clientY };
        const onMove = (moveEvent: PointerEvent) => {
          const last = lastRef.current;
          if (!last) return;
          onDelta(moveEvent.clientX - last.x, moveEvent.clientY - last.y);
          lastRef.current = { x: moveEvent.clientX, y: moveEvent.clientY };
        };
        const onUp = () => {
          lastRef.current = null;
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
      }}
    >
      {label}
    </button>
  );
}

export const SouvenirObjectToolbar: React.FC<Props> = ({
  selected,
  anchor,
  onTextChange,
  onOpacityChange,
  onScale,
  onRotate,
  onReplacePhoto,
  onCrop,
  onBringForward,
  onSendBackward,
  onDelete,
}) => {
  const replaceRef = useRef<HTMLInputElement>(null);
  if (!selected || !anchor) return null;
  const left = Math.min(window.innerWidth - 300, Math.max(12, anchor.x + 18));
  const top = Math.min(window.innerHeight - 260, Math.max(72, anchor.y - 42));

  return (
    <div
      className="souvenir3d-object-toolbar"
      style={{ left, top }}
      role="dialog"
      aria-label="Настройки выбранного объекта"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {selected.kind === 'text' && (
        <>
          <textarea
            value={selected.text ?? ''}
            rows={2}
            aria-label="Текст на сувенире"
            onChange={(event) => onTextChange({ text: event.target.value })}
          />
          <div className="souvenir3d-object-toolbar__row">
            <label>
              Размер
              <input
                type="number"
                min={8}
                max={240}
                value={Math.round(selected.fontSize ?? 28)}
                onChange={(event) => onTextChange({ fontSize: Number(event.target.value) })}
              />
            </label>
            <label>
              Цвет
              <input
                type="color"
                value={selected.fill ?? '#111827'}
                onChange={(event) => onTextChange({ fill: event.target.value })}
              />
            </label>
          </div>
        </>
      )}

      {selected.kind === 'image' && (
        <div className="souvenir3d-object-toolbar__row">
          <button type="button" onClick={() => replaceRef.current?.click()}>Заменить</button>
          <button type="button" onClick={onCrop}>Обрезать</button>
          <input
            ref={replaceRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onReplacePhoto(file);
              event.target.value = '';
            }}
          />
        </div>
      )}

      <label className="souvenir3d-object-toolbar__opacity">
        Прозрачность
        <input
          type="range"
          min={10}
          max={100}
          value={Math.round(selected.opacity * 100)}
          onChange={(event) => onOpacityChange(Number(event.target.value) / 100)}
        />
      </label>

      <div className="souvenir3d-object-toolbar__row souvenir3d-object-toolbar__gestures">
        <GestureButton
          className="souvenir3d-object-toolbar__gesture"
          title="Потяните для изменения размера"
          label="↔ Размер"
          onDelta={(dx, dy) => onScale(Math.max(0.85, Math.min(1.15, 1 + (dx - dy) / 180)))}
        />
        <GestureButton
          className="souvenir3d-object-toolbar__gesture"
          title="Потяните для поворота"
          label="↻ Поворот"
          onDelta={(dx) => onRotate(dx * 0.7)}
        />
      </div>

      <div className="souvenir3d-object-toolbar__row">
        <button type="button" title="Выше" onClick={onBringForward}>Слой ↑</button>
        <button type="button" title="Ниже" onClick={onSendBackward}>Слой ↓</button>
        <button type="button" className="souvenir3d-object-toolbar__delete" onClick={onDelete}>Удалить</button>
      </div>
    </div>
  );
};

export default SouvenirObjectToolbar;
