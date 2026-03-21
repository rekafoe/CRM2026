import React, { useState, useEffect } from 'react';
import { Modal, Button, FormField, Alert } from '../common';
import { duplicateProduct } from '../../services/products';

export interface ProductDuplicateSource {
  id: number;
  name: string;
}

/** Упрощённый или многостраничный продукт — поддерживается полное дублирование через API. */
export function productCanBeDuplicated(
  p: { calculator_type?: string; product_type?: string } | null | undefined,
): boolean {
  if (!p) return false;
  return p.calculator_type === 'simplified' || p.product_type === 'multi_page';
}

interface ProductDuplicateModalProps {
  visible: boolean;
  source: ProductDuplicateSource | null;
  onClose: () => void;
  onDuplicated: (productId: number) => void;
  /** Подсказка под формой (напр. про несохранённые правки). */
  extraHint?: string;
}

export const ProductDuplicateModal: React.FC<ProductDuplicateModalProps> = ({
  visible,
  source,
  onClose,
  onDuplicated,
  extraHint,
}) => {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && source) {
      setName(`${source.name} (копия)`);
      setError(null);
    }
  }, [visible, source]);

  const handleSubmit = async () => {
    if (!source) return;
    if (!name.trim()) {
      setError('Введите название нового продукта');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await duplicateProduct(source.id, { name: name.trim() });
      if (result?.id) {
        onDuplicated(result.id);
        onClose();
      } else {
        setError('Не удалось создать копию');
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      console.error('Ошибка копирования продукта:', err);
      setError(e?.response?.data?.error || e?.message || 'Ошибка копирования продукта');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setName('');
    setError(null);
    onClose();
  };

  if (!source) return null;

  return (
    <Modal isOpen={visible} onClose={handleClose} title="Копировать продукт" size="md">
      <div className="flex flex-column gap-4">
        {error && (
          <Alert type="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <p className="text-sm text-muted" style={{ margin: 0 }}>
          Копия включает шаблон (размеры, типы, цены), параметры, операции и материалы. Исходное название:{' '}
          <strong>{source.name}</strong>
        </p>

        <FormField label="Название копии" required>
          <input
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Визитки премиум — вариант 2"
            autoFocus
          />
        </FormField>

        {extraHint ? (
          <p className="text-sm text-muted" style={{ margin: 0 }}>
            {extraHint}
          </p>
        ) : null}

        <div className="flex gap-3 justify-end mt-2">
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Отмена
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting ? 'Копирование…' : 'Создать копию'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
