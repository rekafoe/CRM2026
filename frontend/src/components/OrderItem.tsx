import React, { useEffect, useState, useCallback } from 'react';
import { Item } from '../types';
import { updateOrderItem, deleteOrderItem, getPrinters } from '../api';
import { numberInputFromString, numberInputToNumber, type NumberInputValue } from '../utils/numberInput';
import { getPaperTypesFromWarehouse } from '../services/calculatorMaterialService';
import { ConfirmDialog } from './common/ConfirmDialog';
import { useToast } from './Toast';
import {
  generateItemDescription,
  isAutoDescription,
  sanitizeOrderItemDescription,
} from './order/orderItemUtils';
import './OrderItem.css';
import { OrderItemSummary } from './order/OrderItemSummary';
import { OrderItemEditForm } from './order/OrderItemEditForm';
import { OrderItemActions } from './order/OrderItemActions';

// Кэш отображаемых имён типов бумаги из склада
let paperTypeDisplayCache: Record<string, string> | null = null;
let paperTypeDisplayPromise: Promise<Record<string, string>> | null = null;

const loadPaperTypeDisplayMap = async (): Promise<Record<string, string>> => {
  if (paperTypeDisplayCache) return paperTypeDisplayCache;
  if (!paperTypeDisplayPromise) {
    paperTypeDisplayPromise = (async () => {
      try {
        const types = await getPaperTypesFromWarehouse();
        const map: Record<string, string> = {};
        types.forEach((t: any) => {
          if (t?.name && t?.display_name) {
            map[String(t.name)] = String(t.display_name);
          }
        });
        paperTypeDisplayCache = map;
        return map;
      } catch {
        paperTypeDisplayCache = {};
        return {};
      } finally {
        paperTypeDisplayPromise = null;
      }
    })();
  }
  return paperTypeDisplayPromise;
};


interface OrderItemProps {
  item: Item;
  orderId: number;
  order?: {
    number?: string;
    customerName?: string;
    customerPhone?: string;
    status?: number;
    created_at?: string;
    totalAmount?: number;
    items?: Item[];
    /** Тип цены заказа (для отображения, если у позиции нет своего) */
    priceType?: string;
  } | null;
  onUpdate: () => void;
  onEditParameters?: (orderId: number, item: Item) => void;
  /** Режим пула заказов: только информация, без принтера/редактирования/удаления */
  readOnly?: boolean;
  /** Операторы за сегодня (для выбора исполнителя) */
  operatorsToday?: Array<{ id: number; name: string }>;
  /** Обновить исполнителя позиции */
  onExecutorChange?: (orderId: number, itemId: number, executor_user_id: number | null) => void;
}

