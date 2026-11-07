// Read-only: pulls every Miswag item and compares its brand/category with what the sync intended.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadEnv } from './lib/env.mjs';
import { miswagClient } from './lib/miswag.mjs';
const m = miswagClient(loadEnv());
const items = await m.getAll('/v1/items?page[size]=30');
writeFileSync('data/live_items.json', JSON.stringify(items));
const payloads = JSON.parse(readFileSync('data/payloads.json', 'utf8'));
const byExt = new Map(payloads.map((p) => [p.external_id, p]));
const tally = {};
for (const it of items) {
  const b = it.brand?.name ?? it.brand_id ?? it.brand ?? '-';
  const ours = String(it.item_code || it.external_id || '').startsWith('MB-');
  const k = `${ours ? 'MB' : 'manual'} | ${typeof b === 'object' ? JSON.stringify(b) : b}`;
  tally[k] = (tally[k] || 0) + 1;
}
console.log(items.length, 'sample keys:', Object.keys(items[0]).join(','));
console.log(JSON.stringify(items[0]).slice(0, 800));
console.log(Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 60));
