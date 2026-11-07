// Checks the Miswag Seller API key. Never prints the key or secret.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const envPath = join(homedir(), '.maliha-secrets', 'miswag.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split(/\r?\n/).filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const key = env.MISWAG_API_KEY, secret = env.MISWAG_API_SECRET;
const fmt = (v, p) => !v ? 'MISSING' : v.startsWith(p) ? `OK (${p}..., ${v.length} chars)` : `WRONG PREFIX (expected ${p})`;
console.log('API key   :', fmt(key, 'ak_prd_'));
console.log('API secret:', fmt(secret, 'sk_prd_'));
if (!key || !secret) process.exit(1);

const res = await fetch('https://seller-api.miswag.com/v1/healthcheck', {
  headers: { 'X-API-Key': key, 'X-API-Secret': secret, Accept: 'application/json' },
});
console.log('Healthcheck HTTP', res.status, res.status === 200 ? 'PASS' : 'FAIL');
