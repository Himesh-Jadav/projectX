// Smaran.ai: API key health check.
// Run from the repo root:   node scripts/check-keys.mjs          (spends NO model tokens)
//                           node scripts/check-keys.mjs --deep   (adds one 1-token call per key, shows remaining quota)
// Reads .env, never prints a key (only the variable name and the last 4 characters).
import { readFileSync } from 'node:fs';

const DEEP = process.argv.includes('--deep');
const TIMEOUT = 10000;

function loadEnv() {
  const out = {};
  const found = ['.env', '../.env', '../../.env'].find((p) => { try { readFileSync(p); return true; } catch { return false; } });
  if (!found) {
    console.log('No .env file found here or in the two folders above. Run from the repo root.');
  } else {
    console.log(`Using ${found}`);
    for (const line of readFileSync(found, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return { ...out, ...process.env };
}

const env = loadEnv();
const providers = { groq: [], gemini: [], openrouter: [] };
for (const [name, value] of Object.entries(env)) {
  if (!/KEY/i.test(name) || typeof value !== 'string') continue;
  const bucket = /^GROQ/i.test(name) ? 'groq' : /^(GEMINI|GOOGLE)/i.test(name) ? 'gemini' : /^OPENROUTER/i.test(name) ? 'openrouter' : null;
  if (!bucket) continue;
  value.split(/[,\s]+/).filter((k) => k.length > 10).forEach((key, i) => providers[bucket].push({ name: `${name}${i ? `#${i + 1}` : ''}`, key }));
}

const mask = (key) => `...${key.slice(-4)}`;
async function call(url, options = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT) });
    let body = null;
    try { body = await res.json(); } catch { /* not json */ }
    return { status: res.status, headers: res.headers, body, ms: Date.now() - started };
  } catch (error) {
    return { status: 0, error: error.name === 'TimeoutError' ? `timed out after ${TIMEOUT / 1000}s` : error.message, ms: Date.now() - started };
  }
}
const verdict = (r) =>
  r.status === 200 ? 'OK'
  : r.status === 0 ? `NO RESPONSE (${r.error})`
  : r.status === 401 || r.status === 403 ? `INVALID KEY (${r.status})`
  : r.status === 429 ? `RATE LIMITED (429${r.headers?.get('retry-after') ? `, retry in ${r.headers.get('retry-after')}s` : ''})`
  : `ERROR ${r.status}${r.body?.error?.message ? `: ${String(r.body.error.message).slice(0, 80)}` : ''}`;

const rows = [];
const add = (provider, k, check, r, extra = '') => rows.push({ provider, key: `${k.name} (${mask(k.key)})`, check, result: verdict(r), ms: r.ms, extra });

for (const k of providers.groq) {
  const auth = { Authorization: `Bearer ${k.key}` };
  add('groq', k, 'key valid', await call('https://api.groq.com/openai/v1/models', { headers: auth }));
  if (DEEP) {
    const r = await call('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.GROQ_FAST_MODEL || 'llama-3.1-8b-instant', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    });
    const h = r.headers;
    add('groq', k, '1-token call', r, h ? `left: ${h.get('x-ratelimit-remaining-requests') ?? '?'} requests/day, ${h.get('x-ratelimit-remaining-tokens') ?? '?'} tokens/min` : '');
  }
}
for (const k of providers.gemini) {
  const auth = { 'x-goog-api-key': k.key };
  add('gemini', k, 'key valid', await call('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: auth }));
  if (DEEP) {
    const r = await call('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text: 'hi' }] }, taskType: 'RETRIEVAL_QUERY', outputDimensionality: 768 }),
    });
    const dims = r.body?.embedding?.values?.length;
    add('gemini', k, 'embedding (768 dims)', dims && dims !== 768 ? { ...r, status: 500, body: { error: { message: `got ${dims} dims` } } } : r, dims ? `${dims} dims` : '');
  }
}
for (const k of providers.openrouter) {
  const auth = { Authorization: `Bearer ${k.key}` };
  const r = await call('https://openrouter.ai/api/v1/key', { headers: auth });
  const d = r.body?.data;
  add('openrouter', k, 'key valid', r, d ? `usage: ${d.usage ?? '?'}, limit: ${d.limit ?? 'none'}, free tier: ${d.is_free_tier ?? '?'}` : '');
  if (DEEP) {
    const model = env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
    const c = await call('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    });
    add('openrouter', k, `1-token call (${model})`, c, c.status === 404 ? 'model not found: set OPENROUTER_MODEL to a current :free model' : '');
  }
}

const base = (env.HINDSIGHT_API_URL || 'http://localhost:3003').replace(/\/$/, '');
const health = await call(`${base}/api/health`);
rows.push({ provider: 'app', key: base, check: 'GET /api/health (database, redis, providers)', result: verdict(health), ms: health.ms, extra: health.body ? JSON.stringify(health.body).slice(0, 120) : '' });

console.log(`\nSmaran.ai key check${DEEP ? ' (deep: 1-token calls)' : ' (no tokens spent)'}\n`);
for (const p of ['groq', 'gemini', 'openrouter']) if (!providers[p].length) console.log(`  ! no ${p} key found in .env`);
console.table(rows.map((r) => ({ provider: r.provider, key: r.key, check: r.check, result: r.result, ms: r.ms, note: r.extra })));

const need = [];
if (!rows.some((r) => r.provider === 'gemini' && r.result === 'OK')) need.push('Gemini (embeddings are required and have no substitute)');
if (!rows.some((r) => r.provider === 'groq' && r.result === 'OK')) need.push('Groq (main LLM)');
console.log(need.length ? `\nFIX FIRST: no working key for ${need.join(' and ')}.` : '\nAt least one working key for each required provider.');
process.exit(need.length ? 1 : 0);
