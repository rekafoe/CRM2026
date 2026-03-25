/** Описание одного фонового паттерна */
export interface BgPattern {
  id: string;
  label: string;
  /** Генерирует SVG-строку под размер холста */
  svg: (w: number, h: number, color?: string, bg?: string) => string;
  /** Цвет по умолчанию для предпросмотра паттерна в панели */
  defaultColor: string;
  defaultBg: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function svgWrap(w: number, h: number, defsInner: string, fillId: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>${defsInner}</defs>
  <rect width="${w}" height="${h}" fill="url(#${fillId})"/>
</svg>`;
}

// ─── Pattern library ─────────────────────────────────────────────────────────

export const BG_PATTERNS: BgPattern[] = [
  {
    id: 'dots-sm',
    label: 'Точки мелкие',
    defaultColor: '#cbd5e1',
    defaultBg: '#ffffff',
    svg: (w, h, c = '#cbd5e1', bg = '#ffffff') =>
      svgWrap(w, h, `
        <pattern id="p" width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="16" height="16" fill="${bg}"/>
          <circle cx="8" cy="8" r="1.5" fill="${c}"/>
        </pattern>`, 'p'),
  },
  {
    id: 'dots-lg',
    label: 'Точки крупные',
    defaultColor: '#94a3b8',
    defaultBg: '#f8fafc',
    svg: (w, h, c = '#94a3b8', bg = '#f8fafc') =>
      svgWrap(w, h, `
        <pattern id="p" width="28" height="28" patternUnits="userSpaceOnUse">
          <rect width="28" height="28" fill="${bg}"/>
          <circle cx="14" cy="14" r="4" fill="${c}"/>
        </pattern>`, 'p'),
  },
  {
    id: 'grid-light',
    label: 'Сетка светлая',
    defaultColor: '#e2e8f0',
    defaultBg: '#ffffff',
    svg: (w, h, c = '#e2e8f0', bg = '#ffffff') =>
      svgWrap(w, h, `
        <pattern id="p" width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill="${bg}"/>
          <path d="M20 0 L0 0 0 20" stroke="${c}" stroke-width="0.5" fill="none"/>
        </pattern>`, 'p'),
  },
  {
    id: 'grid-bold',
    label: 'Сетка жирная',
    defaultColor: '#cbd5e1',
    defaultBg: '#f8fafc',
    svg: (w, h, c = '#cbd5e1', bg = '#f8fafc') =>
      svgWrap(w, h, `
        <pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="${bg}"/>
          <path d="M40 0 L0 0 0 40" stroke="${c}" stroke-width="1" fill="none"/>
        </pattern>`, 'p'),
  },
  {
    id: 'diagonal-r',
    label: 'Диагональ //',
    defaultColor: '#cbd5e1',
    defaultBg: '#ffffff',
    svg: (w, h, c = '#cbd5e1', bg = '#ffffff') =>
      svgWrap(w, h, `
        <pattern id="p" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="12" height="12" fill="${bg}"/>
          <line x1="0" y1="0" x2="0" y2="12" stroke="${c}" stroke-width="2"/>
        </pattern>`, 'p'),
  },
  {
    id: 'diagonal-l',
    label: 'Диагональ \\\\',
    defaultColor: '#cbd5e1',
    defaultBg: '#ffffff',
    svg: (w, h, c = '#cbd5e1', bg = '#ffffff') =>
      svgWrap(w, h, `
        <pattern id="p" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect width="12" height="12" fill="${bg}"/>
          <line x1="0" y1="0" x2="0" y2="12" stroke="${c}" stroke-width="2"/>
        </pattern>`, 'p'),
  },
  {
    id: 'crosshatch',
    label: 'Клетчатый',
    defaultColor: '#dde3ed',
    defaultBg: '#ffffff',
    svg: (w, h, c = '#dde3ed', bg = '#ffffff') =>
      svgWrap(w, h, `
        <pattern id="p" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="${bg}"/>
          <line x1="0" y1="0" x2="12" y2="12" stroke="${c}" stroke-width="1"/>
          <line x1="12" y1="0" x2="0" y2="12" stroke="${c}" stroke-width="1"/>
        </pattern>`, 'p'),
  },
  {
    id: 'chevron',
    label: 'Зигзаг',
    defaultColor: '#94a3b8',
    defaultBg: '#f1f5f9',
    svg: (w, h, c = '#94a3b8', bg = '#f1f5f9') =>
      svgWrap(w, h, `
        <pattern id="p" width="20" height="10" patternUnits="userSpaceOnUse">
          <rect width="20" height="10" fill="${bg}"/>
          <polyline points="0,5 10,0 20,5" stroke="${c}" stroke-width="1.5" fill="none"/>
          <polyline points="0,10 10,5 20,10" stroke="${c}" stroke-width="1.5" fill="none"/>
        </pattern>`, 'p'),
  },
  {
    id: 'honeycomb',
    label: 'Соты',
    defaultColor: '#94a3b8',
    defaultBg: '#ffffff',
    svg: (w, h, c = '#94a3b8', bg = '#ffffff') =>
      svgWrap(w, h, `
        <pattern id="p" width="28" height="48" patternUnits="userSpaceOnUse">
          <rect width="28" height="48" fill="${bg}"/>
          <polygon points="14,2 25,8 25,20 14,26 3,20 3,8" stroke="${c}" stroke-width="1" fill="none"/>
          <polygon points="14,26 25,32 25,44 14,50 3,44 3,32" stroke="${c}" stroke-width="1" fill="none"/>
          <polygon points="0,2 -1,8 -1,20 0,26" stroke="${c}" stroke-width="1" fill="none"/>
          <polygon points="28,2 29,8 29,20 28,26" stroke="${c}" stroke-width="1" fill="none"/>
        </pattern>`, 'p'),
  },
  {
    id: 'waves',
    label: 'Волны',
    defaultColor: '#93c5fd',
    defaultBg: '#eff6ff',
    svg: (w, h, c = '#93c5fd', bg = '#eff6ff') =>
      svgWrap(w, h, `
        <pattern id="p" width="60" height="16" patternUnits="userSpaceOnUse">
          <rect width="60" height="16" fill="${bg}"/>
          <path d="M0 8 Q15 2 30 8 Q45 14 60 8" stroke="${c}" stroke-width="1.5" fill="none"/>
        </pattern>`, 'p'),
  },
  {
    id: 'blueprint',
    label: 'Чертёж',
    defaultColor: '#60a5fa',
    defaultBg: '#1e3a5f',
    svg: (w, h, c = '#60a5fa', bg = '#1e3a5f') =>
      svgWrap(w, h, `
        <pattern id="p" width="60" height="60" patternUnits="userSpaceOnUse">
          <rect width="60" height="60" fill="${bg}"/>
          <path d="M60 0 L0 0 0 60" stroke="${c}" stroke-width="0.4" fill="none" opacity="0.4"/>
          <path d="M0 30 L60 30 M30 0 L30 60" stroke="${c}" stroke-width="0.8" fill="none" opacity="0.6"/>
        </pattern>`, 'p'),
  },
  {
    id: 'confetti',
    label: 'Конфетти',
    defaultColor: '#f472b6',
    defaultBg: '#fff7ed',
    svg: (w, h, _c = '#f472b6', bg = '#fff7ed') => {
      const colors = ['#f472b6', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa'];
      let shapes = '';
      const step = 36;
      let i = 0;
      for (let y = 0; y < h + step; y += step) {
        for (let x = 0; x < w + step; x += step) {
          const col = colors[i % colors.length];
          const r = (i * 37 + x + y) % 3;
          if (r === 0) shapes += `<rect x="${x}" y="${y}" width="5" height="5" fill="${col}" opacity="0.6" transform="rotate(${i * 15}, ${x+2}, ${y+2})"/>`;
          else if (r === 1) shapes += `<circle cx="${x+4}" cy="${y+3}" r="3" fill="${col}" opacity="0.5"/>`;
          else shapes += `<line x1="${x}" y1="${y}" x2="${x+6}" y2="${y+6}" stroke="${col}" stroke-width="2" opacity="0.6"/>`;
          i++;
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${shapes}</svg>`;
    },
  },
];

/** Конвертирует SVG-строку в data URL для Fabric */
export function svgToDataUrl(svgStr: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
}
