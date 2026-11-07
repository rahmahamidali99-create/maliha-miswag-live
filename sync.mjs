// Maliha -> Miswag product sync.
//   node sync.mjs            DRY RUN (default): reads Shopify + Miswag, builds payloads, writes a report. Sends nothing.
//   node sync.mjs --live --only=<shopifyProductId,...>   sends only those products (used for the first approved test)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadEnv } from './lib/env.mjs';
import { shopifyClient, fetchProducts, fetchWholesaleIds } from './lib/shopify.mjs';
import { miswagClient } from './lib/miswag.mjs';
import { isWholesale, isCeraVe } from './lib/rules.mjs';
import { buildPayloads } from './lib/build.mjs';
import { syncOrders } from './lib/orders.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const LIVE = args.live === true;
const ONLY = args.only ? new Set(String(args.only).split(',')) : null;
if (LIVE && !ONLY && !args.all) throw new Error('Live mode needs --only=<ids> (or --all once the owner approves a full run).');

const DATA = new URL('./data/', import.meta.url);
mkdirSync(DATA, { recursive: true });
const env = loadEnv();
const STATE_FILE = new URL('state.json', DATA);
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { items: {} };
const known = (id) => Boolean(state.items[id]);
const shop = await shopifyClient(env);
const miswag = miswagClient(env, { live: LIVE });

// ---- Reference data
const categories = new Map(JSON.parse(readFileSync(new URL('./seed/miswag_categories_flat.json', import.meta.url), 'utf8')).map((c) => [c.id, c]));
const miswagItems = await miswag.getAll('/v1/items?page[size]=30');
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const manualOnMiswag = new Set(miswagItems.filter((i) => !String(i.item_code || '').startsWith('MB-')).map((i) => norm(i.name_en)));

// Approved translations / categories from the 2026-11-03 CSV (reviewed by the owner)
const approved = new Map();
const csvPath = new URL('./seed/approved-translations.csv', import.meta.url);
if (existsSync(csvPath)) {
  const rows = parseCsv(readFileSync(csvPath, 'utf8').replace(/^﻿/, ''));
  const head = rows.shift();
  for (const r of rows) {
    const o = Object.fromEntries(head.map((h, i) => [h, r[i]]));
    if (!approved.has(o.item_group_id)) approved.set(o.item_group_id, o);
  }
}

// Owner-approved Miswag card photos (external_id -> public image URL). Empty until the owner signs off.
const mapPath = new URL('./seed/image-map.json', import.meta.url);
const imageMap = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, 'utf8')) : {};

// ---- Shopify catalogue: active products only
// ---- Miswag orders -> Shopify stock FIRST, so the stock read below already includes them.
// Runs only once the Shopify app has write_inventory (owner-approved 2026-11-07); --orders=off skips it.
let orders = { skipped: 'Shopify app has no write_inventory scope yet' };
if (args.orders === 'off') orders = { skipped: '--orders=off' };
else if (!ONLY && shop.canWriteInventory) {
  try { orders = await syncOrders({ shop, miswag, state, live: LIVE, log: (m) => console.log('ORDERS', m) }); }
  catch (e) { orders = { error: String(e.message || e).slice(0, 300) }; console.log('ORDERS ERROR', orders.error); }
}

const products = await fetchProducts(shop, 'status:active');
const wholesaleIds = await fetchWholesaleIds(shop);

const skipped = {}; const skip = (why, p) => (skipped[why] ??= []).push(`${p.title} (${p.id.split('/').pop()})`);
const out = [];
const soldOutIds = new Set();
for (const p of products) {
  if (ONLY && !ONLY.has(p.id.split('/').pop())) continue;
  if (wholesaleIds.has(p.id) || isWholesale(p)) { skip('WHOLESALE (blocked)', p); continue; }
  if (p.status !== 'ACTIVE' || !p.onlineStoreUrl) { skip('not on the website', p); continue; }
  if (isCeraVe(p)) { skip('CeraVe (listed by hand)', p); continue; }
  if (p.handle === 'free-shipping-threshold' || /^untitled/i.test(p.title)) { skip('helper / untitled', p); continue; }
  if ([...manualOnMiswag].some((m) => m.length > 8 && (norm(p.title).startsWith(m) || m.startsWith(norm(p.title))))) { skip('already on Miswag (by hand)', p); continue; }
  const r = buildPayloads(p, { approved, categories, imageMap });
  if (r.skip) { skip(r.skip, p); continue; }
  // Owner rule (2026-11-07): an item that is sold out in Shopify (real stock 0 on every shade) is taken OFF Miswag
  // (stock 0 + unpublish) and comes back automatically when Shopify has stock again.
  const qty = (x) => x.variations.reduce((t, v) => t + v.sizes[0].quantity, 0);
  const before = r.payloads.length;
  r.payloads = r.payloads.filter((x) => {
    const inStock = (r.realByItem?.[x.external_id] ?? qty(x)) > 0;
    if (!inStock) soldOutIds.add(x.external_id);
    return inStock;
  });
  if (!r.payloads.length) { skip('sold out in Shopify (off Miswag until back in stock)', p); continue; }
  if (r.payloads.length < before) skip('partly sold out (sold-out items off Miswag)', p);
  out.push(r);
}

