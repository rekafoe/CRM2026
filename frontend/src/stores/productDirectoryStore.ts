import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  Product,
  ProductCategory,
  PostProcessingOperation,
  createProduct as apiCreateProduct,
  createProductWithSetup,
  getAllOperations,
  getAllProducts,
  getProductCategories,
  updateProduct,
  ProductSetupPayload,
  clearProductCache,
} from '../services/products';
import { getAllWarehouseMaterials } from '../services/calculatorMaterialService';
import type { Material } from '../types/shared';
import { logger } from '../utils/logger';

type LoadingKey =
  | 'categories'
  | 'products'
  | 'operations'
  | 'materials'
  | 'initialize'
  | 'createProduct'
  | 'createProductSetup'
  | 'toggleProduct';

type ErrorKey = Exclude<LoadingKey, 'initialize'>;

type LoadingState = Record<LoadingKey, boolean>;
type ErrorState = Record<ErrorKey, string | null>;

type CreateProductPayload = Parameters<typeof apiCreateProduct>[0];

interface ProductDirectoryState {
  categories: ProductCategory[];
  products: Product[];
  operations: PostProcessingOperation[];
  materials: Material[];
  loading: LoadingState;
  errors: ErrorState;
  lastFetched: Partial<Record<Exclude<LoadingKey, 'initialize'>, number>>;

  initialize: (force?: boolean) => Promise<void>;
  fetchCategories: (force?: boolean) => Promise<ProductCategory[]>;
  fetchProducts: (force?: boolean) => Promise<Product[]>;
  fetchOperations: (force?: boolean) => Promise<PostProcessingOperation[]>;
  fetchMaterials: (force?: boolean) => Promise<Material[]>;
  refreshDirectory: () => Promise<void>;

  createProduct: (payload: CreateProductPayload) => Promise<Product | null>;
  createProductWithSetup: (payload: ProductSetupPayload) => Promise<number | null>;
  toggleProductActive: (productId: number, nextState?: boolean) => Promise<Product | null>;

  getCategoryById: (id: number) => ProductCategory | undefined;
  getProductById: (id: number) => Product | undefined;
}

const CACHE_TTL = 60_000; // 60 секунд

const initialState: Omit<
  ProductDirectoryState,
  | 'initialize'
  | 'fetchCategories'
  | 'fetchProducts'
  | 'fetchOperations'
  | 'fetchMaterials'
  | 'refreshDirectory'
  | 'createProduct'
  | 'createProductWithSetup'
  | 'toggleProductActive'
  | 'getCategoryById'
  | 'getProductById'
> = {
  categories: [],
  products: [],
  operations: [],
  materials: [],
  loading: {
    categories: false,
    products: false,
    operations: false,
    materials: false,
    initialize: false,
    createProduct: false,
    createProductSetup: false,
    toggleProduct: false,
  },
  errors: {
    categories: null,
    products: null,
    operations: null,
    materials: null,
    createProduct: null,
    createProductSetup: null,
    toggleProduct: null,
  },
  lastFetched: {},
};

function shouldUseCache(
  lastFetched: ProductDirectoryState['lastFetched'],
  key: keyof ProductDirectoryState['lastFetched'],
  force?: boolean,
): boolean {
  if (force) return false;
  const ts = lastFetched[key] ?? 0;
  return Date.now() - ts < CACHE_TTL;
}