export const OrderItem: React.FC<OrderItemProps> = ({ item, orderId, order, onUpdate, onEditParameters, readOnly, operatorsToday = [], onExecutorChange }) => {
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState<NumberInputValue>(item.quantity ?? 1);
  const [price, setPrice] = useState<NumberInputValue>(item.price);
  const [sides, setSides] = useState<NumberInputValue>(item.sides ?? 1);
  const [sheets, setSheets] = useState<NumberInputValue>(item.sheets ?? 0);
  const [waste, setWaste] = useState<NumberInputValue>(item.waste ?? 0);
  const [customDescription, setCustomDescription] = useState(
    item.params.description &&
    item.params.description !== 'Описание товара' &&
    !isAutoDescription(item.params.description)
      ? sanitizeOrderItemDescription(item.params.description, item.type)
      : ''
  );
  const [printerId, setPrinterId] = useState<number | ''>(item.printerId ?? '');
  const [printers, setPrinters] = useState<Array<{ id: number; name: string; technology_code?: string | null; color_mode?: 'bw' | 'color' | 'both' }>>([]);
  const [savingPrinter, setSavingPrinter] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setQty(item.quantity ?? 1);
    setPrice(item.price);
    setSides(item.sides ?? 1);
    setSheets(item.sheets ?? item.params.sheetsNeeded ?? 0);
    setWaste(item.waste ?? 0);
    setCustomDescription(
      item.params.description &&
      item.params.description !== 'Описание товара' &&
      !isAutoDescription(item.params.description)
        ? sanitizeOrderItemDescription(item.params.description, item.type)
        : ''
    );

    // Подтягиваем отображаемое имя типа бумаги из склада
    (async () => {
      if (!materialTypeRaw) {
        setMaterialTypeDisplay(null);
        return;
      }
      try {
        const map = await loadPaperTypeDisplayMap();
        const display = map[String(materialTypeRaw)] || null;
        setMaterialTypeDisplay(display);
      } catch {
        setMaterialTypeDisplay(null);
      }
    })();
    // Важно: не сбрасываем локально выбранный принтер на '' при каждом обновлении item
    // (например, когда список заказов перерендеривается новыми объектами)
    setPrinterId((prev) => {
      if (typeof item.printerId === 'number') return item.printerId;
      // Если принтер реально отсутствует в данных и локально ничего не выбрано — оставляем пусто
      if ((item.printerId == null) && prev === '') return '';
      // Иначе сохраняем локальный выбор, чтобы он не "слетал" визуально
      return prev;
    });
  }, [item.id, item.printerId, item.price, item.quantity, item.sides, item.sheets, item.waste, item.params?.description, item.params?.sheetsNeeded]);

  const specsAny = (item.params as any)?.specifications || {};
  const printTech: string | null =
    specsAny?.print_technology ||
    specsAny?.printTechnology ||
    (item.params as any)?.printTechnology ||
    null;
  const printColorMode: 'bw' | 'color' | null =
    specsAny?.print_color_mode ||
    specsAny?.printColorMode ||
    null;

  // Загружаем принтеры: фильтр по технологии продукта; если технологии нет — все принтеры
  useEffect(() => {
    (async () => {
      try {
        const resp = await getPrinters(printTech ? { technology_code: printTech } : undefined);
        const list = Array.isArray(resp.data) ? resp.data : [];
        const filtered = printColorMode
          ? list.filter((p: any) => (p.color_mode || 'both') === 'both' || p.color_mode === printColorMode)
          : list;
        setPrinters(filtered);
      } catch (e) {
        setPrinters([]);
      }
    })();
  }, [printTech, printColorMode]);

  const loadPrintersIfNeeded = async () => {
    if (printers.length > 0) return;
    try {
      const resp = await getPrinters(printTech ? { technology_code: printTech } : undefined);
      const list = Array.isArray(resp.data) ? resp.data : [];
      const filtered = printColorMode
        ? list.filter((p: any) => (p.color_mode || 'both') === 'both' || p.color_mode === printColorMode)
        : list;
      setPrinters(filtered);
    } catch {
      setPrinters([]);
    }
  };

  const handleQuickPrinterChange = async (next: number | '') => {
    setPrinterId(next);
    if (next === '') return;
    const printerIdVal = Number(next);
    if (!Number.isFinite(printerIdVal)) return;
    try {
      setSavingPrinter(true);
      const payload = {
        printerId: printerIdVal,
        printer_id: printerIdVal,
      };
      const res = await updateOrderItem(orderId, item.id, payload as any);
      const updated = res?.data;
      if (updated && typeof updated.printerId === 'number') {
        setPrinterId(updated.printerId);
      }
      onUpdate();
      addToast({ type: 'success', title: 'Принтер привязан', message: 'Принтер успешно привязан к позиции' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Ошибка', message: err?.message || 'Ошибка при сохранении принтера' });
    } finally {
      setSavingPrinter(false);
    }
  };
  
  // Вычисляем общую стоимость: приоритет — storedTotalCost из калькулятора (источник истины), иначе price × qty
  const computedTotal = numberInputToNumber(qty, 0) * numberInputToNumber(price, 0);
  const storedTotal = (item.params as { storedTotalCost?: number })?.storedTotalCost;
  const total = typeof storedTotal === 'number' && Number.isFinite(storedTotal)
    ? Math.round(storedTotal * 100) / 100
    : Math.round(computedTotal * 100) / 100;
  
  // Получаем название товара
  const name = (item as any).name || (item as any).params?.productName || (item as any).params?.name || (item as any).type || 'Товар без названия';
  const parameterSummary = Array.isArray(item.params.parameterSummary) ? item.params.parameterSummary : [];
  const sheetCountRaw = item.sheets ?? item.params.sheetsNeeded ?? item.params.layout?.sheetsNeeded ?? null;
  const sheetCount = sheetCountRaw != null && sheetCountRaw > 0 ? sheetCountRaw : null;
  const itemsPerSheet = item.params.layout?.itemsPerSheet ?? item.params.piecesPerSheet ?? null;
  const sheetSize = item.params.layout?.sheetSize ?? null;
  
  // Извлекаем данные о материале для отображения
  // 🆕 Приоритет: materialType (тип материала, например 'coated'), затем paperType (тип бумаги, например 'glossy')
  const materialTypeRaw = specsAny?.materialType || specsAny?.paperType || null;
  const materialFormat = specsAny?.format || item.params.formatInfo || sheetSize || null;
  // 🆕 Приоритет: плотность из specifications (то, что выбрал пользователь), затем из parameterSummary, затем из params
  const densityFromSummary = parameterSummary.find((p) => p.label === 'Плотность бумаги' || p.label === 'Плотность')?.value;
  const densityFromSummaryNum = densityFromSummary ? Number(densityFromSummary.replace(/[^\d]/g, '')) : null;
  const materialDensity = specsAny?.paperDensity || densityFromSummaryNum || item.params.paperDensity || null;
  const [materialTypeDisplay, setMaterialTypeDisplay] = useState<string | null>(null);

  const handleSave = async () => {
    try {
      if (qty === '' || price === '' || sides === '') {
        addToast({ type: 'warning', title: 'Внимание', message: 'Заполните цену, количество и стороны печати' });
        return;
      }
      const newPrice = numberInputToNumber(price, 0);
      const newQty = Math.max(1, numberInputToNumber(qty, 1));
      const newPrinterId = printerId === '' ? undefined : Number(printerId);
      await updateOrderItem(orderId, item.id, {
        quantity: newQty,
        price: newPrice,
        sides: Math.max(1, numberInputToNumber(sides, 1)),
        sheets: Math.max(0, numberInputToNumber(sheets, 0)),
        waste: Math.max(0, numberInputToNumber(waste, 0)),
        printerId: newPrinterId,
        printer_id: newPrinterId,
        params: {
          ...item.params,
          description: customDescription,
          storedTotalCost: Math.round(newPrice * newQty * 100) / 100,
        } as Item['params']
      } as any);
      setEditing(false);
      onUpdate();
      addToast({ type: 'success', title: 'Успешно', message: 'Позиция обновлена' });
    } catch (error) {
      addToast({ type: 'error', title: 'Ошибка', message: 'Ошибка при обновлении позиции' });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteOrderItem(orderId, item.id);
      onUpdate();
      addToast({ type: 'success', title: 'Успешно', message: 'Позиция удалена' });
    } catch (error) {
      addToast({ type: 'error', title: 'Ошибка', message: 'Ошибка при удалении позиции' });
    }
  };

  return (
    <div className="item" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1 }}>
        {(() => {
          // Заголовок — по имени (дизайн, ламинация, визитки и т.д.), не по типу
          const itemName = (item as any).name || (item as any).params?.productName || (item as any).params?.name || (item as any).type || 'Позиция';
          const display = sanitizeOrderItemDescription(String(customDescription || ''), (item as any).type);
          const showDesc = Boolean(display) && display !== 'Без описания';
          // Расшифровка: листы печати, резки, операции (ламинация, скругление и т.д.)
          const params = item.params || {};
          const layout = params.layout || params.specifications?.layout || {};
          const sheetsNeeded = Number(params.sheetsNeeded ?? params.specifications?.sheetsNeeded ?? layout.sheetsNeeded) || 0;
          const cutsPerSheet = Number(layout.cutsPerSheet) || 0;
          const parts: string[] = [];
          if (sheetsNeeded > 0) {
            const sheetWord = sheetsNeeded === 1 ? 'лист' : sheetsNeeded < 5 ? 'листа' : 'листов';
            parts.push(`${sheetsNeeded} ${sheetWord} печати`);
          }
          if (cutsPerSheet > 0) {
            const cutWord = cutsPerSheet === 1 ? 'рез' : cutsPerSheet < 5 ? 'реза' : 'резок';
            parts.push(`${cutsPerSheet} ${cutWord}`);
          }
          const rawServices = params.services as Array<{ operationName?: string; service?: string; name?: string; quantity?: number; priceUnit?: string; unit?: string }> | undefined;
          if (Array.isArray(rawServices)) {
            for (const s of rawServices) {
              const name = s.operationName || s.service || s.name || 'Операция';
              const q = Number(s.quantity);
              if (Number.isFinite(q) && q > 0) {
                const unit = String(s.priceUnit || s.unit || '').toLowerCase().includes('sheet') || String(s.priceUnit || '').toLowerCase().includes('лист') ? 'лист.' : 'шт.';
                parts.push(`${String(name).trim()}: ${q} ${unit}`);
              }
            }
          }
          const productionBreakdown = parts.length > 0 ? parts.join(', ') : null;
          return (
            <>
              <strong>{itemName}</strong>
              {showDesc ? <> — {display}</> : null}
              {productionBreakdown && (
                <span style={{ display: 'block', fontSize: 12, color: '#555', marginTop: 2 }}>{productionBreakdown}</span>
              )}
            </>
          );
        })()}
        {item.params.paperName && (
          <span style={{ marginLeft: 6, fontSize: 12, color: '#555' }}>({item.params.paperName}{item.params.lamination && item.params.lamination!=='none' ? `, ламинация: ${item.params.lamination==='matte'?'мат':'гл'}` : ''})</span>
        )}
        {" "}
        {editing ? (
          <OrderItemEditForm
            item={item}
            customDescription={customDescription}
            price={price}
            qty={qty}
            sides={sides}
            sheets={sheets}
            waste={waste}
            printerId={printerId}
            printers={printers}
            printTech={printTech}
            printColorMode={printColorMode}
            onDescriptionChange={setCustomDescription}
            onPriceChange={setPrice}
            onQtyChange={setQty}
            onSidesChange={setSides}
            onSheetsChange={setSheets}
            onWasteChange={setWaste}
            onPrinterChange={setPrinterId}
          />
        ) : (
          <>
            <OrderItemSummary
              item={item}
              orderPriceType={order?.priceType}
              qty={Number(numberInputToNumber(qty, 0))}
              price={Number(numberInputToNumber(price, 0))}
              total={total}
              sides={typeof sides === 'number' ? sides : Number(numberInputToNumber(sides, 0))}
              waste={typeof waste === 'number' ? waste : Number(numberInputToNumber(waste, 0))}
              sheetCount={sheetCount}
              itemsPerSheet={itemsPerSheet}
              sheetSize={sheetSize}
              materialFormat={materialFormat}
              materialTypeDisplay={materialTypeDisplay}
              materialTypeRaw={materialTypeRaw}
              materialDensity={materialDensity}
              parameterSummary={parameterSummary}
            />
          </>
        )}
      </div>
      {/* Показываем только те параметры, которых нет в горизонтальной строке и которые реально нужны отдельно */}
      {operatorsToday.length > 0 && onExecutorChange && (
        <label className="order-item-executor" style={{ marginLeft: 8, fontSize: 12 }}>
          Исполнитель:
          <select
            value={item.executor_user_id ?? (order as any)?.responsible_user_id ?? (order as any)?.userId ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              onExecutorChange(orderId, item.id, v === '' ? null : Number(v));
            }}
          >
            <option value="">—</option>
            {operatorsToday.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
      )}
      {parameterSummary.length > 0 && (
        <div className="order-parameter-summary">
          {parameterSummary
            .filter((param) => {
              // Исключаем параметры, уже показанные в основной строке
              const label = param.label.toLowerCase();
              return !(
                // Формат / размер / материал
                label === 'формат' ||
                label === 'размер' ||
                label === 'тип материала' ||
                label === 'материал' ||
                label === 'плотность бумаги' ||
                label === 'плотность' ||
                // Базовые параметры продукта (как на скрине): тип, тираж, стороны, срок, страницы
                label === 'тип продукта' ||
                label === 'тираж' ||
                label === 'стороны печати' ||
                label === 'срок изготовления' ||
                label === 'количество страниц'
              );
            })
            .map((param) => (
              <span className="parameter-chip" key={`${param.label}-${param.value}`}>
                <span className="parameter-label">{param.label}:</span>
                <span className="parameter-value">{param.value}</span>
              </span>
            ))}
        </div>
      )}
      {!readOnly && (
        <OrderItemActions
          editing={editing}
          printerId={printerId}
          printers={printers}
          savingPrinter={savingPrinter}
          onEditParameters={onEditParameters}
          orderId={orderId}
          item={item}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
          onDelete={() => setShowDeleteConfirm(true)}
          onPrinterFocus={loadPrintersIfNeeded}
          onPrinterChange={handleQuickPrinterChange}
        />
      )}
      {!readOnly && (
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Удаление позиции"
        message="Вы уверены, что хотите удалить эту позицию из заказа?"
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
      />
      )}
    </div>
  );
};

