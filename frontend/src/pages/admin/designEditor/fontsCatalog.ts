/** Каталог шрифтов редактора (локальные / подключаемые веб-шрифты). */

export type FontCategory = 'sans' | 'serif' | 'display' | 'mono' | 'handwriting';

export interface FontCatalogEntry {
  value: string;
  label: string;
  category: FontCategory;
  /** Есть поддержка кириллицы (для фильтра). */
  cyrillic: boolean;
}

type Row = [value: string, label: string, category: FontCategory, cyrillic: boolean];

const ROWS: Row[] = [
  ['Arial', 'Arial', 'sans', true],
  ['Helvetica', 'Helvetica', 'sans', true],
  ['Helvetica Neue', 'Helvetica Neue', 'sans', true],
  ['Verdana', 'Verdana', 'sans', true],
  ['Tahoma', 'Tahoma', 'sans', true],
  ['Trebuchet MS', 'Trebuchet MS', 'sans', true],
  ['Segoe UI', 'Segoe UI', 'sans', true],
  ['Calibri', 'Calibri', 'sans', true],
  ['Century Gothic', 'Century Gothic', 'sans', true],
  ['Futura', 'Futura', 'sans', false],
  ['Gill Sans', 'Gill Sans', 'sans', false],
  ['Times New Roman', 'Times New Roman', 'serif', true],
  ['Georgia', 'Georgia', 'serif', true],
  ['Palatino Linotype', 'Palatino Linotype', 'serif', true],
  ['Book Antiqua', 'Book Antiqua', 'serif', true],
  ['Garamond', 'Garamond', 'serif', false],
  ['Cambria', 'Cambria', 'serif', true],
  ['Constantia', 'Constantia', 'serif', true],
  ['Courier New', 'Courier New', 'mono', true],
  ['Consolas', 'Consolas', 'mono', true],
  ['Lucida Console', 'Lucida Console', 'mono', true],
  ['PT Sans', 'PT Sans', 'sans', true],
  ['PT Serif', 'PT Serif', 'serif', true],
  ['PT Mono', 'PT Mono', 'mono', true],
  ['Roboto', 'Roboto', 'sans', true],
  ['Roboto Condensed', 'Roboto Condensed', 'sans', true],
  ['Open Sans', 'Open Sans', 'sans', true],
  ['Lato', 'Lato', 'sans', true],
  ['Montserrat', 'Montserrat', 'sans', true],
  ['Source Sans 3', 'Source Sans 3', 'sans', true],
  ['Nunito', 'Nunito', 'sans', true],
  ['Ubuntu', 'Ubuntu', 'sans', true],
  ['Oswald', 'Oswald', 'sans', true],
  ['Raleway', 'Raleway', 'sans', true],
  ['Merriweather', 'Merriweather', 'serif', true],
  ['Playfair Display', 'Playfair Display', 'serif', true],
  ['Noto Serif', 'Noto Serif', 'serif', true],
  ['Noto Sans', 'Noto Sans', 'sans', true],
  ['Fira Sans', 'Fira Sans', 'sans', true],
  ['Fira Code', 'Fira Code', 'mono', true],
  ['Inter', 'Inter', 'sans', true],
  ['Manrope', 'Manrope', 'sans', true],
  ['Rubik', 'Rubik', 'sans', true],
  ['Jura', 'Jura', 'sans', true],
  ['Comfortaa', 'Comfortaa', 'sans', true],
  ['Exo 2', 'Exo 2', 'sans', true],
  ['Philosopher', 'Philosopher', 'sans', true],
  ['Underdog', 'Underdog', 'display', true],
  ['Lobster', 'Lobster', 'display', true],
  ['Pacifico', 'Pacifico', 'handwriting', false],
  ['Amatic SC', 'Amatic SC', 'handwriting', true],
  ['Caveat', 'Caveat', 'handwriting', true],
  ['Marck Script', 'Marck Script', 'handwriting', true],
  ['Bad Script', 'Bad Script', 'handwriting', true],
  ['Press Start 2P', 'Press Start 2P', 'display', false],
  ['Orbitron', 'Orbitron', 'display', false],
  ['Russo One', 'Russo One', 'display', true],
  ['Stalinist One', 'Stalinist One', 'display', true],
  ['Poiret One', 'Poiret One', 'display', true],
  ['Yeseva One', 'Yeseva One', 'display', true],
  ['Cormorant', 'Cormorant', 'serif', true],
  ['Cormorant Infant', 'Cormorant Infant', 'serif', true],
  ['Literata', 'Literata', 'serif', true],
  ['Spectral', 'Spectral', 'serif', true],
  ['Tenor Sans', 'Tenor Sans', 'sans', true],
  ['Scada', 'Scada', 'sans', true],
  ['Anonymous Pro', 'Anonymous Pro', 'mono', true],
  ['JetBrains Mono', 'JetBrains Mono', 'mono', true],
  ['IBM Plex Sans', 'IBM Plex Sans', 'sans', true],
  ['IBM Plex Serif', 'IBM Plex Serif', 'serif', true],
  ['IBM Plex Mono', 'IBM Plex Mono', 'mono', true],
  ['Academy', 'Academy', 'serif', true],
  ['Acrom', 'Acrom', 'sans', true],
  ['Akrobat', 'Akrobat', 'sans', true],
  ['Alegreya', 'Alegreya', 'serif', true],
  ['Alegreya SC', 'Alegreya SC', 'serif', true],
  ['Alice', 'Alice', 'serif', true],
  ['ALS Malina', 'ALS Malina', 'display', true],
  ['Bebas Neue', 'Bebas Neue', 'display', true],
  ['Circe', 'Circe', 'sans', true],
  ['Circe Rounded', 'Circe Rounded', 'sans', true],
  ['Coco Gothic', 'Coco Gothic', 'sans', true],
  ['DIN Pro', 'DIN Pro', 'sans', true],
  ['Graphik', 'Graphik', 'sans', true],
  ['Museo Sans Cyrl', 'Museo Sans Cyrl', 'sans', true],
  ['Museo Cyrl', 'Museo Cyrl', 'serif', true],
  ['Neucha', 'Neucha', 'handwriting', true],
  ['Noto Color Emoji', 'Noto Color Emoji', 'display', true],
  ['Pragmatica', 'Pragmatica', 'sans', true],
  ['San Francisco', 'San Francisco', 'sans', true],
  ['SF Pro Display', 'SF Pro Display', 'sans', true],
  ['TT Norms Pro', 'TT Norms Pro', 'sans', true],
  ['VAG Rounded', 'VAG Rounded', 'sans', true],
];

export const FONT_CATALOG: FontCatalogEntry[] = ROWS.map(([value, label, category, cyrillic]) => ({
  value,
  label,
  category,
  cyrillic,
}));

export const FONT_PREVIEW_PANGRAM =
  'Съешь ещё этих мягких французских булок, да выпей же чаю.';

const byValue = new Map(FONT_CATALOG.map((f) => [f.value, f] as const));

export function findFontCatalogEntry(fontFamily: string): FontCatalogEntry | undefined {
  return byValue.get(fontFamily);
}
