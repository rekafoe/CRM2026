export interface WarehouseMaterialOption {
  id: number
  name: string
  category_id?: number | null
  category_name?: string | null
  category_color?: string | null
  material_type_id?: number | null
  material_type_name?: string | null
  material_kind?: string | null
  paper_type_id?: number | null
  paper_type_name?: string | null
  density?: number | string | null
  sheet_width?: number | string | null
  sheet_height?: number | string | null
  printable_width?: number | string | null
  unit?: string | null
  price?: number
}

export interface MaterialTypeNode {
  key: string
  label: string
  variantLabel: 'Плотность' | 'Ширина рулона' | 'Формат / материал' | 'Материал'
  materials: Array<WarehouseMaterialOption & { optionLabel: string }>
}

export interface MaterialCategoryNode {
  key: string
  label: string
  color?: string
  types: MaterialTypeNode[]
}

export interface MaterialSelectionPath {
  categoryKey: string
  typeKey: string
  materialId: number
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
}

function finitePositive(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
}

export function isRollMaterialOption(material: WarehouseMaterialOption): boolean {
  if (material.material_kind === 'roll') return true
  const unit = normalize(material.unit)
  return ['м', 'm', 'meter', 'meters', 'пог.м', 'пог. м'].includes(unit)
}

function categoryIdentity(material: WarehouseMaterialOption): { key: string; label: string } {
  const id = Number(material.category_id)
  const label = String(material.category_name || '').trim() || 'Без категории'
  return {
    key: Number.isFinite(id) && id > 0
      ? `category:${id}`
      : `category-name:${normalize(label)}`,
    label,
  }
}

function typeIdentity(material: WarehouseMaterialOption): { key: string; label: string } {
  const id = Number(material.material_type_id)
  const label = String(
    material.material_type_name
      || material.paper_type_name
      || 'Без типа',
  ).trim()
  return {
    key: Number.isFinite(id) && id > 0
      ? `type:${id}`
      : `type-name:${normalize(label)}`,
    label,
  }
}

function materialOptionLabel(material: WarehouseMaterialOption): string {
  if (isRollMaterialOption(material)) {
    const width = finitePositive(material.sheet_width)
    return width != null
      ? `${formatNumber(width)} мм`
      : 'Ширина не указана'
  }

  const density = finitePositive(material.density)
  if (density != null) {
    return `${formatNumber(density)} г/м²`
  }

  const width = finitePositive(material.sheet_width)
  const height = finitePositive(material.sheet_height)
  if (width != null && height != null) {
    return `${formatNumber(width)}×${formatNumber(height)} мм`
  }

  return material.name
}

function materialSortValue(material: WarehouseMaterialOption): number {
  if (isRollMaterialOption(material)) {
    return finitePositive(material.sheet_width) ?? Number.MAX_SAFE_INTEGER
  }
  return finitePositive(material.density)
    ?? finitePositive(material.sheet_width)
    ?? Number.MAX_SAFE_INTEGER
}

function resolveVariantLabel(materials: WarehouseMaterialOption[]): MaterialTypeNode['variantLabel'] {
  if (materials.length > 0 && materials.every(isRollMaterialOption)) return 'Ширина рулона'
  if (materials.length > 0 && materials.every((material) => finitePositive(material.density) != null)) {
    return 'Плотность'
  }
  if (materials.some((material) => (
    finitePositive(material.sheet_width) != null
    && finitePositive(material.sheet_height) != null
  ))) {
    return 'Формат / материал'
  }
  return 'Материал'
}

export function buildMaterialSelectionTree(
  materials: WarehouseMaterialOption[],
): MaterialCategoryNode[] {
  const categories = new Map<string, MaterialCategoryNode>()
  const seenIds = new Set<number>()

  for (const material of materials) {
    const id = Number(material?.id)
    if (!Number.isFinite(id) || id <= 0 || seenIds.has(id)) continue
    seenIds.add(id)

    const category = categoryIdentity(material)
    const type = typeIdentity(material)
    let categoryNode = categories.get(category.key)
    if (!categoryNode) {
      categoryNode = {
        key: category.key,
        label: category.label,
        color: material.category_color || undefined,
        types: [],
      }
      categories.set(category.key, categoryNode)
    }

    let typeNode = categoryNode.types.find((node) => node.key === type.key)
    if (!typeNode) {
      typeNode = {
        key: type.key,
        label: type.label,
        variantLabel: 'Материал',
        materials: [],
      }
      categoryNode.types.push(typeNode)
    }
    typeNode.materials.push({
      ...material,
      id,
      optionLabel: materialOptionLabel(material),
    })
  }

  return [...categories.values()].map((category) => ({
    ...category,
    types: category.types.map((type) => ({
      ...type,
      variantLabel: resolveVariantLabel(type.materials),
      materials: [...type.materials].sort((left, right) => {
        const numeric = materialSortValue(left) - materialSortValue(right)
        if (numeric !== 0) return numeric
        return left.name.localeCompare(right.name, 'ru')
      }),
    })),
  }))
}

export function findMaterialSelectionPath(
  tree: MaterialCategoryNode[],
  materialId: unknown,
): MaterialSelectionPath | null {
  const id = Number(materialId)
  if (!Number.isFinite(id) || id <= 0) return null
  for (const category of tree) {
    for (const type of category.types) {
      if (type.materials.some((material) => Number(material.id) === id)) {
        return {
          categoryKey: category.key,
          typeKey: type.key,
          materialId: id,
        }
      }
    }
  }
  return null
}
