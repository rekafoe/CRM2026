import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getPlotterCalculatorMaterials,
  quotePlotterCutting,
  type PlotterBareQuoteResponse,
  type PlotterCalculatorMaterial,
} from '../../../services/pricing';
import type { Product } from '../../../services/products';
import { PLOTTER_PRODUCT_ID } from '../components/DynamicProductSelector';
import {
  levelChoice,
  type PlotterCalcDraft,
} from '../components/PlotterCuttingCalculatorForm';

const emptyDraft = (): PlotterCalcDraft => ({
  widthMm: '1000',
  heightMm: '1000',
  quantity: '1',
  materialId: null,
  levelKey: 'auto',
  weeding: false,
  mounting: false,
  proof: false,
});

type Params = {
  isOpen: boolean;
  isPlotterProduct: boolean;
  isEditMode: boolean;
  editContext?: any;
  onAddToOrder: (item: any) => void;
  onSubmitExisting?: (payload: { orderId: number; itemId: number; item: any }) => Promise<void>;
  onClose: () => void;
  setSelectedProduct: (product: Product & { resolvedProductType?: string }) => void;
  setSpecs: (updater: any) => void;
  logger: { error: (...args: any[]) => void };
  toast: { success: (msg: string) => void; error: (msg: string, details?: string) => void };
};

const plotterProduct = (): Product => ({
  id: PLOTTER_PRODUCT_ID,
  category_id: 0,
  name: 'Плоттерная резка',
  description: 'Резка плёнки для аппликации',
  icon: 'scissors',
  calculator_type: 'simplified',
  product_type: 'universal',
  operator_percent: 0,
  is_active: true,
  created_at: '',
  updated_at: '',
  category_name: 'Услуги',
  category_icon: 'puzzle',
});

