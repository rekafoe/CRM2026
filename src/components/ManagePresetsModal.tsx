// frontend/src/components/ManagePresetsModal.tsx

import React, { useState } from 'react';
import { PresetCategory, PresetItem, PresetExtra } from '../types';

interface Props {
  onClose: () => void;
  onSave: () => void;
}

type NewItemForm = { desc: string; price: string };
type NewExtraForm = { name: string; price: string; type: 'checkbox' | 'number'; unit: string };

export default function ManagePresetsModal({ onClose, onSave }: Props) {
  const isAdmin = typeof window !== 'undefined' && localStorage.getItem('crmRole') === 'admin';
  // Инициализируем из localStorage или пустым массивом
  const [presets, setPresets] = useState<PresetCategory[]>(() => {
    const stored = localStorage.getItem('crmPresets');
    if (stored) {
      try {
        return JSON.parse(stored) as PresetCategory[];
      } catch {
        // игнорируем ошибку парсинга
      }
    }
    return [];
  });

  // Формы для добавления новых items и extras
  const [newItem, setNewItem] = useState<Record<number, NewItemForm>>({});
  const [newExtra, setNewExtra] = useState<Record<number, NewExtraForm>>({});

  // Сохранить всё в localStorage и закрыть
  function handleSaveAll() {
    if (!isAdmin) { alert('Недостаточно прав'); return; }
    localStorage.setItem('crmPresets', JSON.stringify(presets));
    onSave();
  }

  // Добавить новую категорию
  function addCategory() {
    if (!isAdmin) { alert('Недостаточно прав'); return; }
    setPresets([
      ...presets,
      { category: '', color: '#000000', items: [], extras: [] }
    ]);
  }

  // Удалить категорию
  function removeCategory(idx: number) {
    if (!isAdmin) { alert('Недостаточно прав'); return; }
    setPresets(presets.filter((_, i) => i !== idx));
  }

  // Обновить категорию
  function updateCategoryField(
    idx: number,
    field: keyof Omit<PresetCategory, 'items' | 'extras'>,
    value: string
  ) {
    if (!isAdmin) { alert('Недостаточно прав'); return; }
    const arr = [...presets];
    (arr[idx] as any)[field] = value;
    setPresets(arr);
  }

  // Items
  function addItem(idx: number) {
    if (!isAdmin) { alert('Недостаточно прав'); return; }
    const form = newItem[idx];
    if (!form || !form.desc) return;
    const arr = [...presets];
    const items = [...arr[idx].items, { description: form.desc, price: Number(form.price) }];
    arr[idx] = { ...arr[idx], items };
    setPresets(arr);
    setNewItem({ ...newItem, [idx]: { desc: '', price: '' } });
  }

  function removeItem(catIdx: number, itemIdx: number) {
    if (!isAdmin) { alert('Недостаточно прав'); return; }
    const arr = [...presets];
    arr[catIdx].items = arr[catIdx].items.filter((_, i) => i !== itemIdx);
    setPresets(arr);
  }

  function updateItemField(
    catIdx: number,
    itemIdx: number,
    field: keyof PresetItem,
    value: string
  ) {
    if (!isAdmin) { alert('Недостаточно прав'); return; }
    const arr = [...presets];
    const item = { ...arr[catIdx].items[itemIdx], [field]: field === 'price' ? Number(value) : value };
    arr[catIdx].items[itemIdx] = item;
    setPresets(arr);
  }

  // Extras
  function addExtra(idx: number) {
    if (!isAdmin) { alert('Недостаточно прав'); return; }
    const form = newExtra[idx];
    if (!form || !form.name) return;
    const arr = [...presets];
    const extra: PresetExtra = {
      name: form.name,
      price: Number(form.price),
      type: form.type,
      unit: form.type === 'number' ? form.unit : undefined
    };
    arr[idx] = { ...arr[idx], extras: [...arr[idx].extras, extra] };
    setPresets(arr);
    setNewExtra({ ...newExtra, [idx]: { name: '', price: '', type: 'checkbox', unit: '' } });
  }

  function removeExtra(catIdx: number, extraIdx: number) {
    if (!isAdmin) { alert('Недостаточно прав'); return; }
    const arr = [...presets];
    arr[catIdx].extras = arr[catIdx].extras.filter((_, i) => i !== extraIdx);
    setPresets(arr);
  }

  function updateExtraField(
    catIdx: number,
    extraIdx: number,
    field: keyof PresetExtra,
    value: string
  ) {
    if (!isAdmin) { alert('Недостаточно прав'); return; }
    const arr = [...presets];
    const extra = { ...arr[catIdx].extras[extraIdx], [field]: field === 'price' ? Number(value) : value };
    // Если сменили type на 'checkbox', очищаем unit
    if (field === 'type' && value === 'checkbox') {
      extra.unit = undefined;
    }
    arr[catIdx].extras[extraIdx] = extra;
    setPresets(arr);
  }

  return (
    <div className="modal">
      <h3>Manage Presets</h3>
      <button onClick={addCategory} disabled={!isAdmin}>➕ Add Category</button>

      {presets.map((cat, idx) => (
        <div key={idx} style={{ border: `2px solid ${cat.color}`, padding: 8, margin: '8px 0' }}>
          {/* Категория */}
          <div>
            <input
              value={cat.category}
              placeholder="Category Name"
              onChange={e => updateCategoryField(idx, 'category', e.target.value)}
            />
            <input
              type="color"
              value={cat.color}
              onChange={e => updateCategoryField(idx, 'color', e.target.value)}
            />
            <button onClick={() => removeCategory(idx)} disabled={!isAdmin}>🗑 Delete Category</button>
          </div>

          {/* Items */}
          <div style={{ marginTop: 8 }}>
            <h4>Items</h4>
            {cat.items.map((it, i) => (
              <div key={i}>
                <input
                  value={it.description}
                  onChange={e => updateItemField(idx, i, 'description', e.target.value)}
                />
                <input
                  type="number"
                  value={it.price}
                  onChange={e => updateItemField(idx, i, 'price', e.target.value)}
                />
                <button onClick={() => removeItem(idx, i)}>✖</button>
              </div>
            ))}
            <div>
              <input
                placeholder="New description"
                value={newItem[idx]?.desc || ''}
                onChange={e => setNewItem({
                  ...newItem,
                  [idx]: { ...(newItem[idx] || { desc: '', price: '' }), desc: e.target.value }
                })}
              />
              <input
                type="number"
                placeholder="Price"
                value={newItem[idx]?.price || ''}
                onChange={e => setNewItem({
                  ...newItem,
                  [idx]: { ...(newItem[idx] || { desc: '', price: '' }), price: e.target.value }
                })}
              />
              <button onClick={() => addItem(idx)} disabled={!isAdmin}>➕ Add Item</button>
            </div>
          </div>

          {/* Extras */}
          <div style={{ marginTop: 8 }}>
            <h4>Extras</h4>
            {cat.extras.map((ex, i) => (
              <div key={i}>
                <input
                  value={ex.name}
                  onChange={e => updateExtraField(idx, i, 'name', e.target.value)}
                />
                <input
                  type="number"
                  value={ex.price}
                  onChange={e => updateExtraField(idx, i, 'price', e.target.value)}
                />
                <select
                  value={ex.type}
                  onChange={e => updateExtraField(idx, i, 'type', e.target.value)}
                >
                  <option value="checkbox">Checkbox</option>
                  <option value="number">Number</option>
                </select>
                {ex.type === 'number' && (
                  <input
                    placeholder="Unit"
                    value={ex.unit || ''}
                    onChange={e => updateExtraField(idx, i, 'unit', e.target.value)}
                  />
                )}
                <button onClick={() => removeExtra(idx, i)} disabled={!isAdmin}>✖</button>
              </div>
            ))}
            <div>
              <input
                placeholder="New extra name"
                value={newExtra[idx]?.name || ''}
                onChange={e => setNewExtra({
                  ...newExtra,
                  [idx]: { ...(newExtra[idx] || { name: '', price: '', type: 'checkbox', unit: '' }), name: e.target.value }
                })}
              />
              <input
                type="number"
                placeholder="Price"
                value={newExtra[idx]?.price || ''}
                onChange={e => setNewExtra({
                  ...newExtra,
                  [idx]: { ...(newExtra[idx] || { name: '', price: '', type: 'checkbox', unit: '' }), price: e.target.value }
                })}
              />
              <select
                value={newExtra[idx]?.type || 'checkbox'}
                onChange={e => setNewExtra({
                  ...newExtra,
                  [idx]: { ...(newExtra[idx] || { name: '', price: '', type: 'checkbox', unit: '' }), type: e.target.value as 'checkbox' | 'number' }
                })}
              >
                <option value="checkbox">Checkbox</option>
                <option value="number">Number</option>
              </select>
              {newExtra[idx]?.type === 'number' && (
                <input
                  placeholder="Unit"
                  value={newExtra[idx]?.unit || ''}
                  onChange={e => setNewExtra({
                    ...newExtra,
                    [idx]: { ...(newExtra[idx] || { name: '', price: '', type: 'checkbox', unit: '' }), unit: e.target.value }
                  })}
                />
              )}
              <button onClick={() => addExtra(idx)} disabled={!isAdmin}>➕ Add Extra</button>
            </div>
          </div>
        </div>
      ))}

      <div style={{ marginTop: 16 }}>
        <button onClick={onClose}>Cancel</button>
        <button onClick={handleSaveAll} disabled={!isAdmin}>Save All</button>
      </div>
    </div>
  );
}
