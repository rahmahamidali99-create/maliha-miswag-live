// Swaps the card photo of hand-listed Miswag items (not in the Shopify sync) for the #F6FDF8 version.
// Everything else is resent exactly as read from Miswag (data/hand-listed-backup.json); the old photo stays as the 2nd image.
// usage: node tools/hand-photos.mjs <itemId,...> [--live]
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadEnv } from '../lib/env.mjs';
import { miswagClient } from '../lib/miswag.mjs';
const LIVE = process.argv.includes('--live');
const ids = new Set(process.argv[2].split(','));
const SIZE_LABEL = JSON.parse(readFileSync(new URL('../seed/hand-size-labels.json', import.meta.url), 'utf8'));
const backup = JSON.parse(readFileSync(new URL('../data/hand-listed-backup.json', import.meta.url), 'utf8'));
const BASE = 'https://raw.githubusercontent.com/rahmahamidali99-create/maliha-miswag-images/main/img/v2/hand/';
const BRAND_BY_NAME = [[/cerave/i, 1005], [/roche/i, 985]];
const m = miswagClient(loadEnv(), { live: LIVE });
for (const { item: it, variations } of backup.filter((x) => ids.has(x.item.id))) {
  const payload = {
    external_id: it.id, name_en: it.name_en, name_ar: it.name_ar, keywords: it.tags, highlight: it.highlight,
    description: it.description, price: it.price, currency: it.currency, category_id: it.category.id,
    brand_id: it.brand?.id ?? BRAND_BY_NAME.find(([re]) => re.test(it.name_en))?.[1],
    variations: variations.map((v) => {
      const old = (v.images.find((i) => !i.is_extra) || v.images[0]).image_url;
      const key = createHash('sha1').update(old).digest('hex').slice(0, 16);
      return {
        external_id: v.id, barcode: v.barcode || v.id, color: v.color,
        images: [{ url: `${BASE}${key}.jpg`, primary: true }, ...v.images.map((i) => ({ url: i.image_url, primary: false }))].slice(0, 4),
        sizes: v.sizes.map((s) => {
          if (!SIZE_LABEL[s.id]) throw new Error(`no label for size ${s.id} (item ${it.id})`);
          return { external_id: s.id, label: SIZE_LABEL[s.id], quantity: s.quantity };
        }),
      };
    }),
  };
  if (!LIVE) { console.log(JSON.stringify(payload).slice(0, 900)); continue; }
  const r = await m.call('POST', '/v1/items/bulk-create?async=false', payload);
  console.log(it.id, r.status, JSON.stringify(r.json).slice(0, 400));
}
