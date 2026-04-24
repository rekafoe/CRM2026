/**
 * Официальный графический знак белорусского рубля (заглавная «Б» + горизонтальная линия).
 * Единая разметка для веб, PDF, Telegram Mini App.
 */
const SVG_INNER = (fillHex: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 24" fill="none" aria-hidden="true" focusable="false"><text x="0" y="16.4" fill="${fillHex}" font-size="16" font-weight="700" font-family="system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans',sans-serif">Б</text><line x1="0" y1="10.1" x2="8" y2="10.1" stroke="${fillHex}" stroke-width="1.45" stroke-linecap="square"/></svg>`.replace(
    /\s+/g,
    ' '
  );

/** Для React: наследует `color` у родителя. */
export const BYN_SYMBOL_SVG_INLINE = SVG_INNER('currentColor');

function encodeDataSvg(svg: string): string {
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/**
 * Data-URL для `background` в легаси-CSS, где внешняя `url(data:...)` — единственный вариант.
 * В Mini App рядом с суммой используется `bynIconInlineSpanHtmlForMiniapp` (инлайн-SVG, currentColor).
 */
export function bynSymbolDataUrlForCss(): string {
  return encodeDataSvg(SVG_INNER('#0f172a'));
}

const SVG_INNER_CURRENT = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 24" fill="none" aria-hidden="true" focusable="false"><text x="0" y="16.4" fill="currentColor" font-size="16" font-weight="700" font-family="system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans',sans-serif">Б</text><line x1="0" y1="10.1" x2="8" y2="10.1" stroke="currentColor" stroke-width="1.45" stroke-linecap="square"/></svg>`.replace(
    /\s+/g,
    ' '
  );

/** Инлайн в Mini App: не data-URL в CSS (ломается в WebView), цвет = currentColor. */
export function bynIconInlineSpanHtmlForMiniapp(): string {
  return ' <span class="ipc-byn" role="img" aria-label="бел. руб.">' + SVG_INNER_CURRENT() + '</span>';
}

/** Инлайн для печатных HTML (Puppeteer): тот же глиф, фиксированный цвет. */
export function bynSymbolHtmlForPrint(inline: boolean = true): string {
  const svg = SVG_INNER('#0f172a');
  if (!inline) return svg;
  return (
    '<span class="byn-print" style="display:inline-block;vertical-align:-0.12em;width:0.9em;height:1.1em;position:relative;top:0.05em">' +
    svg +
    '</span>'
  );
}
