// Turns one Shopify product into Miswag bulk-create payloads (usually one, one per variant when prices differ).
import { readFileSync, existsSync } from 'node:fs';
import { miswagQty, realQty } from './stock.mjs';
import { BRANDS, CAT_BY_COLLECTION, CATEGORY_OVERRIDE, CATEGORY_BY_TITLE, MISWAG_CATEGORY, SHADE_OPTION, GENERIC_BRAND, brandFromTitle, PRODUCT_BRAND, VARIATION_ID_ALIAS } from './rules.mjs';

const hasAr = (s) => /[؀-ۿ]/.test(s || '');
// Miswag's database rejects 4-byte characters (emoji etc.), so they are removed along with emoji joiners.
const no4byte = (s) => s.replace(/[\u{10000}-\u{10FFFF}]/gu, '').replace(/[️‍]/g, '');
const clean = (s) => no4byte(s || '').replace(/[​-‏‪-‮⁠﻿]/g, '').replace(/\s+/g, ' ').trim();
const legacy = (gid) => gid.split('/').pop();
const stripHtml = (h) => (h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
// Remove sentences that name the shop (owner rule from the CSV feed).
const dropShopNames = (s) => s.replace(/[^.!؟?…\n]*(مليحة|مليحه|maliha)[^.!؟?…\n]*[.!؟?…]?/gi, '');
const tidy = (s) => dropShopNames(stripHtml(s)).split('\n').map(clean).filter(Boolean).join('\n');
const jpg = (u) => (/\.webp/i.test(u) ? u + (u.includes('?') ? '&' : '?') + 'format=jpg' : u);
const shopRetail = (v) => Math.round(1000 * (v.compareAtPrice && +v.compareAtPrice > +v.price ? +v.compareAtPrice : +v.price));
// Owner-approved Miswag prices (seed/price-overrides.json, Shopify variant id -> IQD).
// An override below the website retail price is ignored: Miswag must never be cheaper than the website.
const OVERRIDES_PATH = new URL('../seed/price-overrides.json', import.meta.url);
const PRICE_OVERRIDES = existsSync(OVERRIDES_PATH) ? JSON.parse(readFileSync(OVERRIDES_PATH, 'utf8')).prices || {} : {};
const retail = (v) => {
  const base = shopRetail(v);
  const o = PRICE_OVERRIDES[legacy(v.id)];
  return Number.isInteger(o) && o >= base ? o : base;
};
// Miswag variation id for a Shopify variant (an alias when Miswag already uses the plain id elsewhere).
const mbv = (v) => VARIATION_ID_ALIAS[legacy(v.id)] || `MBV-${legacy(v.id)}`;
const SIZE_RE = /\s*\|\s*([\d.]+\s*(?:ML|G|OZ|FL\.?\s?OZ))\s*$/i;

export function buildPayloads(p, ctx) {
  const issues = [];
  const pid = legacy(p.id);
  const approved = ctx.approved.get(pid) || {};
  const tr = Object.fromEntries(p.translations.map((t) => [t.key, t.value]));
  const handles = p.collections.nodes.map((c) => c.handle);

  // Brand
  // Brand: the Shopify brand collection first, then a brand name written in the title. Never empty (Miswag would show NYX).
  const brandHandle = handles.find((h) => BRANDS[h]);
  const fromTitle = brandHandle ? null : PRODUCT_BRAND[pid] || brandFromTitle(hasAr(p.title) ? approved.title : p.title);
  let [brandName, brandId] = brandHandle ? BRANDS[brandHandle] : fromTitle ? fromTitle.slice(1) : ['', null];
  if (!brandHandle && !fromTitle) issues.push('no brand (sent as Generic)');
  else if (brandId == null) issues.push(`brand ${brandName} not on Miswag (sent as Generic)`);
  if (brandId == null) brandId = GENERIC_BRAND;

  // Category
  const titleCat = CATEGORY_BY_TITLE.find(([re]) => re.test(p.title))?.[1];
  const cat = CATEGORY_OVERRIDE[pid] || titleCat || handles.map((h) => CAT_BY_COLLECTION[h]).find(Boolean) || approved.category_3 || '';
  const categoryId = MISWAG_CATEGORY[cat];
  if (!categoryId) return { skip: `no Miswag category (${cat || 'unknown'})` };
  const mc = ctx.categories.get(categoryId);

  // Names
  const rawEn = clean(hasAr(p.title) ? approved.title || '' : p.title);
  const nameEn = rawEn.replace(SIZE_RE, '').replace(/\s*\|\s*$/, '');
  if (nameEn.length < 3) return { skip: 'no English title' };
  let nameAr = hasAr(tr.title) ? clean(tr.title) : approved.title_ar || (hasAr(p.title) ? clean(p.title) : '');
  if (!nameAr) { nameAr = `${mc.name_ar.trim()} ${nameEn}`; issues.push('Arabic title auto-built'); }

  // Description (Arabic first)
  let description = tidy(tr.body_html);
  if (!hasAr(description)) description = tidy(approved.description_ar);
  if (!hasAr(description)) { description = tidy(p.description); issues.push('no Arabic description'); }
  if (description.length < 3) description = nameAr;
  const firstLine = description.split(/\n|(?<=[.!؟?])\s/)[0];
  const highlight = (firstLine.length >= 3 ? firstLine : nameAr).slice(0, 160);
  const keywords = [...new Set([brandName, mc.name_ar.trim(), mc.name_en.trim(), cat].filter((k) => k && k.length >= 3))];

  // Images
  const productImgs = p.media.nodes.map((m) => m.image?.url).filter(Boolean);
  if (!productImgs.length) return { skip: 'no photo' };

  const variants = p.variants.nodes;
  const shadeOpt = p.options.find((o) => SHADE_OPTION.test(o.name));
  const multi = variants.length > 1;
  const prices = new Set(variants.map(retail));
  const split = multi && prices.size > 1; // Miswag has one price per item, so split when variant prices differ.

  const untracked = variants.filter((v) => !v.inventoryItem?.tracked).length;
  if (untracked) issues.push(`${untracked} variant(s) without stock tracking (sent as 0)`);

  const variation = (v) => {
    const label = clean(v.title === 'Default Title' ? 'Default' : v.title);
    const own = v.media.nodes[0]?.image?.url;
    const imgs = [...new Set([own, ...(shadeOpt && own ? [] : productImgs)].filter(Boolean))].slice(0, 4);
    return {
      external_id: mbv(v),
      merchant_code: `MB-${legacy(v.id)}`,
      barcode: `MB-${legacy(v.id)}`, // Miswag API requires a barcode; Shopify has none, so the internal code is used (owner-approved fallback)
      color: { name: label.length >= 3 ? label : `Shade ${label}`, value: '#000000' },
      images: imgs.map((url, i) => ({ url: jpg(url), primary: i === 0 })),
      sizes: [{ external_id: 'std', label: 'Standard', quantity: miswagQty(v, pid) }],
    };
  };
  const base = (extra) => ({
    name_en: extra ? `${nameEn} - ${extra}` : nameEn,
    name_ar: extra ? `${nameAr} - ${extra}` : nameAr,
    keywords, highlight, description, category_id: categoryId,
    brand_id: brandId,
    currency: 'IQD',
  });

  const payloads = split
    ? variants.map((v) => ({ external_id: `MB-${pid}-${legacy(v.id)}`, item_code: `MB-${pid}-${legacy(v.id)}`, ...base(clean(v.title)), price: retail(v), variations: [variation(v)] }))
    : [{ external_id: `MB-${pid}`, item_code: `MB-${pid}`, ...base(''), price: retail(variants[0]), variations: variants.map(variation) }];

  // Miswag-only card photo: an owner-approved cutout on the Maliha background (#F6FDF8) replaces the first photo.
  // A shade key (MBV-...) sets that shade's own clean photo. Every other shade gets the item photo (MB-...) first and
  // keeps its own model/swatch photo second (owner-approved 2026-11-07: cards stay uniform in Miswag search).
  const setCard = (v, card) => {
    const rest = v.images.filter((im) => im.url !== card).map((im) => ({ ...im, primary: false }));
    v.images = [{ url: card, primary: true }, ...rest].slice(0, 4);
  };
  for (const x of payloads) {
    for (const v of x.variations) {
      const card = ctx.imageMap?.[v.external_id] || ctx.imageMap?.[v.external_id.replace(/-v\d+$/, '')] || ctx.imageMap?.[x.external_id];
      if (card) setCard(v, card);
    }
  }

  const totalQty = variants.reduce((s, v) => s + realQty(v), 0);
  // Real Shopify stock per payload: decides whether a never-sent item is created (the fixed Miswag quantity does not).
  const realByItem = Object.fromEntries(payloads.map((x) => [x.external_id, variants.filter((v) => x.variations.some((y) => y.external_id === mbv(v))).reduce((s, v) => s + realQty(v), 0)]));
  return { payloads, issues, totalQty, realByItem, meta: { pid, title: p.title, brand: brandName, brandId, brandFrom: brandHandle ? "collection" : fromTitle ? "title" : "none", category: cat, url: p.onlineStoreUrl } };
}
