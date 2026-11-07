// Read-only: shows what Miswag stored for the given external ids.
import { loadEnv } from './lib/env.mjs';
import { miswagClient } from './lib/miswag.mjs';
const m = miswagClient(loadEnv());
for (const id of process.argv.slice(2)) {
  const it = (await m.call('GET', `/v1/items/${id}`)).json.data?.item;
  const vr = (await m.call('GET', `/v1/items/${id}/variations`)).json.data;
  const vs = Array.isArray(vr) ? vr : (vr?.variations || []);
  console.log(`${id}\n  AR: ${it?.name_ar}\n  EN: ${it?.name_en}\n  price: ${it?.price} ${it?.currency} | category: ${it?.category?.path} | brand: ${it?.brand?.name ?? it?.brand ?? '-'} | active(visible): ${it?.active}`);
  for (const v of vs) console.log(`  - ${v.color?.name}: images=${(v.images || []).length} stock=${JSON.stringify(v.sizes?.map(s => s.quantity) ?? v.stock ?? v.total_stock)}`);
}
