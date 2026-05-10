import { useCallback, useEffect, useState } from 'react';
import { getMaterials } from '../../../api';
import {
  getPlotterCuttingTariffs,
  putPlotterCuttingTariffs,
  type PlotterCuttingTariffsBundleApi,
} from '../../../services/pricing';

export type PlotterTariffMaterialOption = { id: number; name: string };

export function usePlotterCuttingTariffsFormState() {
  const [bundle, setBundle] = useState<PlotterCuttingTariffsBundleApi | null>(null);
  const [materials, setMaterials] = useState<PlotterTariffMaterialOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const b = await getPlotterCuttingTariffs();
      setBundle(b);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || 'Не удалось загрузить тарифы');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    getMaterials()
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : [];
        setMaterials(
          list.map((m: { id: number; name?: string }) => ({
            id: m.id,
            name: m.name || `#${m.id}`,
          }))
        );
      })
      .catch(() => setMaterials([]));
  }, []);

  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(() => setSuccess(null), 3000);
    return () => window.clearTimeout(t);
  }, [success]);

  const save = useCallback(async () => {
    if (!bundle) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const next = await putPlotterCuttingTariffs({
        roll: bundle.roll,
        sheet: bundle.sheet,
      });
      setBundle(next);
      setSuccess('Сохранено');
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }, [bundle]);

  return {
    bundle,
    setBundle,
    materials,
    loading,
    saving,
    error,
    success,
    save,
    reload: load,
  };
}
