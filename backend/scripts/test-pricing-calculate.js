#!/usr/bin/env node
/**
 * Тест POST /api/pricing/calculate для воспроизведения 503 при выборе размера.
 * Использование:
 *   node scripts/test-pricing-calculate.js [BASE_URL] [LOGIN] [PASSWORD]
 * Пример:
 *   node scripts/test-pricing-calculate.js https://crm2026-production.up.railway.app user pass
 */

const BASE_URL = process.argv[2] || 'http://localhost:3001';
const LOGIN = process.argv[3] || '';
const PASSWORD = process.argv[4] || '';

async function main() {
  let token = null;
  if (LOGIN && PASSWORD) {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: LOGIN, password: PASSWORD }),
    });
    if (!loginRes.ok) {
      console.error('Login failed:', loginRes.status, await loginRes.text());
      process.exit(1);
    }
    const data = await loginRes.json();
    token = data?.token || data?.accessToken;
    if (!token) {
      console.error('No token in login response:', JSON.stringify(data, null, 2));
      process.exit(1);
    }
    console.log('Logged in OK');
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Типичный запрос при выборе размера для «открытки дизайнерские» (productId подставьте свой)
  const payloads = [
    {
      name: 'С size_id, без type_id (fallback)',
      body: {
        productId: 58, // типичный ID для теста — замените на реальный
        quantity: 100,
        configuration: {
          size_id: 1,
          material_id: 1,
          print_technology: 'digital_toner',
          print_color_mode: 'color',
          print_sides_mode: 'single',
        },
      },
    },
    {
      name: 'С size_id и type_id',
      body: {
        productId: 58,
        quantity: 100,
        configuration: {
          size_id: 1,
          type_id: 1,
          material_id: 1,
          print_technology: 'digital_toner',
          print_color_mode: 'color',
          print_sides_mode: 'single',
        },
      },
    },
  ];

  for (const { name, body } of payloads) {
    console.log('\n---', name, '---');
    try {
      const res = await fetch(`${BASE_URL}/api/pricing/calculate`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const text = await res.text();
      console.log('Status:', res.status, res.statusText);
      try {
        const json = JSON.parse(text);
        console.log('Response:', JSON.stringify(json, null, 2).slice(0, 500));
      } else {
        console.log('Body:', text.slice(0, 300));
      }
      if (res.status === 503) {
        console.error('>>> 503 Service Unavailable — проверьте логи бэкенда и Railway');
      }
    } catch (err) {
      console.error('Request error:', err.message);
    }
  }
}

main().catch(console.error);