// CSS стили для горизонтального интерфейса товаров
const styles = `
  .order-item-horizontal {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px 12px;
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 4px;
    margin: 2px 0;
    font-size: 13px;
    line-height: 1.4;
  }

  .item-name {
    font-weight: 600;
    color: #2c3e50;
    flex-shrink: 0;
  }

  .separator {
    color: #adb5bd;
    margin: 0 4px;
    font-weight: 300;
    flex-shrink: 0;
  }

  .item-quantity {
    color: #495057;
    font-weight: 500;
    flex-shrink: 0;
  }

  .item-price {
    color: #6c757d;
    font-size: 12px;
    flex-shrink: 0;
  }

  .item-total {
    color: #28a745;
    font-weight: 600;
    flex-shrink: 0;
  }

  .detail-item {
    color: #6c757d;
    background: #e9ecef;
    padding: 1px 4px;
    border-radius: 2px;
    font-weight: 500;
    font-size: 11px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .detail-item.urgency {
    background: #fff3cd;
    color: #856404;
    font-weight: 600;
  }

  .detail-item.customer {
    background: #d1ecf1;
    color: #0c5460;
    font-weight: 600;
  }

  /* Адаптивность */
  @media (max-width: 768px) {
    .order-item-horizontal {
      padding: 6px 8px;
      font-size: 12px;
      gap: 2px;
    }

    .separator {
      margin: 0 2px;
    }

    .detail-item {
      font-size: 10px;
      padding: 1px 3px;
    }

    .item-name {
      font-size: 13px;
    }
  }

  @media (max-width: 480px) {
    .order-item-horizontal {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }

    .separator {
      display: none;
    }

    .detail-item {
      margin-right: 8px;
      margin-bottom: 2px;
    }
  }
`;

// Добавляем стили в head
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}