// ---- Final guard: no payload may come from or mention a wholesale product
const payloads = out.flatMap((r) => r.payloads);
const leaks = out.filter((r) => wholesaleIds.has(`gid://shopify/Product/${r.meta.pid}`) || r.payloads.some((x) => /wholesale|جملة/i.test(x.name_en + x.name_ar + x.description)));
if (leaks.length) { console.error('ABORT: wholesale content detected', leaks.map((l) => l.meta.title)); process.exit(2); }

// ---- Report
const issueCount = {}; out.forEach((r) => r.issues.forEach((i) => { const k = i.replace(/^\d+ /, 'N '); issueCount[k] = (issueCount[k] || 0) + 1; }));
const summary = {
  mode: LIVE ? 'LIVE' : 'DRY RUN (nothing sent)',
  shopify_active_products: products.length,
  wholesale_products_in_store_any_status: wholesaleIds.size,
  wholesale_products_in_payloads: 0,
  products_to_send: out.length,
  miswag_items_to_send: payloads.length,
  variations: payloads.reduce((s, x) => s + x.variations.length, 0),
  skipped: Object.fromEntries(Object.entries(skipped).map(([k, v]) => [k, v.length])),
  warnings: issueCount,
  existing_miswag_items: miswagItems.length,
  orders,
};
writeFileSync(new URL('payloads.json', DATA), JSON.stringify(payloads, null, 1));
writeFileSync(new URL('report.json', DATA), JSON.stringify({ summary, skipped, products: out.map((r) => ({ ...r.meta, issues: r.issues, items: r.payloads.map((x) => x.external_id) })) }, null, 1));
console.log(JSON.stringify(summary, null, 1));

if (LIVE) await pushToMiswag();

