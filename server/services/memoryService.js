import { createClient } from 'redis';
import { createHash } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { config } from '../config.js';
import { connect, memories, projects } from '../db.js';
import { embed } from './embeddings.js';
import { saveMemory } from './memory.js';
import { hasSecret } from './secrets.js';
import { extractAndReconcile } from './extract.js';

let redisPromise;

async function redis() {
  if (!redisPromise) {
    const client = createClient({ url: config.redisUrl, socket: { connectTimeout: 1000, reconnectStrategy: false } });
    client.on('error', (error) => console.error(`Redis error: ${error.message}`));
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

const sessionKey = ({ userId, projectId, sessionId }) =>
  `session:${encodeURIComponent(userId)}:${encodeURIComponent(projectId)}:${encodeURIComponent(sessionId)}`;
const normalizeFact = (value) => String(value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
const recallStopWords = new Set(['about', 'after', 'again', 'also', 'and', 'are', 'does', 'for', 'from', 'have', 'how', 'into', 'its', 'latest', 'name', 'our', 'please', 'project', 'tell', 'that', 'the', 'their', 'there', 'these', 'this', 'those', 'what', 'when', 'where', 'which', 'who', 'with', 'workspace', 'you', 'your']);

function recallTerms(value) {
  return [...new Set((value.toLocaleLowerCase().match(/[a-z0-9][a-z0-9.+_-]{2,}/g) ?? [])
    .filter((term) => !recallStopWords.has(term)))].slice(0, 8);
}

function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export async function recentMessages(session) {
  try { const values = await (await redis()).lRange(sessionKey(session), 0, -1); return values.map((value) => JSON.parse(value)); }
  catch { return []; }
}

export async function appendRecentMessages(session, exchange) {
  try { const client = await redis(); const key = sessionKey(session); await client.multi()
    .rPush(key, exchange.map(({ role, text }) => JSON.stringify({ role, text })))
    .lTrim(key, -(config.shortTermTurnLimit * 2), -1)
    .expire(key, config.shortTermTtlSeconds)
    .exec(); } catch (error) { console.error(`Redis history write failed: ${error.message}`); }
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
    if (cached) { const data = JSON.parse(cached); if (data.query === message) return data.used; }
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
  const relevantVectors = vectorResults.filter((memory) =>
    memory.status === 'active' && memory.similarity >= config.recallSimilarityThreshold && (!memory.expiresAt || memory.expiresAt > timestamp)
  );
  const byId = new Map();
  for (const memory of [...relevantVectors, ...lexicalResults]) {
    if (!memory.expiresAt || memory.expiresAt > timestamp) {
      const id = String(memory._id);
      const current = byId.get(id);
      if (!current || (memory.keywordMatches ?? 0) > (current.keywordMatches ?? 0)) byId.set(id, memory);
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
  try { await (await redis()).set(cacheKey, JSON.stringify({ query: message, used: result }), { EX: config.recallCacheTtlSeconds }); } catch {}
  return result;
}

export async function rememberExchange({ userId, projectId, speaker, message, sourceMessageId, existingMemoryCandidates = [] }) {
  const extracted = await extractAndReconcile(message, existingMemoryCandidates.map((memory) => ({ memory })), speaker);

  await connect();
  for (const item of extracted.items) {
  if (!['decision', 'assumption', 'constraint', 'outcome'].includes(item.type) || item.confidence < config.importanceMinConfidence || hasSecret(item.content) || item.action === 'duplicate' || item.action === 'invalidate') continue;
  const text = item.content.trim();
  const exact = await memories.findOne({ projectId: String(projectId), status: 'active', text: { $regex: `^${escapeRegex(text)}$`, $options: 'i' } });
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
  const candidates = [...candidatesById.values()]
    .sort((a, b) => b.overlap - a.overlap || (b.memory.similarity ?? 0) - (a.memory.similarity ?? 0))
    .slice(0, 5);
  const duplicate = candidates.find(({ memory: nearest }) => (nearest.similarity * 2 - 1) > config.memoryDuplicateThreshold);
  if (duplicate) continue;
  if (item.action === 'conflict') {
    const target = candidates.find(({ memory }) => String(memory._id) === String(item.targetId))?.memory;
    if (!target) continue;
    const pending = await saveMemory({
      userId, projectId, text, content: text, embedding, sourceMessageId, importance: item.confidence,
      type: item.type, status: 'pending', targetOf: target._id, createdByName: speaker,
      reason: item.reason, confidence: item.confidence,
      source: { sessionId: null, messageId: sourceMessageId, quote: text }
    });
    const project = await projects.findOne({ _id: new ObjectId(projectId) }, { projection: { ownerId: 1 } });
    return { kind: 'conflict', pending, target, targetAuthorName: target.createdByName, canResolveNow: target.userId === String(userId) || String(project?.ownerId) === String(userId) };
  }
  const memory = await saveMemory({
    userId, projectId, text, content: text, embedding, sourceMessageId,
    importance: item.confidence, type: item.type, status: 'active', createdByName: speaker,
    reason: item.reason, confidence: item.confidence,
    source: { sessionId: null, messageId: sourceMessageId, quote: text }
  });
  return { kind: 'created', memory };
  }
  return null;
}
