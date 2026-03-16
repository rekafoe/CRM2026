import React from 'react';
import type { Item } from '../../types';
import { usePriceTypeLabels } from '../../hooks/pricing/usePriceTypeLabels';

interface ParameterSummaryItem {
  label: string;
  value: string;
}

interface OrderItemSummaryProps {
  item: Item;
  /** Тип цены заказа (если у позиции нет своего — используем этот) */
  orderPriceType?: string;
  qty: number;
  price: number;
  total: number;
  sides?: number | null;
  waste?: number | null;
  sheetCount: number | null;
  itemsPerSheet: number | null;
  sheetSize: string | null;
  materialFormat: string | null;
  materialTypeDisplay: string | null;
  materialTypeRaw: string | null;
  materialDensity: number | string | null;
  parameterSummary: ParameterSummaryItem[];
}

export const OrderItemSummary: React.FC<OrderItemSummaryProps> = ({
  item,
  orderPriceType,
  qty,
  price,
  total,
  sides,
  waste,
  sheetCount,
  itemsPerSheet,
  sheetSize,
  materialFormat,
  materialTypeDisplay,
  materialTypeRaw,
  materialDensity,
  parameterSummary,
}) => {
  const priceTypeLabels = usePriceTypeLabels();
  const priceTypeKey = item.params?.priceType ?? (item.params as any)?.price_type ?? item.params?.urgency ?? orderPriceType;
  const priceTypeLabel = priceTypeKey ? priceTypeLabels[String(priceTypeKey).toLowerCase()] : undefined;

  return (
    <div className="order-item-horizontal">
      {/* Название товара */}
      <span className="item-name">{item.name || item.params?.productName || item.params?.name || item.type || 'Позиция'}</span>

      {/* Разделитель */}
      <span className="separator">|</span>

      {/* Количество */}
      <span className="item-quantity">{qty.toLocaleString()} шт.</span>

      {/* Разделитель */}
      <span className="separator">|</span>

      {/* Цена за штуку */}
      <span className="item-price">{price.toFixed(2)} BYN</span>

      {/* Разделитель */}
      <span className="separator">|</span>

      {/* Общая стоимость */}
      <span className="item-total">= {total.toFixed(2)} BYN</span>

      {/* Стороны */}
      {typeof sides !== 'undefined' && sides !== null && (
        <>
          <span className="separator">|</span>
          <span className="detail-item">{sides} стор.</span>
        </>
      )}

      {/* Брак */}
      {typeof waste !== 'undefined' && waste !== null && waste > 0 && (
        <>
          <span className="separator">|</span>
          <span className="detail-item">брак: {waste} шт.</span>
        </>
      )}

      {/* Тип цены / срочность — метка из API getPriceTypes() */}
      {priceTypeKey && String(priceTypeKey).toLowerCase() !== 'standard' && (
        <>
          <span className="separator">|</span>
          <span className="detail-item price-type urgency">
            {priceTypeLabel ? `⚡ ${priceTypeLabel.displayLabel}` : `⚡ ${priceTypeKey}`}
          </span>
        </>
      )}

      {/* Тип клиента */}
      {item.params.customerType && item.params.customerType !== 'regular' && (
        <>
          <span className="separator">|</span>
          <span className="detail-item customer">
            👑{' '}
            {item.params.customerType === 'vip'
              ? 'VIP'
              : item.params.customerType === 'wholesale'
              ? 'ОПТ'
              : item.params.customerType}
          </span>
        </>
      )}

      {/* Информация по листам */}
      {sheetCount !== null && (
        <>
          <span className="separator">|</span>
          <span className="detail-item">Листов: {sheetCount}</span>
        </>
      )}
      {itemsPerSheet != null && itemsPerSheet > 0 && (
        <>
          <span className="separator">|</span>
          <span className="detail-item">На листе: {itemsPerSheet}</span>
        </>
      )}
      {sheetSize && (
        <>
          <span className="separator">|</span>
          <span className="detail-item">Формат листа: {sheetSize}</span>
        </>
      )}

      {/* Формат печати */}
      {materialFormat && (
        <>
          <span className="separator">|</span>
          <span className="detail-item">Формат печати: {materialFormat}</span>
        </>
      )}

      {/* Тип материала - показываем display_name из типов бумаги со склада для оператора */}
      {(() => {
        // 🆕 Приоритет: materialTypeDisplay (уже содержит display_name из склада), затем из parameterSummary
        // materialTypeDisplay загружается из склада и содержит транслированное название типа бумаги
        // Это позволяет оператору видеть понятное название (например, "Глянцевая" вместо "glossy")
        const fromWarehouse = materialTypeDisplay; // Уже содержит display_name из склада
        const fromMaterial = parameterSummary.find((p) => p.label === 'Материал')?.value;
        const fromType = parameterSummary.find((p) => p.label === 'Тип материала')?.value;
        
        // 🆕 Показываем "Тип материала" всегда, если есть materialTypeDisplay или materialTypeRaw
        // Это важно для оператора, чтобы он видел тип бумаги (например, "Глянцевая"), даже если "Материал" показывает то же самое
        // Плотности для материалов разных типов могут быть одинаковыми, поэтому нужен именно тип бумаги
        const raw = String(fromWarehouse || fromType || materialTypeRaw || '').trim();
        if (!raw) return null;
        
        // 🆕 Не скрываем тип материала, даже если он совпадает с "Материал"
        // Оператору нужно видеть тип бумаги для правильного выполнения заказа
        return (
          <>
            <span className="separator">|</span>
            <span className="detail-item">Тип: {raw}</span>
          </>
        );
      })()}

      {/* Плотность */}
      {materialDensity && (
        <>
          <span className="separator">|</span>
          <span className="detail-item">Плотность: {materialDensity} г/м²</span>
        </>
      )}

      {/* Материал */}
      {item.params.paperName && (
        <>
          <span className="separator">|</span>
          <span className="detail-item">Материал: {item.params.paperName}</span>
        </>
      )}

      {/* Ламинация */}
      {item.params.lamination && item.params.lamination !== 'none' && (
        <>
          <span className="separator">|</span>
          <span className="detail-item">
            {item.params.lamination === 'matte' ? 'Ламинация: мат' : 
             item.params.lamination === 'glossy' ? 'Ламинация: гл' : 
             `Ламинация: ${item.params.lamination}`}
          </span>
        </>
      )}

      {/* Дополнительные параметры из parameterSummary */}
      {(() => {
        // Параметры, которые нужно показать в основной строке
        const importantParams = parameterSummary.filter((param) => {
          const label = param.label.toLowerCase();
          // Исключаем уже показанные параметры
          return !(
            label === 'материал' ||
            label === 'тип материала' ||
            label === 'плотность бумаги' ||
            label === 'плотность' ||
            label === 'тип продукта' ||
            label === 'тираж' ||
            label === 'стороны печати' ||
            label === 'срок изготовления'
          );
        });

        // Показываем первые 3-4 важных параметра
        const paramsToShow = importantParams.slice(0, 4);
        
        return paramsToShow.map((param) => (
          <React.Fragment key={`${param.label}-${param.value}`}>
            <span className="separator">|</span>
            <span className="detail-item">
              {param.label}: {param.value}
            </span>
          </React.Fragment>
        ));
      })()}
    </div>
  );
};

export default React.memo(OrderItemSummary);


