import { spawn } from 'node:child_process';
import { ObjectId } from 'mongodb';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { connect, dbClient, memories, messages, memory_events, memberships, projects } from '../db.js';
import { recallLongTerm } from '../services/memoryService.js';

const results = [];
let child;
let childOutput = '';
let baseUrl = process.env.HINDSIGHT_API_URL;
let cookie = '';
let projectId = '';

function report(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startApi() {
  if (baseUrl) return;
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => { childOutput = (childOutput + chunk.toString()).slice(-6000); });
  child.stderr.on('data', (chunk) => { childOutput = (childOutput + chunk.toString()).slice(-6000); });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`API server exited early. ${childOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2500) });
      if (response.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`Timed out starting the API server. ${childOutput}`);
}

async function api(path, { method = 'GET', body, timeoutMs = 110_000 } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`API returned non-JSON (${response.status}): ${text.slice(0, 300)}`); }
  if (!response.ok) throw new Error(`${method} ${path} returned ${response.status}: ${payload.error ?? text}`);
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return payload;
}

const projectPath = (path) => `/api/projects/${projectId}${path}`;

function changedMemory(payload, type, needle) {
  return payload?.changes?.map(({ memory }) => memory).find((memory) =>
    memory?.type === type && (!needle || memory.content?.toLowerCase().includes(needle.toLowerCase()))
  );
}

try {
  await connect();
  await startApi();
  console.log(`Using Hindsight API at ${baseUrl}`);

  await api('/api/auth/login', { method: 'POST', body: { email: 'alice@quickbite.demo', password: process.env.DEMO_PASSWORD } });
  const projectResponse = await api('/api/projects', { method: 'POST', body: { name: `Step 1 Verification ${Date.now()}` } });
  projectId = projectResponse.project?.id;
  if (!projectId) throw new Error('Could not create an isolated Step 1 verification project.');

  const session1 = `demo-check-${Date.now()}-one`;
  let step1;
  let mongo;
  for (let attempt = 0; attempt < 3 && !mongo; attempt += 1) {
    step1 = await api(projectPath('/chat'), { method: 'POST', body: { sessionId: session1, message: "Decision: use MongoDB as QuickBite's main database because menus and orders have flexible shapes. We have to ship in 5 days." } });
    mongo = changedMemory(step1, 'decision', 'MongoDB') ?? step1.used?.find(({ memory }) => memory.type === 'decision' && /MongoDB/i.test(memory.content))?.memory;
  }
  report('Step 1: database decision and deadline recorded', Boolean(mongo), mongo?.content ?? 'MongoDB decision was not returned or saved');

  const step2 = await api(projectPath('/chat'), { method: 'POST', body: { sessionId: session1, message: "I'm assuming most students will order from their phones, so mobile-first." } });
  const mobile = changedMemory(step2, 'assumption', 'mobile') ?? step2.used?.find(({ memory }) => memory.type === 'assumption' && /mobile/i.test(memory.content))?.memory;
  report('Step 2: mobile-first assumption recorded', Boolean(mobile), mobile?.content ?? 'Mobile assumption was not returned or saved');

  const step3 = await api(projectPath('/chat'), { method: 'POST', body: { sessionId: session1, message: "No paid APIs for the next 2 minutes, we're in demo mode." } });
  const temporary = changedMemory(step3, 'constraint', 'paid APIs');
  const expiresAt = temporary?.expiresAt ? new Date(temporary.expiresAt) : null;
  const expiryIsFuture = expiresAt && expiresAt.getTime() > Date.now() && expiresAt.getTime() <= Date.now() + 3 * 60_000;
  report('Step 3: temporary constraint saved with expiresAt', Boolean(expiryIsFuture), expiresAt?.toISOString() ?? 'No two-minute expiresAt was returned');

  const session2 = `demo-check-${Date.now()}-two`;
  const sessionStart = await api(projectPath(`/session/start?sessionId=${encodeURIComponent(session2)}`));
  report('Step 4: new session started with check-ins', Array.isArray(sessionStart.checkIns));

  let step5;
  for (let attempt = 0; attempt < 3 && !step5?.conflicts?.length; attempt += 1) {
    step5 = await api(projectPath('/chat'), { method: 'POST', body: { sessionId: session2, message: "Let's use Postgres for the orders table, I like SQL." } });
  }
  const conflict = step5.conflicts?.[0];
  const citesMongo = /MongoDB/i.test(step5.reply ?? '') && Boolean(conflict?.pending?._id);
  report('Conflict: Postgres reply cites MongoDB and creates pending memory', citesMongo, conflict?.pending?.content ?? 'Conflict was not returned');

  let postgres;
  let oldMemory;
  if (conflict?.pending?._id) {
    await api(projectPath('/chat'), { method: 'POST', body: { sessionId: session2, message: 'Orders turned out to be very relational.' } });
    const resolution = await api(projectPath(`/memories/${conflict.pending._id}/resolve`), { method: 'POST', body: { action: 'override' } });
    postgres = resolution.memory;
    oldMemory = resolution.old;
  }
  report('Conflict: override activates Postgres and supersedes MongoDB', oldMemory?.status === 'superseded' && postgres?.status === 'active', `${oldMemory?.status ?? 'missing'} → ${postgres?.status ?? 'missing'}`);

  const step7 = await api(projectPath('/chat'), { method: 'POST', body: { sessionId: session2, message: 'Add a paid SMS OTP service for login.' } });
  const constraintUsed = temporary && step7.used?.some(({ memory }) => String(memory._id) === String(temporary._id));
  report('Step 7: active temporary constraint is recalled for paid SMS request', Boolean(constraintUsed) && /paid|free|constraint/i.test(step7.reply ?? ''), constraintUsed ? 'constraint appeared in used[]' : 'constraint was not recalled');

  if (expiryIsFuture && temporary?._id) {
    const waitMs = Math.max(0, expiresAt.getTime() - Date.now() + 150);
    console.log(`Waiting ${Math.ceil(waitMs / 1000)} seconds for the temporary constraint to expire...`);
    if (waitMs > 0) await delay(waitMs);

    const constraints = await api(projectPath('/memories?status=active&type=constraint'));
    const stillStored = constraints.memories?.some((memory) => String(memory._id) === String(temporary._id));
    const afterExpiry = await api(projectPath('/chat'), { method: 'POST', body: { sessionId: `${session2}-after-expiry`, message: 'Add a paid SMS OTP service for login.' } });
    const excluded = !afterExpiry.used?.some(({ memory }) => String(memory._id) === String(temporary._id));
    report('Expiry: expired constraint excluded before TTL removes the document', Boolean(stillStored && excluded), `document still stored=${Boolean(stillStored)}, returned by recall=${!excluded}`);
  } else report('Expiry: expired constraint excluded before TTL removes the document', false, 'Cannot run expiry check because Step 3 did not save expiresAt');

  const step9 = await api(projectPath('/chat'), { method: 'POST', body: { sessionId: session2, message: "We dropped the mobile-first idea, we're doing kiosks in canteens." } });
  const invalidated = step9.changes?.find(({ kind, memory }) => kind === 'invalidated' && memory?.type === 'assumption');
  report('Correction: mobile-first assumption invalidated', Boolean(invalidated && invalidated.memory.status === 'invalid'), invalidated?.memory?.status ?? 'no invalidation change returned');

  const secretResponse = await api(projectPath('/chat'), { method: 'POST', body: { sessionId: session2, message: 'Our Stripe key is sk_test_abc123...' } });
  const secretGuarded = secretResponse.notices?.some((notice) => /looks like a secret/i.test(notice)) && secretResponse.changes?.length === 0;
  report('Secret: Stripe-like key blocked from memory and extractor', Boolean(secretGuarded), secretResponse.notices?.join('; ') ?? 'secret notice missing');

  let deletedId;
  if (postgres?._id) {
    await api(projectPath(`/memories/${postgres._id}`), { method: 'DELETE' });
    deletedId = String(postgres._id);
  }
  const afterDelete = await api(projectPath('/chat'), { method: 'POST', body: { sessionId: `${session2}-deleted-memory`, message: 'What database did we choose for the orders table?' } });
  const noDeletedMemory = deletedId && !afterDelete.used?.some(({ memory }) => String(memory._id) === deletedId);
  report('Delete: deleted memory is absent from a later recall', Boolean(noDeletedMemory), noDeletedMemory ? 'deleted memory not present in used[]' : 'could not verify deleted memory exclusion');

  const cacheExpiryId = new ObjectId();
  await memories.insertOne({
    _id: cacheExpiryId, projectId: String(projectId), userId: String(projectResponse.user?.id ?? ''),
    text: 'Cache expiry verification constraint: never serve saffron tea.', content: 'Cache expiry verification constraint: never serve saffron tea.',
    type: 'constraint', status: 'active', confidence: 1, createdAt: new Date(),
    expiresAt: new Date(Date.now() + 2000), embedding: []
  });
  const expiryQuery = 'Should we serve saffron tea?';
  const beforeExpiry = await recallLongTerm(expiryQuery, '', projectId);
  const wasCached = beforeExpiry.some(({ memory }) => String(memory._id) === String(cacheExpiryId));
  await delay(3000);
  const afterCacheExpiry = await recallLongTerm(expiryQuery, '', projectId);
  report('Recall cache: expired constraint is not returned after 3 seconds', wasCached && !afterCacheExpiry.some(({ memory }) => String(memory._id) === String(cacheExpiryId)), `cached before expiry=${wasCached}, returned after expiry=${afterCacheExpiry.some(({ memory }) => String(memory._id) === String(cacheExpiryId))}`);

  // Exercise the normal chat route during a Redis outage when configured against
  // a dedicated unavailable Redis endpoint; the route must still return a reply.
  if (process.env.VERIFY_REDIS_DOWN === '1') {
    const outageResponse = await api(projectPath('/chat'), { method: 'POST', body: { sessionId: `${session2}-redis-down`, message: 'What is the project status?' } });
    report('Redis outage: chat route returns without a cache exception', typeof outageResponse.reply === 'string');
  }
} catch (error) {
  report('Demo check execution', false, error.message);
} finally {
  if (projectId) {
    try {
      const objectProjectId = new ObjectId(projectId);
      await Promise.all([
        memories.deleteMany({ projectId }), messages.deleteMany({ projectId }),
        memory_events.deleteMany({ projectId }), memberships.deleteMany({ projectId: objectProjectId }),
        projects.deleteOne({ _id: objectProjectId })
      ]);
    } catch (error) { console.error(`Verification project cleanup failed: ${error.message}`); }
  }
  try { await dbClient.close(); }
  catch (error) { console.error(`Database close failed: ${error.message}`); }
  if (child && child.exitCode === null) child.kill();
  const failed = results.filter(({ passed }) => !passed);
  console.log(`\nDemo check: ${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length && childOutput) console.log(`API output:\n${childOutput}`);
  if (failed.length) process.exitCode = 1;
}
