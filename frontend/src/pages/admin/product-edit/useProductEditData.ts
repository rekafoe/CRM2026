import { useState, useEffect, useCallback } from 'react';
import { getProductDetails, ProductWithDetails, getProductMaterials } from '../../../services/products';

interface ProductDto {
  id: number;
  category_id: number;
  name: string;
  description?: string;
  icon?: string;
  calculator_type?: string;
  product_type?: string;
  is_active?: boolean;
}

export const useProductEditData = (productId: number | null) => {
  const [loading, setLoading] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [product, setProduct] = useState<ProductDto | ProductWithDetails | null>(null);
  const [materials, setMaterials] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    if (!productId) return;
    try {
      setLoading(true);
      setUnauthorized(false);

      const p = await getProductDetails(productId);
      if (!p) {
        setUnauthorized(false);
        return;
      }
      setProduct(p as any);

      const m = await getProductMaterials(productId);
      setMaterials(m);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    loading,
    unauthorized,
    product,
    materials,
    reloadData: loadData,
  };
};

