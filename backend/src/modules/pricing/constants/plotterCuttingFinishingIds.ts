/**
 * Внутренние идентификаторы строки finishing для тарифов плоттера.
 * Не являются id из post_processing_services — только маркеры для расчёта.
 */
export const PLOTTER_FIN_ROLL = -910001;
export const PLOTTER_FIN_SHEET = -910002;
export const PLOTTER_FIN_WEEDING = -910003;
export const PLOTTER_FIN_MOUNTING = -910004;

export function plotterFinishingIdForMode(mode: 'roll' | 'sheet'): number {
  return mode === 'roll' ? PLOTTER_FIN_ROLL : PLOTTER_FIN_SHEET;
}

export function isPlotterCuttingSyntheticServiceId(id: number): boolean {
  return (
    id === PLOTTER_FIN_ROLL ||
    id === PLOTTER_FIN_SHEET ||
    id === PLOTTER_FIN_WEEDING ||
    id === PLOTTER_FIN_MOUNTING
  );
}
