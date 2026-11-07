// Lists every image of the given products (read-only). usage: node tools/media-list.mjs in.json out.json
import { readFileSync, writeFileSync } from 'node:fs';
import { loadEnv } from '../lib/env.mjs';
import { shopifyClient } from '../lib/shopify.mjs';
const items = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const pids = [...new Set(items.map((i) => i.id.split('-')[1]))];
const shop = await shopifyClient(loadEnv());
const out = {};
for (let i = 0; i < pids.length; i += 50) {
  const ids = pids.slice(i, i + 50).map((p) => `gid://shopify/Product/${p}`);
  const d = await shop.gql(`query($ids:[ID!]!){ nodes(ids:$ids){ ... on Product { id media(first:30){ nodes{ ... on MediaImage { image { url } } } } } } }`, { ids });
  for (const n of d.nodes) out[n.id.split('/').pop()] = n.media.nodes.map((m) => m.image?.url).filter(Boolean);
}
writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log('products', Object.keys(out).length, 'images', Object.values(out).flat().length);
