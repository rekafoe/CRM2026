import React from 'react';
import type { Item } from '../../types';
import { BynSymbol } from '../ui/BynSymbol';
import {
  formatMaterialQty,
  formatPrintCaptionLine,
  formatPrintOperationCaption,
  formatServiceQty,
  humanReadablePaperLabel,
  isPrintCostRow,
  materialRowTotal,
  printSidesPhraseFromSpecs,
  serviceRowTotal,
  type OrderItemMaterialRow,
  type OrderItemServiceRow,
} from './orderItemBreakdownUtils';

export type OrderItemBreakdownFooter = {
  unitPrice: number;
  total: number;
  sides?: number | null;
  waste?: number | null;
};

interface Props {
  item: Item;
  /** Продукт / формат / количество — над таблицей */
  header?: {
    productName: string;
    formatText: string;
    quantityText: string;
  };
  /** Исполнитель / принтер — в той же панели, что и продукт/формат/количество */
  assignBar?: React.ReactNode;
  /** Редактировать / удалить — в той же панели */
  tableActions?: React.ReactNode;
  /** Итого и цена за единицу — строка под таблицей */
  footer?: OrderItemBreakdownFooter;
}

const money = (n: number) => (
  <>
    {n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <BynSymbol />
  </>
);

type SummaryRow = { label: string; value: string };

/** Строка материала: человекочитаемый тип бумаги из сводки / paper_type_name; для позиции 0 — префикс сторон и плотности. */
function materialDisplayName(
  m: OrderItemMaterialRow,
  specs: Record<string, unknown>,
  originalIndexInMaterials: number,
  parameterSummary: SummaryRow[]
): string {
  const summaryForRow =
    originalIndexInMaterials === 0 ? parameterSummary : ([] as SummaryRow[]);
  const base = humanReadablePaperLabel(m, summaryForRow);
  if (originalIndexInMaterials > 0) return base;

  const density = specs.paperDensity ?? m.density;
  const densityPart =
    typeof density === 'number' && Number.isFinite(density) ? `${density} г/м²` : '';
  return formatPrintCaptionLine(printSidesPhraseFromSpecs(specs), base, densityPart);
}

/**
 * Вложенная таблица по позиции заказа: материалы и услуги из калькулятора (params.materials / params.services).
 */
export const OrderItemPositionBreakdown: React.FC<Props> = ({
  item,
  header,
  assignBar,
  tableActions,
  footer,
}) => {
  const params = item.params as unknown as Record<string, unknown>;
  const materials = Array.isArray(params.materials)
    ? (params.materials as OrderItemMaterialRow[])
    : [];
  const services = Array.isArray(params.services) ? (params.services as OrderItemServiceRow[]) : [];

  const printServices = services.filter(isPrintCostRow);
  const otherServices = services.filter((s) => !isPrintCostRow(s));

  /** Бумага для печати уже описана в подписи строки «Печать» — отдельную первую строку не показываем. */
  const foldPaperMaterialIntoPrint =
    printServices.length > 0 && materials.length > 0;
  const paperMaterialRow = foldPaperMaterialIntoPrint ? materials[0] : undefined;
  const foldedPaperCost = paperMaterialRow ? materialRowTotal(paperMaterialRow) : 0;
  const materialsAfterPaper = foldPaperMaterialIntoPrint ? materials.slice(1) : materials;

  const showMaterialsAndPrint =
    materialsAfterPaper.length > 0 || printServices.length > 0;
  const showOtherServices = otherServices.length > 0;

  if (!showMaterialsAndPrint && !showOtherServices) return null;

  const parameterSummary = Array.isArray(params.parameterSummary)
    ? (params.parameterSummary as SummaryRow[])
    : [];

  const specs = (params.specifications as Record<string, unknown>) || {};

  return (
    <div
      className="order-item-position-breakdown"
      role="region"
      aria-label="Детализация стоимости позиции"
    >
      <div className="order-item-position-breakdown__card order-item-position-breakdown__card--compact">
        {header || assignBar || tableActions ? (
          <div
            className="order-item-breakdown-meta order-item-breakdown-meta--grid"
            aria-label="Позиция заказа"
          >
            <div className="order-item-breakdown-meta__col order-item-breakdown-meta__col--product">
              {header ? (
                <>
                  <div className="order-item-breakdown-meta__row">
                    <span className="order-item-breakdown-meta__label">Продукт</span>
                    <span className="order-item-breakdown-meta__value">{header.productName}</span>
                  </div>
                  <div className="order-item-breakdown-meta__row">
                    <span className="order-item-breakdown-meta__label">Формат</span>
                    <span className="order-item-breakdown-meta__value">
                      {header.formatText.trim() ? header.formatText : '—'}
                    </span>
                  </div>
                  <div className="order-item-breakdown-meta__row">
                    <span className="order-item-breakdown-meta__label">Количество</span>
                    <span className="order-item-breakdown-meta__value">{header.quantityText}</span>
                  </div>
                </>
              ) : null}
            </div>
            <div className="order-item-breakdown-meta__col order-item-breakdown-meta__col--assign">
              {assignBar}
            </div>
            <div className="order-item-breakdown-meta__col order-item-breakdown-meta__col--actions">
              {tableActions}
            </div>
          </div>
        ) : null}
        <table className="order-item-position-breakdown__table">
          <thead>
            <tr className="order-item-position-breakdown__colheads">
              <th scope="col">Наименование</th>
              <th scope="col">Количество</th>
              <th scope="col">Сумма</th>
            </tr>
          </thead>
          <tbody className="order-item-position-breakdown__tbody">
              {materialsAfterPaper.map((m, i) => {
                const originalIndex = i + (foldPaperMaterialIntoPrint ? 1 : 0);
                return (
                  <tr key={`m-${m.materialId ?? originalIndex}`}>
                    <td>
                      {materialDisplayName(m, specs, originalIndex, parameterSummary)}
                    </td>
                    <td>{formatMaterialQty(m)}</td>
                    <td>{money(materialRowTotal(m))}</td>
                  </tr>
                );
              })}
              {printServices.map((s, i) => {
                const printOnly = serviceRowTotal(s);
                const rowTotal =
                  i === 0 ? printOnly + foldedPaperCost : printOnly;
                const caption = formatPrintOperationCaption(
                  specs,
                  materials,
                  parameterSummary
                );
                return (
                  <tr key={`p-${s.operationId ?? i}`}>
                    <td>{caption}</td>
                    <td>{formatServiceQty(s)}</td>
                    <td>{money(rowTotal)}</td>
                  </tr>
                );
              })}
              {otherServices.map((s, i) => (
                <tr key={`s-${s.operationId ?? i}`}>
                  <td>{String(s.operationName || s.service || 'Услуга').trim()}</td>
                  <td>{formatServiceQty(s)}</td>
                  <td>{money(serviceRowTotal(s))}</td>
                </tr>
              ))}
          </tbody>
          {footer ? (
            <tfoot className="order-item-position-breakdown__tfoot">
              <tr>
                <td colSpan={3} className="order-item-position-breakdown__total-cell">
                  <span className="order-item-position-breakdown__total-line">
                    <span>
                      Итого:{' '}
                      <span className="order-item-position-breakdown__total-sum">{money(footer.total)}</span>
                    </span>
                    <span className="order-item-position-breakdown__total-sep" aria-hidden>
                      {' '}
                      ·{' '}
                    </span>
                    <span>
                      За 1 ед.: {money(footer.unitPrice)}
                    </span>
                    {typeof footer.sides === 'number' && footer.sides > 1 ? (
                      <>
                        <span className="order-item-position-breakdown__total-sep" aria-hidden>
                          {' '}
                          ·{' '}
                        </span>
                        <span>{footer.sides} стор.</span>
                      </>
                    ) : null}
                    {typeof footer.waste === 'number' && footer.waste > 0 ? (
                      <>
                        <span className="order-item-position-breakdown__total-sep" aria-hidden>
                          {' '}
                          ·{' '}
                        </span>
                        <span>брак: {footer.waste} шт.</span>
                      </>
                    ) : null}
                  </span>
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
};
