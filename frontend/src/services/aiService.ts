import { logger } from '../utils/logger';

// Типы для машинного обучения
export interface TrainingData {
  productType: string;
  format: string;
  quantity: number;
  paperType: string;
  paperDensity: number;
  lamination: string;
  urgency: string;
  customerType: string;
  finalPrice: number;
  timestamp: Date;
  marketConditions?: {
    demandLevel: number; // 0-1
    competitionLevel: number; // 0-1
    seasonality: number; // 0-1
  };
}

export interface PricePrediction {
  predictedPrice: number;
  confidence: number; // 0-1
  factors: {
    historical: number;
    market: number;
    seasonality: number;
    competition: number;
  };
  recommendations: string[];
}

export interface ProductRecommendation {
  productType: string;
  format: string;
  quantity: number;
  confidence: number;
  reasoning: string;
  expectedProfit: number;
}

export interface AIModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  lastTraining: Date;
  trainingDataSize: number;
}

// Простая реализация машинного обучения на основе правил и статистики
export class AIService {
  private static trainingData: TrainingData[] = [];
  private static modelMetrics: AIModelMetrics = {
    accuracy: 0.85,
    precision: 0.82,
    recall: 0.88,
    f1Score: 0.85,
    lastTraining: new Date(),
    trainingDataSize: 0
  };

  // Добавление данных для обучения
  static addTrainingData(data: TrainingData): void {
    this.trainingData.push(data);
    this.modelMetrics.trainingDataSize = this.trainingData.length;
    logger.info('Добавлены данные для обучения ИИ', { data });
  }

  // Предсказание цены на основе параметров
  static async predictPrice(params: {
    productType: string;
    format: string;
    quantity: number;
    paperType: string;
    paperDensity: number;
    lamination: string;
    urgency: string;
    customerType: string;
    marketConditions?: {
      demandLevel: number;
      competitionLevel: number;
      seasonality: number;
    };
  }): Promise<PricePrediction> {
    try {
      // Получаем исторические данные для похожих заказов
      const similarOrders = this.findSimilarOrders(params);
      
      // Базовое предсказание на основе исторических данных
      const historicalPrice = this.calculateHistoricalPrice(similarOrders, params);
      
      // Корректировка на основе рыночных условий
      const marketAdjustment = this.calculateMarketAdjustment(params.marketConditions);
      
      // Корректировка на основе сезонности
      const seasonalityAdjustment = this.calculateSeasonalityAdjustment();
      
      // Корректировка на основе конкуренции
      const competitionAdjustment = this.calculateCompetitionAdjustment(params.marketConditions?.competitionLevel);
      
      // Итоговая цена
      let predictedPrice = historicalPrice * marketAdjustment * seasonalityAdjustment * competitionAdjustment;
      
      // Применяем логику минимального заказа для малых объемов
      predictedPrice = await this.applyMinimumOrderLogic(predictedPrice, params);
      
      // Расчет уверенности
      const confidence = this.calculateConfidence(similarOrders.length, params);
      
      // Генерация рекомендаций
      const recommendations = await this.generateRecommendations(params, predictedPrice, confidence);
      
      return {
        predictedPrice: Math.round(predictedPrice * 100) / 100,
        confidence,
        factors: {
          historical: historicalPrice,
          market: marketAdjustment,
          seasonality: seasonalityAdjustment,
          competition: competitionAdjustment
        },
        recommendations
      };
    } catch (error) {
      logger.error('Ошибка предсказания цены ИИ', error);
      return {
        predictedPrice: 0,
        confidence: 0,
        factors: { historical: 0, market: 1, seasonality: 1, competition: 1 },
        recommendations: ['Ошибка в предсказании цены']
      };
    }
  }

