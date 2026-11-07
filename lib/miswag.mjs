// Miswag Seller API client. READ methods are always allowed; WRITE methods refuse unless live=true.
const BASE = 'https://seller-api.miswag.com';

export function miswagClient(env, { live = false } = {}) {
  const headers = { 'X-API-Key': env.MISWAG_API_KEY, 'X-API-Secret': env.MISWAG_API_SECRET, Accept: 'application/json', 'Content-Type': 'application/json' };
  async function call(method, path, body) {
    if (method !== 'GET' && !live) throw new Error(`DRY RUN: refused ${method} ${path}`);
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(path.startsWith('http') ? path : BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
      if ((r.status === 429 || r.status >= 500) && attempt < 4) { await new Promise(s => setTimeout(s, 2000 * (attempt + 1))); continue; }
      const text = await r.text();
      let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }
      return { status: r.status, json };
    }
  }
  async function getAll(path) {
    const out = []; let url = path;
    while (url) {
      const { status, json } = await call('GET', url);
      if (status !== 200) throw new Error(`GET ${url} -> ${status} ${JSON.stringify(json).slice(0, 300)}`);
      const d = json.data;
      const list = Array.isArray(d) ? d : (d.items || d.categories || d.brands || d.sizes || Object.values(d).find(Array.isArray) || []);
      out.push(...list);
      url = d?.paging?.next_url || null;
    }
    return out;
  }
  return { call, getAll };
}
