// Security check for the "Maliha Miswag Sync" Shopify app. Never prints secrets or tokens.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SHOP = 'dvqcxi-0p.myshopify.com';
const API = '2026-10';
const ALLOWED = ['read_products', 'read_inventory', 'read_translations'];

const env = Object.fromEntries(
  readFileSync(join(homedir(), '.maliha-secrets', 'miswag.env'), 'utf8').split(/\r?\n/).filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
if (!env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) { console.log('Client ID/secret: MISSING'); process.exit(1); }

const tokRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET }),
});
const tokBody = await tokRes.json().catch(() => ({}));
if (!tokRes.ok || !tokBody.access_token) { console.log('Token request: FAIL', tokRes.status, JSON.stringify(tokBody).replace(/"access_token":"[^"]+"/, '"access_token":"<hidden>"')); process.exit(1); }
const token = tokBody.access_token;
const granted = (tokBody.scope || '').split(',').map(s => s.trim()).filter(Boolean).sort();
const extra = granted.filter(s => !ALLOWED.includes(s));
console.log('1) App installed, token issued      : PASS');
console.log('   Granted scopes                   :', granted.join(', '));
console.log('2) Only the 3 read scopes, no extra :', extra.length === 0 && granted.length > 0 ? 'PASS' : `FAIL (extra: ${extra.join(', ')})`);
console.log('   Any write_ scope                 :', granted.some(s => s.startsWith('write_')) ? 'FAIL' : 'none (PASS)');

const gql = async (query) => {
  const r = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token }, body: JSON.stringify({ query }),
  });
  const b = await r.json().catch(() => ({}));
  const denied = r.status === 403 || (b.errors || []).some(e => /access denied|ACCESS_DENIED|not approved|required access/i.test(JSON.stringify(e)));
  return { status: r.status, denied, ok: r.ok && !b.errors && b.data, b };
};
const expectOk = async (label, q) => { const r = await gql(q); console.log(label, r.ok ? 'PASS (can read)' : `FAIL (${r.status})`); };
const expectDenied = async (label, q) => { const r = await gql(q); console.log(label, r.denied ? 'PASS (denied)' : `FAIL (status ${r.status}, ${r.ok ? 'DATA RETURNED' : 'unexpected'})`); };

console.log('3) Live access tests:');
await expectOk('   Products  (should read)  :', '{ products(first:1){ nodes{ id } } }');
await expectDenied('   Orders    (must refuse) :', '{ orders(first:1){ nodes{ id } } }');
await expectDenied('   Customers (must refuse) :', '{ customers(first:1){ nodes{ id } } }');
await expectDenied('   Themes    (must refuse) :', '{ themes(first:1){ nodes{ id } } }');
// Write test targets a product id that does not exist, so nothing can change even in the worst case.
await expectDenied('   Edit products (refuse)  :', 'mutation { tagsAdd(id:"gid://shopify/Product/1", tags:["x"]){ userErrors{ message } } }');
