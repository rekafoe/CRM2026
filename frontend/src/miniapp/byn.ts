const BYN_SVG_VIEWBOX = '0 0 3780 5315.63';
const BYN_PATH_D =
  'M1667.66 2690.24c104.12,-0.5 365.38,-11.13 446.39,13.35 279.36,84.42 271.48,429.66 3.79,511.73 -79.56,24.4 -348.11,15.54 -450.15,13.76l0.08 -187.68 369.98 -0.3 0.16 -161.4 -370.58 -1.29 0.33 -188.17zm0.07 -604.24l653.99 -0.69 0.16 -161.09 -816.93 -0.07 -0.13 954.21 -208.72 0.15 0.43 162.65 208.15 0.76 0.21 349.18c111.37,-0.52 222.85,-0.05 334.23,-0.05 106.15,0 220.5,8.88 316.14,-17.04 379.05,-102.75 447.95,-590.61 110.72,-780.65 -82.93,-46.74 -155.85,-65.71 -268.51,-65.55 -109.25,0.16 -219.85,1.61 -329.7,-0.15l-0.04 -441.66z';

const SVG_INNER_CURRENT = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BYN_SVG_VIEWBOX}" fill="none" aria-hidden="true" focusable="false"><path d="${BYN_PATH_D}" fill="currentColor"/></svg>`.replace(
    /\s+/g,
    ' '
  );

export function bynIconInlineSpanHtmlForMiniapp(): string {
  return ' <span class="ipc-byn" role="img" aria-label="бел. руб.">' + SVG_INNER_CURRENT() + '</span>';
}
