import { getDb } from '../../../config/database'

export interface PaperType {
  id: number
  name: string
  display_name: string
  search_keywords: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PrintingPrice {
  id: number
  paper_type_id: number
  density: number
  price: number
  created_at: string
  updated_at: string
}

export interface Material {
  id: number
  name: string
  category_id: number
  paper_type_id?: number
  density?: number
  sheet_price_single?: number
  price?: number
  quantity: number
  min_quantity: number
  max_stock_level: number
  unit: string
  supplier: string
  created_at: string
  updated_at: string
  category_name?: string
}

export interface PaperTypeWithMaterials extends PaperType {
  materials: Material[]
  prices: { [density: number]: number } // Для обратной совместимости
}

export class PaperTypeService {
  private static cache: {
    allPaperTypes?: PaperTypeWithMaterials[]
    paperTypeMap?: Map<number, PaperTypeWithMaterials>
    expiresAt?: number
  } = {}

  private static readonly CACHE_TTL_MS = 5 * 60 * 1000

  private static isCacheValid(): boolean {
    const { expiresAt } = this.cache
    return typeof expiresAt === 'number' && expiresAt > Date.now()
  }

  private static setCache(data: PaperTypeWithMaterials[]): void {
    this.cache.allPaperTypes = data
    this.cache.paperTypeMap = new Map(data.map((item) => [item.id, item]))
    this.cache.expiresAt = Date.now() + this.CACHE_TTL_MS
  }

  private static invalidateCache(): void {
    this.cache = {}
  }

  // Получить все типы бумаги с материалами и ценами
  static async getAllPaperTypes(): Promise<PaperTypeWithMaterials[]> {
    if (this.isCacheValid() && this.cache.allPaperTypes) {
      return this.cache.allPaperTypes
    }

    const db = await getDb()
    
    const paperTypes = await db.all<PaperType>(
      `SELECT *
       FROM paper_types
       WHERE is_active = 1
       ORDER BY display_name`
    ) as unknown as PaperType[]

    if (!paperTypes.length) {
      return []
    }

    const paperTypeIds = paperTypes.map((type) => type.id)

    const materialsByPaperType = new Map<number, Material[]>()

    if (paperTypeIds.length) {
      const placeholders = paperTypeIds.map(() => '?').join(', ')
      const materialRows = await db.all<Material>(
        `SELECT m.*, c.name as category_name
         FROM materials m
         LEFT JOIN material_categories c ON m.category_id = c.id
         WHERE m.paper_type_id IN (${placeholders})
         ORDER BY m.paper_type_id, m.density`,
        ...paperTypeIds
      ) as unknown as Material[]

      for (const material of materialRows) {
        if (!material.paper_type_id) continue
        const list = materialsByPaperType.get(material.paper_type_id) ?? []
        list.push(material)
        materialsByPaperType.set(material.paper_type_id, list)
      }
    }

    const result = paperTypes.map((paperType) => {
      const materials = materialsByPaperType.get(paperType.id) ?? []
      const prices = this.buildPricesIndex(materials)
      return {
        ...paperType,
        materials,
        prices,
      }
    })

    this.setCache(result)
    return result
  }

  // Получить тип бумаги с материалами
  static async getPaperTypeWithMaterials(paperTypeId: number): Promise<PaperTypeWithMaterials | null> {
    if (this.isCacheValid() && this.cache.paperTypeMap?.has(paperTypeId)) {
      return this.cache.paperTypeMap.get(paperTypeId) ?? null
    }

    const db = await getDb()
    
    const paperType = await db.get<PaperType>(
      'SELECT * FROM paper_types WHERE id = ? AND is_active = 1',
      paperTypeId
    )
    
    if (!paperType) return null
    
    const materials = await db.all<Material>(
      `SELECT m.*, c.name as category_name
       FROM materials m
       LEFT JOIN material_categories c ON m.category_id = c.id
       WHERE m.paper_type_id = ?
       ORDER BY m.density`,
      paperTypeId
    ) as unknown as Material[]

    const enriched: PaperTypeWithMaterials = {
      ...paperType,
      materials,
      prices: this.buildPricesIndex(materials),
    }

    this.invalidateCache()
    return enriched
  }

  // Получить все типы бумаги с материалами (алиас для getAllPaperTypes)
  static async getAllPaperTypesWithMaterials(): Promise<PaperTypeWithMaterials[]> {
    return this.getAllPaperTypes()
  }

