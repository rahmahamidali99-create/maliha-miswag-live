// Miswag orders -> Shopify stock (owner-approved 2026-11-07).
// Every new Miswag shipment takes its pieces off Shopify's "available" stock at the Baghdad location.
// A shipment that is cancelled, or a line removed from it, before delivery gives the pieces back.
// Safety:
//  - Shipments that existed before this feature first ran are never touched (first run only records them).
//  - Each change carries a Shopify idempotency key, so a repeated run can never take the same pieces twice.
//  - More than MAX_LINES changes in one run is treated as a fault: nothing is changed and the run reports it.
//  - The only Shopify write this module can make is inventoryAdjustQuantities.
import { readFileSync, existsSync } from 'node:fs';

const MAX_LINES = 40;
const TRACK_DAYS = 30;
const HAND_MAP_PATH = new URL('../seed/hand-map.json', import.meta.url);
// Miswag variation id (hand-listed items) -> { shopify_variant, ... }
const HAND_MAP = existsSync(HAND_MAP_PATH) ? JSON.parse(readFileSync(HAND_MAP_PATH, 'utf8')).variations || {} : {};

// Miswag shows times like "2026/11/06 10:33:34 PM" (Baghdad time, UTC+3).
export function miswagTime(s) {
  const m = String(s || '').match(/(\d{4})\/(\d{2})\/(\d{2}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)/);
  if (!m) return NaN;
  let h = +m[4] % 12; if (m[7] === 'PM') h += 12;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], h - 3, +m[5], +m[6]);
}

// Shopify variant id for one Miswag order line, or null when the line is not linked to Shopify.
export function variantForLine(it) {
  const ext = String(it.external_variation_id || '');
  if (ext.startsWith('MBV-')) return ext.slice(4).replace(/-v\d+$/, '');
  const hand = HAND_MAP[String(it.var_id)] || HAND_MAP[ext];
  return hand ? String(hand.shopify_variant) : null;
}

const ADJUST = `mutation adjust($input: InventoryAdjustQuantitiesInput!, $key: String!) {
  inventoryAdjustQuantities(input: $input) @idempotent(key: $key) {
    inventoryAdjustmentGroup { id }
    userErrors { field message code }
  }
}`;

