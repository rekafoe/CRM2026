import React from 'react';
import { Button } from '../../../common';
import { Customer } from '../../../../types';
import { signerPreview, type CustomerLegalFormState } from '../../../../utils/legalSigner';

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
  marketing_opt_in: boolean;
};

interface CustomerDetailProfilePanelProps {
  customer: Customer;
  editForm: CustomerEditFormState;
  setEditForm: React.Dispatch<React.SetStateAction<CustomerEditFormState>>;
  onSaveDetails: () => void;
  savingCustomer: boolean;
  legalForm: CustomerLegalFormState;
  setLegalForm: React.Dispatch<React.SetStateAction<CustomerLegalFormState>>;
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
        <label className="customers-edit-field customers-edit-field--checkbox">
          <input
            type="checkbox"
            checked={editForm.marketing_opt_in}
            onChange={(e) => setEditForm((prev) => ({ ...prev, marketing_opt_in: e.target.checked }))}
          />
          <span>Разрешены email-рассылки</span>
          <small>
            Выключайте только если клиент попросил не присылать маркетинговые письма.
          </small>
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
        <p className="customers-legal__hint">
          В договоре нужны должность и ФИО в родительном падеже. В подписи акта и счёта — те же данные в именительном.
        </p>
        <div className="customers-legal__fields">
          <label className="customers-legal__field customers-legal__wide">
            <span>Расчётный счёт и банк</span>
            <textarea
              value={legalForm.bank_details}
              onChange={(e) => setLegalForm((prev) => ({ ...prev, bank_details: e.target.value }))}
              placeholder="IBAN, банк, БИК, адрес"
            />
          </label>
          <label className="customers-legal__field">
            <span>Должность</span>
            <input
              value={legalForm.signer_position}
              onChange={(e) => setLegalForm((prev) => ({ ...prev, signer_position: e.target.value }))}
              placeholder="Директор"
            />
          </label>
          <label className="customers-legal__field">
            <span>ФИО</span>
            <input
              value={legalForm.signer_name}
              onChange={(e) => setLegalForm((prev) => ({ ...prev, signer_name: e.target.value }))}
              placeholder="Иванов Иван Иванович"
            />
          </label>
          <label className="customers-legal__field">
            <span>Должность в родительном падеже</span>
            <input
              value={legalForm.signer_position_genitive}
              onChange={(e) => setLegalForm((prev) => ({ ...prev, signer_position_genitive: e.target.value }))}
              placeholder="директора"
            />
          </label>
          <label className="customers-legal__field">
            <span>ФИО в родительном падеже</span>
            <input
              value={legalForm.signer_name_genitive}
              onChange={(e) => setLegalForm((prev) => ({ ...prev, signer_name_genitive: e.target.value }))}
              placeholder="Иванова Ивана Ивановича"
            />
          </label>
          <label className="customers-legal__field customers-legal__wide">
            <span>Основание полномочий</span>
            <input
              value={legalForm.authority_basis}
              onChange={(e) => setLegalForm((prev) => ({ ...prev, authority_basis: e.target.value }))}
              placeholder="Устава, доверенности № 12 от 01.02.2026"
            />
          </label>
          <p className="customers-legal__hint">{signerPreview(legalForm)}</p>
        </div>
      </div>
    )}
  </div>
);
