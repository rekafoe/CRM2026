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
  } | null;
  onUpdate: () => void;
  onEditParameters?: (orderId: number, item: Item) => void;
}

export const OrderItem: React.FC<OrderItemProps> = ({ item, orderId, order, onUpdate, onEditParameters }) => {
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

  useEffect(() => {
    if (!editing) return;
    (async () => {
      try {
        const resp = await getPrinters(printTech ? { technology_code: printTech } : undefined);
        const list = Array.isArray(resp.data) ? resp.data : [];
        // Фильтр по режиму печати (если указан в продукте)
        const filtered = printColorMode
          ? list.filter((p: any) => (p.color_mode || 'both') === 'both' || p.color_mode === printColorMode)
          : list;
        setPrinters(filtered);
      } catch (e) {
        setPrinters([]);
      }
    })();
  }, [editing, printTech, printColorMode]);

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
    // Сохраняем только при выборе конкретного принтера (не даём "снять" через пустое значение)
    if (next === '') return;
    try {
      setSavingPrinter(true);
      await updateOrderItem(orderId, item.id, {
        printerId: Number(next),
      } as any);
      onUpdate();
    } catch {
      addToast({ type: 'error', title: 'Ошибка', message: 'Ошибка при сохранении принтера' });
    } finally {
      setSavingPrinter(false);
    }
  };
  
  // Вычисляем общую стоимость
  const total = numberInputToNumber(qty, 0) * numberInputToNumber(price, 0);
  
  // Получаем название товара
  const name = (item as any).name || 'Товар без названия';
  const parameterSummary = Array.isArray(item.params.parameterSummary) ? item.params.parameterSummary : [];
  const sheetCountRaw = item.sheets ?? item.params.sheetsNeeded ?? item.params.layout?.sheetsNeeded ?? null;
  const sheetCount = sheetCountRaw != null && sheetCountRaw > 0 ? sheetCountRaw : null;
  const itemsPerSheet = item.params.layout?.itemsPerSheet ?? item.params.piecesPerSheet ?? null;
  const sheetSize = item.params.layout?.sheetSize ?? null;
  
  // Извлекаем данные о материале для отображения
  const materialTypeRaw = specsAny?.paperType || specsAny?.materialType || null;
  const materialFormat = specsAny?.format || item.params.formatInfo || sheetSize || null;
  const materialDensity = specsAny?.paperDensity || item.params.paperDensity || null;
  const [materialTypeDisplay, setMaterialTypeDisplay] = useState<string | null>(null);

  const handleSave = async () => {
    try {
      if (qty === '' || price === '' || sides === '') {
        addToast({ type: 'warning', title: 'Внимание', message: 'Заполните цену, количество и стороны печати' });
        return;
      }
      await updateOrderItem(orderId, item.id, {
        quantity: Math.max(1, numberInputToNumber(qty, 1)),
        price: numberInputToNumber(price, 0),
        sides: Math.max(1, numberInputToNumber(sides, 1)),
        sheets: Math.max(0, numberInputToNumber(sheets, 0)),
        waste: Math.max(0, numberInputToNumber(waste, 0)),
        printerId: printerId === '' ? null : Number(printerId),
        params: {
          ...item.params,
          description: customDescription
        }
      });
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
          // В заголовке показываем только кастомное / сохранённое описание,
          // без автогенерации из parameterSummary (иначе дублируется с чипами ниже).
          const display = sanitizeOrderItemDescription(String(customDescription || ''), item.type);
          const showDesc = Boolean(display);
          return (
            <>
              <strong>{item.type}</strong>
              {showDesc ? <> — {display}</> : null}
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
        onEdit={() => setEditing(true)}
        onDelete={() => setShowDeleteConfirm(true)}
        onPrinterFocus={loadPrintersIfNeeded}
        onPrinterChange={handleQuickPrinterChange}
      />
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
