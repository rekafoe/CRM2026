/**
 * Официальный графический знак белорусского рубля (заглавная «Б» + горизонтальная линия).
 * Единая разметка для веб, PDF, Telegram Mini App.
 */
/**
 * Рисуем знак вручную, а не через `<text>`:
 * WebView Telegram по-разному рендерит кириллическую "Б", из-за чего глиф "плывёт".
 */
/** Гориз. штрих как в `BynSymbol.tsx` (линия y=10.1), прямо под «окном»; длина ~4,5/6 ширины, 1u слева от стояка. */
const SVG_INNER = (fillHex: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 24" fill="none" aria-hidden="true" focusable="false"><path d="M2 2.75H17V5.35H4.7V10.55H10.35C15.2 10.55 18 12.95 18 17.1C18 21.25 15.05 23.25 10.05 23.25H2V2.75ZM4.7 13.05V20.65H9.95C13.3 20.65 15.3 19.55 15.3 16.85C15.3 14.15 13.3 13.05 9.95 13.05H4.7Z" fill="${fillHex}"/><rect x="1.1" y="9.45" width="15.1" height="1.3" rx="0.15" fill="${fillHex}"/></svg>`.replace(
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
 * В Mini App рядом с суммой используется `bynIconInlineSpanHtmlForMiniapp`.
 */
export function bynSymbolDataUrlForCss(): string {
  return encodeDataSvg(SVG_INNER('#0f172a'));
}

const SVG_INNER_CURRENT = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 24" fill="none" aria-hidden="true" focusable="false"><path d="M2 2.75H17V5.35H4.7V10.55H10.35C15.2 10.55 18 12.95 18 17.1C18 21.25 15.05 23.25 10.05 23.25H2V2.75ZM4.7 13.05V20.65H9.95C13.3 20.65 15.3 19.55 15.3 16.85C15.3 14.15 13.3 13.05 9.95 13.05H4.7Z" fill="currentColor"/><rect x="1.1" y="9.45" width="15.1" height="1.3" rx="0.15" fill="currentColor"/></svg>`.replace(
    /\s+/g,
    ' '
  );

/** Mini App: инлайн-SVG с currentColor. */
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