export const useProductDirectoryStore = create<ProductDirectoryState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      initialize: async (force) => {
        const { loading } = get();
        if (loading.initialize && !force) return;

        set((state) => ({
          loading: { ...state.loading, initialize: true },
        }));

        try {
          await Promise.all([
            get().fetchCategories(force),
            get().fetchProducts(force),
            get().fetchOperations(force),
            get().fetchMaterials(force),
          ]);
        } finally {
          set((state) => ({
            loading: { ...state.loading, initialize: false },
          }));
        }
      },

      fetchCategories: async (force) => {
        const state = get();
        if (state.loading.categories) {
          return state.categories;
        }
        if (shouldUseCache(state.lastFetched, 'categories', force)) {
          return state.categories;
        }

        set({
          loading: { ...state.loading, categories: true },
          errors: { ...state.errors, categories: null },
        });

        try {
          const categories = await getProductCategories();
          set((prev) => ({
            categories,
            lastFetched: { ...prev.lastFetched, categories: Date.now() },
          }));
          return categories;
        } catch (error) {
          logger.error('productDirectoryStore', 'Не удалось загрузить категории продуктов', error);
          set((prev) => ({
            errors: {
              ...prev.errors,
              categories: (error as Error)?.message ?? 'Ошибка загрузки категорий',
            },
          }));
          return state.categories;
        } finally {
          set((prev) => ({
            loading: { ...prev.loading, categories: false },
          }));
        }
      },

      fetchProducts: async (force) => {
        const state = get();
        if (state.loading.products) {
          return state.products;
        }
        if (shouldUseCache(state.lastFetched, 'products', force)) {
          return state.products;
        }

        set({
          loading: { ...state.loading, products: true },
          errors: { ...state.errors, products: null },
        });

        try {
          const products = await getAllProducts(force); // 🆕 Передаем force
          set((prev) => ({
            products,
            lastFetched: { ...prev.lastFetched, products: Date.now() },
          }));
          return products;
        } catch (error) {
          logger.error('productDirectoryStore', 'Не удалось загрузить продукты', error);
          set((prev) => ({
            errors: {
              ...prev.errors,
              products: (error as Error)?.message ?? 'Ошибка загрузки продуктов',
            },
          }));
          return state.products;
        } finally {
          set((prev) => ({
            loading: { ...prev.loading, products: false },
          }));
        }
      },

      fetchOperations: async (force) => {
        const state = get();
        if (state.loading.operations) {
          return state.operations;
        }
        if (shouldUseCache(state.lastFetched, 'operations', force)) {
          return state.operations;
        }

        set({
          loading: { ...state.loading, operations: true },
          errors: { ...state.errors, operations: null },
        });

        try {
          const operations = await getAllOperations({ is_active: true });
          set((prev) => ({
            operations,
            lastFetched: { ...prev.lastFetched, operations: Date.now() },
          }));
          return operations;
        } catch (error) {
          logger.error('productDirectoryStore', 'Не удалось загрузить операции', error);
          set((prev) => ({
            errors: {
              ...prev.errors,
              operations: (error as Error)?.message ?? 'Ошибка загрузки операций',
            },
          }));
          return state.operations;
        } finally {
          set((prev) => ({
            loading: { ...prev.loading, operations: false },
          }));
        }
      },

      fetchMaterials: async (force) => {
        const state = get();
        if (state.loading.materials) {
          return state.materials;
        }
        if (shouldUseCache(state.lastFetched, 'materials', force)) {
          return state.materials;
        }

        set({
          loading: { ...state.loading, materials: true },
          errors: { ...state.errors, materials: null },
        });

        try {
          const materials = await getAllWarehouseMaterials();
          set((prev) => ({
            materials,
            lastFetched: { ...prev.lastFetched, materials: Date.now() },
          }));
          return materials;
        } catch (error) {
          logger.error('productDirectoryStore', 'Не удалось загрузить материалы', error);
          set((prev) => ({
            errors: {
              ...prev.errors,
              materials: (error as Error)?.message ?? 'Ошибка загрузки материалов',
            },
          }));
          return state.materials;
        } finally {
          set((prev) => ({
            loading: { ...prev.loading, materials: false },
          }));
        }
      },

      refreshDirectory: async () => {
        clearProductCache();
        await Promise.all([
          get().fetchCategories(true),
          get().fetchProducts(true),
          get().fetchOperations(true),
          get().fetchMaterials(true),
        ]);
      },

      createProduct: async (payload) => {
        const state = get();
        if (state.loading.createProduct) return null;

        set({
          loading: { ...state.loading, createProduct: true },
          errors: { ...state.errors, createProduct: null },
        });

        try {
          const created = await apiCreateProduct(payload);
          clearProductCache();
          await get().fetchProducts(true);
          return get().getProductById(created.id) ?? null;
        } catch (error) {
          logger.error('productDirectoryStore', 'Не удалось создать продукт', error);
          set((prev) => ({
            errors: {
              ...prev.errors,
              createProduct: (error as Error)?.message ?? 'Ошибка создания продукта',
            },
          }));
          return null;
        } finally {
          set((prev) => ({
            loading: { ...prev.loading, createProduct: false },
          }));
        }
      },

      createProductWithSetup: async (payload) => {
        const state = get();
        if (state.loading.createProductSetup) return null;

        set({
          loading: { ...state.loading, createProductSetup: true },
          errors: { ...state.errors, createProductSetup: null },
        });

        try {
          const created = await createProductWithSetup(payload);
          clearProductCache();
          await Promise.all([get().fetchProducts(true), get().fetchMaterials(true)]);
          return created.id;
        } catch (error) {
          logger.error('productDirectoryStore', 'Не удалось создать продукт через мастер', error);
          set((prev) => ({
            errors: {
              ...prev.errors,
              createProductSetup:
                (error as Error)?.message ?? 'Ошибка создания продукта через мастер',
            },
          }));
          return null;
        } finally {
          set((prev) => ({
            loading: { ...prev.loading, createProductSetup: false },
          }));
        }
      },

      toggleProductActive: async (productId, nextState) => {
        const state = get();
        if (state.loading.toggleProduct) return null;
        const product = state.products.find((item) => item.id === productId);
        if (!product) {
          set((prev) => ({
            errors: {
              ...prev.errors,
              toggleProduct: 'Продукт не найден',
            },
          }));
          return null;
        }

        const targetState =
          typeof nextState === 'boolean' ? nextState : !Boolean(product.is_active);

        set({
          loading: { ...state.loading, toggleProduct: true },
          errors: { ...state.errors, toggleProduct: null },
        });

        try {
          await updateProduct(productId, { is_active: targetState } as Partial<Product>);
          const updatedProduct = { ...product, is_active: targetState };
            clearProductCache();

          set((prev) => ({
            products: prev.products.map((item) =>
              item.id === productId ? updatedProduct : item,
            ),
            lastFetched: { ...prev.lastFetched, products: Date.now() },
          }));

          return updatedProduct;
        } catch (error) {
          logger.error('productDirectoryStore', 'Не удалось обновить статус продукта', error);
          set((prev) => ({
            errors: {
              ...prev.errors,
              toggleProduct: (error as Error)?.message ?? 'Ошибка смены статуса продукта',
            },
          }));
          return null;
        } finally {
          set((prev) => ({
            loading: { ...prev.loading, toggleProduct: false },
          }));
        }
      },

      getCategoryById: (id) => {
        return get().categories.find((category) => category.id === id);
      },

      getProductById: (id) => {
        return get().products.find((product) => product.id === id);
      },
    }),
    { name: 'product-directory-store' },
  ),
);

