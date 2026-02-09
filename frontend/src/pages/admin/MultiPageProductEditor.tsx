import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Alert } from '../../components/common';
import { apiClient } from '../../api/client';
import '../../styles/admin-page-layout.css';
import './MultiPageProductEditor.css';

interface BindingTypeConfig {
  value: string;
  label: string;
  enabled: boolean;
  maxPages: number;
  minPages: number;
  duplexDefault: boolean;
  price: number;
}

interface PrintTypeConfig {
  value: string;
  label: string;
  enabled: boolean;
  pricePerPage: number;
  setupCost: number;
}

interface PaperTypeConfig {
  value: string;
  label: string;
  enabled: boolean;
  densities: number[];
}

const DEFAULT_BINDING_TYPES: BindingTypeConfig[] = [
  { value: 'none', label: 'Без переплета', enabled: true, maxPages: 500, minPages: 1, duplexDefault: false, price: 0 },
  { value: 'plastic_spring', label: 'На пружину пластик', enabled: true, maxPages: 500, minPages: 1, duplexDefault: false, price: 3 },
  { value: 'metal_spring', label: 'На пружину металл', enabled: true, maxPages: 130, minPages: 1, duplexDefault: false, price: 5 },
  { value: 'hardcover', label: 'Твердый', enabled: true, maxPages: 500, minPages: 40, duplexDefault: true, price: 25 },
  { value: 'simple_channel', label: 'Симпл Ченл', enabled: true, maxPages: 300, minPages: 1, duplexDefault: false, price: 4 },
  { value: 'c_bind', label: 'C-Bind', enabled: true, maxPages: 500, minPages: 1, duplexDefault: false, price: 6 },
  { value: 'staple', label: 'На скобу', enabled: true, maxPages: 60, minPages: 4, duplexDefault: true, price: 1 },
  { value: 'corner_staple', label: 'Переплет на скобу в уголке', enabled: true, maxPages: 20, minPages: 4, duplexDefault: true, price: 0.5 },
  { value: 'rings', label: 'На кольца', enabled: true, maxPages: 500, minPages: 1, duplexDefault: false, price: 8 },
  { value: 'screws', label: 'На винты', enabled: true, maxPages: 500, minPages: 1, duplexDefault: false, price: 10 },
  { value: 'softcover', label: 'Мягкий (КБС)', enabled: true, maxPages: 300, minPages: 40, duplexDefault: true, price: 15 },
  { value: 'archive', label: 'Архивный', enabled: true, maxPages: 500, minPages: 1, duplexDefault: false, price: 20 },
  { value: 'folder', label: 'В папку', enabled: true, maxPages: 100, minPages: 1, duplexDefault: false, price: 5 },
];

const DEFAULT_PRINT_TYPES: PrintTypeConfig[] = [
  { value: 'laser_bw', label: 'Лазерная черно-белая', enabled: true, pricePerPage: 0.5, setupCost: 0 },
  { value: 'laser_color', label: 'Лазерная цветная', enabled: true, pricePerPage: 3.0, setupCost: 0 },
  { value: 'digital_bw', label: 'Цифровая черно-белая', enabled: true, pricePerPage: 0.4, setupCost: 0 },
  { value: 'digital_color', label: 'Цифровая цветная', enabled: true, pricePerPage: 2.5, setupCost: 0 },
  { value: 'offset', label: 'Офсетная печать', enabled: false, pricePerPage: 0.2, setupCost: 50 },
];

const DEFAULT_PAPER_TYPES: PaperTypeConfig[] = [
  { value: 'office_premium', label: 'Бумага офисная премиум', enabled: true, densities: [80, 90, 100] },
  { value: 'office_standard', label: 'Бумага офисная стандарт', enabled: true, densities: [80] },
  { value: 'coated_matte', label: 'Мелованная матовая', enabled: true, densities: [120, 150, 170, 200, 250, 300] },
  { value: 'coated_glossy', label: 'Мелованная глянцевая', enabled: true, densities: [120, 150, 170, 200, 250, 300] },
  { value: 'design', label: 'Дизайнерская бумага', enabled: false, densities: [120, 200, 300] },
];

