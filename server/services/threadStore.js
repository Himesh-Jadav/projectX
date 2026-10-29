export const hiddenSecretText = '[hidden: looks like a secret]';

export const threadCacheKey = ({ userId, projectId, sessionId }) =>
  `thread:${encodeURIComponent(String(userId))}:${encodeURIComponent(String(projectId))}:${encodeURIComponent(String(sessionId))}`;

export async function loadRecentThread({ userId, projectId, sessionId, redis, collection, limit = 40 }) {
  const key = threadCacheKey({ userId, projectId, sessionId });
  try {
    const cachedRows = await redis.lRange(key, -limit, -1);
    const cached = cachedRows.map((row) => JSON.parse(row));
    if (cached.length >= limit) return cached;
  } catch {}
  const rows = await collection.find({ userId: String(userId), projectId: String(projectId), sessionId: String(sessionId) })
    .sort({ createdAt: -1 }).limit(limit).toArray();
  rows.reverse();
  try {
    await redis.del(key);
    if (rows.length) await redis.rPush(key, rows.map((row) => JSON.stringify(row)));
  } catch (error) { console.error(`Redis history refill failed: ${error.message}`); }
  return rows;
}

export async function persistMessagePair({ session, input, reply, meta, secretGuard, collection, retryDelayMs = 2000, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const timestamp = new Date();
  const docs = [
    { ...session, role: 'user', text: secretGuard(input) ? hiddenSecretText : input, createdAt: timestamp, meta: { usedMemoryIds: [], changes: [], agentSteps: [] } },
    { ...session, role: 'assistant', text: reply, createdAt: new Date(timestamp.getTime() + 1), meta }
  ];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { await collection.insertMany(docs); return true; }
    catch (error) {
      console.error(`MongoDB conversation write failed${attempt ? ' after retry' : ''}: ${error.message}`);
      if (!attempt) await wait(retryDelayMs);
    }
  }
  return false;
}