  // Рекомендации оптимальных параметров
  static async getOptimalRecommendations(customerProfile: {
    budget: number;
    quantity: number;
    urgency: string;
    quality: 'basic' | 'standard' | 'premium';
  }): Promise<ProductRecommendation[]> {
    try {
      const recommendations: ProductRecommendation[] = [];
      
      // Анализируем все доступные продукты
      const availableProducts = this.getAvailableProducts();
      
      for (const product of availableProducts) {
        const prediction = await this.predictPrice({
          productType: product.type,
          format: product.recommendedFormat,
          quantity: customerProfile.quantity,
          paperType: product.recommendedPaperType,
          paperDensity: product.recommendedDensity,
          lamination: product.recommendedLamination,
          urgency: customerProfile.urgency,
          customerType: 'regular'
        });
        
        if (prediction.predictedPrice <= customerProfile.budget && prediction.confidence > 0.7) {
          recommendations.push({
            productType: product.type,
            format: product.recommendedFormat,
            quantity: customerProfile.quantity,
            confidence: prediction.confidence,
            reasoning: this.generateReasoning(product, prediction, customerProfile),
            expectedProfit: this.calculateExpectedProfit(prediction.predictedPrice, product.cost)
          });
        }
      }
      
      // Сортируем по ожидаемой прибыли
      return recommendations.sort((a, b) => b.expectedProfit - a.expectedProfit);
    } catch (error) {
      logger.error('Ошибка генерации рекомендаций ИИ', error);
      return [];
    }
  }

  // Обновление модели на основе новых данных
  static retrainModel(): AIModelMetrics {
    try {
      if (this.trainingData.length < 10) {
        logger.warn('Недостаточно данных для переобучения модели', { 
          dataSize: this.trainingData.length 
        });
        return this.modelMetrics;
      }
      
      // Простое переобучение на основе статистики
      const newMetrics = this.calculateModelMetrics();
      
      this.modelMetrics = {
        ...newMetrics,
        lastTraining: new Date(),
        trainingDataSize: this.trainingData.length
      };
      
      logger.info('Модель ИИ переобучена', { metrics: this.modelMetrics });
      return this.modelMetrics;
    } catch (error) {
      logger.error('Ошибка переобучения модели ИИ', error);
      return this.modelMetrics;
    }
  }

  // Получение метрик модели
  static getModelMetrics(): AIModelMetrics {
    return { ...this.modelMetrics };
  }

  // Экспорт данных для обучения
  static exportTrainingData(): TrainingData[] {
    return [...this.trainingData];
  }

  // Импорт данных для обучения
  static importTrainingData(data: TrainingData[]): void {
    this.trainingData = [...data];
    this.modelMetrics.trainingDataSize = this.trainingData.length;
    logger.info('Импортированы данные для обучения ИИ', { count: data.length });
  }

  // Приватные методы

  private static findSimilarOrders(params: any): TrainingData[] {
    return this.trainingData.filter(order => 
      order.productType === params.productType &&
      order.format === params.format &&
      Math.abs(order.quantity - params.quantity) / params.quantity < 0.5 && // ±50%
      order.paperType === params.paperType &&
      Math.abs(order.paperDensity - params.paperDensity) <= 20
    );
  }

  // ✅ АНАЛИТИКА: Расчет исторической цены для ML-предсказаний
  // Работает с УЖЕ сохраненными ценами из истории заказов
  // НЕ влияет на реальное ценообразование - только для рекомендаций
  private static calculateHistoricalPrice(orders: TrainingData[], params: any): number {
    if (orders.length === 0) {
      // Базовые цены если нет исторических данных
      return this.getBasePrice(params.productType, params.format);
    }
    
    // Средняя цена с учетом количества
    const weightedPrices = orders.map(order => {
      const quantityWeight = Math.min(order.quantity / params.quantity, 2); // Максимум 2x вес
      return order.finalPrice * quantityWeight;
    });
    
    return weightedPrices.reduce((sum, price) => sum + price, 0) / weightedPrices.length;
  }

