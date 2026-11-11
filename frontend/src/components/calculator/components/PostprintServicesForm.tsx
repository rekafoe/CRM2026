import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '../../ui/AppIcon';
import { MoneyAmount } from '../../ui';
import { getRecentPostprintServiceIds } from '../../../services/pricing/api';
import { PostprintServiceCard } from './PostprintServiceCard';
import { SelectedProductCard } from './SelectedProductCard';
import type { PostprintServiceOption } from './postprintTypes';
import {
  clearPostprintServiceSelection,
  defaultPostprintSelectionKey,
  foldPostprintSearch,
  groupPostprintServices,
  isPostprintServiceSelected,
  pickRecentServices,
  postprintGroupStartsCollapsed,
  postprintGroupTitle,
  postprintServiceQuantity,
  recentServiceIdsFromOrderItems,
  selectPostprintService,
  servicesCountLabel,
} from './postprintPicker';

interface PostprintServicesFormProps {
  selectedProductName: string;
  onOpenProductSelector: () => void;
  postprintLoading: boolean;
  postprintError: string | null;
  postprintServices: PostprintServiceOption[];
  postprintSelections: Record<string, number>;
  setPostprintSelections: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  getOperationUnitPrice: (op: any, qty: number) => number;
  orderId?: number | null;
  orderItems?: Array<{ id: number; params?: unknown }>;
}

