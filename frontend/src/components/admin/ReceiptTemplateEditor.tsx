import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '../common';
import './ReceiptTemplateEditor.css';

interface ReceiptTemplateEditorProps {
  htmlContent: string;
  onChange: (html: string) => void;
  placeholders: string[];
  templateType: 'receipt' | 'order-blank';
  organizationData: {
    name?: string;
    unp?: string;
    legal_address?: string;
    phone?: string;
    email?: string;
  } | null;
  onSave?: () => void;
  saving?: boolean;
  onClose?: () => void;
}

const SAMPLE_DATA_RECEIPT = {
  companyName: 'ООО «Пример»',
  unp: '193679900',
  legalAddress: 'г. Минск, ул. Примерная, 1',
  phone: '+375 29 123-45-67',
  receiptNumber: '123',
  orderNumber: 'Заказ-456',
  orderDate: '30 января 2025 г.',
  itemsTable: `
    <tr><td>1</td><td>Визитки А6, офсет 300 г</td><td>1000</td><td>0.50</td><td>500.00</td></tr>
    <tr><td>2</td><td>Листовки А4, мелованная 80 г</td><td>500</td><td>1.20</td><td>600.00</td></tr>
    <tr><td>3</td><td>Бланки А4, офсет 80 г</td><td>200</td><td>0.35</td><td>70.00</td></tr>
  `.trim(),
  totalStr: '1 170.00',
  summaryLine: 'Всего наименований 3, на сумму 1 170.00 бел. руб. (одна тысяча сто семьдесят) белорусских рублей 00 копеек',
  manager: 'Менеджер: Иванова М.И.',
};

const SAMPLE_DATA_BLANK = {
  companyName: 'ООО «Пример»',
  unp: '193679900',
  legalAddress: 'г. Минск, ул. Примерная, 1',
  phone: '+375 29 123-45-67',
  receiptNumber: '______',
  orderNumber: '______',
  orderDate: '________________',
  itemsTable: `
    <tr><td>1</td><td></td><td></td><td></td><td></td></tr>
    <tr><td>2</td><td></td><td></td><td></td><td></td></tr>
    <tr><td>3</td><td></td><td></td><td></td><td></td></tr>
    <tr><td>4</td><td></td><td></td><td></td><td></td></tr>
    <tr><td>5</td><td></td><td></td><td></td><td></td></tr>
  `.trim(),
  totalStr: '',
  summaryLine: 'Всего наименований ______, на сумму ________________ бел. руб. _________________________________________',
  manager: 'Менеджер: ________________',
};

const ORDER_BLANK_SAMPLE = {
  companyName: 'ООО «Пример»',
  companyPhone: '+375 29 123-45-67',
  companyAddress: 'г. Минск, ул. Примерная, 1',
  companySchedule: 'Пн–Пт 9:00–18:00',
  orderNumber: 'Заказ-456',
  createdDate: '30.01.2025',
  readyDate: '02.02.2025',
  customerName: 'Иванов Иван Иванович',
  customerPhone: '+375 29 765-43-21',
  cost: '1 170.00',
  prepaymentAmount: '500.00',
  debt: '670.00',
  totalAmount: '1 170.00',
  itemsTable: `
    <tr><td>1</td><td>Визитки А6</td><td>1000</td><td>500.00</td></tr>
    <tr><td>2</td><td>Листовки А4</td><td>500</td><td>600.00</td></tr>
    <tr><td>3</td><td>Бланки А4</td><td>200</td><td>70.00</td></tr>
  `.trim(),
  executedBy: 'Иванова М.И.',
};

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