export async function syncOrders({ shop, miswag, state, live, log }) {
  const now = Date.now();
  const o = (state.orders ??= { started_at: null, seen: {} });
  const firstRun = !o.started_at;
  const report = { new_shipments: 0, deducted_lines: 0, restored_lines: 0, unlinked_lines: [], skipped_before_start: 0, errors: [] };

  // ---- 1. Read recent shipments (newest first) until we pass ones we already know or older than TRACK_DAYS.
  const list = [];
  for (let page = 1; page <= 10; page++) {
    const r = await miswag.call('GET', `/v1/shipments?page=${page}&per_page=50`);
    if (r.status !== 200) throw new Error(`Miswag shipments ${r.status}`);
    const rows = Array.isArray(r.json.data) ? r.json.data : [];
    list.push(...rows);
    const oldest = rows.length ? miswagTime(rows[rows.length - 1].created_at) : 0;
    if (rows.length < 50 || oldest < now - TRACK_DAYS * 864e5) break;
    if (!firstRun && rows.every((s) => o.seen[s.shipment_id])) break;
  }

  if (firstRun) {
    // Go-live: remember everything that already exists; staff handled those by hand.
    for (const s of list) o.seen[s.shipment_id] = { at: miswagTime(s.created_at), state: s.state, before_start: true };
    o.started_at = now;
    report.skipped_before_start = list.length;
    return report;
  }

  // ---- 2. Plan changes.
  const plan = []; // { key, variant, delta, shipment, why }
  const details = new Map();
  const detail = async (id) => {
    if (!details.has(id)) {
      const r = await miswag.call('GET', `/v1/shipments/${id}`);
      if (r.status !== 200) throw new Error(`Miswag shipment ${id}: ${r.status}`);
      details.set(id, r.json.data);
    }
    return details.get(id);
  };

  for (const s of list) {
    const known = o.seen[s.shipment_id];
    if (known) { known.state = s.state; continue; }
    if (miswagTime(s.created_at) < o.started_at) { o.seen[s.shipment_id] = { at: miswagTime(s.created_at), state: s.state, before_start: true }; report.skipped_before_start++; continue; }
    report.new_shipments++;
    const d = await detail(s.shipment_id);
    const rec = { at: miswagTime(s.created_at), state: d.state, lines: {} };
    if (d.state !== 'cancelled') {
      for (const it of d.items || []) {
        const variant = variantForLine(it);
        if (!variant) { report.unlinked_lines.push(`${s.shipment_id}: ${it.item_name} x${it.quantity}`); continue; }
        rec.lines[it.list_id] = { variant, qty: it.quantity, done: false, restored: false };
        plan.push({ key: `miswag-${s.shipment_id}-${it.list_id}-out`, variant, delta: -it.quantity, shipment: s.shipment_id, line: it.list_id, kind: 'out' });
      }
    }
    o.seen[s.shipment_id] = rec;
  }

  // Shipments we took stock for and that are not finished yet: watch for cancellations / removed lines.
  for (const [id, rec] of Object.entries(o.seen)) {
    if (rec.before_start || !rec.lines || ['delivered', 'cancelled'].includes(rec.state)) continue;
    const open = Object.entries(rec.lines).filter(([, l]) => l.done && !l.restored);
    if (!open.length) continue;
    const d = await detail(id);
    rec.state = d.state;
    const present = new Set((d.items || []).map((it) => String(it.list_id)));
    for (const [lineId, l] of open) {
      if (d.state === 'cancelled' || !present.has(String(lineId))) {
        plan.push({ key: `miswag-${id}-${lineId}-back`, variant: l.variant, delta: l.qty, shipment: id, line: lineId, kind: 'back' });
      }
    }
  }

  // Lines planned but not yet applied in an earlier run (e.g. a Shopify error) are retried with the same key.
  for (const [id, rec] of Object.entries(o.seen)) {
    if (!rec.lines || rec.state === 'cancelled') continue;
    for (const [lineId, l] of Object.entries(rec.lines)) {
      if (!l.done && !plan.some((p) => p.key === `miswag-${id}-${lineId}-out`)) {
        plan.push({ key: `miswag-${id}-${lineId}-out`, variant: l.variant, delta: -l.qty, shipment: id, line: lineId, kind: 'out' });
      }
    }
  }

  if (plan.length > MAX_LINES) {
    report.errors.push(`HOLD orders: ${plan.length} stock changes planned in one run (limit ${MAX_LINES}). Nothing changed.`);
    for (const p of plan) if (p.kind === 'out') delete o.seen[p.shipment]; // retried next run
    return report;
  }

  // ---- 3. Apply.
  const items = new Map();
  for (const p of plan) {
    if (!items.has(p.variant)) {
      const v = await shop.gql(`query($id: ID!){ productVariant(id:$id){ inventoryItem{ id inventoryLevels(first:1){ nodes{ location{ id } } } } } }`, { id: `gid://shopify/ProductVariant/${p.variant}` });
      const inv = v.productVariant?.inventoryItem;
      items.set(p.variant, inv ? { item: inv.id, location: inv.inventoryLevels.nodes[0]?.location.id } : null);
    }
    const target = items.get(p.variant);
    const rec = o.seen[p.shipment].lines[p.line];
    if (!target?.location) { report.errors.push(`${p.shipment}: Shopify variant ${p.variant} not found`); continue; }
    log(`${live ? '' : '[dry run] '}${p.kind === 'out' ? 'take' : 'give back'} ${Math.abs(p.delta)} x variant ${p.variant} (Miswag shipment ${p.shipment})`);
    if (!live) continue;
    const r = await shop.mutateInventory(ADJUST, {
      key: p.key,
      input: { name: 'available', reason: p.kind === 'out' ? 'other' : 'restock', referenceDocumentUri: `app://maliha-miswag-sync/shipment/${p.shipment}`, changes: [{ delta: p.delta, inventoryItemId: target.item, locationId: target.location, changeFromQuantity: null }] },
    });
    const errs = r.inventoryAdjustQuantities?.userErrors || [];
    if (errs.length) { report.errors.push(`${p.key}: ${errs.map((e) => e.message).join('; ')}`); continue; }
    if (p.kind === 'out') { rec.done = true; report.deducted_lines++; } else { rec.restored = true; report.restored_lines++; }
  }

  // ---- 4. Forget shipments older than TRACK_DAYS.
  for (const [id, rec] of Object.entries(o.seen)) if (rec.at && rec.at < now - TRACK_DAYS * 864e5) delete o.seen[id];
  return report;
}