export const PostprintServicesForm: React.FC<PostprintServicesFormProps> = ({
  selectedProductName,
  onOpenProductSelector,
  postprintLoading,
  postprintError,
  postprintServices,
  postprintSelections,
  setPostprintSelections,
  getOperationUnitPrice,
  orderId,
  orderItems,
}) => {
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [remoteIds, setRemoteIds] = useState<number[] | null>(null);
  const pendingRevealId = useRef<number | null>(null);
  const searching = foldPostprintSearch(query).length > 0;

  const localIds = useMemo(
    () => recentServiceIdsFromOrderItems(orderItems ?? []),
    [orderItems],
  );

  useEffect(() => {
    let cancelled = false;
    setRemoteIds(null);
    const resolvedOrderId = orderId != null && orderId > 0 ? orderId : null;
    void getRecentPostprintServiceIds(resolvedOrderId)
      .then((ids) => {
        if (!cancelled) setRemoteIds(ids);
      })
      .catch(() => {
        if (!cancelled) setRemoteIds(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const recentIds = remoteIds ?? localIds;
  const groups = useMemo(
    () => groupPostprintServices(postprintServices, query),
    [postprintServices, query],
  );
  const recentServices = useMemo(
    () => pickRecentServices(postprintServices, recentIds, query),
    [postprintServices, recentIds, query],
  );
  const selectedServices = useMemo(
    () => postprintServices.filter((service) => isPostprintServiceSelected(service.serviceId, postprintSelections)),
    [postprintServices, postprintSelections],
  );

  useEffect(() => {
    const id = pendingRevealId.current;
    if (id == null) return;
    const node = document.getElementById(`postprint-service-${id}`);
    if (!node) return;
    node.scrollIntoView({ block: 'nearest' });
    pendingRevealId.current = null;
  }, [openGroups, postprintServices, query]);

  const revealService = (service: PostprintServiceOption, clearQuery = false) => {
    pendingRevealId.current = service.serviceId;
    if (clearQuery) setQuery('');
    const title = postprintGroupTitle(service);
    setOpenGroups((prev) => ({ ...prev, [title]: true }));
  };

  const isGroupOpen = (name: string, totalInGroup: number) => {
    if (!postprintGroupStartsCollapsed(totalInGroup)) return true;
    return openGroups[name] === true;
  };

  const previewUnitPrice = (service: PostprintServiceOption) => {
    const variant = service.variants.find((item) => item.key === defaultPostprintSelectionKey(service)) ?? service.variants[0];
    return getOperationUnitPrice(
      {
        key: defaultPostprintSelectionKey(service),
        serviceId: service.serviceId,
        variantId: variant?.variantId,
        name: service.name,
        unit: service.unit,
        priceUnit: service.priceUnit,
        rate: service.rate,
        tiers: variant?.tiers?.length ? variant.tiers : service.tiers,
      },
      Math.max(1, service.minQuantity ?? 1),
    );
  };

  return (
    <div className="calculator-section-group calculator-section-unified">
      <div className="section-group-header">
        <h3>
          <AppIcon name="wrench" size="xs" /> Послепечатные услуги
        </h3>
      </div>
      <div className="section-group-content">
        <div className="postprint-picker-search-wrap">
          <label className="postprint-picker-search-label" htmlFor="postprint-service-search">
            Поиск по названию
          </label>
          <AppIcon name="search" size="xs" className="postprint-picker-search__icon" />
          <input
            id="postprint-service-search"
            type="search"
            className="postprint-picker-search"
            placeholder="Название услуги"
            value={query}
            autoComplete="off"
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button
              type="button"
              className="postprint-picker-search__clear"
              aria-label="Очистить поиск"
              onClick={() => setQuery('')}
            >
              <AppIcon name="x" size="xs" />
            </button>
          ) : null}
        </div>

        <SelectedProductCard
          productType="postprint"
          displayName={selectedProductName || 'Послепечатные услуги'}
          onOpenSelector={onOpenProductSelector}
        />

        <div className="form-section postprint-services-form">
          {selectedServices.length > 0 && (
            <div className="postprint-chip-row" aria-label="Выбранные услуги">
              {selectedServices.map((service) => {
                const quantity = postprintServiceQuantity(service.serviceId, postprintSelections);
                return (
                  <span key={service.serviceId} className="postprint-chip">
                    <button type="button" className="postprint-chip__name" onClick={() => revealService(service, true)}>
                      {service.name}
                      {quantity > 0 ? <span className="postprint-chip__qty">× {quantity}</span> : null}
                    </button>
                    <button
                      type="button"
                      className="postprint-chip__remove"
                      aria-label={`Убрать ${service.name}`}
                      onClick={() =>
                        setPostprintSelections((prev) => clearPostprintServiceSelection(prev, service.serviceId))
                      }
                    >
                      <AppIcon name="x" size="xs" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {postprintLoading && <div className="postprint-services-loading">Загрузка операций...</div>}
          {postprintError && !postprintLoading && (
            <div className="postprint-services-error">{postprintError}</div>
          )}
          {!postprintLoading && !postprintError && (
            <div className="postprint-services-list">
              {recentServices.length > 0 && (
                <section className="postprint-recent" aria-label="Недавние услуги">
                  <div className="postprint-recent__title">Недавние</div>
                  <div className="postprint-recent__list">
                    {recentServices.map((service) => {
                      const selected = isPostprintServiceSelected(service.serviceId, postprintSelections);
                      return (
                        <button
                          key={service.serviceId}
                          type="button"
                          className={selected ? 'postprint-recent__item is-selected' : 'postprint-recent__item'}
                          onClick={() => {
                            if (selected) {
                              setPostprintSelections((prev) =>
                                clearPostprintServiceSelection(prev, service.serviceId),
                              );
                              return;
                            }
                            setPostprintSelections((prev) => selectPostprintService(prev, service));
                            revealService(service);
                          }}
                        >
                          <span className="postprint-recent__name">{service.name}</span>
                          <span className="postprint-recent__price">
                            <MoneyAmount value={previewUnitPrice(service)} /> / {service.priceUnit || service.unit || 'шт'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {groups.length === 0 ? (
                <div className="postprint-services-empty">
                  {searching ? 'Ничего не найдено' : 'Нет доступных операций'}
                </div>
              ) : (
                groups.map((group) => {
                  const open = searching || isGroupOpen(group.categoryName, group.totalInGroup);
                  const collapsible = !searching && postprintGroupStartsCollapsed(group.totalInGroup);
                  const countLabel = servicesCountLabel(searching ? group.services.length : group.totalInGroup);
                  return (
                    <div key={group.categoryName} className="postprint-category-group">
                      {collapsible ? (
                        <button
                          type="button"
                          className="postprint-category-group__toggle"
                          aria-expanded={open}
                          onClick={() =>
                            setOpenGroups((prev) => ({
                              ...prev,
                              [group.categoryName]: !isGroupOpen(group.categoryName, group.totalInGroup),
                            }))
                          }
                        >
                          <AppIcon name={open ? 'arrow-up' : 'arrow-down'} size="xs" />
                          <span>{group.categoryName}</span>
                          <span className="postprint-category-group__count">{countLabel}</span>
                        </button>
                      ) : (
                        <div className="postprint-category-group__title">
                          <span>{group.categoryName}</span>
                          <span className="postprint-category-group__count">{countLabel}</span>
                        </div>
                      )}
                      {open &&
                        group.services.map((service) => (
                          <div
                            key={service.serviceId}
                            id={`postprint-service-${service.serviceId}`}
                            className={
                              isPostprintServiceSelected(service.serviceId, postprintSelections)
                                ? 'postprint-service-slot is-picked'
                                : 'postprint-service-slot'
                            }
                          >
                            <PostprintServiceCard
                              service={service}
                              postprintSelections={postprintSelections}
                              setPostprintSelections={setPostprintSelections}
                              getOperationUnitPrice={getOperationUnitPrice}
                            />
                          </div>
                        ))}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
