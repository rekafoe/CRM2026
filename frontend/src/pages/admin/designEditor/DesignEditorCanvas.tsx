import React, { useRef, useEffect } from 'react';
import { Stage, Layer, Rect, Image as KonvaImage, Text, Transformer, Group } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';
import { PAGE_OFFSET, EMPTY_PAGE } from './constants';
import type { DesignTemplate } from '../../../api';
import type { DesignPage, CanvasPhotoField } from './types';

/** Изображение по URL для канваса */
type URLImageProps = Omit<React.ComponentPropsWithoutRef<typeof KonvaImage>, 'image'> & { src: string };
const URLImage = React.forwardRef<Konva.Image, URLImageProps>(({ src, ...props }, ref) => {
  const [image] = useImage(src);
  return <KonvaImage ref={ref} {...props} image={image} />;
});

/** Поле для фото: пустой прямоугольник или с изображением, принимает дроп */
const PhotoFieldGroup = React.forwardRef<Konva.Group, {
  field: CanvasPhotoField;
  isSelected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void;
}>(({ field, isSelected, onSelect, onDragEnd, onTransformEnd }, ref) => (
  <Group
    ref={ref}
    x={field.x}
    y={field.y}
    draggable
    onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      onSelect();
    }}
    onDragEnd={(e) => {
      const node = e.target;
      onDragEnd(node.x(), node.y());
    }}
    onTransformEnd={onTransformEnd}
  >
    <Rect
      width={field.width}
      height={field.height}
      stroke={isSelected ? '#2563eb' : '#9ca3af'}
      strokeWidth={isSelected ? 2 : 1}
      dash={[6, 4]}
      fill="#f9fafb"
      listening={true}
    />
    {field.src && (
      <URLImage
        src={field.src}
        x={0}
        y={0}
        width={field.width}
        height={field.height}
        listening={false}
      />
    )}
  </Group>
));

interface DesignEditorCanvasProps {
  template: DesignTemplate | null;
  stageWidth: number;
  stageHeight: number;
  pageWidthPx: number;
  pageHeightPx: number;
  safeZonePx: number;
  currentPageData: DesignPage;
  pages: DesignPage[];
  currentPage: number;
  setPages: React.Dispatch<React.SetStateAction<DesignPage[]>>;
  selectedTextId: string | null;
  setSelectedTextId: (id: string | null) => void;
  selectedImageId: string | null;
  setSelectedImageId: (id: string | null) => void;
  selectedPhotoFieldId: string | null;
  setSelectedPhotoFieldId: (id: string | null) => void;
  onPhotoFieldDrop: (fieldId: string, file: File) => void;
  getPhotoFieldIdAt: (stageX: number, stageY: number) => string | null;
  showGuides: boolean;
  stageRef: React.RefObject<Konva.Stage | null>;
  guidesLayerRef: React.RefObject<Konva.Layer | null>;
  apiBaseUrl: string;
}

