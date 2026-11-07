// Read-only: downloads Miswag categories, brands, sizes, and the current Miswag items into ./data
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadEnv } from './lib/env.mjs';
import { miswagClient } from './lib/miswag.mjs';
const m = miswagClient(loadEnv());
mkdirSync(new URL('./data/', import.meta.url), { recursive: true });
for (const [name, path] of [['categories_flat', '/v1/categories/flat'], ['brands', '/v1/brands'], ['sizes', '/v1/sizes'], ['items', '/v1/items?page[size]=30']]) {
  try {
    const list = await m.getAll(path);
    writeFileSync(new URL(`./data/miswag_${name}.json`, import.meta.url), JSON.stringify(list, null, 1));
    console.log(name, list.length);
  } catch (e) { console.log(name, 'ERROR', e.message); }
}
