// Shopify Admin client for the "Maliha Miswag Sync" app.
// Scopes: read_products, read_inventory, read_translations, plus write_inventory (owner-approved 2026-11-07)
// used ONLY by mutateInventory() to take Miswag orders off Shopify stock. gql() is read-only.
export const SHOP = 'dvqcxi-0p.myshopify.com';
const API = '2026-10';

export async function shopifyClient(env) {
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET }),
  });
  const b = await r.json();
  if (!b.access_token) throw new Error(`Shopify token failed: ${r.status}`);
  const scopes = b.scope.split(',').map(s => s.trim()).sort().join(',');
  // Hard stop if the app ever gains more access than it should.
  const ALLOWED = ['read_inventory,read_products,read_translations', 'read_inventory,read_products,read_translations,write_inventory'];
  if (!ALLOWED.includes(scopes)) throw new Error(`Unexpected Shopify scopes: ${scopes}`);
  const canWriteInventory = scopes.includes('write_inventory');
  const token = b.access_token;
  async function gql(query, variables) {
    if (/^\s*mutation/i.test(query)) throw new Error('gql() is read-only; use mutateInventory()');
    return send(query, variables);
  }
  // The only write allowed: inventoryAdjustQuantities (Miswag orders -> Shopify stock).
  async function mutateInventory(query, variables) {
    if (!canWriteInventory) throw new Error('Shopify app has no write_inventory scope yet');
    const ops = [...query.matchAll(/([a-zA-Z]+)\s*\(input:/g)].map((m) => m[1]);
    if (!/^\s*mutation/i.test(query) || ops.length !== 1 || ops[0] !== 'inventoryAdjustQuantities') throw new Error('mutateInventory() only runs inventoryAdjustQuantities');
    return send(query, variables);
  }
  async function send(query, variables) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token }, body: JSON.stringify({ query, variables }),
      });
      const j = await res.json();
      const throttled = (Array.isArray(j.errors) ? j.errors : []).some(e => e.extensions?.code === 'THROTTLED');
      if ((throttled || res.status >= 500 || res.status === 429) && attempt < 6) { await new Promise(s => setTimeout(s, 2000 * (attempt + 1))); continue; }
      if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 500));
      return j.data;
    }
  }
  return { gql, mutateInventory, canWriteInventory };
}

const PRODUCT_FIELDS = `
  id title handle status tags onlineStoreUrl description vendor productType
  options { name values }
  collections(first: 40) { nodes { handle title } }
  media(first: 8) { nodes { ... on MediaImage { image { url } } } }
  translations(locale: "ar") { key value }
  variants(first: 100) { nodes {
    id title price compareAtPrice inventoryQuantity
    inventoryItem { tracked }
    selectedOptions { name value }
    media(first: 1) { nodes { ... on MediaImage { image { url } } } }
  } }`;

export async function fetchProducts(shop, query) {
  const out = []; let after = null;
  do {
    const d = await shop.gql(`query($q:String!,$after:String){ products(first:25, query:$q, after:$after){ nodes{ ${PRODUCT_FIELDS} } pageInfo{ hasNextPage endCursor } } }`, { q: query, after });
    out.push(...d.products.nodes);
    after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (after);
  return out;
}

// Independent list of every wholesale product id (any status), used as a final guard.
export async function fetchWholesaleIds(shop) {
  const ids = new Set(); let after = null;
  do {
    const d = await shop.gql(`query($after:String){ products(first:250, query:"tag:maliha-wholesale OR title:*WHOLESALE* OR title:*wholesale*", after:$after){ nodes{ id } pageInfo{ hasNextPage endCursor } } }`, { after });
    d.products.nodes.forEach(n => ids.add(n.id));
    after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (after);
  let cAfter = null;
  do {
    const c = await shop.gql(`query($after:String){ collections(first:1, query:"handle:maliha-wholesale-catalog"){ nodes{ handle products(first:250, after:$after){ nodes{ id } pageInfo{ hasNextPage endCursor } } } } }`, { after: cAfter });
    const col = c.collections.nodes.find(n => n.handle === 'maliha-wholesale-catalog');
    if (!col) break;
    col.products.nodes.forEach(n => ids.add(n.id));
    cAfter = col.products.pageInfo.hasNextPage ? col.products.pageInfo.endCursor : null;
  } while (cAfter);
  return ids;
}
