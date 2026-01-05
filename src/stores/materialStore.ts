import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { Material } from '../types';

interface MaterialState {
  // Состояние
  materials: Material[];
  isLoading: boolean;
  error: string | null;
  
  // Действия
  setMaterials: (materials: Material[]) => void;
  addMaterial: (material: Material) => void;
  updateMaterial: (id: number, updates: Partial<Material>) => void;
  deleteMaterial: (id: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Вычисляемые значения
  getMaterialById: (id: number) => Material | undefined;
  getMaterialsByCategory: (category: string) => Material[];
  getLowStockMaterials: (threshold: number) => Material[];
}

export const useMaterialStore = create<MaterialState>()(
  devtools(
    (set, get) => ({
      // Начальное состояние
      materials: [],
      isLoading: false,
      error: null,
      
      // Основные действия
      setMaterials: (materials) => set({ materials, error: null }),
      
      addMaterial: (material) => set((state) => ({
        materials: [...state.materials, material]
      })),
      
      updateMaterial: (id, updates) => set((state) => ({
        materials: state.materials.map(material => 
          material.id === id ? { ...material, ...updates } : material
        )
      })),
      
      deleteMaterial: (id) => set((state) => ({
        materials: state.materials.filter(material => material.id !== id)
      })),
      
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      
      // Вычисляемые значения
      getMaterialById: (id) => get().materials.find(material => material.id === id),
      
      getMaterialsByCategory: (category) => 
        get().materials.filter(material => material.category === category),
      
      getLowStockMaterials: (threshold) => 
        get().materials.filter(material => 
          material.quantity !== undefined && material.quantity <= threshold
        )
    }),
    {
      name: 'material-store',
    }
  )
);
