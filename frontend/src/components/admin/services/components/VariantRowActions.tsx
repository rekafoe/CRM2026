import React from 'react';

export type VariantRowActionsLayout = 'root' | 'branch' | 'leaf';

export interface VariantRowActionsProps {
  layout: VariantRowActionsLayout;
  onAddChild?: () => void;
  onAddSibling?: () => void;
  onDelete: () => void;
}

/** Пустая ячейка той же ширины, что и кнопка — столбцы действий ровные по строкам */
const Slot: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <span className="variant-actions-slot">{children}</span>
);

/**
 * Кнопки в колонке «Действия»: всегда три слота — дочерняя (↘), соседняя (↓), удалить (×).
 * Порядок одинаковый на всех уровнях; где кнопки нет — пустой слот.
 */
export const VariantRowActions: React.FC<VariantRowActionsProps> = ({
  layout,
  onAddChild,
  onAddSibling,
  onDelete,
}) => (
  <td className="variant-actions-cell">
    <div className="cell">
      <div className="variant-actions-row" role="group" aria-label="Действия со строкой">
        {layout === 'root' && (
          <>
            <Slot>
              <button
                type="button"
                className="el-button el-button--success el-button--small is-plain"
                onClick={onAddChild}
                title="Добавить дочернюю строку"
              >
                <span style={{ fontSize: '14px' }}>↘</span>
              </button>
            </Slot>
            <Slot>
              <button
                type="button"
                className="el-button el-button--success el-button--small"
                onClick={onAddSibling}
                title="Добавить тип на том же уровне"
              >
                <span style={{ fontSize: '14px' }}>↓</span>
              </button>
            </Slot>
            <Slot>
              <button
                type="button"
                className="el-button el-button--danger el-button--small is-plain variant-delete-btn"
                onClick={onDelete}
                title="Удалить тип"
              >
                <span style={{ fontSize: '14px' }}>×</span>
              </button>
            </Slot>
          </>
        )}
        {layout === 'branch' && (
          <>
            <Slot>
              <button
                type="button"
                className="el-button el-button--success el-button--small is-plain"
                onClick={onAddChild}
                title="Добавить дочернюю строку (уровень 2)"
              >
                <span style={{ fontSize: '14px' }}>↘</span>
              </button>
            </Slot>
            <Slot>
              <button
                type="button"
                className="el-button el-button--success el-button--small"
                onClick={onAddSibling}
                title="Добавить строку на том же уровне"
              >
                <span style={{ fontSize: '14px' }}>↓</span>
              </button>
            </Slot>
            <Slot>
              <button
                type="button"
                className="el-button el-button--danger el-button--small"
                onClick={onDelete}
                title="Удалить строку"
              >
                <span style={{ fontSize: '14px' }}>×</span>
              </button>
            </Slot>
          </>
        )}
        {layout === 'leaf' && (
          <>
            <Slot />
            <Slot>
              <button
                type="button"
                className="el-button el-button--success el-button--small"
                onClick={onAddSibling}
                title="Добавить строку на том же уровне"
              >
                <span style={{ fontSize: '14px' }}>↓</span>
              </button>
            </Slot>
            <Slot>
              <button
                type="button"
                className="el-button el-button--danger el-button--small"
                onClick={onDelete}
                title="Удалить строку"
              >
                <span style={{ fontSize: '14px' }}>×</span>
              </button>
            </Slot>
          </>
        )}
      </div>
    </div>
  </td>
);