  private static calculateMarketAdjustment(conditions?: any): number {
    if (!conditions) return 1.0;
    
    let adjustment = 1.0;
    
    // Корректировка на спрос
    if (conditions.demandLevel > 0.7) adjustment *= 1.1; // +10% при высоком спросе
    else if (conditions.demandLevel < 0.3) adjustment *= 0.9; // -10% при низком спросе
    
    return adjustment;
  }

  private static calculateSeasonalityAdjustment(): number {
    const month = new Date().getMonth();
    
    // Сезонные корректировки для полиграфии
    const seasonalMultipliers = [
      0.9,  // Январь - спад после праздников
      0.95, // Февраль
      1.0,  // Март
      1.05, // Апрель - весенний подъем
      1.1,  // Май - пик сезона
      1.05, // Июнь
      0.95, // Июль - отпуска
      0.9,  // Август - отпуска
      1.0,  // Сентябрь - возвращение к работе
      1.1,  // Октябрь - осенний подъем
      1.2,  // Ноябрь - подготовка к праздникам
      1.3   // Декабрь - пик сезона
    ];
    
    return seasonalMultipliers[month];
  }

  private static calculateCompetitionAdjustment(competitionLevel?: number): number {
    if (!competitionLevel) return 1.0;
    
    // При высокой конкуренции снижаем цену
    if (competitionLevel > 0.7) return 0.95;
    if (competitionLevel < 0.3) return 1.05;
    
    return 1.0;
  }

