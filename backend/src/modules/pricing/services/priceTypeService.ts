import {
  PriceTypeDTO,
  CreatePriceTypeDTO,
  UpdatePriceTypeDTO,
} from '../dtos/priceType.dto';
import { PriceTypeRepository } from '../repositories/priceTypeRepository';

export class PriceTypeService {
  static list(activeOnly = false): Promise<PriceTypeDTO[]> {
    return PriceTypeRepository.list(activeOnly);
  }

  static getById(id: number): Promise<PriceTypeDTO | null> {
    return PriceTypeRepository.getById(id);
  }

  static getByKey(key: string): Promise<PriceTypeDTO | null> {
    return PriceTypeRepository.getByKey(key);
  }

  static create(payload: CreatePriceTypeDTO): Promise<PriceTypeDTO> {
    return PriceTypeRepository.create(payload);
  }

  static update(id: number, payload: UpdatePriceTypeDTO): Promise<PriceTypeDTO | null> {
    return PriceTypeRepository.update(id, payload);
  }

  static delete(id: number): Promise<boolean> {
    return PriceTypeRepository.delete(id);
  }

  /** Множитель по ключу (для расчётов). Fallback 1 если не найден. */
  static async getMultiplier(key: string): Promise<number> {
    const pt = await PriceTypeRepository.getByKey(key);
    return pt?.multiplier ?? 1;
  }
}
