import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Secrets live outside OneDrive. On a server (GitHub Actions) they come from environment variables instead.
export function loadEnv() {
  const env = { ...process.env };
  try {
    for (const l of readFileSync(join(homedir(), '.maliha-secrets', 'miswag.env'), 'utf8').split(/\r?\n/)) {
      const i = l.indexOf('=');
      if (i > 0 && !env[l.slice(0, i).trim()]) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    }
  } catch { /* no local file: rely on process.env */ }
  for (const k of ['MISWAG_API_KEY', 'MISWAG_API_SECRET', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET'])
    if (!env[k]) throw new Error(`Missing ${k}`);
  return env;
}
