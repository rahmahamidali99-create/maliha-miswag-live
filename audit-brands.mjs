// Read-only: for every product the sync sends, compare collection brand vs Shopify vendor vs what Miswag shows.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadEnv } from './lib/env.mjs';
import { shopifyClient, fetchProducts } from './lib/shopify.mjs';
import { BRANDS } from './lib/rules.mjs';
const shop = await shopifyClient(loadEnv());
const products = await fetchProducts(shop, 'status:active');
const report = JSON.parse(readFileSync('data/report.json', 'utf8'));
const live = new Map(JSON.parse(readFileSync('data/live_items.json', 'utf8')).map((i) => [i.id, i]));
const byId = new Map(products.map((p) => [p.id.split('/').pop(), p]));
const rows = [];
for (const r of report.products) {
  const p = byId.get(r.pid);
  const handles = p.collections.nodes.map((c) => c.handle);
  const brandCols = handles.filter((h) => BRANDS[h]);
  const miswagBrand = r.items.map((id) => live.get(id)?.brand?.name).filter(Boolean)[0];
  rows.push({ pid: r.pid, title: p.title, vendor: p.vendor, type: p.productType, brandCols, sent: r.brand, miswag: miswagBrand, category: r.category, cats: handles.filter((h) => !BRANDS[h]) });
}
writeFileSync('data/brand-audit.json', JSON.stringify(rows, null, 1));
const v = {}; rows.filter((x) => !x.brandCols.length).forEach((x) => (v[x.vendor] = (v[x.vendor] || 0) + 1));
console.log('NO BRAND COLLECTION -> vendor counts:', v);
const multi = rows.filter((x) => x.brandCols.length > 1);
console.log('MULTIPLE brand collections:', multi.length, multi.slice(0, 15).map((x) => `${x.title} :: ${x.brandCols} :: vendor ${x.vendor}`));
const mism = rows.filter((x) => x.brandCols.length === 1 && x.vendor && BRANDS[x.brandCols[0]][0].toLowerCase().replace(/\W/g, '').slice(0, 4) !== x.vendor.toLowerCase().replace(/\W/g, '').slice(0, 4));
console.log('collection vs vendor disagree:', mism.length, mism.slice(0, 40).map((x) => `${x.title} :: col ${x.brandCols[0]} :: vendor ${x.vendor}`));
