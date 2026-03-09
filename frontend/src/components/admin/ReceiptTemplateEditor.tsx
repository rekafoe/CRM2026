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
    logo_url?: string;
  } | null;
  onSave?: () => void;
  saving?: boolean;
  onClose?: () => void;
  /** Загрузка/удаление логотипа организации (обновляет организацию в БД) */
  onLogoChange?: (logoUrl: string | null) => Promise<void>;
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
    {{logo}}
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

const DEFAULT_ORDER_BLANK_TEMPLATE = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Бланк заказа {{orderNumber}}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #333; margin: 16px; line-height: 1.35; }
    .header { margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #333; }
    .company { font-weight: bold; font-size: 13px; margin-bottom: 4px; }
    .contact { font-size: 10px; color: #555; margin-bottom: 2px; }
    .order-info { display: flex; gap: 24px; margin: 12px 0; padding: 8px; background: #f5f5f5; border-radius: 4px; }
    .order-info div { flex: 1; }
    .order-info label { font-size: 9px; color: #555; display: block; }
    .order-info span { font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { border: 1px solid #333; padding: 4px 6px; text-align: left; }
    th { background: #eee; font-weight: bold; }
    .totals { margin-top: 12px; }
    .totals div { margin: 4px 0; }
    .executed { margin-top: 16px; }

  </style>
</head>
<body>
  <div class="header">
    {{logo}}
    <div class="company">{{companyName}}</div>
    <div class="contact">Тел.: {{companyPhone}}</div>
    <div class="contact">Адрес: {{companyAddress}}</div>
    <div class="contact">Режим работы: {{companySchedule}}</div>
  </div>
  <div class="order-info">
    <div><label>Дата создания</label><span>{{createdDate}}</span></div>
    <div><label>Дата готовности</label><span>{{readyDate}}</span></div>
    <div><label>Заказ №</label><span>{{orderNumber}}</span></div>
    <div><label>Клиент</label><span>{{customerName}}</span></div>
    <div><label>Телефон</label><span>{{customerPhone}}</span></div>
  </div>
  <table>
    <thead>
      <tr><th>№</th><th>Наименование</th><th>Кол-во</th><th>Сумма</th></tr>
    </thead>
    <tbody>{{itemsTable}}</tbody>
  </table>
  <div class="totals">
    <div>Стоимость: {{cost}}</div>
    <div>Предоплата: {{prepaymentAmount}}</div>
    <div>К оплате: {{debt}}</div>
    <div><strong>Итого: {{totalAmount}}</strong></div>
  </div>
  <div class="executed">Выполнил: {{executedBy}}</div>
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
  onLogoChange,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewMode, setPreviewMode] = useState<'filled' | 'blank'>('filled');
  const [activeTab, setActiveTab] = useState<'split' | 'code' | 'preview'>('split');
  const [logoUploading, setLogoUploading] = useState(false);

  const sampleData = templateType === 'receipt'
    ? (previewMode === 'filled' ? SAMPLE_DATA_RECEIPT : SAMPLE_DATA_BLANK)
    : ORDER_BLANK_SAMPLE;

  const orgData = organizationData || {};
  const subs = useMemo((): Record<string, string> => {
    const logoImg = orgData.logo_url && (orgData.logo_url.startsWith('data:') || orgData.logo_url.startsWith('http'))
      ? `<img src="${orgData.logo_url.replace(/"/g, '&quot;')}" alt="Logo" style="max-width:150px;max-height:60px;object-fit:contain;margin-bottom:8px;" />`
      : '';
    if (templateType === 'receipt') {
      const sd = previewMode === 'filled' ? SAMPLE_DATA_RECEIPT : SAMPLE_DATA_BLANK;
      return {
        logo: logoImg,
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
      logo: logoImg,
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
  }, [templateType, orgData.name, orgData.unp, orgData.legal_address, orgData.phone, orgData.logo_url, previewMode]);

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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onLogoChange) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setLogoUploading(true);
        await onLogoChange(reader.result as string);
      } finally {
        setLogoUploading(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleLogoRemove = async () => {
    if (!onLogoChange) return;
    try {
      setLogoUploading(true);
      await onLogoChange(null);
    } finally {
      setLogoUploading(false);
    }
  };

  return (
    <div className="receipt-template-editor-v2">
      {organizationData && onLogoChange && (
        <div className="rte-logo-block">
          <div className="rte-logo-preview">
            {orgData.logo_url ? (
              <img src={orgData.logo_url} alt="Логотип" />
            ) : (
              <span className="rte-logo-placeholder">Нет логотипа</span>
            )}
          </div>
          <div className="rte-logo-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
              onChange={handleLogoUpload}
              style={{ display: 'none' }}
            />
            <button type="button" className="rte-ph-btn" onClick={() => fileInputRef.current?.click()} disabled={logoUploading}>
              {logoUploading ? 'Загрузка…' : '📷 Загрузить логотип'}
            </button>
            {orgData.logo_url && (
              <button type="button" className="rte-ph-btn" onClick={handleLogoRemove} disabled={logoUploading}>
                Удалить
              </button>
            )}
            <span className="rte-logo-hint">В шаблоне вставьте плейсхолдер {'{{logo}}'}</span>
          </div>
        </div>
      )}
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
          {!htmlContent.trim() && (
            <button
              type="button"
              className="rte-ph-btn rte-load-default"
              onClick={() => onChange(templateType === 'receipt' ? DEFAULT_RECEIPT_TEMPLATE : DEFAULT_ORDER_BLANK_TEMPLATE)}
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
