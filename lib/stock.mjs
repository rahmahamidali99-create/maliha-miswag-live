// Owner rule (2026-11-06): every Miswag listing shows a fixed quantity (seed/stock-rule.json -> fixed_quantity),
// sold-out variants (real stock 0) show 0, and products/variants the owner lists in "exceptions": those get their real Shopify stock ("real") or a set number.
// Shopify stock itself is never changed; this only decides the quantity sent to Miswag.
import { readFileSync, existsSync } from 'node:fs';

const PATH = new URL('../seed/stock-rule.json', import.meta.url);
const RULE = existsSync(PATH) ? JSON.parse(readFileSync(PATH, 'utf8')) : {};
const FIXED = Number.isInteger(RULE.fixed_quantity) && RULE.fixed_quantity >= 0 ? RULE.fixed_quantity : null;
const EXCEPTIONS = RULE.exceptions || {};

export const realQty = (v) => (v.inventoryItem?.tracked ? Math.max(0, v.inventoryQuantity || 0) : 0);

export const miswagQty = (v, pid) => {
  const e = EXCEPTIONS[v.id.split('/').pop()] ?? EXCEPTIONS[String(pid)];
  if (Number.isInteger(e) && e >= 0) return e;
  if (e !== undefined || FIXED === null) return realQty(v);
  // Sold out on the website -> 0 on Miswag (owner rule 2026-11-06).
  if (RULE.zero_when_sold_out !== false && realQty(v) === 0) return 0;
  return FIXED;
};
