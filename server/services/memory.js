import { ObjectId } from 'mongodb';
import { config } from '../config.js';
import { connect, memories, memory_events } from '../db.js';
import { embed } from './embeddings.js';

const now = () => new Date();
const idValue = (id) => id instanceof ObjectId ? id : new ObjectId(id);

async function event(memoryId, name, details = {}, ownership = {}) {
  await memory_events.insertOne({ memoryId, event: name, at: now(), details, ...ownership });
}

export async function recall(query, { userId, projectId }) {
  await connect();
  const vector = await embed(query, 'RETRIEVAL_QUERY');
  const results = await memories.aggregate([
    { $vectorSearch: {
      index: 'memory_vector', path: 'embedding', queryVector: vector,
      numCandidates: 100, limit: 8,
      filter: { userId, projectId, status: 'active' }
    } },
    { $addFields: { similarity: { $meta: 'vectorSearchScore' } } }
  ]).toArray();

  const timestamp = now();
  const ranked = results
    .filter((memory) => (!memory.expiresAt || memory.expiresAt > timestamp) && memory.similarity >= config.recallSimilarityThreshold)
    .map((memory) => ({
      memory,
      similarity: memory.similarity,
      confidence: memory.confidence,
      finalScore: memory.similarity * memory.confidence,
      why: `Matched your message; ${memory.type} from ${new Date(memory.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`
    }))
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 5);

  const decisionIds = ranked.filter(({ memory }) => memory.type === 'decision').map(({ memory }) => memory._id);
  if (decisionIds.length) {
    const outcomes = await memories.find({ userId, projectId, status: 'active', type: 'outcome', outcomeOf: { $in: decisionIds } }).toArray();
    for (const outcome of outcomes) {
      if (outcome.expiresAt && outcome.expiresAt <= timestamp) continue;
      ranked.push({ memory: outcome, similarity: null, confidence: outcome.confidence, finalScore: null, why: 'Linked outcome for a recalled decision.' });
    }
  }
  return ranked;
}

export async function saveMemory(input) {
  await connect();
  const timestamp = now();
  const embedding = await embed(input.content, 'RETRIEVAL_DOCUMENT');
  const document = {
    userId: input.userId ?? config.demoUserId,
    projectId: input.projectId ?? config.demoProjectId,
    type: input.type,
    content: input.content,
    reason: input.reason ?? '',
    status: input.status ?? 'active',
    confidence: input.confidence ?? 0.8,
    private: input.private ?? false,
    source: input.source ?? { sessionId: null, messageId: null, quote: input.content },
    supersedes: input.supersedes ?? null,
    supersededBy: null,
    targetOf: input.targetOf ?? null,
    invalidReason: null,
    outcomeOf: input.outcomeOf ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastConfirmedAt: timestamp,
    confirmCount: 1,
    revisitAfter: input.revisitAfter ?? null,
    expiresAt: input.expiresAt ?? null,
    embedding,
    embeddingModel: config.embeddingModel
  };
  const { insertedId } = await memories.insertOne(document);
  document._id = insertedId;
  await event(insertedId, input.status === 'pending' ? 'conflict_held' : 'created', { type: document.type, status: document.status }, { userId: document.userId, projectId: document.projectId });
  return document;
}

export async function confirmMemory(id) {
  await connect();
  const _id = idValue(id);
  const timestamp = now();
  const result = await memories.findOneAndUpdate({ _id, status: 'active' }, { $set: { lastConfirmedAt: timestamp, updatedAt: timestamp }, $inc: { confirmCount: 1 } }, { returnDocument: 'after' });
  if (!result) throw new Error('Active memory not found.');
  await event(_id, 'confirmed', { confirmCount: result.confirmCount }, { userId: result.userId, projectId: result.projectId });
  return result;
}

export async function supersede(oldId, newId) {
  await connect();
  const previousId = idValue(oldId);
  const nextId = idValue(newId);
  const timestamp = now();
  const [previous, next] = await Promise.all([
    memories.findOneAndUpdate({ _id: previousId, status: 'active' }, { $set: { status: 'superseded', supersededBy: nextId, updatedAt: timestamp } }, { returnDocument: 'after' }),
    memories.findOneAndUpdate({ _id: nextId, status: { $in: ['pending', 'active'] } }, { $set: { status: 'active', supersedes: previousId, updatedAt: timestamp } }, { returnDocument: 'after' })
  ]);
  if (!previous || !next) throw new Error('Could not supersede memories: verify the old memory is active and the new memory exists.');
  await event(previousId, 'superseded', { supersededBy: nextId }, { userId: previous.userId, projectId: previous.projectId });
  await event(nextId, 'confirmed', { supersedes: previousId, resolvedAs: 'override' }, { userId: next.userId, projectId: next.projectId });
  return { previous, next };
}

export async function invalidate(id, reason = 'Marked as no longer true by the user.') {
  await connect();
  const _id = idValue(id);
  const updated = await memories.findOneAndUpdate({ _id, status: { $in: ['active', 'pending'] } }, { $set: { status: 'invalid', invalidReason: reason, updatedAt: now() } }, { returnDocument: 'after' });
  if (!updated) throw new Error('Memory not found or cannot be invalidated.');
  await event(_id, 'invalidated', { reason }, { userId: updated.userId, projectId: updated.projectId });
  return updated;
}

export async function deleteMemory(id) {
  await connect();
  const _id = idValue(id);
  const document = await memories.findOne({ _id });
  const result = await memories.deleteOne({ _id });
  if (!result.deletedCount) throw new Error('Memory not found.');
  await event(_id, 'deleted', {}, document ? { userId: document.userId, projectId: document.projectId } : {});
  return { deleted: true };
}