export function usePlotterCuttingCalculator({
  isOpen,
  isPlotterProduct,
  isEditMode,
  editContext,
  onAddToOrder,
  onSubmitExisting,
  onClose,
  setSelectedProduct,
  setSpecs,
  logger,
  toast,
}: Params) {
  const [materials, setMaterials] = useState<PlotterCalculatorMaterial[]>([]);
  const [draft, setDraft] = useState<PlotterCalcDraft>(emptyDraft);
  const [quote, setQuote] = useState<PlotterBareQuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const hydratedKey = useRef<string | null>(null);
  const quoteRef = useRef<PlotterBareQuoteResponse | null>(null);
  quoteRef.current = quote;

  const patchDraft = useCallback((patch: Partial<PlotterCalcDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    if (!isOpen || !isPlotterProduct) return;
    let cancelled = false;
    getPlotterCalculatorMaterials()
      .then((payload) => {
        if (!cancelled) setMaterials(payload.materials ?? []);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Не удалось загрузить материалы');
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, isPlotterProduct]);

  useEffect(() => {
    if (!isOpen) hydratedKey.current = null;
    if (!isOpen || !editContext?.item) return;
    const params = editContext.item.params || {};
    if (params.plotterBareProduct !== true) return;
    const key = `${editContext.orderId}:${editContext.item.id}`;
    if (hydratedKey.current === key) return;
    hydratedKey.current = key;
    setSelectedProduct(plotterProduct() as Product & { resolvedProductType?: string });
    setDraft({
      widthMm: String(params.width_mm ?? ''),
      heightMm: String(params.height_mm ?? ''),
      quantity: String(editContext.item.quantity ?? params.quantity ?? 1),
      materialId: params.material_id != null ? Number(params.material_id) : null,
      levelKey: params.level_key || 'auto',
      weeding: params.plotter_weeding === true,
      mounting: params.plotter_mounting === true,
      proof: params.plotter_proof === true,
    });
    setSpecs((prev: any) => ({ ...prev, productType: 'universal' }));
  }, [editContext, isOpen, setSelectedProduct, setSpecs]);

  useEffect(() => {
    if (!isOpen || !isPlotterProduct) return;
    const width = Number(draft.widthMm);
    const height = Number(draft.heightMm);
    const quantity = Math.floor(Number(draft.quantity));
    if (!(width > 0) || !(height > 0) || !(quantity > 0)) {
      setQuote(null);
      setLoading(false);
      return;
    }
    const choice = levelChoice(draft, quoteRef.current);
    const id = ++requestId.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      quotePlotterCutting({
        width_mm: width,
        height_mm: height,
        quantity,
        material_id: draft.materialId,
        weeding: draft.weeding,
        mounting: draft.mounting,
        proof: draft.proof,
        level_multiplier: choice.multiplier,
        level_name: choice.name,
      })
        .then((next) => {
          if (id !== requestId.current) return;
          setQuote(next);
          setError(null);
        })
        .catch((err: any) => {
          if (id !== requestId.current) return;
          setQuote(null);
          setError(err?.response?.data?.message || err?.message || 'Не удалось посчитать');
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    isOpen,
    isPlotterProduct,
    draft.widthMm,
    draft.heightMm,
    draft.quantity,
    draft.materialId,
    draft.weeding,
    draft.mounting,
    draft.proof,
    draft.levelKey,
  ]);

  const isPlotterValid = Boolean(quote && quote.total >= 0);
  const plotterResult = useMemo(() => {
    if (!quote) return null;
    return {
      totalCost: quote.total,
      pricePerItem: quote.unitPrice,
      specifications: { quantity: Math.max(1, Math.floor(Number(draft.quantity) || 1)) },
      productionTime: '—',
      parameterSummary: quote.lines.map((line) => ({
        label: line.title,
        value: `${line.total.toFixed(2)}`,
      })),
      warnings: quote.warnings,
    };
  }, [draft.quantity, quote]);

  const handleAddPlotterProduct = useCallback(async () => {
    if (!quote) return;
    const width = Number(draft.widthMm);
    const height = Number(draft.heightMm);
    const quantity = Math.max(1, Math.floor(Number(draft.quantity) || 1));
    const name = `Плоттерная резка ${width}×${height} мм`;
    const materialQty = quote.lines.find((line) => line.key === 'material')?.quantity ?? 0;
    const paramsPayload = {
      plotterBareProduct: true,
      productName: name,
      name,
      description: quote.lines.map((line) => line.title).join(', '),
      storedTotalCost: quote.total,
      priceLockedByCalculator: true,
      width_mm: width,
      height_mm: height,
      quantity,
      material_id: draft.materialId,
      level_key: draft.levelKey,
      plotter_weeding: draft.weeding,
      plotter_mounting: draft.mounting,
      plotter_proof: draft.proof,
      plotter_mode: quote.mode,
      plotterLines: quote.lines,
      materials:
        draft.materialId && materialQty > 0
          ? [{ materialId: draft.materialId, quantity: materialQty, name: quote.material?.name }]
          : [],
    };
    const apiItem = {
      type: 'plotter',
      name,
      params: paramsPayload,
      price: quantity > 0 ? Math.round((quote.total / quantity) * 10000) / 10000 : quote.total,
      totalCost: quote.total,
      quantity,
      sides: 1,
          sheets: 0,
      waste: 0,
      clicks: 0,
    };
    try {
      if (isEditMode && editContext && onSubmitExisting) {
        await onSubmitExisting({
          orderId: editContext.orderId,
          itemId: editContext.item.id,
          item: apiItem,
        });
        toast.success('Позиция обновлена');
      } else {
        await Promise.resolve(onAddToOrder(apiItem));
        toast.success('Плоттерная резка добавлена в заказ');
      }
      onClose();
    } catch (err: any) {
      logger.error('Ошибка сохранения плоттерной резки', err);
      toast.error('Не удалось сохранить позицию', err?.message || 'Ошибка сохранения');
    }
  }, [draft, editContext, isEditMode, logger, onAddToOrder, onClose, onSubmitExisting, quote, toast]);

  const resetPlotterDraft = useCallback(() => {
    setDraft(emptyDraft());
    setQuote(null);
    setError(null);
  }, []);

  return {
    plotterMaterials: materials,
    plotterDraft: draft,
    patchPlotterDraft: patchDraft,
    plotterQuote: quote,
    plotterLoading: loading,
    plotterError: error,
    plotterResult,
    isPlotterValid,
    handleAddPlotterProduct,
    resetPlotterDraft,
  };
}
