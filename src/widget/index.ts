type PresetItem = { description: string; price: number };
type PresetCategory = { category: string; color: string; items: PresetItem[] };

async function fetchJSON<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export interface WidgetConfig {
  apiBase?: string; // default '/api'
  container?: string | HTMLElement; // default '#print-crm-widget'
  theme?: { primary?: string };
}

class PrintCRMWidget {
  private apiBase: string;
  private container: HTMLElement;
  private state: { categories: PresetCategory[]; cat?: PresetCategory; item?: PresetItem; price?: number; name?: string; phone?: string; email?: string; prepay?: number } = { categories: [] };

  constructor(cfg?: WidgetConfig) {
    this.apiBase = cfg?.apiBase || '/api';
    const c = typeof cfg?.container === 'string' ? document.querySelector(cfg!.container as string) : (cfg?.container as HTMLElement) || document.getElementById('print-crm-widget');
    if (!c) throw new Error('Widget container not found');
    this.container = c as HTMLElement;
    if (cfg?.theme?.primary) {
      const root = this.container as HTMLElement;
      root.style.setProperty('--pc-primary', cfg.theme.primary);
    }
  }

  async init() {
    const categories = await fetchJSON<PresetCategory[]>(`${this.apiBase}/presets`);
    this.state.categories = categories;
    this.render();
  }

  private render() {
    this.container.innerHTML = '';
    this.container.classList.add('pcw');
    const title = el('h3', '', 'Соберите заказ');
    const row1 = el('div', 'row');
    const selCat = el('select') as HTMLSelectElement;
    selCat.appendChild(new Option('Категория', ''));
    for (const c of this.state.categories) selCat.appendChild(new Option(c.category, c.category));
    selCat.onchange = () => {
      this.state.cat = this.state.categories.find(c => c.category === selCat.value);
      this.state.item = undefined; this.state.price = undefined; this.render();
    };
    row1.appendChild(selCat);

    const row2 = el('div', 'row');
    const selItem = el('select') as HTMLSelectElement;
    selItem.appendChild(new Option('Позиция', ''));
    if (this.state.cat) for (const i of this.state.cat.items) selItem.appendChild(new Option(`${i.description} (${i.price})`, i.description));
    selItem.onchange = () => {
      const it = this.state.cat?.items.find(i => i.description === selItem.value);
      this.state.item = it; this.state.price = it?.price; this.render();
    };
    row2.appendChild(selItem);

    const row3 = el('div', 'row');
    const priceInput = el('input') as HTMLInputElement;
    priceInput.type = 'number';
    priceInput.placeholder = 'Цена';
    priceInput.value = String(this.state.price ?? '');
    priceInput.oninput = () => this.state.price = Number(priceInput.value || 0);
    row3.appendChild(priceInput);

    const row4 = el('div', 'row');
    const name = el('input') as HTMLInputElement; name.placeholder = 'Имя';
    const phone = el('input') as HTMLInputElement; phone.placeholder = 'Телефон';
    const email = el('input') as HTMLInputElement; email.placeholder = 'Email'; email.type = 'email';
    name.oninput = () => this.state.name = name.value;
    phone.oninput = () => this.state.phone = phone.value;
    email.oninput = () => this.state.email = email.value;
    row4.append(name, phone, email);

    const row5 = el('div', 'row');
    const prepay = el('input') as HTMLInputElement; prepay.placeholder = 'Предоплата'; prepay.type = 'number';
    prepay.oninput = () => this.state.prepay = Number(prepay.value || 0);
    row5.append(prepay);

    const submit = el('button', 'btn', 'Оформить и оплатить предоплату');
    submit.onclick = () => this.submit();

    const summary = el('div', 'summary');
    const info = el('div', 'muted', 'После оформления вы будете перенаправлены на оплату предоплаты.');
    summary.append(info);

    this.container.append(title, row1, row2, row3, row4, row5, submit, summary);
  }

  private async submit() {
    if (!this.state.cat || !this.state.item || !this.state.price) return alert('Выберите позицию и цену');
    const orderRes = await fetchJSON<any>(`${this.apiBase}/orders`, {
      method: 'POST',
      body: JSON.stringify({
        customerName: this.state.name,
        customerPhone: this.state.phone,
        customerEmail: this.state.email,
        prepaymentAmount: this.state.prepay || 0
      })
    });
    await fetchJSON<any>(`${this.apiBase}/orders/${orderRes.id}/items`, {
      method: 'POST',
      body: JSON.stringify({ type: this.state.cat.category, params: { description: this.state.item.description }, price: this.state.price })
    });
    const prepay = await fetchJSON<any>(`${this.apiBase}/orders/${orderRes.id}/prepay`, {
      method: 'POST', body: JSON.stringify({ amount: this.state.prepay || this.state.price })
    });
    if (prepay.paymentUrl) window.location.href = prepay.paymentUrl;
  }
}

(window as any).PrintCRMWidget = {
  init: async (cfg?: WidgetConfig) => {
    const w = new PrintCRMWidget(cfg);
    await w.init();
    return w;
  }
};

export default PrintCRMWidget;
