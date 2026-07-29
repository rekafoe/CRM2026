import React, { useMemo } from 'react';
import type { AssignableUser } from '../../api';
import './AssignableUserSelect.css';

export type AssignableUserSelectProps = {
  value: number | '' | null;
  onChange: (userId: number | null) => void;
  onShift: AssignableUser[];
  all: AssignableUser[];
  id?: string;
  disabled?: boolean;
  className?: string;
  emptyLabel?: string;
  title?: string;
  /** Показать текущего выбранного, даже если его нет в списках */
  orphanLabel?: string;
};

function dedupeById(users: AssignableUser[]): AssignableUser[] {
  const seen = new Set<number>();
  const out: AssignableUser[] = [];
  for (const u of users) {
    const id = Number(u.id);
    if (!Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(u);
  }
  return out;
}

export const AssignableUserSelect: React.FC<AssignableUserSelectProps> = ({
  value,
  onChange,
  onShift,
  all,
  id,
  disabled,
  className = '',
  emptyLabel = '—',
  title,
  orphanLabel,
}) => {
  const onShiftList = useMemo(() => dedupeById(onShift), [onShift]);
  const onShiftIds = useMemo(() => new Set(onShiftList.map((u) => Number(u.id))), [onShiftList]);
  const allRest = useMemo(
    () => dedupeById(all).filter((u) => !onShiftIds.has(Number(u.id))),
    [all, onShiftIds],
  );

  const selectedId =
    value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0
      ? Number(value)
      : null;

  const orphan =
    selectedId != null &&
    !onShiftIds.has(selectedId) &&
    !allRest.some((u) => Number(u.id) === selectedId);

  return (
    <select
      id={id}
      className={`assignable-user-select ${className}`.trim()}
      value={selectedId ?? ''}
      disabled={disabled}
      title={title}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? null : Number(v));
      }}
    >
      <option value="">{emptyLabel}</option>
      {orphan && selectedId != null ? (
        <option value={selectedId}>{orphanLabel || `Пользователь #${selectedId}`}</option>
      ) : null}
      {onShiftList.length > 0 ? (
        <optgroup label="В смене">
          {onShiftList.map((u) => (
            <option key={`shift-${u.id}`} value={u.id}>
              {u.name}
            </option>
          ))}
        </optgroup>
      ) : null}
      {allRest.length > 0 ? (
        <optgroup label="Все сотрудники">
          {allRest.map((u) => (
            <option key={`all-${u.id}`} value={u.id}>
              {u.name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
};
