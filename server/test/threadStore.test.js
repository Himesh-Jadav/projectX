import test from 'node:test';
import assert from 'node:assert/strict';
import { hasSecret } from '../services/secrets.js';
import { hiddenSecretText, loadRecentThread, persistMessagePair, threadCacheKey } from '../services/threadStore.js';

function fakeRedis() {
  const rows = new Map();
  return {
    rows,
    async lRange(key, start, end) {
      const value = rows.get(key) ?? [];
      const from = start < 0 ? Math.max(0, value.length + start) : start;
      const to = end < 0 ? value.length + end : end;
      return value.slice(from, to + 1);
    },
    async del(key) { rows.delete(key); },
    async rPush(key, values) { rows.set(key, [...(rows.get(key) ?? []), ...values]); }
  };
}

function fakeCollection(documents) {
  return {
    find(filter) {
      let result = documents.filter((document) => Object.entries(filter).every(([key, value]) => String(document[key]) === String(value)));
      const cursor = {
        sort() { result = [...result].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); return cursor; },
        limit(count) { result = result.slice(0, count); return cursor; },
        async toArray() { return [...result]; }
      };
      return cursor;
    }
  };
}

test('cleared Redis reloads the latest session from MongoDB in chronological order and refills cache', async () => {
  const session = { userId: 'user-a', projectId: 'project-a', sessionId: 'session-a' };
  const docs = Array.from({ length: 42 }, (_, index) => ({ ...session, role: index % 2 ? 'assistant' : 'user', text: `turn ${index}`, createdAt: new Date(index * 1000), meta: { usedMemoryIds: [], changes: [], agentSteps: [] } }));
  const redis = fakeRedis();
  const key = threadCacheKey(session);
  redis.rows.set(key, ['old cache value']);
  await redis.del(key);
  const messages = await loadRecentThread({ ...session, redis, collection: fakeCollection(docs) });
  assert.equal(messages.length, 40);
  assert.deepEqual(messages.map(({ text }) => text), Array.from({ length: 40 }, (_, index) => `turn ${index + 2}`));
  assert.equal(JSON.parse(redis.rows.get(key)[0]).text, 'turn 2');
});

test('secret-looking user messages are stored as the hidden marker', async () => {
  let stored;
  await persistMessagePair({ session: { userId: 'u', projectId: 'p', sessionId: 's' }, input: 'api_key=abcdefgh12345678', reply: 'Guarded', meta: { usedMemoryIds: [], changes: [], agentSteps: [] }, secretGuard: hasSecret, collection: { async insertMany(rows) { stored = rows; } } });
  assert.equal(stored[0].text, hiddenSecretText);
  assert.equal(stored[1].text, 'Guarded');
  assert.equal('embedding' in stored[0], false);
});

test('agent steps and awaiting metadata persist with the assistant message', async () => {
  let stored;
  const meta = { usedMemoryIds: [], changes: [], agentSteps: [{ n: 1, action: 'ask_user', summary: 'asked 1 question' }], awaiting: { question: 'Replace or add?', options: ['Replace', 'Add'] } };
  await persistMessagePair({ session: { userId: 'u', projectId: 'p', sessionId: 's' }, input: 'Use Postgres?', reply: 'Replace or add?', meta, secretGuard: () => false, collection: { async insertMany(rows) { stored = rows; } } });
  assert.deepEqual(stored[1].meta.agentSteps, meta.agentSteps);
  assert.deepEqual(stored[1].meta.awaiting, meta.awaiting);
});

test('thread reads are isolated by user, project, and session', async () => {
  const docs = [{ userId: 'user-a', projectId: 'project-a', sessionId: 'session-a', role: 'user', text: 'private', createdAt: new Date() }];
  const redis = fakeRedis();
  const messages = await loadRecentThread({ userId: 'user-b', projectId: 'project-a', sessionId: 'session-a', redis, collection: fakeCollection(docs) });
  assert.deepEqual(messages, []);
  assert.equal(redis.rows.has(threadCacheKey({ userId: 'user-b', projectId: 'project-a', sessionId: 'session-a' })), false);
});

test('failed MongoDB persistence is retried once and does not throw into the chat path', async () => {
  let attempts = 0;
  const succeeded = await persistMessagePair({ session: { userId: 'u', projectId: 'p', sessionId: 's' }, input: 'hello', reply: 'hi', meta: { usedMemoryIds: [], changes: [], agentSteps: [] }, secretGuard: () => false, retryDelayMs: 0, collection: { async insertMany() { attempts += 1; throw new Error('mongo unavailable'); } }, wait: async () => {} });
  assert.equal(succeeded, false);
  assert.equal(attempts, 2);
});
