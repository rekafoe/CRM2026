import React from 'react';
import { Button } from '../../components/common';

export interface PublicDesignCustomerForm {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
}

interface PublicDesignFinalizeFormProps {
  form: PublicDesignCustomerForm;
  saving: boolean;
  onChange: (form: PublicDesignCustomerForm) => void;
  onSubmit: () => void;
}

export const PublicDesignFinalizeForm: React.FC<PublicDesignFinalizeFormProps> = ({
  form,
  saving,
  onChange,
  onSubmit,
}) => (
  <form
    className="public-design-editor__finalize"
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
  >
    <div className="public-design-editor__finalize-title">Контакты для заказа</div>
    <label>
      <span>Имя</span>
      <input
        type="text"
        value={form.customerName}
        onChange={(event) => onChange({ ...form, customerName: event.target.value })}
        placeholder="Иван Петров"
      />
    </label>
    <label>
      <span>Телефон</span>
      <input
        type="tel"
        value={form.customerPhone}
        onChange={(event) => onChange({ ...form, customerPhone: event.target.value })}
        placeholder="+375..."
      />
    </label>
    <label>
      <span>Email</span>
      <input
        type="email"
        value={form.customerEmail}
        onChange={(event) => onChange({ ...form, customerEmail: event.target.value })}
        placeholder="client@example.com"
      />
    </label>
    <Button variant="secondary" type="submit" disabled={saving}>
      Отправить заявку
    </Button>
  </form>
);
