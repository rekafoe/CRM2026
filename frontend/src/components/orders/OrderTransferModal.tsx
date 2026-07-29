import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Button } from '../common';
import { AssignableUserSelect } from './AssignableUserSelect';
import { useAssignableUsers } from '../../hooks/useAssignableUsers';
import {
  transferOrder,
  type Department,
  type OrderTransferPayload,
} from '../../api';
import type { Order } from '../../types';
import './OrderTransferModal.css';

export type OrderTransferModalProps = {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  departments: Department[];
  date?: string;
  onTransferred: (order: Order) => void;
  onError?: (message: string) => void;
};

type Mode = 'colleague' | 'pavilion';

export const OrderTransferModal: React.FC<OrderTransferModalProps> = ({
  isOpen,
  onClose,
  order,
  departments,
  date,
  onTransferred,
  onError,
}) => {
  const [mode, setMode] = useState<Mode>('colleague');
  const [colleagueUserId, setColleagueUserId] = useState<number | null>(null);
  const [transferContact, setTransferContact] = useState(true);
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [assignResponsible, setAssignResponsible] = useState(false);
  const [pavilionUserId, setPavilionUserId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sameDeptId = order.fulfillment_department_id ?? null;
  const assignDeptId = mode === 'pavilion' ? departmentId : sameDeptId;

  const { onShift, all } = useAssignableUsers({
    date,
    departmentId: assignDeptId,
    enabled: isOpen,
  });

  const pavilionOptions = useMemo(
    () =>
      departments.filter(
        (d) =>
          sameDeptId == null || Number(d.id) !== Number(sameDeptId),
      ),
    [departments, sameDeptId],
  );

  useEffect(() => {
    if (!isOpen) return;
    setMode('colleague');
    setColleagueUserId(null);
    setTransferContact(true);
    setDepartmentId(null);
    setAssignResponsible(false);
    setPavilionUserId(null);
    setSubmitting(false);
  }, [isOpen, order.id]);

  const canSubmit =
    mode === 'colleague'
      ? colleagueUserId != null && colleagueUserId > 0
      : departmentId != null &&
        departmentId > 0 &&
        (!assignResponsible || (pavilionUserId != null && pavilionUserId > 0));

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      let payload: OrderTransferPayload;
      if (mode === 'colleague') {
        payload = {
          mode: 'colleague',
          userId: colleagueUserId!,
          transferContact,
        };
      } else {
        payload = {
          mode: 'pavilion',
          department_id: departmentId!,
          ...(assignResponsible && pavilionUserId
            ? {
                responsible_user_id: pavilionUserId,
                executor_user_id: pavilionUserId,
              }
            : {}),
        };
      }
      const res = await transferOrder(order.id, payload);
      onTransferred(res.data);
      onClose();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e as Error)?.message ||
        'Не удалось передать заказ';
      onError?.(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Передать заказ" size="sm">
      <div className="order-transfer-modal">
        <div className="order-transfer-modal__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'colleague'}
            className={`order-transfer-modal__tab ${mode === 'colleague' ? 'is-active' : ''}`}
            onClick={() => setMode('colleague')}
          >
            Коллеге
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'pavilion'}
            className={`order-transfer-modal__tab ${mode === 'pavilion' ? 'is-active' : ''}`}
            onClick={() => setMode('pavilion')}
          >
            В павильон
          </button>
        </div>

        {mode === 'colleague' ? (
          <div className="order-transfer-modal__body">
            <label className="order-transfer-modal__field">
              <span>Сотрудник</span>
              <AssignableUserSelect
                value={colleagueUserId}
                onChange={setColleagueUserId}
                onShift={onShift}
                all={all}
                emptyLabel="— Выберите —"
              />
            </label>
            <label className="order-transfer-modal__check">
              <input
                type="checkbox"
                checked={transferContact}
                onChange={(e) => setTransferContact(e.target.checked)}
              />
              <span>Тоже сменить контактёра</span>
            </label>
            <p className="order-transfer-modal__hint">
              Точка выполнения не меняется. Ответственный и исполнители всех позиций
              перейдут выбранному сотруднику.
            </p>
          </div>
        ) : (
          <div className="order-transfer-modal__body">
            <label className="order-transfer-modal__field">
              <span>Павильон</span>
              <select
                className="assignable-user-select"
                value={departmentId ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setDepartmentId(v === '' ? null : Number(v));
                  setPavilionUserId(null);
                }}
              >
                <option value="">— Выберите —</option>
                {pavilionOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="order-transfer-modal__hint">
              Заказ уйдёт в пул выбранной точки: ответственный и исполнители будут сняты.
              Контактёр по умолчанию останется.
            </p>
            <label className="order-transfer-modal__check">
              <input
                type="checkbox"
                checked={assignResponsible}
                onChange={(e) => setAssignResponsible(e.target.checked)}
                disabled={departmentId == null}
              />
              <span>Сразу назначить ответственного</span>
            </label>
            {assignResponsible ? (
              <label className="order-transfer-modal__field">
                <span>Ответственный / исполнитель</span>
                <AssignableUserSelect
                  value={pavilionUserId}
                  onChange={setPavilionUserId}
                  onShift={onShift}
                  all={all}
                  emptyLabel="— Выберите —"
                  disabled={departmentId == null}
                />
              </label>
            ) : null}
          </div>
        )}

        <div className="order-transfer-modal__actions">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || submitting}
            loading={submitting}
          >
            Передать
          </Button>
        </div>
      </div>
    </Modal>
  );
};
