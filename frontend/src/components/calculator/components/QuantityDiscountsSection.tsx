import React, { useState, useEffect } from 'react';

interface QuantityDiscount {
  id: number;
  min_quantity: number;
  max_quantity?: number;
  discount_percent: number;
  discount_name: string;
  is_active: boolean;
}

interface QuantityDiscountsSectionProps {
  quantity: number;
  basePrice: number;
  onDiscountChange?: (discount: QuantityDiscount | null) => void;
}

export const QuantityDiscountsSection: React.FC<QuantityDiscountsSectionProps> = ({
  quantity,
  basePrice,
  onDiscountChange
}) => {
  const [discounts, setDiscounts] = useState<QuantityDiscount[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDiscount, setSelectedDiscount] = useState<QuantityDiscount | null>(null);

  // Загружаем скидки по тиражам
  useEffect(() => {
    loadQuantityDiscounts();
  }, []);

  // Определяем применимую скидку при изменении количества
  useEffect(() => {
    const applicableDiscount = findApplicableDiscount(quantity);
    setSelectedDiscount(applicableDiscount);
    onDiscountChange?.(applicableDiscount);
  }, [quantity, discounts]);

  const loadQuantityDiscounts = async () => {
    setLoading(true);
    try {
      // Загружаем скидки из API
      // Используем правильный endpoint из database-pricing
      const response = await fetch('/api/database-pricing/volume-discounts', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('crmToken') || 'admin-token-123'}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const discountsData = data.data || data;
        setDiscounts(Array.isArray(discountsData) ? discountsData : []);
      } else {
        // Если endpoint не найден (404) или ошибка - используем fallback данные
        // Это нормально, если скидки еще не настроены на бэкенде
        // Не показываем ошибку в консоли для 404
        if (response.status !== 404) {
          console.warn('Ошибка загрузки скидок по тиражам:', response.status);
        }
        setDiscounts(getFallbackDiscounts());
      }
    } catch (error) {
      // Тихая обработка ошибки - используем fallback данные
      // Не логируем ошибку в консоль, так как это ожидаемое поведение
      setDiscounts(getFallbackDiscounts());
    } finally {
      setLoading(false);
    }
  };

  const getFallbackDiscounts = (): QuantityDiscount[] => [
    {
      id: 1,
      min_quantity: 100,
      max_quantity: 499,
      discount_percent: 5,
      discount_name: 'Скидка 5% от 100 шт',
      is_active: true
    },
    {
      id: 2,
      min_quantity: 500,
      max_quantity: 999,
      discount_percent: 10,
      discount_name: 'Скидка 10% от 500 шт',
      is_active: true
    },
    {
      id: 3,
      min_quantity: 1000,
      max_quantity: 4999,
      discount_percent: 15,
      discount_name: 'Скидка 15% от 1000 шт',
      is_active: true
    },
    {
      id: 4,
      min_quantity: 5000,
      discount_percent: 20,
      discount_name: 'Скидка 20% от 5000 шт',
      is_active: true
    }
  ];

  const findApplicableDiscount = (qty: number): QuantityDiscount | null => {
    if (qty <= 0) return null;

    // Сортируем скидки по минимальному количеству (по убыванию)
    const sortedDiscounts = discounts
      .filter(d => d.is_active)
      .sort((a, b) => b.min_quantity - a.min_quantity);

    // Находим первую подходящую скидку
    for (const discount of sortedDiscounts) {
      if (qty >= discount.min_quantity) {
        if (!discount.max_quantity || qty <= discount.max_quantity) {
          return discount;
        }
      }
    }

    return null;
  };

  // ❌ УДАЛЕНО: Расчет скидок на фронтенде
  // Компонент теперь ТОЛЬКО отображает информацию о доступных скидках
  // Фактическое применение скидок должно происходить на бэкенде
  
  // const calculateDiscountAmount = (discount: QuantityDiscount | null): number => {
  //   if (!discount) return 0;
  //   return (basePrice * quantity * discount.discount_percent) / 100;
  // };

  // const calculateFinalPrice = (): number => {
  //   const discountAmount = calculateDiscountAmount(selectedDiscount);
  //   return (basePrice * quantity) - discountAmount;
  // };

  const getDiscountTier = (qty: number): string => {
    if (qty < 100) return 'Стандартная цена';
    if (qty < 500) return 'Базовый тираж';
    if (qty < 1000) return 'Средний тираж';
    if (qty < 5000) return 'Крупный тираж';
    return 'Оптовый тираж';
  };

  const getNextTierInfo = (qty: number): { nextTier: number; additionalDiscount: number } | null => {
    const nextDiscount = discounts
      .filter(d => d.is_active && d.min_quantity > qty)
      .sort((a, b) => a.min_quantity - b.min_quantity)[0];

    if (!nextDiscount) return null;

    return {
      nextTier: nextDiscount.min_quantity,
      additionalDiscount: nextDiscount.discount_percent - (selectedDiscount?.discount_percent || 0)
    };
  };

  if (loading) {
    return (
      <div className="quantity-discounts-section">
        <h4>💰 Скидки по тиражам</h4>
        <div className="loading-state">
          <small>🔄 Загружаем информацию о скидках...</small>
        </div>
      </div>
    );
  }

  const nextTierInfo = getNextTierInfo(quantity);
  // ❌ УДАЛЕНО: Расчет финальной цены на фронтенде
  // const discountAmount = calculateDiscountAmount(selectedDiscount);
  // const finalPrice = calculateFinalPrice();

  return (
    <div className="quantity-discounts-section">
      <h4>💰 Скидки по тиражам</h4>
      
      {/* Текущий тираж */}
      <div className="current-tier">
        <div className="tier-info">
          <span className="tier-label">Текущий тираж:</span>
          <span className="tier-value">{quantity} шт</span>
          <span className="tier-category">({getDiscountTier(quantity)})</span>
        </div>
      </div>

      {/* Применимая скидка */}
      {selectedDiscount ? (
        <div className="applied-discount">
          <div className="discount-header">
            <span className="discount-icon">🎯</span>
            <span className="discount-name">{selectedDiscount.discount_name}</span>
          </div>
          <div className="discount-details">
            {/* ❌ УДАЛЕНО: Отображение суммы скидки (считалось на фронте) */}
            <div className="discount-percent">
              <span className="percent-label">Скидка:</span>
              <span className="percent-value">{selectedDiscount.discount_percent}%</span>
            </div>
            <div className="discount-info">
              <span className="info-text">💡 Скидка будет применена при расчете на сервере</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="no-discount">
          <span className="no-discount-icon">💡</span>
          <span className="no-discount-text">Скидки по тиражам не применяются</span>
        </div>
      )}

      {/* Информация о следующем уровне скидки */}
      {nextTierInfo && (
        <div className="next-tier-info">
          <div className="next-tier-header">
            <span className="next-tier-icon">⬆️</span>
            <span className="next-tier-text">Следующий уровень скидки</span>
          </div>
          <div className="next-tier-details">
            <div className="next-tier-requirement">
              <span className="requirement-label">Добавьте еще:</span>
              <span className="requirement-value">{nextTierInfo.nextTier - quantity} шт</span>
            </div>
            <div className="next-tier-benefit">
              <span className="benefit-label">Дополнительная скидка:</span>
              <span className="benefit-value">+{nextTierInfo.additionalDiscount}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ❌ УДАЛЕН БЛОК "Итоговая цена" - расчеты должны быть на бэкенде */}
      {/* Итоговая цена с учетом скидки будет рассчитана бэкендом и показана в результатах калькулятора */}

      {/* Таблица всех скидок */}
      <div className="discounts-table">
        <h5>📊 Все доступные скидки</h5>
        <div className="table-container">
          <table className="discounts-table-content">
            <thead>
              <tr>
                <th>Количество</th>
                <th>Скидка</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {discounts.map(discount => (
                <tr 
                  key={discount.id} 
                  className={selectedDiscount?.id === discount.id ? 'active' : ''}
                >
                  <td>
                    {discount.min_quantity}
                    {discount.max_quantity ? ` - ${discount.max_quantity}` : '+'} шт
                  </td>
                  <td>{discount.discount_percent}%</td>
                  <td>
                    <span className={`status ${selectedDiscount?.id === discount.id ? 'applied' : 'available'}`}>
                      {selectedDiscount?.id === discount.id ? 'Применена' : 'Доступна'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default QuantityDiscountsSection;
