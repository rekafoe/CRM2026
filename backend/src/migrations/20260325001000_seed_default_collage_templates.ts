import { Database } from 'sqlite'

type SeedCollageTemplate = {
  name: string
  photoCount: number
  sortOrder: number
  cells: Array<{ x: number; y: number; w: number; h: number }>
}

const SEED_COLLAGE_TEMPLATES: SeedCollageTemplate[] = [
  {
    name: '2 фото: пополам вертикально',
    photoCount: 2,
    sortOrder: 201,
    cells: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
  },
  {
    name: '2 фото: пополам горизонтально',
    photoCount: 2,
    sortOrder: 202,
    cells: [
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  },
  {
    name: '2 фото: главное и подпись',
    photoCount: 2,
    sortOrder: 203,
    cells: [
      { x: 0, y: 0, w: 1, h: 0.68 },
      { x: 0.18, y: 0.68, w: 0.64, h: 0.32 },
    ],
  },
  {
    name: '3 фото: большое слева',
    photoCount: 3,
    sortOrder: 301,
    cells: [
      { x: 0, y: 0, w: 0.62, h: 1 },
      { x: 0.62, y: 0, w: 0.38, h: 0.5 },
      { x: 0.62, y: 0.5, w: 0.38, h: 0.5 },
    ],
  },
  {
    name: '3 фото: большое сверху',
    photoCount: 3,
    sortOrder: 302,
    cells: [
      { x: 0, y: 0, w: 1, h: 0.6 },
      { x: 0, y: 0.6, w: 0.5, h: 0.4 },
      { x: 0.5, y: 0.6, w: 0.5, h: 0.4 },
    ],
  },
  {
    name: '3 фото: три колонки',
    photoCount: 3,
    sortOrder: 303,
    cells: [
      { x: 0, y: 0, w: 0.333, h: 1 },
      { x: 0.333, y: 0, w: 0.334, h: 1 },
      { x: 0.667, y: 0, w: 0.333, h: 1 },
    ],
  },
  {
    name: '4 фото: сетка 2x2',
    photoCount: 4,
    sortOrder: 401,
    cells: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  {
    name: '4 фото: главное и три малых',
    photoCount: 4,
    sortOrder: 402,
    cells: [
      { x: 0, y: 0, w: 0.65, h: 1 },
      { x: 0.65, y: 0, w: 0.35, h: 0.333 },
      { x: 0.65, y: 0.333, w: 0.35, h: 0.334 },
      { x: 0.65, y: 0.667, w: 0.35, h: 0.333 },
    ],
  },
  {
    name: '4 фото: журнальный блок',
    photoCount: 4,
    sortOrder: 403,
    cells: [
      { x: 0, y: 0, w: 0.5, h: 0.62 },
      { x: 0.5, y: 0, w: 0.5, h: 0.62 },
      { x: 0, y: 0.62, w: 0.5, h: 0.38 },
      { x: 0.5, y: 0.62, w: 0.5, h: 0.38 },
    ],
  },
  {
    name: '5 фото: герой и сетка',
    photoCount: 5,
    sortOrder: 501,
    cells: [
      { x: 0, y: 0, w: 0.6, h: 1 },
      { x: 0.6, y: 0, w: 0.4, h: 0.25 },
      { x: 0.6, y: 0.25, w: 0.4, h: 0.25 },
      { x: 0.6, y: 0.5, w: 0.4, h: 0.25 },
      { x: 0.6, y: 0.75, w: 0.4, h: 0.25 },
    ],
  },
  {
    name: '5 фото: верхняя панорама',
    photoCount: 5,
    sortOrder: 502,
    cells: [
      { x: 0, y: 0, w: 1, h: 0.45 },
      { x: 0, y: 0.45, w: 0.25, h: 0.55 },
      { x: 0.25, y: 0.45, w: 0.25, h: 0.55 },
      { x: 0.5, y: 0.45, w: 0.25, h: 0.55 },
      { x: 0.75, y: 0.45, w: 0.25, h: 0.55 },
    ],
  },
  {
    name: '5 фото: мозаика',
    photoCount: 5,
    sortOrder: 503,
    cells: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.25 },
      { x: 0.5, y: 0.25, w: 0.5, h: 0.25 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  {
    name: '6 фото: сетка 3x2',
    photoCount: 6,
    sortOrder: 601,
    cells: [
      { x: 0, y: 0, w: 0.333, h: 0.5 },
      { x: 0.333, y: 0, w: 0.334, h: 0.5 },
      { x: 0.667, y: 0, w: 0.333, h: 0.5 },
      { x: 0, y: 0.5, w: 0.333, h: 0.5 },
      { x: 0.333, y: 0.5, w: 0.334, h: 0.5 },
      { x: 0.667, y: 0.5, w: 0.333, h: 0.5 },
    ],
  },
  {
    name: '6 фото: сетка 2x3',
    photoCount: 6,
    sortOrder: 602,
    cells: [
      { x: 0, y: 0, w: 0.5, h: 0.333 },
      { x: 0.5, y: 0, w: 0.5, h: 0.333 },
      { x: 0, y: 0.333, w: 0.5, h: 0.334 },
      { x: 0.5, y: 0.333, w: 0.5, h: 0.334 },
      { x: 0, y: 0.667, w: 0.5, h: 0.333 },
      { x: 0.5, y: 0.667, w: 0.5, h: 0.333 },
    ],
  },
  {
    name: '6 фото: центр и миниатюры',
    photoCount: 6,
    sortOrder: 603,
    cells: [
      { x: 0.25, y: 0.18, w: 0.5, h: 0.64 },
      { x: 0, y: 0, w: 0.25, h: 0.33 },
      { x: 0, y: 0.33, w: 0.25, h: 0.34 },
      { x: 0, y: 0.67, w: 0.25, h: 0.33 },
      { x: 0.75, y: 0, w: 0.25, h: 0.5 },
      { x: 0.75, y: 0.5, w: 0.25, h: 0.5 },
    ],
  },
]

export async function up(db: Database): Promise<void> {
  for (const template of SEED_COLLAGE_TEMPLATES) {
    const existing = await db.get<{ id: number }>(
      'SELECT id FROM collage_templates WHERE name = ? AND photo_count = ? LIMIT 1',
      [template.name, template.photoCount]
    )
    if (existing) continue

    await db.run(
      `INSERT INTO collage_templates (name, photo_count, layout, padding_default, sort_order, is_active)
       VALUES (?, ?, ?, 12, ?, 1)`,
      [
        template.name,
        template.photoCount,
        JSON.stringify({ cells: template.cells }),
        template.sortOrder,
      ]
    )
  }
}

export async function down(db: Database): Promise<void> {
  const names = SEED_COLLAGE_TEMPLATES.map((template) => template.name)
  const placeholders = names.map(() => '?').join(',')
  await db.run(`DELETE FROM collage_templates WHERE name IN (${placeholders})`, names)
}
