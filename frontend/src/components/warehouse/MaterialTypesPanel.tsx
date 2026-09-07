import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createMaterialType,
  deleteMaterialType,
  getMaterialTypePrintTechnologies,
  getMaterialTypes,
  getPrintTechnologies,
  replaceMaterialTypePrintTechnologies,
  updateMaterialType,
  MaterialPrintTechnologyDto,
  MaterialTypeDto,
} from '../../api';
import { useUIStore } from '../../stores/uiStore';
import { EmptyState, ConfirmDialog } from '../common';
import { AppIcon } from '../ui/AppIcon';
import { WarehouseButton } from './common/WarehouseButton';
import { WarehouseModal } from './common/WarehouseModal';
import './MaterialTypesPanel.css';

interface MaterialTypesPanelProps {
  categoryId: number | null;
  categoryName?: string;
}

type TypeForm = {
  name: string;
  code: string;
  description: string;
  is_active: boolean;
};

type PrintTechnologyOption = {
  code: string;
  name: string;
  pricing_mode?: string;
  is_active?: number | boolean;
};

const EMPTY_FORM: TypeForm = {
  name: '',
  code: '',
  description: '',
  is_active: true,
};

const PRINT_PRICING_MODE_LABELS: Record<string, string> = {
  per_sheet: 'Листовая',
  per_meter: 'Погонные метры',
  per_m2: 'Квадратные метры',
};