export const DesignEditorCanvas: React.FC<DesignEditorCanvasProps> = ({
  template,
  stageWidth,
  stageHeight,
  pageWidthPx,
  pageHeightPx,
  safeZonePx,
  currentPageData,
  pages,
  currentPage,
  setPages,
  selectedTextId,
  setSelectedTextId,
  selectedImageId,
  setSelectedImageId,
  selectedPhotoFieldId,
  setSelectedPhotoFieldId,
  onPhotoFieldDrop,
  getPhotoFieldIdAt,
  showGuides,
  stageRef,
  guidesLayerRef,
  apiBaseUrl,
}) => {
  const transformerRef = useRef<Konva.Transformer>(null);
  const imageRefs = useRef<Record<string, Konva.Image>>({});
  const textRefs = useRef<Record<string, Konva.Text>>({});
  const fieldGroupRefs = useRef<Record<string, Konva.Group>>({});

  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const node = selectedImageId
      ? imageRefs.current[selectedImageId]
      : selectedTextId
        ? textRefs.current[selectedTextId]
        : selectedPhotoFieldId
          ? fieldGroupRefs.current[selectedPhotoFieldId]
          : null;
    if (node) {
      tr.nodes([node]);
      tr.getLayer()?.batchDraw();
    } else {
      tr.nodes([]);
    }
  }, [selectedImageId, selectedTextId, selectedPhotoFieldId]);

  const handleTransformEnd = (node: Konva.Node, kind: 'image' | 'text' | 'photoField', id: string) => {
    const x = node.x();
    const y = node.y();
    setPages((prev) => {
      const next = [...prev];
      const page = next[currentPage] ?? { images: [], texts: [], photoFields: [] };
      if (kind === 'image') {
        const img = node as Konva.Image;
        const w = img.width() * (img.scaleX() ?? 1);
        const h = img.height() * (img.scaleY() ?? 1);
        img.width(w);
        img.height(h);
        img.scaleX(1);
        img.scaleY(1);
        next[currentPage] = {
          ...page,
          images: page.images.map((i) =>
            i.id === id ? { ...i, x, y, width: w, height: h } : i
          ),
        };
      } else if (kind === 'text') {
        const txt = node as Konva.Text;
        const scaleX = txt.scaleX();
        const scaleY = txt.scaleY();
        txt.scaleX(1);
        txt.scaleY(1);
        next[currentPage] = {
          ...page,
          texts: page.texts.map((t) =>
            t.id === id ? { ...t, x, y, scaleX, scaleY } : t
          ),
        };
      } else if (kind === 'photoField') {
        const group = node as Konva.Group;
        const rect = group.findOne('Rect');
        const scaleX = group.scaleX();
        const scaleY = group.scaleY();
        const w = (rect?.width() ?? 100) * scaleX;
        const h = (rect?.height() ?? 100) * scaleY;
        group.scaleX(1);
        group.scaleY(1);
        if (rect) {
          rect.width(w);
          rect.height(h);
        }
        const img = group.findOne('Image');
        if (img) {
          img.width(w);
          img.height(h);
        }
        next[currentPage] = {
          ...page,
          photoFields: page.photoFields.map((f) =>
            f.id === id ? { ...f, x, y, width: w, height: h } : f
          ),
        };
      }
      return next;
    });
  };

  const previewSrc = template?.preview_url
    ? template.preview_url.startsWith('http')
      ? template.preview_url
      : `${apiBaseUrl.replace(/\/api\/?$/, '')}${template.preview_url.startsWith('/') ? '' : '/'}${template.preview_url}`
    : null;

  return (
    <Stage
      ref={stageRef as React.RefObject<Konva.Stage>}
      width={stageWidth}
      height={stageHeight}
      onDragOver={(e: Konva.KonvaEventObject<DragEvent>) => e.evt.preventDefault()}
      onDrop={(e: Konva.KonvaEventObject<DragEvent>) => {
        const files = e.evt.dataTransfer?.files;
        const file = files?.length ? files[0] : null;
        if (!file?.type.startsWith('image/')) return;
        const stage = e.target.getStage();
        const pos = stage?.getPointerPosition();
        if (pos && getPhotoFieldIdAt(pos.x, pos.y)) {
          onPhotoFieldDrop(getPhotoFieldIdAt(pos.x, pos.y)!, file);
        }
      }}
      onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
        if (e.target === e.target.getStage()) {
          setSelectedTextId(null);
          setSelectedImageId(null);
          setSelectedPhotoFieldId(null);
        }
      }}
    >
      <Layer>
        {previewSrc && (
          <URLImage
            src={previewSrc}
            x={PAGE_OFFSET}
            y={PAGE_OFFSET}
            width={pageWidthPx}
            height={pageHeightPx}
          />
        )}
        <Rect
          x={PAGE_OFFSET}
          y={PAGE_OFFSET}
          width={pageWidthPx}
          height={pageHeightPx}
          fill={previewSrc ? 'transparent' : 'white'}
          stroke="#ccc"
          strokeWidth={1}
          listening={false}
        />
        {currentPageData.images.map((img) => (
          <URLImage
            key={img.id}
            ref={(el) => { if (el) imageRefs.current[img.id] = el; }}
            src={img.src}
            x={img.x}
            y={img.y}
            width={img.width}
            height={img.height}
            draggable
            onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
              e.cancelBubble = true;
              setSelectedImageId(img.id);
              setSelectedTextId(null);
              setSelectedPhotoFieldId(null);
            }}
            onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
              setPages((prev) => {
                const next = [...prev];
                const page = next[currentPage] ?? EMPTY_PAGE;
                next[currentPage] = {
                  ...page,
                  images: page.images.map((i) =>
                    i.id === img.id ? { ...i, x: e.target.x(), y: e.target.y() } : i
                  ),
                };
                return next;
              });
            }}
            onTransformEnd={(e: Konva.KonvaEventObject<Event>) => handleTransformEnd(e.target, 'image', img.id)}
          />
        ))}
        {currentPageData.texts.map((t) => (
          <Text
            key={t.id}
            ref={(el) => { if (el) textRefs.current[t.id] = el; }}
            x={t.x}
            y={t.y}
            text={t.text}
            fontSize={t.fontSize ?? 24}
            fontFamily={t.fontFamily ?? 'Arial'}
            fill="#000"
            scaleX={t.scaleX ?? 1}
            scaleY={t.scaleY ?? 1}
            draggable
            onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
              e.cancelBubble = true;
              setSelectedTextId(t.id);
              setSelectedImageId(null);
              setSelectedPhotoFieldId(null);
            }}
            onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
              setPages((prev) => {
                const next = [...prev];
                const page = next[currentPage] ?? EMPTY_PAGE;
                next[currentPage] = {
                  ...page,
                  texts: page.texts.map((i) =>
                    i.id === t.id ? { ...i, x: e.target.x(), y: e.target.y() } : i
                  ),
                };
                return next;
              });
            }}
            onTransformEnd={(e: Konva.KonvaEventObject<Event>) => handleTransformEnd(e.target, 'text', t.id)}
          />
        ))}
        {(currentPageData.photoFields ?? []).map((field) => (
          <PhotoFieldGroup
            key={field.id}
            field={field}
            ref={(el) => { if (el) fieldGroupRefs.current[field.id] = el; }}
            isSelected={selectedPhotoFieldId === field.id}
            onSelect={() => {
              setSelectedPhotoFieldId(field.id);
              setSelectedTextId(null);
              setSelectedImageId(null);
            }}
            onDragEnd={(x, y) => {
              setPages((prev) => {
                const next = [...prev];
                const page = next[currentPage] ?? EMPTY_PAGE;
                next[currentPage] = {
                  ...page,
                  photoFields: page.photoFields.map((f) =>
                    f.id === field.id ? { ...f, x, y } : f
                  ),
                };
                return next;
              });
            }}
            onTransformEnd={(e: Konva.KonvaEventObject<Event>) => handleTransformEnd(e.target, 'photoField', field.id)}
          />
        ))}
        <Transformer ref={transformerRef} rotateEnabled={false} />
      </Layer>
      <Layer ref={guidesLayerRef as React.RefObject<Konva.Layer>} listening={false}>
        {showGuides && (
          <>
            <Rect
              x={PAGE_OFFSET}
              y={PAGE_OFFSET}
              width={pageWidthPx}
              height={pageHeightPx}
              stroke="#c41e3a"
              strokeWidth={2}
              dash={[6, 4]}
            />
            {safeZonePx > 0 && (
              <Rect
                x={PAGE_OFFSET + safeZonePx}
                y={PAGE_OFFSET + safeZonePx}
                width={pageWidthPx - 2 * safeZonePx}
                height={pageHeightPx - 2 * safeZonePx}
                stroke="#0d9488"
                strokeWidth={1}
                dash={[8, 4]}
              />
            )}
          </>
        )}
      </Layer>
    </Stage>
  );
};