  // Создать новый тип бумаги
  static async createPaperType(paperType: Omit<PaperType, 'id' | 'created_at' | 'updated_at'>): Promise<PaperType> {
    const db = await getDb()
    
    const result = await db.run(
      'INSERT INTO paper_types (name, display_name, search_keywords, is_active) VALUES (?, ?, ?, ?)',
      paperType.name,
      paperType.display_name,
      paperType.search_keywords,
      paperType.is_active
    )
    
    const newPaperType = await db.get<PaperType>(
      'SELECT * FROM paper_types WHERE id = ?',
      result.lastID
    )

    this.invalidateCache()
    return newPaperType!
  }

  // Обновить тип бумаги
  static async updatePaperType(id: number, paperType: Partial<Omit<PaperType, 'id' | 'created_at' | 'updated_at'>>): Promise<PaperType> {
    const db = await getDb()

    const allowedFields: Array<keyof Omit<PaperType, 'id' | 'created_at' | 'updated_at'>> = [
      'name',
      'display_name',
      'search_keywords',
      'is_active',
    ]

    const entries = Object.entries(paperType).filter(([key, value]) => allowedFields.includes(key as any) && value !== undefined)
    if (!entries.length) {
      const existing = await db.get<PaperType>('SELECT * FROM paper_types WHERE id = ?', id)
      return existing!
    }

    const fields = entries.map(([key]) => `${key} = ?`).join(', ')
    const values = entries.map(([, value]) => value)

    await db.run(
      `UPDATE paper_types SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ...values,
      id
    )
    
    const updatedPaperType = await db.get<PaperType>(
      'SELECT * FROM paper_types WHERE id = ?',
      id
    )
    
    this.invalidateCache()
    return updatedPaperType!
  }

  // Удалить тип бумаги (физическое удаление с каскадным удалением связанных данных)
  static async deletePaperType(id: number): Promise<void> {
    const db = await getDb()

    await db.exec('BEGIN')
    try {
      await db.run(
        'DELETE FROM printing_prices WHERE paper_type_id = ?',
        id
      )

      await db.run(
        'DELETE FROM materials WHERE paper_type_id = ?',
        id
      )

      await db.run(
        'DELETE FROM paper_types WHERE id = ?',
        id
      )

      await db.exec('COMMIT')
      this.invalidateCache()
    } catch (error) {
      await db.exec('ROLLBACK')
      throw error
    }
  }

  private static buildPricesIndex(materials: Material[]): { [density: number]: number } {
    return materials.reduce<{ [density: number]: number }>((acc, material) => {
      if (material.density && (material.sheet_price_single != null || material.price != null)) {
        acc[material.density] = material.sheet_price_single ?? material.price ?? 0
      }
      return acc
    }, {})
  }

  // Добавить материал к типу бумаги
  static async addMaterialToPaperType(paperTypeId: number, materialId: number): Promise<void> {
    const db = await getDb()
    
    await db.run(
      'UPDATE materials SET paper_type_id = ? WHERE id = ?',
      paperTypeId,
      materialId
    )
  }

  // Удалить связь материала с типом бумаги
  static async removeMaterialFromPaperType(materialId: number): Promise<void> {
    const db = await getDb()
    
    await db.run(
      'UPDATE materials SET paper_type_id = NULL WHERE id = ?',
      materialId
    )
  }

  // Найти тип бумаги по ключевым словам в названии материала
  static async findPaperTypeByMaterialName(materialName: string): Promise<PaperType | null> {
    const db = await getDb()
    
    const paperTypes = await this.getAllPaperTypes()
    
    for (const paperType of paperTypes) {
      const keywords = paperType.search_keywords.split(',').map(k => k.trim().toLowerCase())
      
      for (const keyword of keywords) {
        if (materialName.toLowerCase().includes(keyword)) {
          return paperType
        }
      }
    }
    
    return null
  }

  // Получить цену материала для типа бумаги и плотности
  static async getMaterialPrice(paperTypeId: number, density: number): Promise<number | null> {
    const db = await getDb()
    
    const material = await db.get<Material>(
      'SELECT sheet_price_single, price FROM materials WHERE paper_type_id = ? AND density = ?',
      paperTypeId,
      density
    )
    
    return material?.sheet_price_single || material?.price || null
  }
}

