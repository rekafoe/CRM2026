import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { Alert, Modal } from '../../components/common';
import { AppIcon } from '../../components/ui';
import {
  getDocumentTemplates,
  uploadDocumentTemplate,
  setDefaultTemplate,
  deleteDocumentTemplate,
  downloadDocumentTemplate,
  analyzeTemplate,
  getTemplateFieldMapping,
  saveTemplateFieldMapping,
  FieldMapping,
  TemplateAnalysis,
} from '../../api';
import { DocumentTemplate } from '../../types';
import './DocumentTemplatesPage.css';

const DocumentTemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadForm, setUploadForm] = useState({
    name: '',
    type: 'contract' as 'contract' | 'act' | 'invoice',
    isDefault: false,
  });
  
  // Состояние для модального окна маппинга
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [analysis, setAnalysis] = useState<TemplateAnalysis | null>(null);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getDocumentTemplates();
      setTemplates(Array.isArray(response.data) ? response.data : []);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить шаблоны');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!uploadForm.name.trim()) {
      setError('Укажите название шаблона');
      return;
    }

    // Проверка расширения файла
    const ext = file.name.toLowerCase().split('.').pop();
    if (uploadForm.type === 'contract' && ext !== 'docx') {
      setError('Шаблон договора должен быть в формате .docx');
      return;
    }
    if ((uploadForm.type === 'act' || uploadForm.type === 'invoice') && !['xlsx', 'xls'].includes(ext || '')) {
      setError('Шаблон акта/счета должен быть в формате .xlsx или .xls');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('template', file);
      formData.append('name', uploadForm.name.trim());
      formData.append('type', uploadForm.type);
      formData.append('isDefault', String(uploadForm.isDefault));

      await uploadDocumentTemplate(formData);
      await loadTemplates();

      // Сброс формы
      setUploadForm({ name: '', type: 'contract', isDefault: false });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить шаблон');
    } finally {
      setUploading(false);
    }
  }, [uploadForm, loadTemplates]);

  const handleSetDefault = useCallback(async (id: number) => {
    try {
      await setDefaultTemplate(id);
      await loadTemplates();
    } catch (err: any) {
      setError(err?.message || 'Не удалось установить шаблон по умолчанию');
    }
  }, [loadTemplates]);

  const handleDownload = useCallback(async (template: DocumentTemplate) => {
    try {
      const response = await downloadDocumentTemplate(template.id);
      const blob = new Blob([response.data], { 
        type: response.headers['content-type'] || 'application/octet-stream'
      });
      
      // Извлекаем имя файла из заголовка Content-Disposition
      let filename = `${template.name}${template.type === 'contract' ? '.docx' : '.xlsx'}`;
      const contentDisposition = response.headers['content-disposition'];
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
          try {
            filename = decodeURIComponent(filename);
          } catch (e) {
            // Если не удалось декодировать, используем как есть
          }
        }
      }
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || 'Не удалось скачать шаблон');
    }
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('Вы уверены, что хотите удалить этот шаблон?')) {
      return;
    }

    try {
      await deleteDocumentTemplate(id);
      await loadTemplates();
    } catch (err: any) {
      setError(err?.message || 'Не удалось удалить шаблон');
    }
  }, [loadTemplates]);

  const handleConfigureMapping = useCallback(async (template: DocumentTemplate) => {
    try {
      setSelectedTemplate(template);
      setAnalyzing(true);
      setError(null);
      
      // Анализируем шаблон
      const analysisResponse = await analyzeTemplate(template.id);
      setAnalysis(analysisResponse.data);
      
      // Загружаем существующий маппинг
      const mappingResponse = await getTemplateFieldMapping(template.id);
      const existingMappings = mappingResponse.data || [];
      
      // Создаем маппинг для всех плейсхолдеров
      const newMappings: FieldMapping[] = analysisResponse.data.placeholders.map(placeholder => {
        const existing = existingMappings.find(m => m.templateField === placeholder);
        return existing || {
          templateField: placeholder,
          systemField: '',
          fieldLabel: '',
        };
      });
      
      setMappings(newMappings);
      setMappingModalOpen(true);
    } catch (err: any) {
      setError(err?.message || 'Не удалось проанализировать шаблон');
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const handleSaveMapping = useCallback(async () => {
    if (!selectedTemplate) return;
    
    try {
      setSavingMapping(true);
      setError(null);
      
      // Фильтруем только заполненные маппинги
      const validMappings = mappings.filter(m => m.systemField.trim() !== '');
      
      await saveTemplateFieldMapping(selectedTemplate.id, validMappings);
      setMappingModalOpen(false);
      setSelectedTemplate(null);
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить маппинг');
    } finally {
      setSavingMapping(false);
    }
  }, [mappings, selectedTemplate]);

  // Список доступных полей системы
  const systemFields = [
    { value: 'customerName', label: 'Название клиента' },
    { value: 'companyName', label: 'Название компании' },
    { value: 'legalName', label: 'Юридическое название' },
    { value: 'legalAddress', label: 'Юридический адрес' },
    { value: 'taxId', label: 'УНП' },
    { value: 'bankDetails', label: 'Банковские реквизиты' },
    { value: 'authorizedPerson', label: 'Уполномоченное лицо' },
    { value: 'contractNumber', label: 'Номер договора' },
    { value: 'contractDate', label: 'Дата договора' },
    { value: 'orders', label: 'Заказы (массив) - автоматически вычисляет totalAmount' },
    { value: 'totalAmount', label: 'Общая сумма (автоматически из orders, если не указана)' },
  ];

  const typeLabels = {
    contract: 'Договор',
    act: 'Акт',
    invoice: 'Счёт',
  };

  const groupedTemplates = templates.reduce((acc, template) => {
    if (!acc[template.type]) {
      acc[template.type] = [];
    }
    acc[template.type].push(template);
    return acc;
  }, {} as Record<string, DocumentTemplate[]>);

  return (
    <AdminPageLayout
      title="Шаблоны документов"
      description="Договоры, акты и счета для клиента."
      icon={<AppIcon name="clipboard" size="lg" />}
      onBack={() => navigate('/adminpanel')}
      className="document-templates-layout"
    >
      {error && <Alert type="error">{error}</Alert>}

      <div className="document-templates-page">
        {/* Форма загрузки */}
        <div className="templates-upload-section">
          <h3>Загрузить новый шаблон</h3>
          <div className="templates-upload-form">
            <div className="form-row">
              <label>
                <span>Название шаблона</span>
                <input
                  type="text"
                  value={uploadForm.name}
                  onChange={(e) => setUploadForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Например: Договор 2025"
                  disabled={uploading}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                <span>Тип документа</span>
                <select
                  value={uploadForm.type}
                  onChange={(e) =>
                    setUploadForm((prev) => ({ ...prev, type: e.target.value as any }))
                  }
                  disabled={uploading}
                >
                  <option value="contract">Договор (.docx)</option>
                  <option value="act">Акт (.xlsx)</option>
                  <option value="invoice">Счёт (.xlsx)</option>
                </select>
              </label>
            </div>
            <div className="form-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={uploadForm.isDefault}
                  onChange={(e) =>
                    setUploadForm((prev) => ({ ...prev, isDefault: e.target.checked }))
                  }
                  disabled={uploading}
                />
                <span>Установить как шаблон по умолчанию</span>
              </label>
            </div>
            <div className="form-row">
              <input
                ref={fileInputRef}
                type="file"
                accept={
                  uploadForm.type === 'contract'
                    ? '.docx'
                    : uploadForm.type === 'act' || uploadForm.type === 'invoice'
                    ? '.xlsx,.xls'
                    : ''
                }
                onChange={handleFileChange}
                disabled={uploading || !uploadForm.name.trim()}
                className="file-input"
              />
              <button
                type="button"
                className="lg-btn lg-btn--primary"
                onClick={() =>fileInputRef.current?.click()}
                disabled={uploading || !uploadForm.name.trim()}
              >
                {uploading ? 'Загрузка...' : 'Выбрать файл'}
              </button>
            </div>
          </div>
        </div>

        {/* Список шаблонов */}
        <div className="templates-list-section">
          <h3>Загруженные шаблоны</h3>
          {loading ? (
            <div className="templates-loading">Загрузка...</div>
          ) : templates.length === 0 ? (
            <div className="templates-empty">Нет загруженных шаблонов</div>
          ) : (
            <div className="templates-groups">
              {(['contract', 'act', 'invoice'] as const).map((type) => {
                const typeTemplates = groupedTemplates[type] || [];
                if (typeTemplates.length === 0) return null;

                return (
                  <div key={type} className="templates-group">
                    <h4>{typeLabels[type]}</h4>
                    <div className="templates-table-wrapper">
                      <table className="templates-table">
                        <thead>
                          <tr>
                            <th>Название</th>
                            <th>По умолчанию</th>
                            <th>Дата создания</th>
                            <th>Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {typeTemplates.map((template: DocumentTemplate) => (
                            <tr key={template.id}>
                              <td>{template.name}</td>
                              <td>
                                {template.is_default ? (
                                  <span className="badge badge-success">Да</span>
                                ) : (
                                  <span className="badge badge-secondary">Нет</span>
                                )}
                              </td>
                              <td>
                                {new Date(template.created_at).toLocaleDateString('ru-RU')}
                              </td>
                              <td>
                                <div className="templates-actions">
                                  <button
                                    type="button"
                                    className="lg-btn"
                                    title="Скачать шаблон"
                                    onClick={() =>handleDownload(template)}
                                  >
                                    Скачать
                                  </button>
                                  <button
                                    type="button"
                                    className="lg-btn"
                                    title="Система сама сопоставляет стандартные поля"
                                    onClick={() =>handleConfigureMapping(template)}
                                  >
                                    Поля
                                  </button>
                                  {!template.is_default && (
                                    <button
                                      type="button"
                                      className="lg-btn"
                                      onClick={() =>handleSetDefault(template.id)}
                                    >
                                      По умолчанию
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="lg-btn lg-btn--danger"
                                    onClick={() =>handleDelete(template.id)}
                                  >
                                    Удалить
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно для настройки маппинга полей */}
      <Modal
        isOpen={mappingModalOpen}
        onClose={() => {
          setMappingModalOpen(false);
          setSelectedTemplate(null);
          setAnalysis(null);
          setMappings([]);
        }}
        title={`Настройка полей: ${selectedTemplate?.name || ''}`}
        size="xl"
      >
        {analyzing ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>Анализ шаблона...</div>
        ) : analysis ? (
          <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '20px' }}>
              <Alert type="info">
                Найдено {analysis.placeholders.length} полей в шаблоне. Сопоставьте каждое поле шаблона с полем системы.
                <br />
                <strong>Примечание:</strong> Если в шаблоне есть поле для общей суммы, но нет массива заказов, 
                система автоматически вычислит totalAmount из массива orders (если он сопоставлен).
              </Alert>
            </div>
            
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #ddd', backgroundColor: '#f5f5f5' }}>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Поле в шаблоне</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Поле системы</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Описание</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((mapping, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '10px' }}>
                        <code style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>
                          {mapping.templateField}
                        </code>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <select
                          value={mapping.systemField}
                          onChange={(e) => {
                            const newMappings = [...mappings];
                            newMappings[index].systemField = e.target.value;
                            setMappings(newMappings);
                          }}
                          style={{ width: '100%', padding: '5px' }}
                        >
                          <option value="">-- Не сопоставлено --</option>
                          {systemFields.map(field => (
                            <option key={field.value} value={field.value}>
                              {field.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <input
                          type="text"
                          value={mapping.fieldLabel || ''}
                          onChange={(e) => {
                            const newMappings = [...mappings];
                            newMappings[index].fieldLabel = e.target.value;
                            setMappings(newMappings);
                          }}
                          placeholder="Описание (необязательно)"
                          style={{ width: '100%', padding: '5px' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="lg-btn"
                onClick={() =>{
                  setMappingModalOpen(false);
                  setSelectedTemplate(null);
                  setAnalysis(null);
                  setMappings([]);
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="lg-btn lg-btn--primary"
                onClick={handleSaveMapping}
                disabled={savingMapping}
              >
                {savingMapping ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </AdminPageLayout>
  );
};

export default DocumentTemplatesPage;