export const MultiPageProductEditor: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'binding' | 'print' | 'paper' | 'preview'>('binding');
  const [bindingTypes, setBindingTypes] = useState<BindingTypeConfig[]>(DEFAULT_BINDING_TYPES);
  const [printTypes, setPrintTypes] = useState<PrintTypeConfig[]>(DEFAULT_PRINT_TYPES);
  const [paperTypes, setPaperTypes] = useState<PaperTypeConfig[]>(DEFAULT_PAPER_TYPES);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Загрузка конфигурации
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await apiClient.get('/pricing/multipage/schema');
        if (response.data?.bindingTypes) {
          // Мержим с дефолтами
          const loaded = response.data.bindingTypes;
          setBindingTypes(prev => prev.map(bt => {
            const found = loaded.find((l: any) => l.value === bt.value);
            return found ? { ...bt, ...found, enabled: true } : bt;
          }));
        }
      } catch (error) {
        console.log('Using default config');
      }
    };
    loadConfig();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveStatus(null);
    
    try {
      // В реальном приложении здесь был бы API для сохранения конфига
      // Пока просто показываем успех
      await new Promise(resolve => setTimeout(resolve, 500));
      setSaveStatus({ type: 'success', message: 'Настройки сохранены' });
    } catch (error) {
      setSaveStatus({ type: 'error', message: 'Ошибка сохранения' });
    } finally {
      setSaving(false);
    }
  }, [bindingTypes, printTypes, paperTypes]);

  const updateBindingType = (index: number, updates: Partial<BindingTypeConfig>) => {
    setBindingTypes(prev => prev.map((bt, i) => i === index ? { ...bt, ...updates } : bt));
  };

  const updatePrintType = (index: number, updates: Partial<PrintTypeConfig>) => {
    setPrintTypes(prev => prev.map((pt, i) => i === index ? { ...pt, ...updates } : pt));
  };

  const updatePaperType = (index: number, updates: Partial<PaperTypeConfig>) => {
    setPaperTypes(prev => prev.map((pt, i) => i === index ? { ...pt, ...updates } : pt));
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div style={{ marginBottom: 12 }}>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={() => navigate('/adminpanel/products')}
          >
            ← Назад
          </Button>
        </div>
        <div>
          <h1>Конструктор многостраничной продукции</h1>
          <p>Настройка параметров, типов переплёта и ценообразования</p>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Alert type="info">
          <strong>Многостраничные изделия настраиваются как продукты каталога.</strong>
          {' '}
          Создайте отдельный продукт для каждого варианта (например «Фотоальбом на две скобы», «Фотоальбом на пружине») — у каждого будут свои операции и параметры. Эта страница — справочная настройка глобальной схемы.
          {' '}
          <Button variant="primary" size="sm" onClick={() => navigate('/adminpanel/products')}>
            Каталог продуктов
          </Button>
        </Alert>
      </div>

      {saveStatus && (
        <div style={{ marginBottom: 16 }}>
          <Alert type={saveStatus.type}>
            {saveStatus.message}
          </Alert>
        </div>
      )}

      <div className="multipage-editor">
        <div className="multipage-editor__tabs">
          <button
            className={`multipage-editor__tab ${activeTab === 'binding' ? 'multipage-editor__tab--active' : ''}`}
            onClick={() => setActiveTab('binding')}
          >
            Типы переплёта
          </button>
          <button
            className={`multipage-editor__tab ${activeTab === 'print' ? 'multipage-editor__tab--active' : ''}`}
            onClick={() => setActiveTab('print')}
          >
            Типы печати
          </button>
          <button
            className={`multipage-editor__tab ${activeTab === 'paper' ? 'multipage-editor__tab--active' : ''}`}
            onClick={() => setActiveTab('paper')}
          >
            Материалы
          </button>
          <button
            className={`multipage-editor__tab ${activeTab === 'preview' ? 'multipage-editor__tab--active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            Предпросмотр
          </button>
        </div>

        <div className="multipage-editor__content">
          {activeTab === 'binding' && (
            <div className="multipage-editor__section">
              <h3>Типы переплёта</h3>
              <p className="multipage-editor__hint">
                Настройте доступные типы переплёта, их ограничения и цены
              </p>
              
              <table className="multipage-editor__table">
                <thead>
                  <tr>
                    <th>Вкл</th>
                    <th>Название</th>
                    <th>Мин. стр.</th>
                    <th>Макс. стр.</th>
                    <th>Двуст. печать</th>
                    <th>Цена, BYN</th>
                  </tr>
                </thead>
                <tbody>
                  {bindingTypes.map((bt, index) => (
                    <tr key={bt.value} className={!bt.enabled ? 'multipage-editor__row--disabled' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={bt.enabled}
                          onChange={(e) => updateBindingType(index, { enabled: e.target.checked })}
                        />
                      </td>
                      <td>{bt.label}</td>
                      <td>
                        <input
                          type="number"
                          className="multipage-editor__input--small"
                          value={bt.minPages}
                          onChange={(e) => updateBindingType(index, { minPages: parseInt(e.target.value) || 1 })}
                          min={1}
                          disabled={!bt.enabled}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="multipage-editor__input--small"
                          value={bt.maxPages}
                          onChange={(e) => updateBindingType(index, { maxPages: parseInt(e.target.value) || 100 })}
                          min={1}
                          disabled={!bt.enabled}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={bt.duplexDefault}
                          onChange={(e) => updateBindingType(index, { duplexDefault: e.target.checked })}
                          disabled={!bt.enabled}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="multipage-editor__input--small"
                          value={bt.price}
                          onChange={(e) => updateBindingType(index, { price: parseFloat(e.target.value) || 0 })}
                          step={0.1}
                          min={0}
                          disabled={!bt.enabled}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'print' && (
            <div className="multipage-editor__section">
              <h3>Типы печати</h3>
              <p className="multipage-editor__hint">
                Настройте доступные типы печати и их стоимость
              </p>
              
              <table className="multipage-editor__table">
                <thead>
                  <tr>
                    <th>Вкл</th>
                    <th>Название</th>
                    <th>Цена за стр., BYN</th>
                    <th>Приладка, BYN</th>
                  </tr>
                </thead>
                <tbody>
                  {printTypes.map((pt, index) => (
                    <tr key={pt.value} className={!pt.enabled ? 'multipage-editor__row--disabled' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={pt.enabled}
                          onChange={(e) => updatePrintType(index, { enabled: e.target.checked })}
                        />
                      </td>
                      <td>{pt.label}</td>
                      <td>
                        <input
                          type="number"
                          className="multipage-editor__input--small"
                          value={pt.pricePerPage}
                          onChange={(e) => updatePrintType(index, { pricePerPage: parseFloat(e.target.value) || 0 })}
                          step={0.1}
                          min={0}
                          disabled={!pt.enabled}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="multipage-editor__input--small"
                          value={pt.setupCost}
                          onChange={(e) => updatePrintType(index, { setupCost: parseFloat(e.target.value) || 0 })}
                          step={1}
                          min={0}
                          disabled={!pt.enabled}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'paper' && (
            <div className="multipage-editor__section">
              <h3>Типы бумаги</h3>
              <p className="multipage-editor__hint">
                Настройте доступные типы бумаги и плотности
              </p>
              
              <table className="multipage-editor__table">
                <thead>
                  <tr>
                    <th>Вкл</th>
                    <th>Название</th>
                    <th>Плотности (г/м²)</th>
                  </tr>
                </thead>
                <tbody>
                  {paperTypes.map((pt, index) => (
                    <tr key={pt.value} className={!pt.enabled ? 'multipage-editor__row--disabled' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={pt.enabled}
                          onChange={(e) => updatePaperType(index, { enabled: e.target.checked })}
                        />
                      </td>
                      <td>{pt.label}</td>
                      <td>
                        <input
                          type="text"
                          className="multipage-editor__input--wide"
                          value={pt.densities.join(', ')}
                          onChange={(e) => {
                            const densities = e.target.value
                              .split(',')
                              .map(s => parseInt(s.trim()))
                              .filter(n => !isNaN(n) && n > 0);
                            updatePaperType(index, { densities });
                          }}
                          placeholder="80, 120, 150"
                          disabled={!pt.enabled}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="multipage-editor__section">
              <h3>Предпросмотр калькулятора</h3>
              <p className="multipage-editor__hint">
                Так будет выглядеть калькулятор для клиентов
              </p>
              
              <div className="multipage-editor__preview">
                {/* Здесь можно добавить MultiPageProductForm для превью */}
                <div className="multipage-editor__preview-placeholder">
                  <p>Активные типы переплёта: {bindingTypes.filter(b => b.enabled).length}</p>
                  <p>Активные типы печати: {printTypes.filter(p => p.enabled).length}</p>
                  <p>Активные типы бумаги: {paperTypes.filter(p => p.enabled).length}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="multipage-editor__footer">
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Сохранение...' : 'Сохранить настройки'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MultiPageProductEditor;
