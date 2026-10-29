import { createClient } from 'redis';
import { createHash } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { config } from '../config.js';
import { connect, memories, messages, projects } from '../db.js';
import { embed } from './embeddings.js';
import { invalidate, saveMemory } from './memory.js';
import { hasSecret } from './secrets.js';
import { extractAndReconcile } from './extract.js';
import { loadRecentThread, threadCacheKey } from './threadStore.js';
import { sanitizeBasedOn, findDependents } from './dependencies.js';

let redisPromise;
let lastRedisAttempt = 0;

async function redis() {
  if (!redisPromise) {
    const wait = 5000 - (Date.now() - lastRedisAttempt);
    if (lastRedisAttempt && wait > 0) throw new Error('Redis reconnect throttled');
    lastRedisAttempt = Date.now();
    const client = createClient({ url: config.redisUrl, socket: { connectTimeout: 1000, reconnectStrategy: false } });
    const invalidate = () => { if (redisPromise) redisPromise = undefined; };
    client.on('end', invalidate);
    client.on('error', (error) => {
      console.error(`Redis error: ${error.message}`);
      if (!client.isOpen || !client.isReady) invalidate();
    });
    redisPromise = client.connect().then(() => client).catch((error) => {
      redisPromise = undefined;
      throw error;
    });
  }
  return redisPromise;
}

export async function clearRecallCache(projectId) {
  try { await (await redis()).del(`recall:${encodeURIComponent(String(projectId))}`); }
  catch (error) { console.error(`Redis recall cache clear failed: ${error.message}`); }
}

async function cachedEmbed(text, taskType) {
  const key = `embedding:${createHash('sha256').update(`${taskType}:${text}`).digest('hex')}`;
  try {
    const client = await redis();
    const cached = await client.get(key);
    if (cached) return JSON.parse(cached);
    const value = await embed(text, taskType);
    await client.set(key, JSON.stringify(value), { EX: config.embeddingCacheTtlSeconds });
    return value;
  } catch { return embed(text, taskType); }
}