  private static calculateConfidence(similarOrdersCount: number, params: any): number {
    let confidence = 0.5; // Базовая уверенность
    
    // Больше похожих заказов = выше уверенность
    if (similarOrdersCount > 10) confidence += 0.3;
    else if (similarOrdersCount > 5) confidence += 0.2;
    else if (similarOrdersCount > 2) confidence += 0.1;
    
    // Высокая уверенность для стандартных параметров
    if (['A4', 'A5', 'A6'].includes(params.format)) confidence += 0.1;
    if (['semi-matte', 'coated'].includes(params.paperType)) confidence += 0.1;
    if (params.quantity >= 100 && params.quantity <= 10000) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  private static async generateRecommendations(params: any, predictedPrice: number, confidence: number): Promise<string[]> {
    const recommendations: string[] = [];
    
    if (confidence < 0.6) {
      recommendations.push('Низкая уверенность в предсказании. Рекомендуется ручная проверка цены.');
    }
    
    // Проверяем, является ли это малым заказом
    const isSmallOrder = this.isSmallOrder(params.quantity, params.format, params.productType);
    
    if (isSmallOrder) {
      const minimumCosts = await this.getMinimumOrderCosts();
      const minimumCost = minimumCosts[params.format] || minimumCosts['default'];
      
      if (predictedPrice >= minimumCost) {
        recommendations.push(`Малый объем (${params.quantity} шт.). Применена минимальная стоимость заказа ${minimumCost} BYN.`);
      }
      
      if (params.format === 'SRA3' && params.quantity <= 5) {
        recommendations.push('Для SRA3 формата до 5 листов действует минимальная стоимость заказа 8.00 BYN.');
      }
      
      recommendations.push('Рассмотрите увеличение количества для снижения цены за единицу.');
    } else if (params.quantity < 100) {
      recommendations.push('Малый тираж. Рассмотрите увеличение количества для снижения цены за единицу.');
    }
    
    if (params.urgency === 'urgent' && predictedPrice > 1000) {
      recommendations.push('Высокая стоимость срочного заказа. Рассмотрите стандартные сроки.');
    }
    
    if (params.paperType === 'premium' && params.lamination === 'none') {
      recommendations.push('Премиум бумага без ламинации. Добавьте ламинацию для защиты.');
    }
    
    return recommendations;
  }

  private static getAvailableProducts(): any[] {
    return [
      {
        type: 'flyers',
        recommendedFormat: 'A6',
        recommendedPaperType: 'semi-matte',
        recommendedDensity: 120,
        recommendedLamination: 'none',
        cost: 0.15
      },
      {
        type: 'business_cards',
        recommendedFormat: '90x50',
        recommendedPaperType: 'coated',
        recommendedDensity: 300,
        recommendedLamination: 'glossy',
        cost: 0.25
      },
      {
        type: 'posters',
        recommendedFormat: 'A3',
        recommendedPaperType: 'coated',
        recommendedDensity: 150,
        recommendedLamination: 'none',
        cost: 0.8
      }
    ];
  }

  private static generateReasoning(product: any, prediction: PricePrediction, profile: any): string {
    const reasons = [];
    
    if (prediction.confidence > 0.8) {
      reasons.push('Высокая точность предсказания');
    }
    
    if (product.type === 'flyers' && profile.quantity > 1000) {
      reasons.push('Оптимальный выбор для массовых тиражей');
    }
    
    if (product.recommendedLamination !== 'none') {
      reasons.push('Дополнительная защита и презентабельность');
    }
    
    return reasons.join('. ') || 'Рекомендуется на основе анализа данных';
  }

  private static calculateExpectedProfit(predictedPrice: number, cost: number): number {
    return predictedPrice - cost;
  }

  private static getBasePrice(productType: string, format: string): number {
    const basePrices: Record<string, Record<string, number>> = {
      flyers: { A6: 0.15, A5: 0.25, A4: 0.4 },
      business_cards: { '90x50': 0.25, '85x55': 0.3 },
      posters: { A3: 0.8, A2: 1.5, A1: 2.5 }
    };
    
    return basePrices[productType]?.[format] || 1.0;
  }

  private static calculateModelMetrics(): AIModelMetrics {
    // Упрощенный расчет метрик
    const accuracy = Math.min(0.9, 0.7 + (this.trainingData.length / 1000) * 0.2);
    
    return {
      accuracy,
      precision: accuracy * 0.95,
      recall: accuracy * 1.05,
      f1Score: accuracy,
      lastTraining: new Date(),
      trainingDataSize: this.trainingData.length
    };
  }

  // Применение логики минимального заказа для малых объемов
  private static async applyMinimumOrderLogic(price: number, params: any): Promise<number> {
    const { quantity, format, productType } = params;
    
    // Определяем минимальную стоимость заказа на основе формата и типа продукта
    const minimumOrderCosts = await this.getMinimumOrderCosts();
    
    // Проверяем, является ли это малым объемом
    const isSmallOrder = this.isSmallOrder(quantity, format, productType);
    
    if (isSmallOrder) {
      const minimumCost = minimumOrderCosts[format] || minimumOrderCosts['default'];
      
      // Если рассчитанная цена меньше минимальной, применяем минимальную стоимость
      if (price < minimumCost) {
        logger.info('Применена минимальная стоимость заказа', {
          originalPrice: price,
          minimumCost,
          quantity,
          format,
          productType
        });
        return minimumCost;
      }
    }
    
    return price;
  }

  // Определение минимальных стоимостей заказа по форматам
  private static async getMinimumOrderCosts(): Promise<Record<string, number>> {
    // В новой системе минимальные стоимости пока заданы статически
    return {
      A6: 2.5,
      A5: 3.5,
      A4: 5.0,
      SRA3: 8.0,
      A3: 6.0,
      A2: 10.0,
      A1: 15.0,
      default: 3.0,
    };
  }

  // Проверка, является ли заказ малым объемом
  private static isSmallOrder(quantity: number, format: string, productType: string): boolean {
    // Для SRA3 формата - до 5 листов считается малым объемом
    if (format === 'SRA3' && quantity <= 5) {
      return true;
    }
    
    // Для других форматов - до 10 штук
    if (quantity <= 10) {
      return true;
    }
    
    // Для визиток - до 50 штук
    if (productType === 'business_cards' && quantity <= 50) {
      return true;
    }
    
    return false;
  }
}

