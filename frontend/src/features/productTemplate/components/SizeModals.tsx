import React from 'react'
import { Button, FormField, Modal } from '../../../components/common'
import type { SimplifiedSizeConfig, ProductTypeId } from '../hooks/useProductTemplate'

interface AddSizeModalProps {
  isOpen: boolean
  onClose: () => void
  newSize: { label: string; width_mm: string; height_mm: string }
  setNewSize: (v: { label: string; width_mm: string; height_mm: string }) => void
  onCommit: () => void
}

export const AddSizeModal: React.FC<AddSizeModalProps> = ({
  isOpen,
  onClose,
  newSize,
  setNewSize,
  onCommit,
}) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Добавить размер" size="md">
    <div className="simplified-add-size">
      <FormField label="Название" required>
        <input className="form-input" value={newSize.label} onChange={(e) => setNewSize({ ...newSize, label: e.target.value })} placeholder="Например: A4" />
      </FormField>
      <div className="simplified-form-grid">
        <FormField label="Ширина, мм" required>
          <input className="form-input form-input--compact" value={newSize.width_mm} onChange={(e) => setNewSize({ ...newSize, width_mm: e.target.value })} placeholder="210" />
        </FormField>
        <FormField label="Высота, мм" required>
          <input className="form-input form-input--compact" value={newSize.height_mm} onChange={(e) => setNewSize({ ...newSize, height_mm: e.target.value })} placeholder="297" />
        </FormField>
      </div>
      <div className="simplified-add-size__actions">
        <Button variant="secondary" onClick={onClose}>Отмена</Button>
        <Button variant="primary" onClick={onCommit} disabled={!newSize.label.trim()}>Добавить</Button>
      </div>
    </div>
  </Modal>
)

interface CopySizesModalProps {
  isOpen: boolean
  onClose: () => void
  availableSourceTypes: Array<{ id: ProductTypeId; name: string }>
  copyFromTypeId: ProductTypeId | null
  setCopyFromTypeId: (id: ProductTypeId | null) => void
  copySourceSizes: SimplifiedSizeConfig[]
  copySelectedSizeIds: (number | string)[]
  setCopySelectedSizeIds: React.Dispatch<React.SetStateAction<(number | string)[]>>
  typeConfigs: Record<string, { sizes: SimplifiedSizeConfig[] }> | undefined
  onCommit: () => void
}

export const CopySizesModal: React.FC<CopySizesModalProps> = ({
  isOpen,
  onClose,
  availableSourceTypes,
  copyFromTypeId,
  setCopyFromTypeId,
  copySourceSizes,
  copySelectedSizeIds,
  setCopySelectedSizeIds,
  typeConfigs,
  onCommit,
}) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Скопировать размеры из другого типа" size="md">
    <div className="simplified-add-size">
      <FormField label="Тип-источник" required>
        <select
          className="form-select"
          value={copyFromTypeId ?? ''}
          onChange={(e) => {
            const typeId = Number(e.target.value)
            if (!Number.isFinite(typeId)) {
              setCopyFromTypeId(null)
              setCopySelectedSizeIds([])
              return
            }
            const sourceSizes = typeConfigs?.[String(typeId)]?.sizes ?? []
            setCopyFromTypeId(typeId)
            setCopySelectedSizeIds(sourceSizes.map((s) => s.id))
          }}
        >
          {availableSourceTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Размеры для копирования">
        {copySourceSizes.length === 0 ? (
          <div className="text-muted text-sm">В выбранном типе нет размеров для копирования.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={copySelectedSizeIds.length === copySourceSizes.length}
                onChange={(e) => {
                  if (e.target.checked) {
                    setCopySelectedSizeIds(copySourceSizes.map((s) => s.id))
                  } else {
                    setCopySelectedSizeIds([])
                  }
                }}
              />
              Выбрать все
            </label>
            <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border-color, #e5e7eb)', borderRadius: 8, padding: 8 }}>
              {copySourceSizes.map((s) => {
                const checked = copySelectedSizeIds.some((id) => String(id) === String(s.id))
                return (
                  <label key={s.id} className="checkbox-label" style={{ display: 'block', marginBottom: 6 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCopySelectedSizeIds((prev) => (prev.some((id) => String(id) === String(s.id)) ? prev : [...prev, s.id]))
                        } else {
                          setCopySelectedSizeIds((prev) => prev.filter((id) => String(id) !== String(s.id)))
                        }
                      }}
                    />
                    {s.label} ({s.width_mm}×{s.height_mm} мм)
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </FormField>
      <div className="simplified-add-size__actions">
        <Button variant="secondary" onClick={onClose}>Отмена</Button>
        <Button
          variant="primary"
          onClick={onCommit}
          disabled={!copyFromTypeId || copySelectedSizeIds.length === 0}
        >
          Скопировать
        </Button>
      </div>
    </div>
  </Modal>
)
