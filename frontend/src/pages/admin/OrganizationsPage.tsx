import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { Alert, Button, Modal } from '../../components/common';
import {
  getOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  getReceiptTemplate,
  saveReceiptTemplate,
  getOrderBlankTemplate,
  saveOrderBlankTemplate,
  type Organization,
} from '../../api';
import './OrganizationsPage.css';

const RECEIPT_PLACEHOLDERS = [
  '{{companyName}}', '{{unp}}', '{{legalAddress}}', '{{phone}}',
  '{{receiptNumber}}', '{{orderNumber}}', '{{orderDate}}',
  '{{itemsTable}}', '{{totalStr}}', '{{summaryLine}}', '{{manager}}',
];
const ORDER_BLANK_PLACEHOLDERS = [
  '{{companyName}}', '{{companyPhone}}', '{{companyAddress}}', '{{companySchedule}}',
  '{{orderNumber}}', '{{createdDate}}', '{{readyDate}}', '{{customerName}}', '{{customerPhone}}',
  '{{cost}}', '{{prepaymentAmount}}', '{{debt}}', '{{totalAmount}}', '{{itemsTable}}', '{{executedBy}}',
];

export const OrganizationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [form, setForm] = useState<Partial<Organization>>({});
  const [saving, setSaving] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateType, setTemplateType] = useState<'receipt' | 'order-blank'>('receipt');
  const [templateOrg, setTemplateOrg] = useState<Organization | null>(null);
  const [templateContent, setTemplateContent] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);

  const loadOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getOrganizations();
      setOrganizations(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить организации');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  const handleCreate = () => {
    setEditingOrg(null);
    setForm({ name: '', unp: '', is_default: 0, sort_order: 0 });
  };

  const handleEdit = (org: Organization) => {
    setEditingOrg(org);
    setForm({ ...org });
  };

  const handleSave = async () => {
    if (!form.name?.trim()) {
      setError('Укажите название организации');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      if (editingOrg?.id) {
        await updateOrganization(editingOrg.id, form);
      } else {
        await createOrganization(form);
      }
      await loadOrganizations();
      setEditingOrg(null);
      setForm({});
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Удалить организацию? Заказы с этой организацией останутся без привязки.')) return;
    try {
      await deleteOrganization(id);
      await loadOrganizations();
      if (editingOrg?.id === id) setEditingOrg(null);
    } catch (err: any) {
      setError(err?.message || 'Не удалось удалить');
    }
  };

  const openTemplateEditor = async (org: Organization, type: 'receipt' | 'order-blank') => {
    setTemplateOrg(org);
    setTemplateType(type);
    setTemplateModalOpen(true);
    try {
      const res = type === 'receipt' ? await getReceiptTemplate(org.id) : await getOrderBlankTemplate(org.id);
      setTemplateContent(res.data?.html_content || '');
    } catch {
      setTemplateContent('');
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateOrg) return;
    try {
      setTemplateSaving(true);
      if (templateType === 'receipt') {
        await saveReceiptTemplate(templateOrg.id, templateContent);
      } else {
        await saveOrderBlankTemplate(templateOrg.id, templateContent);
      }
      setTemplateModalOpen(false);
      setTemplateOrg(null);
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить шаблон');
    } finally {
      setTemplateSaving(false);
    }
  };

  return (
    <AdminPageLayout title="Организации" icon="🏢" onBack={() => navigate('/adminpanel')}>
      <div className="organizations-page">
        {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

        <div className="organizations-actions">
          <Button onClick={handleCreate}>+ Добавить организацию</Button>
        </div>

        {(editingOrg || Object.keys(form).length) ? (
          <div className="organizations-form-card">
            <h3>{editingOrg ? 'Редактировать' : 'Новая организация'}</h3>
            <div className="form-grid">
              <label>Название *</label>
              <input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ООО «Название»" />
              <label>УНП</label>
              <input value={form.unp || ''} onChange={(e) => setForm({ ...form, unp: e.target.value })} placeholder="193679900" />
              <label>Юр. адрес</label>
              <input value={form.legal_address || ''} onChange={(e) => setForm({ ...form, legal_address: e.target.value })} />
              <label>Телефон</label>
              <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <label>Email</label>
              <input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <label>Банковские реквизиты</label>
              <textarea value={form.bank_details || ''} onChange={(e) => setForm({ ...form, bank_details: e.target.value })} rows={3} />
              <label className="checkbox-row">
                <input type="checkbox" checked={!!form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked ? 1 : 0 })} />
                По умолчанию
              </label>
            </div>
            <div className="form-actions">
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</Button>
              <Button variant="secondary" onClick={() => { setEditingOrg(null); setForm({}); }}>Отмена</Button>
            </div>
          </div>
        ) : null}

        <div className="organizations-list">
          {loading ? <p>Загрузка...</p> : (
            <table className="organizations-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>УНП</th>
                  <th>По умолчанию</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id}>
                    <td>{org.name}</td>
                    <td>{org.unp || '—'}</td>
                    <td>{org.is_default ? 'Да' : ''}</td>
                    <td>
                      <button className="btn-link" onClick={() => handleEdit(org)}>Изменить</button>
                      {' '}
                      <button className="btn-link" onClick={() => openTemplateEditor(org, 'receipt')}>Чек</button>
                      {' '}
                      <button className="btn-link" onClick={() => openTemplateEditor(org, 'order-blank')}>Бланк</button>
                      {' '}
                      {!org.is_default && (
                        <button className="btn-link danger" onClick={() => handleDelete(org.id)}>Удалить</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Modal isOpen={templateModalOpen} onClose={() => setTemplateModalOpen(false)} title={templateType === 'receipt' ? `Товарный чек: ${templateOrg?.name || ''}` : `Бланк заказа: ${templateOrg?.name || ''}`}>
          <div className="receipt-template-editor">
            <p className="template-help">
              Плейсхолдеры: {(templateType === 'receipt' ? RECEIPT_PLACEHOLDERS : ORDER_BLANK_PLACEHOLDERS).join(', ')}
            </p>
            <textarea
              value={templateContent}
              onChange={(e) => setTemplateContent(e.target.value)}
              rows={20}
              className="template-textarea"
              spellCheck={false}
            />
            <div className="template-actions">
              <Button onClick={handleSaveTemplate} disabled={templateSaving}>
                {templateSaving ? 'Сохранение...' : 'Сохранить шаблон'}
              </Button>
              <Button variant="secondary" onClick={() => setTemplateModalOpen(false)}>Закрыть</Button>
            </div>
          </div>
        </Modal>
      </div>
    </AdminPageLayout>
  );
};

export default OrganizationsPage;
