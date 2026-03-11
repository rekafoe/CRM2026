import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Stage, Layer, Rect, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui/AppIcon';
import { Alert, Button } from '../../components/common';
import { getDesignTemplate, uploadOrderFile, updateOrderItem, type DesignTemplate } from '../../api';
import '../../styles/admin-page-layout.css';
import './DesignEditorPage.css';

/** Масштаб: 1 мм = scalePx пикселей на экране (для превью) */
const MM_TO_PX = 96 / 25.4;

const PAGE_OFFSET = 40;

/** Компонент изображения с загрузкой по URL */
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

interface CanvasImage {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
}

export const DesignEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const [searchParams] = useSearchParams();
  const orderId = parseInt(searchParams.get('orderId') ?? '0', 10);
  const orderItemId = parseInt(searchParams.get('orderItemId') ?? '0', 10);
  const hasOrderContext = orderId > 0;

  const [template, setTemplate] = useState<DesignTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [images, setImages] = useState<CanvasImage[]>([]);
  const [pageWidth, setPageWidth] = useState(210);
  const [pageHeight, setPageHeight] = useState(297);
  const [scale, setScale] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<Konva.Stage>(null);

  const loadTemplate = useCallback(async () => {
    const id = parseInt(templateId ?? '0', 10);
    if (!id) {
      setError('Не указан шаблон');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await getDesignTemplate(id);
      const t = res.data;
      setTemplate(t);
      let spec: { width_mm?: number; height_mm?: number } = {};
      try {
        if (t.spec) spec = typeof t.spec === 'string' ? JSON.parse(t.spec) : (t.spec as object);
      } catch {}
      const w = spec.width_mm ?? 210;
      const h = spec.height_mm ?? 297;
      setPageWidth(w);
      setPageHeight(h);
      // Масштаб: страница помещается в ~500px по ширине
      const maxW = 500;
      setScale(Math.min(maxW / (w * MM_TO_PX), 2));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить шаблон');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  const stageW = Math.ceil(pageWidth * MM_TO_PX * scale) + 80;
  const stageH = Math.ceil(pageHeight * MM_TO_PX * scale) + 80;
  const pageW = pageWidth * MM_TO_PX * scale;
  const pageH = pageHeight * MM_TO_PX * scale;

  const handleAddImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const maxW = pageW * 0.5;
      const maxH = pageH * 0.5;
      let w = img.width;
      let h = img.height;
      if (w > maxW || h > maxH) {
        const r = Math.min(maxW / w, maxH / h);
        w *= r;
        h *= r;
      }
      setImages((prev) => [
        ...prev,
        {
          id: `img-${Date.now()}`,
          x: PAGE_OFFSET,
          y: PAGE_OFFSET,
          width: w,
          height: h,
          src: url,
        },
      ]);
    };
    img.src = url;
    e.target.value = '';
  }, [pageW, pageH]);

  const handleSave = useCallback(async () => {
    const designState = {
      templateId: templateId ? parseInt(templateId, 10) : null,
      pageWidth,
      pageHeight,
      images: images.map((i) => ({ id: i.id, x: i.x, y: i.y, width: i.width, height: i.height })),
    };

    if (hasOrderContext) {
      try {
        setSaving(true);
        setError(null);
        const stage = stageRef.current;
        if (!stage) {
          setError('Канвас не готов');
          return;
        }
        const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: 'image/png' });
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `maket-${Date.now()}.png`, { type: 'image/png' });
        await uploadOrderFile(orderId, file, orderItemId > 0 ? orderItemId : undefined);
        if (orderItemId > 0) {
          await updateOrderItem(orderId, orderItemId, {
            params: { designState, designTemplateId: templateId ? parseInt(templateId, 10) : undefined },
          });
        }
        navigate(-1);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Ошибка сохранения');
      } finally {
        setSaving(false);
      }
    } else {
      console.log('Design state:', designState);
      alert('Макет сохранён в консоль. Для сохранения в заказ откройте редактор из карточки заказа.');
    }
  }, [templateId, pageWidth, pageHeight, images, hasOrderContext, orderId, orderItemId, navigate]);

  if (loading) {
    return (
      <AdminPageLayout title="Редактор макета" icon={<AppIcon name="image" size="sm" />} onBack={() => navigate(-1)}>
        <div className="design-editor-loading">Загрузка шаблона...</div>
      </AdminPageLayout>
    );
  }

  if (error || !template) {
    return (
      <AdminPageLayout title="Редактор макета" icon={<AppIcon name="image" size="sm" />} onBack={() => navigate(-1)}>
        {error && <Alert type="error">{error}</Alert>}
        <Button variant="secondary" onClick={() => navigate('/adminpanel/design-templates')}>
          Вернуться в каталог
        </Button>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title={`Редактор: ${template.name}`}
      icon={<AppIcon name="image" size="sm" />}
      onBack={() => navigate(-1)}
    >
      <div className="design-editor">
        <div className="design-editor-toolbar">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAddImage}
            style={{ display: 'none' }}
          />
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <AppIcon name="plus" size="xs" /> Добавить фото
          </Button>
          <Button variant="secondary" onClick={handleSave} disabled={saving}>
            <AppIcon name="save" size="xs" /> {hasOrderContext ? (saving ? 'Сохранение…' : 'Сохранить в заказ') : 'Сохранить'}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/adminpanel/design-templates')}>
            Закрыть
          </Button>
        </div>

        <div className="design-editor-canvas-wrap">
          <Stage ref={stageRef} width={stageW} height={stageH}>
            <Layer>
              {/* Фон страницы */}
              <Rect
                x={PAGE_OFFSET}
                y={PAGE_OFFSET}
                width={pageW}
                height={pageH}
                fill="white"
                stroke="#ccc"
                strokeWidth={1}
              />
              {images.map((img) => (
                <URLImage
                  key={img.id}
                  src={img.src}
                  x={img.x}
                  y={img.y}
                  width={img.width}
                  height={img.height}
                  draggable
                  onDragEnd={(e) => {
                    setImages((prev) =>
                      prev.map((i) =>
                        i.id === img.id ? { ...i, x: e.target.x(), y: e.target.y() } : i
                      )
                    );
                  }}
                />
              ))}
            </Layer>
          </Stage>
        </div>

        <div className="design-editor-info">
          <p>
            Формат: {pageWidth}×{pageHeight} мм
          </p>
          {hasOrderContext ? (
            <p>Макет будет загружен в заказ #{orderId}{orderItemId > 0 ? ' и привязан к позиции' : ''}.</p>
          ) : (
            <p>Перетаскивайте фото. Для сохранения в заказ откройте редактор из карточки заказа (Файлы → Создать макет).</p>
          )}
        </div>
      </div>
    </AdminPageLayout>
  );
};

export default DesignEditorPage;
