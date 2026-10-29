import { ObjectId } from 'mongodb';
import { config } from '../config.js';
import { connect, memories, memory_events } from '../db.js';
import { embed } from './embeddings.js';
import { clearRecallCache } from './memoryService.js';
import { sanitizeBasedOn, findDependents } from './dependencies.js';

const now = () => new Date();
const idValue = (id) => id instanceof ObjectId ? id : new ObjectId(id);

async function event(memoryId, name, details = {}, ownership = {}) {
  await memory_events.insertOne({ memoryId, event: name, at: now(), details, ...ownership });
}

export async function getMemory(projectId, id, filter = {}) {
  await connect();
  const _id = idValue(id);
  const memory = await memories.findOne({ ...filter, _id, projectId: String(projectId) });
  if (!memory) {
    const error = new Error('Memory not found.');
    error.status = 404;
    throw error;
  }
  return memory;
}

const actorFields = (actor = {}, projectId) => ({
  projectId: String(actor.projectId ?? projectId ?? ''),
  actorId: String(actor.actorId ?? actor.userId ?? ''),
  actorName: actor.actorName ?? actor.createdByName ?? ''
});

export async function recall(query, { projectId }) {
  await connect();
  const vector = await embed(query, 'RETRIEVAL_QUERY');
  const results = await memories.aggregate([
    { $vectorSearch: {
      index: 'memory_index', path: 'embedding', queryVector: vector,
      numCandidates: 100, limit: 8,
      filter: { projectId: String(projectId), status: 'active' }
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
    const outcomes = await memories.find({ projectId: String(projectId), status: 'active', type: 'outcome', outcomeOf: { $in: decisionIds } }).toArray();
    for (const outcome of outcomes) {
      if (outcome.expiresAt && outcome.expiresAt <= timestamp) continue;
      ranked.push({ memory: outcome, similarity: null, confidence: outcome.confidence, finalScore: null, why: 'Linked outcome for a recalled decision.' });
    }
  }
  return ranked;
}

export async function saveMemory(input) {
  await connect();
  const projectId = String(input.projectId ?? config.demoProjectId);
  const userId = String(input.userId ?? config.demoUserId);
  if (input.action === 'access') {
    const result = await memories.findOneAndUpdate(
      { _id: idValue(input.memoryId), projectId },
      { $set: { lastAccessedAt: now() }, $inc: { accessCount: 1 } },
      { returnDocument: 'after' }
    );
    if (!result) throw new Error('Memory not found for access update.');
    await clearRecallCache(projectId);
    return result;
  }
  if (input.action === 'update') {
    const text = input.text ?? input.content;
    const embedding = input.embedding ?? await embed(text, 'RETRIEVAL_DOCUMENT');
    const timestamp = now();
    const result = await memories.findOneAndUpdate(
      { _id: idValue(input.memoryId), userId, projectId },
      { $set: {
        text, content: text, embedding, sourceMessageId: input.sourceMessageId ?? null,
        importance: input.importance ?? 1, lastAccessedAt: timestamp, updatedAt: timestamp, statusChangedAt: timestamp,
        embeddingModel: config.embeddingModel, type: input.type ?? 'fact',
        status: input.status ?? 'active', ...(input.basedOn ? { basedOn: await sanitizeBasedOn(projectId, input.basedOn, input.recalledIds ?? []) } : {}), createdByName: input.createdByName ?? 'Unknown',
        reason: input.reason ?? '', confidence: input.confidence ?? 1,
        ...(input.source ? { source: input.source } : {})
      }, $inc: { accessCount: 1 } },
      { returnDocument: 'after' }
    );
    if (!result) throw new Error('Memory not found for update.');
    await clearRecallCache(projectId);
    return result;
  }
  for (const reference of [input.targetOf, input.supersedes, input.outcomeOf].filter(Boolean)) {
    await getMemory(projectId, reference);
  }
  const timestamp = now();
  const text = input.text ?? input.content;
  const embedding = input.embedding ?? await embed(text, 'RETRIEVAL_DOCUMENT');
  const document = {
    userId,
    projectId,
    createdByName: input.createdByName ?? 'Unknown',
    type: input.type,
    text,
    content: text,
    sourceMessageId: input.sourceMessageId ?? input.source?.messageId ?? null,
    importance: input.importance ?? 1,
    reason: input.reason ?? '',
    status: input.status ?? 'active',
    statusChangedAt: timestamp,
    confidence: input.confidence ?? 0.8,
    private: input.private ?? false,
    source: input.source ?? { sessionId: null, messageId: null, quote: input.content },
    ...(input.basedOn?.length ? { basedOn: await sanitizeBasedOn(projectId, input.basedOn, input.recalledIds ?? []) } : {}),
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
    lastAccessedAt: timestamp,
    accessCount: 0,
    embedding,
    embeddingModel: config.embeddingModel
  };
  const { insertedId } = await memories.insertOne(document);
  await clearRecallCache(projectId);
  document._id = insertedId;
  await event(insertedId, input.status === 'pending' ? 'conflict_held' : 'created', { type: document.type, status: document.status }, { projectId: document.projectId, actorId: document.userId, actorName: document.createdByName });
  return document;
}

export async function confirmMemory(projectId, id, actor) {
  await connect();
  const _id = idValue(id);
  const current = await getMemory(projectId, _id, { status: 'active' });
  const timestamp = now();
  const result = await memories.findOneAndUpdate({ _id, projectId: String(projectId), status: 'active' }, { $set: { lastConfirmedAt: timestamp, updatedAt: timestamp }, $inc: { confirmCount: 1 } }, { returnDocument: 'after' });
  if (!result) throw new Error('Active memory not found.');
  await event(_id, 'confirmed', { confirmCount: result.confirmCount }, actorFields(actor ?? { userId: current.userId, createdByName: current.createdByName }, projectId));
  return result;
}

export async function supersede(projectId, oldId, newId, actor) {
  await connect();
  const previousId = idValue(oldId);
  const nextId = idValue(newId);
  await getMemory(projectId, previousId, { status: 'active' });
  await getMemory(projectId, nextId, { status: { $in: ['pending', 'active'] } });
  const timestamp = now();
  const [previous, next] = await Promise.all([
    memories.findOneAndUpdate({ _id: previousId, projectId: String(projectId), status: 'active' }, { $set: { status: 'superseded', statusChangedAt: timestamp, supersededBy: nextId, updatedAt: timestamp } }, { returnDocument: 'after' }),
    memories.findOneAndUpdate({ _id: nextId, projectId: String(projectId), status: { $in: ['pending', 'active'] } }, { $set: { status: 'active', statusChangedAt: timestamp, supersedes: previousId, updatedAt: timestamp } }, { returnDocument: 'after' })
  ]);
  if (!previous || !next) throw new Error('Could not supersede memories: verify the old memory is active and the new memory exists.');
  await event(previousId, 'superseded', { supersededBy: nextId }, actorFields(actor ?? { userId: previous.userId, createdByName: previous.createdByName }, projectId));
  await event(nextId, 'confirmed', { supersedes: previousId, resolvedAs: 'override' }, actorFields(actor ?? { userId: next.userId, createdByName: next.createdByName }, projectId));
  const dependents = await findDependents(projectId, previousId);
  await stalePending(projectId, previousId, actor);
  await clearRecallCache(projectId);
  return { previous, next, dependents };
}

async function stalePending(projectId, targetId, actor) {
  const pending = await memories.find({ projectId: String(projectId), targetOf: targetId, status: 'pending' }).toArray();
  if (!pending.length) return;
  await memories.deleteMany({ _id: { $in: pending.map(({ _id }) => _id) }, projectId: String(projectId) });
  for (const item of pending) await event(item._id, 'conflict_stale', { targetId: String(targetId) }, actorFields(actor ?? { userId: item.userId, createdByName: item.createdByName }, projectId));
}

export async function invalidate(projectId, id, reason = 'Marked as no longer true by the user.', actor) {
  await connect();
  const _id = idValue(id);
  const current = await getMemory(projectId, _id);
  if (!['active', 'pending'].includes(current.status)) {
    const error = new Error('Memory cannot be invalidated.'); error.status = 404; throw error;
  }
  const timestamp = now();
  const updated = await memories.findOneAndUpdate({ _id, projectId: String(projectId), status: { $in: ['active', 'pending'] } }, { $set: { status: 'invalid', statusChangedAt: timestamp, invalidReason: reason, updatedAt: timestamp } }, { returnDocument: 'after' });
  if (!updated) throw new Error('Memory not found or cannot be invalidated.');
  updated.dependents = await findDependents(projectId, _id);
  await event(_id, 'invalidated', { reason }, actorFields(actor ?? { userId: updated.userId, createdByName: updated.createdByName }, projectId));
  await stalePending(projectId, _id, actor);
  await clearRecallCache(projectId);
  return updated;
}

export async function deleteMemory(projectId, id, actor) {
  await connect();
  const _id = idValue(id);
  const document = await getMemory(projectId, _id);
  await event(_id, 'deleted', {}, actorFields(actor ?? { userId: document.userId, createdByName: document.createdByName }, projectId));
  const result = await memories.deleteOne({ _id, projectId: String(projectId) });
  if (!result.deletedCount) throw new Error('Memory not found.');
  await clearRecallCache(projectId);
  await stalePending(projectId, _id, actor);
  return { deleted: true };
}

export async function withdrawMemory(projectId, id, actor) {
  await connect();
  const memory = await getMemory(projectId, id, { status: 'pending' });
  if (memory.userId !== String(actor.userId)) {
    const error = new Error('Only the author can withdraw a pending memory.'); error.status = 403; throw error;
  }
  await memories.deleteOne({ _id: memory._id, projectId: String(projectId), status: 'pending' });
  await event(memory._id, 'conflict_withdrawn', {}, actorFields(actor, projectId));
  await clearRecallCache(projectId);
  return { deleted: true };
}
