import { PrintPriceRepository, PrintPriceDTO, CreatePrintPriceDTO, UpdatePrintPriceDTO } from '../repositories/printPriceRepository';

export class PrintPriceService {
  static list(): Promise<PrintPriceDTO[]> {
    return PrintPriceRepository.list();
  }

  static getByTechnology(technologyCode: string): Promise<PrintPriceDTO | undefined> {
    return PrintPriceRepository.findActiveByTechnology(technologyCode);
  }

  static create(payload: CreatePrintPriceDTO): Promise<PrintPriceDTO> {
    return PrintPriceRepository.create(payload);
  }

  static update(id: number, payload: UpdatePrintPriceDTO): Promise<PrintPriceDTO | null> {
    return PrintPriceRepository.update(id, payload);
  }

  static delete(id: number): Promise<void> {
    return PrintPriceRepository.delete(id);
  }
}