async function pushToMiswag() {
  const hash = (o) => createHash('sha1').update(JSON.stringify(o)).digest('hex');
  const content = (x) => ({ ...x, price: undefined, variations: x.variations.map((v) => ({ ...v, sizes: v.sizes.map((z) => ({ ...z, quantity: undefined })) })) });
  const stockOf = (x) => Object.fromEntries(x.variations.map((v) => [v.external_id, v.sizes[0].quantity]));
  const log = { created_or_updated: 0, price_updates: 0, stock_updates: 0, published: 0, unpublished: 0, errors: [] };
  const err = (what, r) => { log.errors.push(`${what}: ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`); console.log('ERROR', what, r.status, JSON.stringify(r.json).slice(0, 300)); };
  const toPublish = [];
  const current = new Set(payloads.map((x) => x.external_id));

  // Safety: a broken Shopify read must never wipe Miswag.
  const prevCount = Object.keys(state.items).length;
  // Sold-out items are still known to Shopify, so they count as "seen" here (they are only taken off Miswag).
  if (!ONLY && prevCount > 20 && current.size + soldOutIds.size < prevCount * 0.7) throw new Error(`ABORT: only ${current.size} items now vs ${prevCount} before. Not touching Miswag.`);

  let n = 0;
  for (const x of payloads) {
    n++;
    const prev = state.items[x.external_id];
    const h = hash(content(x)), stock = stockOf(x);
    if (!prev || prev.hash !== h) {
      const r = await miswag.call('POST', '/v1/items/bulk-create?async=false', x);
      if (r.status !== 200 && r.status !== 201) { err(`create ${x.external_id}`, r); continue; }
      log.created_or_updated++;
      // Variations that disappeared from Shopify stay on Miswag; zero their stock.
      for (const old of Object.keys(prev?.stock || {}).filter((v) => !(v in stock))) {
        const z = await miswag.call('PATCH', `/v1/items/${x.external_id}/stock`, { variations: [{ id: old, sizes: [{ id: 'std', quantity: 0 }] }] });
        if (z.status >= 300) err(`zero ${old}`, z);
      }
      state.items[x.external_id] = { hash: h, price: x.price, stock, published: prev?.published ?? false };
    } else {
      if (prev.price !== x.price) {
        const r = await miswag.call('PATCH', `/v1/items/${x.external_id}/price`, { price: x.price });
        if (r.status >= 300) err(`price ${x.external_id}`, r); else { log.price_updates++; prev.price = x.price; }
      }
      const changed = Object.entries(stock).filter(([v, q]) => prev.stock?.[v] !== q);
      if (changed.length) {
        const r = await miswag.call('PATCH', `/v1/items/${x.external_id}/stock`, { variations: changed.map(([v, q]) => ({ id: v, sizes: [{ id: 'std', quantity: q }] })) });
        if (r.status >= 300) err(`stock ${x.external_id}`, r); else { log.stock_updates++; prev.stock = { ...prev.stock, ...stock }; }
      }
    }
    // Not yet published, or taken off earlier (sold out / hidden) and now back: submit it again.
    if (state.items[x.external_id].published !== true) toPublish.push(x.external_id);
    if (n % 50 === 0) { console.log(`... ${n}/${payloads.length}`); writeFileSync(STATE_FILE, JSON.stringify(state)); }
  }

  // Items that no longer qualify (deleted, drafted, hidden from the website, turned wholesale, CeraVe): take them off Miswag.
  const gone = ONLY ? [] : Object.keys(state.items).filter((id) => !current.has(id) && state.items[id].published !== 'removed');
  for (const id of gone) {
    const s0 = state.items[id];
    const z = await miswag.call('PATCH', `/v1/items/${id}/stock`, { variations: Object.keys(s0.stock || {}).map((v) => ({ id: v, sizes: [{ id: 'std', quantity: 0 }] })) });
    if (z.status >= 300) err(`zero ${id}`, z);
    // Remember Miswag now holds 0, so the stock is sent again when the item comes back.
    else s0.stock = Object.fromEntries(Object.keys(s0.stock || {}).map((v) => [v, 0]));
  }
  for (let i = 0; i < gone.length; i += 50) {
    const r = await miswag.call('POST', '/v1/items/actions/unpublish', { items: gone.slice(i, i + 50) });
    if (r.status >= 300) err('unpublish', r); else { gone.slice(i, i + 50).forEach((id) => (state.items[id].published = 'removed')); log.unpublished += Math.min(50, gone.length - i); }
  }

  // Submit new (or returning) items for Miswag review.
  for (let i = 0; i < toPublish.length; i += 50) {
    const batch = toPublish.slice(i, i + 50);
    const r = await miswag.call('POST', '/v1/items/actions/publish', { items: batch });
    if (r.status >= 300) { err('publish', r); continue; }
    const results = r.json.data?.results || r.json.data?.items || r.json.data || [];
    for (const id of batch) {
      const res = Array.isArray(results) ? results.find((o) => (o.id || o.item || o.external_id) === id) : null;
      if (!res || res.status === 'invalid') {
        // Images are fetched by Miswag in the background; such items are simply retried on the next run.
        if (res && res.errors.every((e) => /no images/i.test(e))) log.publish_waiting_for_images = (log.publish_waiting_for_images || 0) + 1;
        else err(`publish ${id}`, { status: 200, json: res ?? 'no result' });
      } else { state.items[id].published = true; log.published++; }
    }
  }

  // Hand-listed items (CeraVe + La Roche-Posay C12, numeric Miswag ids) linked in seed/hand-map.json:
  // they get the real Shopify stock too (owner-approved 2026-11-07). Only stock is sent; the listings stay as the owner made them.
  const handPath = new URL('./seed/hand-map.json', import.meta.url);
  if (!ONLY && existsSync(handPath)) {
    const hand = JSON.parse(readFileSync(handPath, 'utf8')).variations || {};
    const ids = [...new Set(Object.values(hand).map((h) => `gid://shopify/ProductVariant/${h.shopify_variant}`))];
    const qty = {};
    for (let i = 0; i < ids.length; i += 50) {
      const d = await shop.gql(`query($ids:[ID!]!){ nodes(ids:$ids){ ... on ProductVariant { id inventoryQuantity inventoryItem { tracked } } } }`, { ids: ids.slice(i, i + 50) });
      for (const n of d.nodes) if (n) qty[n.id.split('/').pop()] = n.inventoryItem?.tracked ? Math.max(0, n.inventoryQuantity || 0) : 0;
    }
    state.hand ??= {};
    log.hand_stock_updates = 0;
    for (const [variation, h] of Object.entries(hand)) {
      const q = qty[h.shopify_variant];
      if (q === undefined || state.hand[variation] === q) continue;
      const r = await miswag.call('PATCH', `/v1/items/${h.item}/stock`, { variations: [{ id: variation, sizes: [{ id: h.size, quantity: q }] }] });
      if (r.status >= 300) err(`hand stock ${h.item}`, r); else { state.hand[variation] = q; log.hand_stock_updates++; }
    }
  }

  writeFileSync(STATE_FILE, JSON.stringify(state));
  const run = { at: new Date().toISOString(), ...summary, ...log, errors: log.errors.length, error_samples: log.errors.slice(0, 20) };
  writeFileSync(new URL('last-run.json', DATA), JSON.stringify(run, null, 1));
  console.log(JSON.stringify({ ...log, errors: log.errors.length }, null, 1));
  if (log.errors.length) process.exitCode = 1;
}

function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
