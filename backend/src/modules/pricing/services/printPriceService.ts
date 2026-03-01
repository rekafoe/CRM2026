import { getDb } from '../../../db';
import { PrintPriceRepository, PrintPriceDTO, CreatePrintPriceDTO, UpdatePrintPriceDTO } from '../repositories/printPriceRepository';

export type PrintPriceMode = 'bw_single' | 'bw_duplex' | 'color_single' | 'color_duplex';

export class PrintPriceService {
  static list(): Promise<PrintPriceDTO[]> {
    return PrintPriceRepository.list();
  }

  static getByTechnology(technologyCode: string): Promise<PrintPriceDTO | undefined> {
    return PrintPriceRepository.findActiveByTechnology(technologyCode);
  }

  /**
   * Получает цену за лист из централизованных диапазонов (print_price_tiers) по типу тиража.
   * Используется вместо плоских цен.
   */
  static async getPricePerSheetFromTiers(
    technologyCode: string,
    priceMode: PrintPriceMode,
    sheetsNeeded: number
  ): Promise<{ pricePerSheet: number; printPriceId: number } | null> {
    try {
      const db = await getDb();
      const pp = await db.get<{ id: number }>(
        `SELECT id FROM print_prices WHERE technology_code = ? AND is_active = 1 AND counter_unit = 'sheets' ORDER BY id DESC LIMIT 1`,
        [technologyCode]
      );
      if (!pp) return null;

      const tiersRaw = await db.all<{ min_sheets: number; max_sheets: number | null; price_per_sheet: number }>(
        `SELECT min_sheets, max_sheets, price_per_sheet FROM print_price_tiers
         WHERE print_price_id = ? AND price_mode = ?
         ORDER BY min_sheets DESC`,
        [pp.id, priceMode]
      );
      const tiers = Array.isArray(tiersRaw) ? tiersRaw : [];
      if (tiers.length === 0) return null;

      for (const t of tiers) {
        if (sheetsNeeded >= t.min_sheets && (t.max_sheets == null || sheetsNeeded <= t.max_sheets)) {
          return { pricePerSheet: t.price_per_sheet, printPriceId: pp.id };
        }
      }
      const last = tiers[tiers.length - 1];
      return { pricePerSheet: last.price_per_sheet, printPriceId: pp.id };
    } catch {
      return null;
    }
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