const DEFAULT_RECEIPT_TEMPLATE = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Товарный чек {{receiptNumber}}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #333; margin: 16px; line-height: 1.35; }
    .header { margin-bottom: 10px; }
    .title { font-size: 13px; font-weight: bold; margin-bottom: 6px; }
    .org { margin-bottom: 2px; }
    .unp { margin-bottom: 8px; color: #555; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { border: 1px solid #333; padding: 4px 6px; text-align: left; }
    th { background: #eee; font-weight: bold; }
    td:nth-child(1) { width: 28px; text-align: center; }
    td:nth-child(3) { width: 80px; text-align: right; }
    td:nth-child(4), td:nth-child(5) { text-align: right; width: 70px; }
    .total { font-weight: bold; margin: 6px 0; }
    .summary { margin: 8px 0; }
    .manager { margin-top: 12px; }
    .sign { margin-top: 24px; font-size: 10px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">Товарный чек № {{receiptNumber}} к заказу № {{orderNumber}} от {{orderDate}}</div>
    <div class="org">Организация {{companyName}}</div>
    <div class="unp">УНП {{unp}}</div>
  </div>
  <table>
    <thead>
      <tr><th>№</th><th>Товар</th><th>Количество</th><th>Цена</th><th>Сумма</th></tr>
    </thead>
    <tbody>{{itemsTable}}</tbody>
  </table>
  <div class="total">Итого: {{totalStr}}</div>
  <div class="summary">{{summaryLine}}</div>
  <div class="manager">{{manager}}</div>
  <div class="sign">(подпись)</div>
</body>
</html>`;

export const ReceiptTemplateEditor: React.FC<ReceiptTemplateEditorProps> = ({
  htmlContent,
  onChange,
  placeholders,
  templateType,
  organizationData,
  onSave,
  saving,
  onClose,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const [previewMode, setPreviewMode] = useState<'filled' | 'blank'>('filled');
  const [activeTab, setActiveTab] = useState<'split' | 'code' | 'preview'>('split');

  const sampleData = templateType === 'receipt'
    ? (previewMode === 'filled' ? SAMPLE_DATA_RECEIPT : SAMPLE_DATA_BLANK)
    : ORDER_BLANK_SAMPLE;

  const orgData = organizationData || {};
  const subs = useMemo((): Record<string, string> => {
    if (templateType === 'receipt') {
      const sd = previewMode === 'filled' ? SAMPLE_DATA_RECEIPT : SAMPLE_DATA_BLANK;
      return {
        companyName: escapeHtml(orgData.name || sd.companyName),
        unp: escapeHtml(orgData.unp || sd.unp),
        legalAddress: escapeHtml(orgData.legal_address || sd.legalAddress),
        phone: escapeHtml(orgData.phone || sd.phone),
        receiptNumber: sd.receiptNumber,
        orderNumber: sd.orderNumber,
        orderDate: sd.orderDate,
        itemsTable: sd.itemsTable,
        totalStr: sd.totalStr,
        summaryLine: sd.summaryLine,
        manager: sd.manager,
      };
    }
    const ob = ORDER_BLANK_SAMPLE;
    return {
      companyName: escapeHtml(orgData.name || ob.companyName),
      companyPhone: escapeHtml(orgData.phone || ob.companyPhone),
      companyAddress: escapeHtml(orgData.legal_address || ob.companyAddress),
      companySchedule: ob.companySchedule,
      orderNumber: ob.orderNumber,
      createdDate: ob.createdDate,
      readyDate: ob.readyDate,
      customerName: ob.customerName,
      customerPhone: ob.customerPhone,
      cost: ob.cost,
      prepaymentAmount: ob.prepaymentAmount,
      debt: ob.debt,
      totalAmount: ob.totalAmount,
      itemsTable: ob.itemsTable,
      executedBy: ob.executedBy,
    };
  }, [templateType, orgData.name, orgData.unp, orgData.legal_address, orgData.phone, previewMode]);

  const htmlForPreview = useMemo(() => {
    let out = htmlContent;
    for (const [key, val] of Object.entries(subs)) {
      const ph = `{{${key}}}`;
      out = out.split(ph).join(val);
    }
    return out;
  }, [htmlContent, subs]);

  useEffect(() => {
    const iframe = previewRef.current;
    if (!iframe?.contentDocument) return;
    iframe.contentDocument.open();
    iframe.contentDocument.write(htmlForPreview);
    iframe.contentDocument.close();
  }, [htmlForPreview]);

  const insertPlaceholder = (ph: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = htmlContent.slice(0, start);
    const after = htmlContent.slice(end);
    const next = before + ph + after;
    onChange(next);
    setTimeout(() => {
      ta.focus();
      const pos = start + ph.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  };

  return (
    <div className="receipt-template-editor-v2">
      <div className="rte-toolbar">
        <div className="rte-toolbar-left">
          <span className="rte-tabs">
            <button
              type="button"
              className={activeTab === 'split' ? 'active' : ''}
              onClick={() => setActiveTab('split')}
            >
              Раздельно
            </button>
            <button
              type="button"
              className={activeTab === 'code' ? 'active' : ''}
              onClick={() => setActiveTab('code')}
            >
              Код
            </button>
            <button
              type="button"
              className={activeTab === 'preview' ? 'active' : ''}
              onClick={() => setActiveTab('preview')}
            >
              Превью
            </button>
          </span>
          {templateType === 'receipt' && (
            <span className="rte-preview-mode">
              <label>
                <input
                  type="radio"
                  checked={previewMode === 'filled'}
                  onChange={() => setPreviewMode('filled')}
                />
                Заполненный
              </label>
              <label>
                <input
                  type="radio"
                  checked={previewMode === 'blank'}
                  onChange={() => setPreviewMode('blank')}
                />
                Бланк
              </label>
            </span>
          )}
        </div>
        <div className="rte-toolbar-right">
          {!htmlContent.trim() && templateType === 'receipt' && (
            <button
              type="button"
              className="rte-ph-btn rte-load-default"
              onClick={() => onChange(DEFAULT_RECEIPT_TEMPLATE)}
              title="Загрузить шаблон по умолчанию"
            >
              📄 Шаблон по умолчанию
            </button>
          )}
          {placeholders.map((ph) => (
            <button
              key={ph}
              type="button"
              className="rte-ph-btn"
              onClick={() => insertPlaceholder(ph)}
              title={`Вставить ${ph}`}
            >
              {ph}
            </button>
          ))}
        </div>
      </div>

      <div className={`rte-body rte-${activeTab}`}>
        <div className={`rte-editor-pane ${activeTab === 'preview' ? 'hidden' : ''}`}>
          <textarea
            ref={textareaRef}
            value={htmlContent}
            onChange={(e) => onChange(e.target.value)}
            className="rte-textarea"
            spellCheck={false}
            placeholder="<!DOCTYPE html>..."
          />
        </div>
        <div className={`rte-preview-pane ${activeTab === 'code' ? 'hidden' : ''}`}>
          <iframe
            ref={previewRef}
            title="Превью шаблона"
            className="rte-preview-iframe"
            sandbox="allow-same-origin"
          />
        </div>
      </div>

      <div className="rte-actions">
        {onSave && (
          <Button onClick={onSave} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить шаблон'}
          </Button>
        )}
        {onClose && (
          <Button variant="secondary" onClick={onClose}>
            Закрыть
          </Button>
        )}
      </div>
    </div>
  );
};
