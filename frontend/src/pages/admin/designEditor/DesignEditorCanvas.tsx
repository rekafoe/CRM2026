import React from 'react';
import { Stage, Layer, Rect, Image as KonvaImage, Text } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';
import { PAGE_OFFSET } from './constants';
import type { DesignTemplate } from '../../../api';
import type { DesignPage } from './types';

/** Изображение по URL для канваса */
const URLImage: React.FC<{
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  draggable?: boolean;
  onDragEnd?: (e: { target: { x: () => number; y: () => number } }) => void;
}> = (props) => {
  const [image] = useImage(props.src);
  return <KonvaImage {...props} image={image} />;
};

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
  showGuides,
  stageRef,
  guidesLayerRef,
  apiBaseUrl,
}) => {
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
      onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
        if (e.target === e.target.getStage()) setSelectedTextId(null);
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
            src={img.src}
            x={img.x}
            y={img.y}
            width={img.width}
            height={img.height}
            draggable
            onDragEnd={(e) => {
              setPages((prev) => {
                const next = [...prev];
                const page = next[currentPage] ?? { images: [], texts: [] };
                next[currentPage] = {
                  ...page,
                  images: page.images.map((i) =>
                    i.id === img.id ? { ...i, x: e.target.x(), y: e.target.y() } : i
                  ),
                };
                return next;
              });
            }}
          />
        ))}
        {currentPageData.texts.map((t) => (
          <Text
            key={t.id}
            x={t.x}
            y={t.y}
            text={t.text}
            fontSize={t.fontSize ?? 24}
            fontFamily={t.fontFamily ?? 'Arial'}
            fill="#000"
            draggable
            onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
              setPages((prev) => {
                const next = [...prev];
                const page = next[currentPage] ?? { images: [], texts: [] };
                next[currentPage] = {
                  ...page,
                  texts: page.texts.map((i) =>
                    i.id === t.id ? { ...i, x: e.target.x(), y: e.target.y() } : i
                  ),
                };
                return next;
              });
            }}
            onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
              e.cancelBubble = true;
              setSelectedTextId(t.id);
            }}
          />
        ))}
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
