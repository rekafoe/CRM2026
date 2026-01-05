import {
  CreateProductServiceLinkDTO,
  ProductServiceLinkDTO,
} from '../dtos/serviceLink.dto';
import { ProductServiceLinkRepository } from '../repositories/serviceLinkRepository';
import { PricingServiceRepository } from '../../pricing/repositories/serviceRepository';

export class ProductServiceLinkService {
  static list(productId: number): Promise<ProductServiceLinkDTO[]> {
    return ProductServiceLinkRepository.listByProduct(productId);
  }

  static async create(productId: number, payload: CreateProductServiceLinkDTO): Promise<{ link: ProductServiceLinkDTO; alreadyLinked: boolean }> {
    const service = await PricingServiceRepository.getServiceById(payload.serviceId);
    if (!service) {
      const error = new Error('Service not found');
      (error as any).code = 'SERVICE_NOT_FOUND';
      throw error;
    }

    try {
      const link = await ProductServiceLinkRepository.create(productId, payload);
      return { link, alreadyLinked: false };
    } catch (error: any) {
      if (error?.code === 'PRODUCT_SERVICE_LINK_ALREADY_EXISTS' && error.existing) {
        return { link: error.existing, alreadyLinked: true };
      }
      throw error;
    }
  }

  static async delete(productId: number, serviceId: number): Promise<number> {
    return ProductServiceLinkRepository.delete(productId, serviceId);
  }
}


