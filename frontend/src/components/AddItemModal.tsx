import React, { useEffect, useState } from 'react';
import { PresetCategory, MaterialRow, Item, Order } from '../types';
import { addOrderItem, getProductMaterials, getPresets, getPrinters, getPrintTechnologies } from '../api';
import axios from 'axios';
// import FlyersCalculatorModal from './FlyersCalculatorModal'; // MOVED TO ARCHIVE
import type { Printer } from '../types';

interface Props {
  order: Order;
  onSave: () => void;
  onClose: () => void;
  initialCategory?: string;
  allowedCategories?: string[];
}

export default function AddItemModal({ order, onSave, onClose, initialCategory, allowedCategories }: Props) {
  const [presets, setPresets] = useState<PresetCategory[]>([]);
  const [category, setCategory] = useState<PresetCategory | null>(null);
  const [product, setProduct] = useState<PresetCategory['items'][0] | null>(null);
  const [price, setPrice] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [extras, setExtras] = useState<Record<string, number | boolean>>({});
  const [required, setRequired] = useState<MaterialRow[]>([]);
  const [ok, setOk] = useState(true);
  const [customComponents, setCustomComponents] = useState<Array<{ materialId: number; qtyPerItem: number }>>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [printTechnologies, setPrintTechnologies] = useState<Array<{ code: string; name: string; pricing_mode: string }>>([]);
  const [printTech, setPrintTech] = useState<string>('');
  const [printerId, setPrinterId] = useState<number | ''>('');
  const [sides, setSides] = useState(1);
  const [sheets, setSheets] = useState(0);
  const [waste, setWaste] = useState(0);
  // MVP calculator (flyers)
  const [calcParams, setCalcParams] = useState<{ format?: 'A6'|'A5'|'A4'; sides?: 1|2; qty?: number; paperDensity?: 130|170; lamination?: 'none'|'matte'|'glossy' }>({});
  const [calcResult, setCalcResult] = useState<{ pricePerItem?: number; totalPrice?: number; totalSheets?: number; components?: Array<{ materialId:number; qtyPerItem:number }> }>({});
  const [showFlyersCalc, setShowFlyersCalc] = useState(false);

  useEffect(() => {
    getPresets().then(r => {
      const list = Array.isArray(allowedCategories) && allowedCategories.length
        ? r.data.filter(p => allowedCategories.includes(p.category))
        : r.data
      setPresets(list);
      if (!category && initialCategory) {
        const cat = list.find(p => p.category === initialCategory) || null;
        if (cat) setCategory(cat)
      }
    });
    getPrintTechnologies().then(r => setPrintTechnologies(r.data || [])).catch(() => setPrintTechnologies([]));
    getPrinters().then(r => setPrinters(r.data));
    if (product && category) {
      getProductMaterials(category.category, product.description).then(res => {
        setRequired(res.data);
        setOk(res.data.every(r => r.quantity - (r as any).min_quantity >= r.qtyPerItem * Math.max(1, quantity)));
      });
    }
  }, [product, category, quantity]);

  const filteredPrinters = printTech
    ? printers.filter(p => (p.technology_code || '') === printTech)
    : printers;

  async function handleSave() {
    if (!product || !category) return;
    // Ensure calculator applied for flyers even if user не нажал "Рассчитать"
    let localCalc = calcResult;
    if (category.category === 'Листовки') {
      const guessFormat = (desc: string): 'A6'|'A5'|'A4'|undefined => {
        if (/A6/i.test(desc)) return 'A6';
        if (/A5/i.test(desc)) return 'A5';
        if (/A4/i.test(desc)) return 'A4';
        return undefined;
      }
      const needFormat = calcParams.format || guessFormat(product.description);
      const needQty = calcParams.qty || quantity;
      const needSides = calcParams.sides || sides;
      const needDensity = calcParams.paperDensity || 130;
      const needLam = calcParams.lamination || 'none';
      if (needFormat && needQty && needSides) {
        try {
          const r = await axios.post('/api/calculators/flyers-color/price', {
            format: needFormat, qty: needQty, sides: needSides, paperDensity: needDensity, lamination: needLam
          })
          localCalc = r.data
          setCalcResult(r.data)
        } catch {}
      }
    }
    const params = { description: product.description, printTechnology: printTech || undefined } as any;
    const item: Omit<Item, 'id'> = {
      type: category.category,
      params,
      price: (localCalc.pricePerItem ?? price) || product.price,
      quantity: calcParams.qty ?? quantity,
      printerId: printerId ? Number(printerId) : undefined,
      sides: calcParams.sides ?? sides,
      sheets,
      waste,
      clicks: 1
    };
    const payload: any = { ...item };
    if (localCalc.components && localCalc.components.length > 0) payload.components = localCalc.components;
    else if (customComponents.length > 0) payload.components = customComponents;
    addOrderItem(order.id, payload).then(onSave);
  }

  return (
    <div className="modal">
      <h3>Добавить позицию</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          onClick={() => setShowFlyersCalc(true)}
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontWeight: 600 }}
        >Листовки</button>
        {/* другие продукты добавим позже кнопками здесь */}
      </div>

      <div style={{ marginTop: 10 }}>
        <button onClick={onClose}>Закрыть</button>
      </div>

      {/* MOVED TO ARCHIVE - FlyersCalculatorModal
      {showFlyersCalc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <FlyersCalculatorModal order={order} onSave={onSave} onClose={() => setShowFlyersCalc(false)} />
        </div>
      )}
      */}

      {false && !!category && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select onChange={e => {
            const prod = (category?.items || []).find(i => i.description === e.target.value)!;
            setProduct(prod);
            setPrice(prod.price);
          }}>
            <option value="">Выберите продукт</option>
            {(category?.items || []).map(i => (
              <option key={i.description} value={i.description}>
                {i.description} ({i.price})
              </option>
            ))}
          </select>
          {product && (
            <button
              className="btn-danger"
              onClick={() => setProduct(null)}
            >Очистить</button>
          )}
        </div>
      )}

      {false && !!product && (
        <div>
          {/* MVP калькулятор для Листовок */}
          {Boolean(category) && (category as any).category === 'Листовки' && (
            <div className="order-total" style={{ marginTop: 8 }}>
              <strong>Калькулятор (MVP)</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
                <label>Формат
                  <select value={calcParams.format || ''} onChange={e => setCalcParams(p => ({ ...p, format: (e.target.value as any) || undefined }))}>
                    <option value="">—</option>
                    <option value="A6">A6</option>
                    <option value="A5">A5</option>
                    <option value="A4">A4</option>
                  </select>
                </label>
                <label>Стороны
                  <select value={calcParams.sides || 1} onChange={e => setCalcParams(p => ({ ...p, sides: Number(e.target.value) as any }))}>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </label>
                <label>Тираж
                  <input type="number" value={calcParams.qty || ''} onChange={e => setCalcParams(p => ({ ...p, qty: Number(e.target.value) || undefined }))} />
                </label>
                <label>Плотность
                  <select value={calcParams.paperDensity || 130} onChange={e => setCalcParams(p => ({ ...p, paperDensity: Number(e.target.value) as any }))}>
                    <option value={130}>130</option>
                    <option value={170}>170</option>
                  </select>
                </label>
                <label>Ламинация
                  <select value={calcParams.lamination || 'none'} onChange={e => setCalcParams(p => ({ ...p, lamination: (e.target.value as any) }))}>
                    <option value="none">Нет</option>
                    <option value="matte">Матовая</option>
                    <option value="glossy">Глянцевая</option>
                  </select>
                </label>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button onClick={async () => {
                    if (!calcParams.format || !calcParams.qty || !calcParams.sides) { alert('Заполните формат/тираж/стороны'); return }
                  const r = await axios.post('/api/calculators/flyers-color/price', calcParams)
                    setCalcResult(r.data)
                    setPrice(r.data?.pricePerItem || price)
                  }}>Рассчитать</button>
                </div>
              </div>
              {calcResult && (calcResult as any).totalPrice != null && (
                <div style={{ marginTop: 8, fontSize: 14 }}>
                  <div>Цена за штуку: <strong>{(calcResult as any).pricePerItem} BYN</strong></div>
                  <div>Итого: <strong>{(calcResult as any).totalPrice} BYN</strong></div>
                  <div>SRA3 листов: {(calcResult as any).totalSheets}</div>
                </div>
              )}
            </div>
          )}
          <p>Базовая цена: {product?.price}</p>
          <p>
            Своя цена:{' '}
            <input
              type="number"
              value={price}
              onChange={e => setPrice(Number(e.target.value))}
            />
          </p>
          <p>
            Количество:
            <input
              type="number"
              value={quantity}
              min={1}
              onChange={e => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              style={{ marginLeft: 8 }}
            />
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label>
              Тип печати:
              <select value={printTech} onChange={e => setPrintTech(e.target.value)}>
                <option value="">Не выбран</option>
                {printTechnologies.map(t => (
                  <option key={t.code} value={t.code}>{t.name}</option>
                ))}
              </select>
            </label>
            <label>
              Принтер:
              <select value={printerId} onChange={e => setPrinterId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Не выбран</option>
                {filteredPrinters.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label>
              Стороны:
              <select value={sides} onChange={e => setSides(Number(e.target.value))}>
                <option value={1}>Односторонняя</option>
                <option value={2}>Двусторонняя</option>
              </select>
            </label>
            <label>
              Листы SRA3:
              <input type="number" value={sheets} min={0} onChange={e => setSheets(Math.max(0, Number(e.target.value) || 0))} />
            </label>
            <label>
              Брак (листы):
              <input type="number" value={waste} min={0} onChange={e => setWaste(Math.max(0, Number(e.target.value) || 0))} />
            </label>
          </div>
        </div>
      )}

      {false && required.length > 0 && (
        <div style={{ color: ok ? 'green' : 'red' }}>
          {required.map(r => (
            <div key={r.materialId}>
              {r.name}: {r.quantity}{r.unit} / needs {r.qtyPerItem * Math.max(1, quantity)}{r.unit}
            </div>
          ))}
        </div>
      )}

      {/* Простейший пользовательский калькулятор состава (опционально) */}
      {false && !!product && (
        <div style={{ marginTop: 8 }}>
          <details>
            <summary>Дополнительно: задать состав вручную</summary>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input type="number" placeholder="ID материала" onKeyDown={e => {
                if (e.key === 'Enter') {
                  const id = Number((e.target as HTMLInputElement).value);
                  if (id) setCustomComponents(arr => [...arr, { materialId: id, qtyPerItem: 1 }]);
                  (e.target as HTMLInputElement).value = '';
                }
              }} />
              <button onClick={() => setCustomComponents([])}>Очистить</button>
            </div>
            {customComponents.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 12 }}>
                {customComponents.map((c, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span>Материал #{c.materialId}</span>
                    <input type="number" value={c.qtyPerItem} min={0} step={0.01} onChange={e => setCustomComponents(list => list.map((v,i) => i===idx ? { ...v, qtyPerItem: Number(e.target.value) } : v))} />
                    <button className="btn-danger" onClick={() => setCustomComponents(list => list.filter((_,i) => i!==idx))}>Удалить</button>
                  </div>
                ))}
              </div>
            )}
          </details>
        </div>
      )}

      {false && (
        <>
          <button onClick={onClose}>Отмена</button>
          <button onClick={handleSave} disabled={!product || !ok}>Сохранить</button>
          {!ok && <div style={{ color: 'red', marginTop: 8 }}>Недостаточно материалов с учётом минимального остатка</div>}
        </>
      )}
    </div>
  );
}
