import React from 'react';
import { Button } from '../../../common';
import { Customer } from '../../../../types';

export type CustomerEditFormState = {
  first_name: string;
  last_name: string;
  middle_name: string;
  company_name: string;
  legal_name: string;
  tax_id: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

interface CustomerDetailProfilePanelProps {
  customer: Customer;
  editForm: CustomerEditFormState;
  setEditForm: React.Dispatch<React.SetStateAction<CustomerEditFormState>>;
  onSaveDetails: () => void;
  savingCustomer: boolean;
  legalForm: { bank_details: string; authorized_person: string };
  setLegalForm: React.Dispatch<React.SetStateAction<{ bank_details: string; authorized_person: string }>>;
  onSaveLegal: () => void;
  savingLegal: boolean;
}

export const CustomerDetailProfilePanel: React.FC<CustomerDetailProfilePanelProps> = ({
  customer,
  editForm,
  setEditForm,
  onSaveDetails,
  savingCustomer,
  legalForm,
  setLegalForm,
  onSaveLegal,
  savingLegal,
}) => (
  <div className="customer-detail-view__stack">
    <div className="customers-edit-section">
      <h5 className="customers-edit-section__title">Данные клиента</h5>
      <div className="customers-edit-section__fields">
        {customer.type === 'individual' ? (
          <>
            <label className="customers-edit-field">
              <span>Фамилия</span>
              <input
                type="text"
                value={editForm.last_name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, last_name: e.target.value }))}
                placeholder="Фамилия"
              />
            </label>
            <label className="customers-edit-field">
              <span>Имя</span>
              <input
                type="text"
                value={editForm.first_name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, first_name: e.target.value }))}
                placeholder="Имя"
              />
            </label>
            <label className="customers-edit-field">
              <span>Отчество</span>
              <input
                type="text"
                value={editForm.middle_name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, middle_name: e.target.value }))}
                placeholder="Отчество"
              />
            </label>
          </>
        ) : (
          <>
            <label className="customers-edit-field">
              <span>Название компании</span>
              <input
                type="text"
                value={editForm.company_name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, company_name: e.target.value }))}
                placeholder="Краткое название"
              />
            </label>
            <label className="customers-edit-field">
              <span>Юридическое название</span>
              <input
                type="text"
                value={editForm.legal_name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, legal_name: e.target.value }))}
                placeholder="Полное юридическое название"
              />
            </label>
            <label className="customers-edit-field">
              <span>УНП</span>
              <input
                type="text"
                value={editForm.tax_id}
                onChange={(e) => setEditForm((prev) => ({ ...prev, tax_id: e.target.value }))}
                placeholder="УНП"
              />
            </label>
          </>
        )}
        <label className="customers-edit-field">
          <span>Телефон</span>
          <input
            type="text"
            value={editForm.phone}
            onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder="+375 ..."
          />
        </label>
        <label className="customers-edit-field">
          <span>Email</span>
          <input
            type="email"
            value={editForm.email}
            onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="email@example.com"
          />
        </label>
        <label className="customers-edit-field">
          <span>Адрес</span>
          <input
            type="text"
            value={editForm.address}
            onChange={(e) => setEditForm((prev) => ({ ...prev, address: e.target.value }))}
            placeholder="Адрес"
          />
        </label>
        <label className="customers-edit-field">
          <span>Примечание</span>
          <input
            type="text"
            value={editForm.notes}
            onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Заметки"
          />
        </label>
      </div>
      <Button variant="primary" size="sm" onClick={onSaveDetails} disabled={savingCustomer}>
        {savingCustomer ? 'Сохранение…' : 'Сохранить данные'}
      </Button>
    </div>

    {customer.type === 'legal' && (
      <div className="customers-legal">
        <div className="customers-legal__header">
          <h5>Реквизиты юридического лица</h5>
          <Button variant="secondary" size="sm" onClick={onSaveLegal} disabled={savingLegal}>
            {savingLegal ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
        <div className="customers-legal__fields">
          <label className="customers-legal__field">
            <span>Расчётный счёт и банк</span>
            <textarea
              value={legalForm.bank_details}
              onChange={(e) => setLegalForm((prev) => ({ ...prev, bank_details: e.target.value }))}
              placeholder="IBAN, банк, БИК, адрес"
            />
          </label>
          <label className="customers-legal__field">
            <span>Уполномоченное лицо</span>
            <textarea
              value={legalForm.authorized_person}
              onChange={(e) => setLegalForm((prev) => ({ ...prev, authorized_person: e.target.value }))}
              placeholder="Действует на основании договора, устава и пр."
            />
          </label>
        </div>
      </div>
    )}
  </div>
);