export const MaterialTypesPanel: React.FC<MaterialTypesPanelProps> = ({
  categoryId,
  categoryName,
}) => {
  const { showToast } = useUIStore();
  const [types, setTypes] = useState<MaterialTypeDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MaterialTypeDto | null>(null);
  const [form, setForm] = useState<TypeForm>(EMPTY_FORM);
  const [typeToDelete, setTypeToDelete] = useState<MaterialTypeDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [printTechnologies, setPrintTechnologies] = useState<PrintTechnologyOption[]>([]);
  const [printLinks, setPrintLinks] = useState<MaterialPrintTechnologyDto[]>([]);
  const [loadingPrintLinks, setLoadingPrintLinks] = useState(false);

  const load = useCallback(async () => {
    if (!categoryId) {
      setTypes([]);
      return;
    }
    try {
      setLoading(true);
      const res = await getMaterialTypes({ category_id: categoryId });
      setTypes(Array.isArray(res.data) ? res.data : []);
    } catch (error: any) {
      showToast(error?.response?.data?.error || 'Не удалось загрузить типы', 'error');
      setTypes([]);
    } finally {
      setLoading(false);
    }
  }, [categoryId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getPrintTechnologies()
      .then((response) => {
        const rows = Array.isArray(response.data) ? response.data : [];
        setPrintTechnologies(
          rows
            .filter((row: any) => row?.code)
            .map((row: any) => ({
              code: String(row.code),
              name: String(row.name || row.code),
              pricing_mode: row.pricing_mode ? String(row.pricing_mode) : undefined,
              is_active: row.is_active,
            })),
        );
      })
      .catch(() => setPrintTechnologies([]));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return types;
    return types.filter((t) =>
      (t.name || '').toLowerCase().includes(q)
      || (t.code || '').toLowerCase().includes(q)
      || (t.description || '').toLowerCase().includes(q),
    );
  }, [types, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPrintLinks([]);
    setShowModal(true);
  };

  const openEdit = (row: MaterialTypeDto) => {
    setEditing(row);
    setForm({
      name: row.name || '',
      code: row.code || '',
      description: row.description || '',
      is_active: Number(row.is_active ?? 1) !== 0,
    });
    setPrintLinks([]);
    setShowModal(true);
    setLoadingPrintLinks(true);
    getMaterialTypePrintTechnologies(row.id)
      .then((response) => {
        const links = Array.isArray(response.data) ? response.data : [];
        setPrintLinks(links);
      })
      .catch((error: any) => {
        showToast(error?.response?.data?.error || 'Не удалось загрузить разрешённую печать', 'error');
      })
      .finally(() => setLoadingPrintLinks(false));
  };

  const togglePrintTechnology = (technologyCode: string, enabled: boolean) => {
    setPrintLinks((current) => {
      if (!enabled) {
        const remaining = current.filter((link) => link.technology_code !== technologyCode);
        if (current.some((link) => link.technology_code === technologyCode && Boolean(link.is_default))) {
          return remaining.map((link, index) => ({ ...link, is_default: index === 0 }));
        }
        return remaining;
      }
      if (current.some((link) => link.technology_code === technologyCode)) return current;
      return [
        ...current,
        {
          technology_code: technologyCode,
          supports_indoor: true,
          supports_outdoor: false,
          is_default: current.length === 0,
          priority: current.length * 10 + 10,
          is_active: true,
        },
      ];
    });
  };

  const updatePrintLink = (
    technologyCode: string,
    patch: Partial<MaterialPrintTechnologyDto>,
  ) => {
    setPrintLinks((current) =>
      current.map((link) =>
        link.technology_code === technologyCode ? { ...link, ...patch } : link,
      ),
    );
  };

  const setDefaultPrintTechnology = (technologyCode: string) => {
    setPrintLinks((current) =>
      current.map((link) => ({
        ...link,
        is_default: link.technology_code === technologyCode,
      })),
    );
  };

  const save = async () => {
    if (!categoryId) return;
    if (!form.name.trim()) {
      showToast('Введите название типа', 'warning');
      return;
    }
    const withoutUsage = printLinks.find(
      (link) => !Boolean(link.supports_indoor) && !Boolean(link.supports_outdoor),
    );
    if (withoutUsage) {
      const technology = printTechnologies.find((row) => row.code === withoutUsage.technology_code);
      showToast(
        `Для технологии «${technology?.name || withoutUsage.technology_code}» выберите помещение и/или улицу`,
        'warning',
      );
      return;
    }
    try {
      setSaving(true);
      const payload = {
        category_id: categoryId,
        name: form.name.trim(),
        code: form.code.trim() || null,
        description: form.description.trim() || null,
        is_active: form.is_active,
      };
      let savedTypeId: number;
      if (editing) {
        const response = await updateMaterialType(editing.id, payload);
        savedTypeId = response.data.id;
      } else {
        const response = await createMaterialType(payload);
        savedTypeId = response.data.id;
        // Если сохранение связей ниже не удастся, повторная попытка должна обновлять уже созданный тип.
        setEditing(response.data);
      }
      await replaceMaterialTypePrintTechnologies(savedTypeId, printLinks);
      showToast(editing ? 'Тип обновлён' : 'Тип создан', 'success');
      setShowModal(false);
      await load();
    } catch (error: any) {
      showToast(error?.response?.data?.error || error?.message || 'Ошибка сохранения типа', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!typeToDelete) return;
    try {
      await deleteMaterialType(typeToDelete.id);
      showToast('Тип удалён', 'success');
      setTypeToDelete(null);
      await load();
    } catch (error: any) {
      showToast(error?.response?.data?.error || error?.message || 'Ошибка удаления типа', 'error');
      setTypeToDelete(null);
    }
  };

  if (!categoryId) {
    return (
      <div className="material-types-panel">
        <EmptyState
          title="Выберите категорию"
          description="Типы материалов создаются внутри категории. Выберите категорию слева."
        />
      </div>
    );
  }

  return (
    <div className="material-types-panel">
      <div className="material-types-panel__header">
        <div>
          <h3 className="material-types-panel__title">
            Типы: {categoryName || `категория #${categoryId}`}
          </h3>
          <p className="material-types-panel__hint">
            Здесь создаются типы, которые потом выбираются в карточке материала.
          </p>
        </div>
        <div className="flex gap-2">
          <WarehouseButton
            variant="secondary"
            size="sm"
            icon={<AppIcon name="refresh" size="xs" />}
            onClick={load}
            title="Обновить"
          >
            Обновить
          </WarehouseButton>
          <WarehouseButton
            variant="primary"
            size="sm"
            icon={<AppIcon name="plus" size="xs" />}
            onClick={openCreate}
          >
            Добавить тип
          </WarehouseButton>
        </div>
      </div>

      <input
        className="form-input"
        placeholder="Поиск типа..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p className="material-types-panel__hint">Загрузка типов...</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Нет типов в этой категории"
          description="Создайте тип, например «Плёнка глянец» или «Бумага мелованная»"
          action={{ label: 'Добавить тип', onClick: openCreate }}
        />
      ) : (
        <div className="material-types-panel__table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Код</th>
                <th>Описание</th>
                <th>Статус</th>
                <th>Материалы</th>
                <th>Печать</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const active = Number(row.is_active ?? 1) !== 0;
                return (
                  <tr key={row.id} className={active ? undefined : 'material-types-panel__inactive'}>
                    <td>{row.name}</td>
                    <td>{row.code || '—'}</td>
                    <td>{row.description || '—'}</td>
                    <td>
                      <span className={`material-types-panel__badge ${active ? 'material-types-panel__badge--active' : ''}`}>
                        {active ? 'Активен' : 'Выключен'}
                      </span>
                    </td>
                    <td>{row.materials_count ?? 0}</td>
                    <td>
                      {row.print_technologies_count
                        ? `${row.print_technologies_count} техн.`
                        : 'Не настроена'}
                    </td>
                    <td>
                      <div className="inv-actions">
                        <WarehouseButton
                          variant="secondary"
                          size="sm"
                          icon={<AppIcon name="pencil" size="xs" />}
                          onClick={() => openEdit(row)}
                          title="Изменить"
                          className="icon-only"
                        />
                        <WarehouseButton
                          variant="danger"
                          size="sm"
                          icon={<AppIcon name="trash" size="xs" />}
                          onClick={() => setTypeToDelete(row)}
                          title="Удалить"
                          className="icon-only"
                          disabled={(row.materials_count ?? 0) > 0}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <WarehouseModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Редактировать тип' : 'Новый тип материала'}
        size="xl"
        className="material-types-modal"
        modalClassName="material-types-modal-shell"
        footer={(
          <>
            <WarehouseButton variant="secondary" onClick={() => setShowModal(false)}>
              Отмена
            </WarehouseButton>
            <WarehouseButton variant="primary" onClick={save} loading={saving}>
              Сохранить
            </WarehouseButton>
          </>
        )}
      >
        <div className="material-types-form">
          <section className="material-types-form__section">
            <div className="material-types-form__section-header">
              <span className="material-types-form__section-icon">
                <AppIcon name="tag" size="xs" />
              </span>
              <div>
                <h4>Основные данные</h4>
                <p>Название увидит оператор при выборе складского материала.</p>
              </div>
            </div>
            <div className="material-types-form__basic-grid">
              <div className="form-group material-types-form__name-field">
                <label htmlFor="material-type-name">Название *</label>
                <input
                  id="material-type-name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Например, ORACAL белая матовая"
                />
              </div>
              <div className="form-group">
                <label htmlFor="material-type-code">Код</label>
                <input
                  id="material-type-code"
                  value={form.code}
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                  placeholder="Необязательно"
                />
              </div>
              <label className="material-types-form__status-card">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
                <span>
                  <strong>Тип активен</strong>
                  <small>Можно назначать новым материалам</small>
                </span>
              </label>
              <div className="form-group material-types-form__description-field">
                <label htmlFor="material-type-description">Описание</label>
                <textarea
                  id="material-type-description"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Краткое внутреннее пояснение для сотрудников"
                />
              </div>
            </div>
          </section>

          <section className="material-types-form__section material-types-print">
            <div className="material-types-form__section-header material-types-print__header">
              <span className="material-types-form__section-icon material-types-form__section-icon--print">
                <AppIcon name="printer" size="xs" />
              </span>
              <div>
                <h4>Разрешённые технологии печати</h4>
                <p>
                  CRM сама выберет технологию по назначению. Настройка действует на все
                  ширины и плотности этого типа материала.
                </p>
              </div>
              <span className="material-types-print__count">
                Выбрано: {printLinks.length}
              </span>
            </div>

            {loadingPrintLinks ? (
              <div className="material-types-print__empty">Загрузка технологий...</div>
            ) : printTechnologies.length === 0 ? (
              <div className="material-types-print__empty">
                Нет технологий печати. Сначала добавьте их в настройках принтеров.
              </div>
            ) : (
              <div className="material-types-print__list">
                {printTechnologies
                  .filter(
                    (technology) =>
                      Number(technology.is_active ?? 1) !== 0
                      || printLinks.some((link) => link.technology_code === technology.code),
                  )
                  .map((technology) => {
                    const link = printLinks.find(
                      (item) => item.technology_code === technology.code,
                    );
                    const enabled = Boolean(link);
                    const isDefault = Boolean(link?.is_default);
                    return (
                      <article
                        key={technology.code}
                        className={[
                          'material-types-print__card',
                          enabled ? 'is-enabled' : '',
                          isDefault ? 'is-default' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <div className="material-types-print__card-header">
                          <label className="material-types-print__technology">
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={(event) =>
                                togglePrintTechnology(technology.code, event.target.checked)
                              }
                            />
                            <span className="material-types-print__technology-copy">
                              <strong>{technology.name}</strong>
                              <small>{technology.code}</small>
                            </span>
                          </label>
                          <span className="material-types-print__mode-badge">
                            {PRINT_PRICING_MODE_LABELS[technology.pricing_mode || '']
                              || technology.pricing_mode
                              || 'Режим не указан'}
                          </span>
                          {enabled ? (
                            <button
                              type="button"
                              className={`material-types-print__default-button${isDefault ? ' is-active' : ''}`}
                              onClick={() => setDefaultPrintTechnology(technology.code)}
                            >
                              {isDefault ? (
                                <><AppIcon name="check" size="xs" /> Основная</>
                              ) : (
                                'Сделать основной'
                              )}
                            </button>
                          ) : (
                            <span className="material-types-print__disabled-label">Не используется</span>
                          )}
                        </div>

                        {enabled && link ? (
                          <div className="material-types-print__card-body">
                            <div className="material-types-print__control">
                              <span className="material-types-print__control-label">
                                Подходит для
                              </span>
                              <div className="material-types-print__usage" role="group" aria-label={`Назначение: ${technology.name}`}>
                                <button
                                  type="button"
                                  className={Boolean(link.supports_indoor) ? 'is-active' : ''}
                                  aria-pressed={Boolean(link.supports_indoor)}
                                  onClick={() =>
                                    updatePrintLink(technology.code, {
                                      supports_indoor: !Boolean(link.supports_indoor),
                                    })
                                  }
                                >
                                  В помещении
                                </button>
                                <button
                                  type="button"
                                  className={Boolean(link.supports_outdoor) ? 'is-active' : ''}
                                  aria-pressed={Boolean(link.supports_outdoor)}
                                  onClick={() =>
                                    updatePrintLink(technology.code, {
                                      supports_outdoor: !Boolean(link.supports_outdoor),
                                    })
                                  }
                                >
                                  На улице
                                </button>
                              </div>
                            </div>
                            <label className="material-types-print__priority">
                              <span>Приоритет маршрута</span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={link.priority ?? 100}
                                onChange={(event) =>
                                  updatePrintLink(technology.code, {
                                    priority: Math.max(
                                      0,
                                      Math.floor(Number(event.target.value) || 0),
                                    ),
                                  })
                                }
                              />
                              <small>Меньше — выше</small>
                            </label>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
              </div>
            )}

            <div className="material-types-print__note">
              <AppIcon name="info" size="xs" />
              <span>
                Клиент не увидит название технологии и ширину рулона — только материал
                и назначение «В помещении / На улице».
              </span>
            </div>
          </section>
        </div>
      </WarehouseModal>

      <ConfirmDialog
        isOpen={Boolean(typeToDelete)}
        onClose={() => setTypeToDelete(null)}
        onConfirm={confirmDelete}
        title="Удаление типа"
        message={typeToDelete ? `Удалить тип «${typeToDelete.name}»?` : ''}
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
      />
    </div>
  );
};
