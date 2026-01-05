import React, { useState, useMemo, useCallback } from 'react';
import { Button, FormField, StatusBadge } from '../../../common';
import { api } from '../../../../api';
import { numberInputFromString, numberInputToNullable, type NumberInputValue } from '../../../../utils/numberInput';
import type { PrinterRow, PrintTechnology, PricingMode } from '../types';

interface PrintersTabProps {
  printers: PrinterRow[];
  printTechnologies: PrintTechnology[];
  loading: boolean;
  onLoadData: () => Promise<void>;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
  getPricingModeForTech: (techCode?: string | null) => PricingMode | null;
}

type PrinterFormState = Omit<Partial<PrinterRow>, 'max_width_mm'> & {
  max_width_mm?: NumberInputValue | null;
};

const PrintersTabComponent: React.FC<PrintersTabProps> = ({
  printers,
  printTechnologies,
  loading,
  onLoadData,
  onError,
  onSuccess,
  getPricingModeForTech,
}) => {
  const [printerForm, setPrinterForm] = useState<PrinterFormState>({ counter_unit: 'sheets', is_active: 1 });
  const [newPrinterForm, setNewPrinterForm] = useState<PrinterFormState>({
    counter_unit: 'sheets',
    is_active: 1,
    color_mode: 'both',
    printer_class: 'office'
  });
  const [editingPrinterId, setEditingPrinterId] = useState<number | null>(null);

  const techOptions = useMemo(
    () => printTechnologies.filter((t) => t.is_active !== 0),
    [printTechnologies]
  );

  const startEditPrinter = useCallback((printer: PrinterRow) => {
    setEditingPrinterId(printer.id);
    setPrinterForm({
      ...printer,
      max_width_mm: printer.max_width_mm ?? null,
      color_mode: printer.color_mode || 'both',
      printer_class: printer.printer_class || 'office',
    });
  }, []);

  const cancelEditPrinter = useCallback(() => {
    setEditingPrinterId(null);
    setPrinterForm({ counter_unit: 'sheets', is_active: 1 });
  }, []);

  const savePrinter = useCallback(async () => {
    if (!editingPrinterId) return;
    try {
      await api.put(`/printers/${editingPrinterId}`, {
        code: printerForm.code,
        name: printerForm.name,
        technology_code: printerForm.technology_code,
        counter_unit: printerForm.counter_unit,
        max_width_mm: numberInputToNullable((printerForm.max_width_mm ?? '') as NumberInputValue),
        color_mode: printerForm.color_mode,
        printer_class: printerForm.printer_class,
        is_active: printerForm.is_active,
      });
      await onLoadData();
      cancelEditPrinter();
      onSuccess('Принтер сохранён');
    } catch (error) {
      onError('Ошибка сохранения принтера');
      console.error('Error saving printer:', error);
    }
  }, [editingPrinterId, printerForm, onLoadData, onError, onSuccess]);

  const createPrinter = useCallback(async () => {
    if (!newPrinterForm.code || !newPrinterForm.name) {
      onError('Укажите код и название принтера');
      return;
    }
    try {
      await api.post('/printers', {
        code: newPrinterForm.code,
        name: newPrinterForm.name,
        technology_code: newPrinterForm.technology_code,
        counter_unit: newPrinterForm.counter_unit,
        max_width_mm: numberInputToNullable((newPrinterForm.max_width_mm ?? '') as NumberInputValue),
        color_mode: newPrinterForm.color_mode,
        printer_class: newPrinterForm.printer_class,
        is_active: newPrinterForm.is_active,
      });
      setNewPrinterForm({ counter_unit: 'sheets', is_active: 1, color_mode: 'both', printer_class: 'office' });
      await onLoadData();
      onSuccess('Принтер добавлен');
    } catch (error) {
      onError('Ошибка добавления принтера');
      console.error('Error creating printer:', error);
    }
  }, [newPrinterForm, onLoadData, onError, onSuccess]);

  return (
    <div className="pricing-section">
      <div className="section-header">
        <h3>Принтеры</h3>
        <p>Оборудование для аналитики и счётчиков. Цены печати задаются только во вкладке "Цены печати".</p>
      </div>

      <div className="data-card">
        <div className="card-header">
          <div className="card-title">
            <h4>Добавить принтер</h4>
          </div>
          <div className="card-actions">
            <Button variant="primary" size="sm" onClick={createPrinter} loading={loading}>
              Создать
            </Button>
          </div>
        </div>
        <div className="card-content">
          <div className="field-group">
            <FormField label="Код">
              <input
                className="form-control"
                value={newPrinterForm.code || ''}
                onChange={(e) => setNewPrinterForm({ ...newPrinterForm, code: e.target.value })}
                placeholder="C83hc"
              />
            </FormField>
            <FormField label="Название">
              <input
                className="form-control"
                value={newPrinterForm.name || ''}
                onChange={(e) => setNewPrinterForm({ ...newPrinterForm, name: e.target.value })}
                placeholder="Konica AccurioPress C83hc"
              />
            </FormField>
            <FormField label="Тип печати">
              <select
                className="form-control"
                value={newPrinterForm.technology_code || ''}
                onChange={(e) => setNewPrinterForm({ ...newPrinterForm, technology_code: e.target.value || undefined })}
              >
                <option value="">Не выбран</option>
                {techOptions.map((t) => (
                  <option key={t.code} value={t.code}>{t.name}</option>
                ))}
              </select>
            </FormField>
            {/* Цены печати задаются в отдельной вкладке "Цены печати" (print_prices) */}
            <FormField label="Ед. счётчика">
              <select
                className="form-control"
                value={newPrinterForm.counter_unit || 'sheets'}
                onChange={(e) => setNewPrinterForm({ ...newPrinterForm, counter_unit: e.target.value as 'sheets' | 'meters' })}
              >
                <option value="sheets">Листы</option>
                <option value="meters">Погонные метры</option>
              </select>
            </FormField>
            <FormField label="Цветность">
              <select
                className="form-control"
                value={newPrinterForm.color_mode || 'both'}
                onChange={(e) => setNewPrinterForm({ ...newPrinterForm, color_mode: e.target.value as any })}
              >
                <option value="both">Цвет+Ч/Б</option>
                <option value="color">Только цвет</option>
                <option value="bw">Только Ч/Б</option>
              </select>
            </FormField>
            <FormField label="Класс">
              <select
                className="form-control"
                value={newPrinterForm.printer_class || 'office'}
                onChange={(e) => setNewPrinterForm({ ...newPrinterForm, printer_class: e.target.value as any })}
              >
                <option value="office">Офисный</option>
                <option value="pro">Профессиональный</option>
              </select>
            </FormField>
            <FormField label="Макс. ширина, мм (для ШФП)">
              <input
                type="number"
                className="form-control"
                value={(newPrinterForm.max_width_mm ?? '') as any}
                onChange={(e) => setNewPrinterForm({ ...newPrinterForm, max_width_mm: numberInputFromString(e.target.value) })}
              />
            </FormField>
            <FormField label="Активность">
              <select
                className="form-control"
                value={(newPrinterForm.is_active ?? 1) ? 1 : 0}
                onChange={(e) => setNewPrinterForm({ ...newPrinterForm, is_active: Number(e.target.value) })}
              >
                <option value={1}>Активен</option>
                <option value={0}>Выключен</option>
              </select>
            </FormField>
          </div>
        </div>
      </div>

      <div className="data-grid">
        {printers.map((printer) => (
          <div key={printer.id} className="data-card">
            <div className="card-header">
              <div className="card-title">
                <h4>{printer.name}</h4>
                <StatusBadge status={printer.is_active ? 'active' : 'inactive'} />
              </div>
              {editingPrinterId === printer.id ? (
                <div className="card-actions">
                  <Button variant="success" size="sm" onClick={savePrinter} loading={loading}>
                    Сохранить
                  </Button>
                  <Button variant="secondary" size="sm" onClick={cancelEditPrinter}>
                    Отмена
                  </Button>
                </div>
              ) : (
                <Button variant="primary" size="sm" onClick={() => startEditPrinter(printer)}>
                  Изменить
                </Button>
              )}
            </div>
            <div className="card-content">
              {editingPrinterId === printer.id ? (
                <div className="field-group">
                  <FormField label="Код">
                    <input
                      className="form-control"
                      value={printerForm.code || ''}
                      onChange={(e) => setPrinterForm({ ...printerForm, code: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Название">
                    <input
                      className="form-control"
                      value={printerForm.name || ''}
                      onChange={(e) => setPrinterForm({ ...printerForm, name: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Тип печати">
                    <select
                      className="form-control"
                      value={printerForm.technology_code || ''}
                      onChange={(e) => setPrinterForm({ ...printerForm, technology_code: e.target.value || undefined })}
                    >
                      <option value="">Не выбран</option>
                      {techOptions.map((t) => (
                        <option key={t.code} value={t.code}>{t.name}</option>
                      ))}
                    </select>
                  </FormField>
                {/* Цены печати задаются в отдельной вкладке "Цены печати" (print_prices) */}
                  <FormField label="Ед. счётчика">
                    <select
                      className="form-control"
                      value={printerForm.counter_unit || 'sheets'}
                      onChange={(e) => setPrinterForm({ ...printerForm, counter_unit: e.target.value as 'sheets' | 'meters' })}
                    >
                      <option value="sheets">Листы</option>
                      <option value="meters">Погонные метры</option>
                    </select>
                  </FormField>
                  <FormField label="Цветность">
                    <select
                      className="form-control"
                      value={printerForm.color_mode || 'both'}
                      onChange={(e) => setPrinterForm({ ...printerForm, color_mode: e.target.value as any })}
                    >
                      <option value="both">Цвет+Ч/Б</option>
                      <option value="color">Только цвет</option>
                      <option value="bw">Только Ч/Б</option>
                    </select>
                  </FormField>
                  <FormField label="Класс">
                    <select
                      className="form-control"
                      value={printerForm.printer_class || 'office'}
                      onChange={(e) => setPrinterForm({ ...printerForm, printer_class: e.target.value as any })}
                    >
                      <option value="office">Офисный</option>
                      <option value="pro">Профессиональный</option>
                    </select>
                  </FormField>
                  <FormField label="Макс. ширина, мм">
                    <input
                      type="number"
                      className="form-control"
                      value={(printerForm.max_width_mm ?? '') as any}
                      onChange={(e) => setPrinterForm({ ...printerForm, max_width_mm: numberInputFromString(e.target.value) })}
                    />
                  </FormField>
                  <FormField label="Активность">
                    <select
                      className="form-control"
                      value={(printerForm.is_active ?? printer.is_active ?? 1) ? 1 : 0}
                      onChange={(e) => setPrinterForm({ ...printerForm, is_active: Number(e.target.value) })}
                    >
                      <option value={1}>Активен</option>
                      <option value={0}>Выключен</option>
                    </select>
                  </FormField>
                </div>
              ) : (
                <div className="field-group">
                  <FormField label="Тип печати">
                    <span className="field-value">
                      {printer.technology_code
                        ? techOptions.find((t) => t.code === printer.technology_code)?.name || printer.technology_code
                        : '—'}
                    </span>
                  </FormField>
                  <FormField label="Цветность">
                    <span className="field-value">
                      {printer.color_mode === 'bw' ? 'Ч/Б' : printer.color_mode === 'color' ? 'Цветной' : 'Цвет+Ч/Б'}
                    </span>
                  </FormField>
                  <FormField label="Класс">
                    <span className="field-value">
                      {printer.printer_class === 'pro' ? 'Профессиональный' : 'Офисный'}
                    </span>
                  </FormField>
                  <FormField label="Себестоимость печати">
                    <span className="field-value">
                      {techOptions.find((t) => t.code === printer.technology_code)?.pricing_mode === 'per_meter'
                        ? (printer.price_per_meter == null ? '—' : `${Number(printer.price_per_meter).toFixed(2)} BYN/м`)
                        : `${printer.price_single == null ? '—' : `${Number(printer.price_single).toFixed(2)} BYN/лист`}${printer.price_duplex == null ? '' : `, 2 стор: ${Number(printer.price_duplex).toFixed(2)}`}`}
                    </span>
                  </FormField>
                  <FormField label="Ед. счётчика">
                    <span className="field-value">
                      {printer.counter_unit === 'meters' ? 'Погонные метры' : 'Листы'}
                    </span>
                  </FormField>
                  <FormField label="Макс. ширина, мм">
                    <span className="field-value">{printer.max_width_mm ?? '—'}</span>
                  </FormField>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const PrintersTab = React.memo(PrintersTabComponent);
PrintersTab.displayName = 'PrintersTab';

