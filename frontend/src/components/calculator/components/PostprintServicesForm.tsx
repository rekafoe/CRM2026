import React from 'react';
import { AppIcon } from '../../ui/AppIcon';
import { PostprintServiceCard } from './PostprintServiceCard';
import type { PostprintCategory, PostprintServiceOption } from './postprintTypes';
import { SelectedProductCard } from './SelectedProductCard';

interface PostprintServicesFormProps {
  selectedProductName: string;
  onOpenProductSelector: () => void;
  postprintLoading: boolean;
  postprintError: string | null;
  postprintServices: PostprintServiceOption[];
  postprintByCategory: PostprintCategory[];
  postprintSelections: Record<string, number>;
  setPostprintSelections: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  getOperationUnitPrice: (op: any, qty: number) => number;
}

export const PostprintServicesForm: React.FC<PostprintServicesFormProps> = ({
  selectedProductName,
  onOpenProductSelector,
  postprintLoading,
  postprintError,
  postprintServices,
  postprintByCategory,
  postprintSelections,
  setPostprintSelections,
  getOperationUnitPrice,
}) => (
  <div className="calculator-section-group calculator-section-unified">
    <div className="section-group-header">
      <h3>
        <AppIcon name="wrench" size="xs" /> Послепечатные услуги
      </h3>
    </div>
    <div className="section-group-content">
      <SelectedProductCard
        productType="postprint"
        displayName={selectedProductName || 'Послепечатные услуги'}
        onOpenSelector={onOpenProductSelector}
      />
      <div className="form-section postprint-services-form">
        {postprintLoading && (
          <div className="postprint-services-loading">Загрузка операций...</div>
        )}
        {postprintError && !postprintLoading && (
          <div className="postprint-services-error">{postprintError}</div>
        )}
        {!postprintLoading && !postprintError && (
          <div className="postprint-services-list">
            {postprintServices.length === 0 ? (
              <div className="postprint-services-empty">Нет доступных операций</div>
            ) : (
              postprintByCategory.map((group) => (
                <div key={group.categoryName} className="postprint-category-group">
                  <h3 className="postprint-category-group__title">{group.categoryName}</h3>
                  {group.services.map((service) => (
                    <PostprintServiceCard
                      key={String(service.serviceId)}
                      service={service}
                      postprintSelections={postprintSelections}
                      setPostprintSelections={setPostprintSelections}
                      getOperationUnitPrice={getOperationUnitPrice}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  </div>
);
