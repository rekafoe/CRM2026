/**
 * Строка уровня 0 — тип (родительская строка дерева вариантов).
 */
import React from 'react';
import { PriceRangeCells } from './PriceRangeCells';
import { VariantRowLevel0Props } from './ServiceVariantsTable.types';

export const VariantRowLevel0: React.FC<VariantRowLevel0Props> = ({
  variant,
  typeName,
  commonRangesAsPriceRanges,
  isEditingName,
  editingNameValue,
  onNameChange,
  onNameEditStart,
  onNameEditCancel,
  onNameSave,
  onCreateChild,
  onCreateSibling,
  onDelete,
}) => (
  <tr className="el-table__row expanded">
    <td className="variant-name-cell" style={{ width: '200px', minWidth: '200px', maxWidth: '200px', padding: 0 }}>
      <div className="cell">
        <div className="variant-name-row">
          <div className="el-input el-input--small" style={{ flex: 1, marginRight: '8px', minWidth: 0 }}>
            {isEditingName ? (
              <input
                type="text"
                className="el-input__inner"
                value={editingNameValue}
                onChange={(e) => onNameChange(e.target.value)}
                onBlur={onNameSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onNameSave();
                  } else if (e.key === 'Escape') {
                    onNameEditCancel();
                  }
                }}
                autoFocus
              />
            ) : (
              <input
                type="text"
                className="el-input__inner"
                value={typeName}
                onClick={onNameEditStart}
                readOnly
                style={{ cursor: 'pointer' }}
              />
            )}
          </div>
        </div>
      </div>
    </td>
    <PriceRangeCells
      tiers={[]}
      commonRanges={commonRangesAsPriceRanges}
      onPriceChange={() => {}}
      editable={false}
    />
    <td style={{ width: '120px', minWidth: '120px', maxWidth: '120px', padding: 0 }}>
      <div className="cell">
        <div className="active-panel" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <button
            type="button"
            className="el-button el-button--success el-button--small is-plain"
            onClick={onCreateChild}
            title="Добавить дочернюю строку"
          >
            <span style={{ fontSize: '14px' }}>↘</span>
          </button>
          <button
            type="button"
            className="el-button el-button--success el-button--small"
            onClick={onCreateSibling}
            title="Добавить тип на том же уровне"
          >
            <span style={{ fontSize: '14px' }}>↓</span>
          </button>
          <button
            type="button"
            className="el-button el-button--danger el-button--small is-plain variant-delete-btn"
            onClick={onDelete}
            title="Удалить тип"
          >
            <span style={{ fontSize: '14px' }}>×</span>
          </button>
        </div>
      </div>
    </td>
  </tr>
);
