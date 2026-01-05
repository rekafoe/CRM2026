import {
  CreatePricingServiceDTO,
  CreateServiceVolumeTierDTO,
  PricingServiceDTO,
  ServiceVolumeTierDTO,
  UpdatePricingServiceDTO,
  UpdateServiceVolumeTierDTO,
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

  static listServiceTiers(serviceId: number): Promise<ServiceVolumeTierDTO[]> {
    return PricingServiceRepository.listServiceTiers(serviceId);
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
}