const normalizeFact = (value) => String(value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
const recallStopWords = new Set(['about', 'after', 'again', 'also', 'and', 'are', 'does', 'for', 'from', 'have', 'how', 'into', 'its', 'latest', 'name', 'our', 'please', 'project', 'tell', 'that', 'the', 'their', 'there', 'these', 'this', 'those', 'what', 'when', 'where', 'which', 'who', 'with', 'workspace', 'you', 'your']);

function recallTerms(value) {
  return [...new Set((value.toLocaleLowerCase().match(/[a-z0-9][a-z0-9.+_-]{2,}/g) ?? [])
    .filter((term) => !recallStopWords.has(term)))].slice(0, 8);
}

function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function parseDurationMs(duration) {
  const parts = duration.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  return parts ? ((Number(parts[1] ?? 0) * 86400 + Number(parts[2] ?? 0) * 3600 + Number(parts[3] ?? 0) * 60 + Number(parts[4] ?? 0)) * 1000) : 0;
}

export async function recentMessages(session) {
  try {
    const cache = await redis();
    await connect();
    return await loadRecentThread({ ...session, redis: cache, collection: messages, limit: 40 });
  } catch (error) {
    try {
      await connect();
      const rows = await messages.find({ projectId: String(session.projectId), userId: String(session.userId), sessionId: String(session.sessionId) }).sort({ createdAt: -1 }).limit(40).toArray();
      return rows.reverse();
    } catch (mongoError) { console.error(`MongoDB history read failed: ${mongoError.message || error.message}`); return []; }
  }
}

export async function appendRecentMessages(session, exchange) {
  try { const client = await redis(); const key = threadCacheKey(session); await client.multi()
    .rPush(key, exchange.map((row) => JSON.stringify(row)))
    .lTrim(key, -40, -1)
    .expire(key, config.shortTermTtlSeconds)
    .exec(); } catch (error) { console.error(`Redis history write failed: ${error.message}`); }
}

export async function pageMessages({ userId, projectId, sessionId, before, limit = 40 }) {
  await connect();
  const filter = { userId: String(userId), projectId: String(projectId), sessionId: String(sessionId) };
  if (before) filter.createdAt = { $lt: before };
  const rows = await messages.find(filter).sort({ createdAt: -1 }).limit(limit + 1).toArray();
  const hasMore = rows.length > limit;
  return { messages: rows.slice(0, limit).reverse(), hasMore };
}

export async function latestSession({ userId, projectId }) {
  await connect();
  const row = await messages.find({ userId: String(userId), projectId: String(projectId) }).sort({ createdAt: -1 }).limit(1).next();
  return row?.sessionId ?? null;
}

function vectorSearch(vector, projectId, limit) {
  const filter = { projectId: String(projectId), status: 'active' };
  return memories.aggregate([
    { $vectorSearch: {
      index: 'memory_index', path: 'embedding', queryVector: vector,
      numCandidates: Math.max(100, limit * 20), limit,
      filter
    } },
    { $addFields: { similarity: { $meta: 'vectorSearchScore' } } }
  ]).toArray();
}

export async function recallLongTerm(message, userId, projectId) {
  await connect();
  const cacheKey = `recall:${encodeURIComponent(String(projectId))}`;
  try {
    const cached = await (await redis()).get(cacheKey);
    if (cached) { const data = JSON.parse(cached); if (data.query === message) return data.used.filter(({ memory }) => !memory.expiresAt || new Date(memory.expiresAt) > new Date()); }
  } catch {}
  const vector = await cachedEmbed(message, 'RETRIEVAL_QUERY');
  const [vectorResults, lexicalResults] = await Promise.all([
    vectorSearch(vector, projectId, 5).catch((error) => {
      console.error(`Atlas vector recall failed: ${error.message}`);
      return [];
    }),
    (async () => {
      const terms = recallTerms(message);
      if (!terms.length) return [];
      const matches = await memories.find({
        projectId: String(projectId), status: 'active',
        $or: terms.flatMap((term) => {
          const regex = { $regex: escapeRegex(term), $options: 'i' };
          return [{ text: regex }, { content: regex }];
        })
      }).sort({ createdAt: -1 }).limit(20).toArray();
      return matches.map((memory) => ({
        ...memory,
        keywordMatches: terms.filter((term) => new RegExp(escapeRegex(term), 'i').test(memory.text ?? memory.content ?? '')).length
      }));
    })()
  ]);
  const timestamp = new Date();
  const correctionLookup = /\b(?:dropped|no longer|scrap that|instead of|not doing .+ anymore)\b/i.test(message);
  const relevantVectors = vectorResults.filter((memory) =>
    memory.status === 'active' && memory.similarity >= (correctionLookup ? Math.min(config.recallSimilarityThreshold, 0.35) : config.recallSimilarityThreshold) && (!memory.expiresAt || memory.expiresAt > timestamp)
  );
  const byId = new Map();
  for (const memory of [...relevantVectors, ...lexicalResults]) {
    if (!memory.expiresAt || memory.expiresAt > timestamp) {
      const id = String(memory._id);
      const current = byId.get(id);
      if (!current || (memory.keywordMatches ?? 0) > (current.keywordMatches ?? 0)) byId.set(id, { ...memory, similarity: memory.similarity ?? current?.similarity });
    }
  }
  const used = [...byId.values()]
    .sort((a, b) => (b.keywordMatches ?? 0) - (a.keywordMatches ?? 0) || (b.similarity ?? 0) - (a.similarity ?? 0))
    .slice(0, 5);
  if (used.length) {
    try {
      for (const memory of used) await saveMemory({ action: 'access', memoryId: memory._id, userId, projectId: memory.projectId });
    } catch (error) { console.error(`Memory access update failed: ${error.message}`); }
  }
  const result = used.map((memory) => {
    const { embedding, ...safeMemory } = memory;
    return {
    memory: { ...safeMemory, text: memory.text ?? memory.content, content: memory.content ?? memory.text, type: memory.type ?? 'fact', createdByName: memory.createdByName ?? 'You' },
    similarity: memory.similarity ?? 0, confidence: memory.confidence ?? 1,
    finalScore: memory.similarity ?? (memory.keywordMatches / Math.max(1, recallTerms(message).length)),
    why: memory.keywordMatches ? 'Matched project terms in your message.' : 'Matched your message.'
  }; });
  try {
    const soonestExpiry = used.reduce((soonest, memory) => {
      const expiry = memory.expiresAt ? new Date(memory.expiresAt).getTime() : Infinity;
      return Math.min(soonest, expiry);
    }, Infinity);
    const ttl = Math.min(60, config.recallCacheTtlSeconds, Number.isFinite(soonestExpiry) ? Math.ceil((soonestExpiry - Date.now()) / 1000) : 60);
    if (ttl > 0) await (await redis()).set(cacheKey, JSON.stringify({ query: message, used: result }), { EX: ttl });
  } catch {}
  return result;
}

export async function rememberExchange({ userId, projectId, speaker, message, sourceMessageId, existingMemoryCandidates = [] }) {
  const extracted = await extractAndReconcile(message, existingMemoryCandidates.map((memory) => ({ memory })), speaker);
  if (/No paid APIs for the next 2 minutes/i.test(message)) console.log('[extractor raw output: temporary constraint]', JSON.stringify(extracted));
  if (/\b(?:dropped|no longer|scrap that|instead of|not doing .+ anymore)\b/i.test(message)) console.log('[extractor raw output: correction]', JSON.stringify(extracted));
  return applyItems({ user: { _id: userId, username: speaker }, project: { _id: projectId }, items: extracted.items, recalled: existingMemoryCandidates, sourceMessageId, message });
}

export async function applyItems({ user, project, items, recalled = [], sourceMessageId = new ObjectId(), message = '' }) {
  const userId = String(user?._id);
  const projectId = String(project?._id);
  const speaker = user?.username ?? user?.name ?? '';
  const existingMemoryCandidates = recalled.map((entry) => entry?.memory ?? entry).filter(Boolean);
  if (!userId || !projectId || !Array.isArray(items)) throw new TypeError('applyItems requires user, project, and items.');
  const extracted = { items };
  const now = new Date();
  const expiryDuration = (input) => {
    const text = input.toLowerCase();
    const match = text.match(/\b(?:for\s+)?(?:the\s+)?(?:next\s+|in\s+)(\d+)\s*(seconds?|minutes?|hours?|days?)\b/) ?? text.match(/\bfor\s+(\d+)\s*(seconds?|minutes?|hours?|days?)\b/);
    if (match) {
      const unit = match[2].toLowerCase();
      const suffix = unit.startsWith('second') ? 'S' : unit.startsWith('minute') ? 'M' : unit.startsWith('hour') ? 'H' : 'D';
      return suffix === 'S' ? `PT${match[1]}S` : suffix === 'D' ? `P${match[1]}D` : `PT${match[1]}${suffix}`;
    }
    if (/\buntil tomorrow\b/.test(text) || /\btoday only\b/.test(text)) {
      const end = new Date(now);
      if (/\buntil tomorrow\b/.test(text)) end.setDate(end.getDate() + 1);
      end.setHours(0, 0, 0, 0);
      if (end <= now) end.setDate(end.getDate() + 1);
      const seconds = Math.max(1, Math.ceil((end - now) / 1000));
      const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60), remainder = seconds % 60;
      return `PT${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${remainder ? `${remainder}S` : ''}`;
    }
    return null;
  };
  const duration = expiryDuration(String(message));
  for (const item of items) {
    if (item.type === 'constraint' && !item.expiresIn && duration) item.expiresIn = duration;
    if (item.type === 'constraint' && item.expiresIn && !item.expiresAt) item.expiresAt = new Date(now.getTime() + parseDurationMs(item.expiresIn));
  }
  const correction = /\b(?:dropped|no longer|scrap that|instead of|not doing .+ anymore)\b/i.test(message);
  if (correction && items.length === 0) {
    const matches = existingMemoryCandidates.filter((memory) => (memory.similarity ?? 0) > 0.6);
    if (matches.length === 1) items.push({ type: matches[0].type, content: matches[0].content ?? matches[0].text, reason: 'The user explicitly corrected this memory.', confidence: 0.95, expiresIn: null, revisitIn: null, expiresAt: null, action: 'invalidate', targetId: String(matches[0]._id), outcomeOf: null });
  }

  await connect();
  const results = [];
  for (const item of extracted.items) {
  if (!['decision', 'assumption', 'constraint', 'outcome'].includes(item.type) || item.confidence < config.importanceMinConfidence || hasSecret(item.content) || item.action === 'duplicate') continue;
  const text = item.content.trim();
  const exact = item.action === 'invalidate' ? null : await memories.findOne({ projectId: String(projectId), status: 'active', text: { $regex: `^${escapeRegex(text)}$`, $options: 'i' } });
  if (exact) continue;
  const embedding = await cachedEmbed(text, 'RETRIEVAL_DOCUMENT');
  const vectorMatches = await vectorSearch(embedding, projectId, 5).catch((error) => {
    console.error(`Atlas duplicate check failed: ${error.message}`);
    return [];
  });
  // Always check exact project text matches as well as vector results. Short
  // name changes (for example Daymark -> Dincharya) can rank poorly by meaning.
  const terms = recallTerms(text);
  const lexicalMatches = terms.length ? await memories.find({
    projectId: String(projectId), status: 'active',
    $or: terms.flatMap((term) => {
      const regex = { $regex: escapeRegex(term), $options: 'i' };
      return [{ text: regex }, { content: regex }];
    })
  }).sort({ createdAt: -1 }).limit(20).toArray() : [];
  const candidatesById = new Map();
  for (const memory of [...existingMemoryCandidates, ...vectorMatches, ...lexicalMatches]) {
    if (String(memory.projectId) !== String(projectId)) continue;
    if (memory.status !== 'active' || (memory.expiresAt && memory.expiresAt <= new Date())) continue;
    const id = String(memory._id);
    const overlap = terms.filter((term) => new RegExp(escapeRegex(term), 'i').test(memory.text ?? memory.content ?? '')).length;
    const current = candidatesById.get(id);
    if (!current || overlap > current.overlap) candidatesById.set(id, { memory, overlap });
  }
  if (item.action === 'invalidate' && item.targetId && ObjectId.isValid(item.targetId)) {
    const target = await memories.findOne({ _id: new ObjectId(item.targetId), projectId: String(projectId), status: { $in: ['active', 'pending'] } });
    if (target) candidatesById.set(String(target._id), { memory: target, overlap: terms.filter((term) => new RegExp(escapeRegex(term), 'i').test(target.text ?? target.content ?? '')).length });
  }
  const candidates = [...candidatesById.values()]
    .sort((a, b) => b.overlap - a.overlap || (b.memory.similarity ?? 0) - (a.memory.similarity ?? 0))
    .slice(0, 5);
  if (item.action === 'invalidate') {
    const target = candidates.find(({ memory }) => String(memory._id) === String(item.targetId))?.memory;
    if (target) {
      const memory = await invalidate(projectId, target._id, item.reason, { userId, createdByName: speaker });
      results.push({ kind: 'invalidated', memory, dependents: memory.dependents ?? await findDependents(projectId, target._id) });
    }
    continue;
  }
  const duplicate = candidates.find(({ memory: nearest }) => (nearest.similarity * 2 - 1) > config.memoryDuplicateThreshold);
  if (duplicate) continue;
  if (item.action === 'conflict') {
    const target = candidates.find(({ memory }) => String(memory._id) === String(item.targetId))?.memory;
    if (!target) continue;
    const pending = await saveMemory({
      userId, projectId, text, content: text, embedding, sourceMessageId, importance: item.confidence,
      type: item.type, status: 'pending', targetOf: target._id, createdByName: speaker,
      reason: item.reason, confidence: item.confidence,
      basedOn: await sanitizeBasedOn(projectId, item.basedOn, existingMemoryCandidates.map((memory) => memory._id)), recalledIds: existingMemoryCandidates.map((memory) => memory._id),
      source: { sessionId: null, messageId: sourceMessageId, quote: text }
    });
    const project = await projects.findOne({ _id: new ObjectId(projectId) }, { projection: { ownerId: 1 } });
    results.push({ kind: 'conflict', pending, target, targetAuthorName: target.createdByName, canResolveNow: target.userId === String(userId) || String(project?.ownerId) === String(userId) });
    continue;
  }
  const memory = await saveMemory({
    userId, projectId, text, content: text, embedding, sourceMessageId,
    importance: item.confidence, type: item.type, status: 'active', createdByName: speaker,
    reason: item.reason, confidence: item.confidence,
    expiresAt: item.expiresAt, revisitAfter: item.revisitAfter, outcomeOf: item.outcomeOf ?? null,
    basedOn: await sanitizeBasedOn(projectId, item.basedOn, existingMemoryCandidates.map((memory) => memory._id)), recalledIds: existingMemoryCandidates.map((memory) => memory._id),
    source: { sessionId: null, messageId: sourceMessageId, quote: text }
  });
  results.push({ kind: 'created', memory });
  }
  return results.length === 1 ? results[0] : results;
}
