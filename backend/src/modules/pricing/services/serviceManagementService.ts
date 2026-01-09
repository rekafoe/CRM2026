import {
  CreatePricingServiceDTO,
  CreateServiceVolumeTierDTO,
  PricingServiceDTO,
  ServiceVolumeTierDTO,
  UpdatePricingServiceDTO,
  UpdateServiceVolumeTierDTO,
  ServiceVariantDTO,
  CreateServiceVariantDTO,
  UpdateServiceVariantDTO,
} from '../dtos/service.dto';
import { PricingServiceRepository } from '../repositories/serviceRepository';

export class ServiceManagementService {
  static listServices(): Promise<PricingServiceDTO[]> {
    return PricingServiceRepository.listServices();
  }

  static createService(payload: CreatePricingServiceDTO): Promise<PricingServiceDTO> {
    return PricingServiceRepository.createService(payload);
  }

  static async updateService(id: number, payload: UpdatePricingServiceDTO): Promise<PricingServiceDTO | null> {
    return PricingServiceRepository.updateService(id, payload);
  }

  static deleteService(id: number): Promise<void> {
    return PricingServiceRepository.deleteService(id);
  }

  static listServiceTiers(serviceId: number, variantId?: number): Promise<ServiceVolumeTierDTO[]> {
    return PricingServiceRepository.listServiceTiers(serviceId, variantId);
  }

  static createServiceTier(serviceId: number, payload: CreateServiceVolumeTierDTO): Promise<ServiceVolumeTierDTO> {
    return PricingServiceRepository.createServiceTier(serviceId, payload);
  }

  static updateServiceTier(tierId: number, payload: UpdateServiceVolumeTierDTO): Promise<ServiceVolumeTierDTO | null> {
    return PricingServiceRepository.updateServiceTier(tierId, payload);
  }

  static deleteServiceTier(tierId: number): Promise<void> {
    return PricingServiceRepository.deleteServiceTier(tierId);
  }

  // Методы для работы с вариантами услуг
  static listServiceVariants(serviceId: number): Promise<ServiceVariantDTO[]> {
    return PricingServiceRepository.listServiceVariants(serviceId);
  }

  static createServiceVariant(serviceId: number, payload: CreateServiceVariantDTO): Promise<ServiceVariantDTO> {
    return PricingServiceRepository.createServiceVariant(serviceId, payload);
  }

  static updateServiceVariant(variantId: number, payload: UpdateServiceVariantDTO): Promise<ServiceVariantDTO | null> {
    return PricingServiceRepository.updateServiceVariant(variantId, payload);
  }

  static deleteServiceVariant(variantId: number): Promise<void> {
    return PricingServiceRepository.deleteServiceVariant(variantId);
  }

  static listAllVariantTiers(serviceId: number): Promise<Map<number, ServiceVolumeTierDTO[]>> {
    return PricingServiceRepository.listAllVariantTiers(serviceId);
  }
}


