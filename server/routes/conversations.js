import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { memories, messages as messageCollection } from '../db.js';
import { latestSession, pageMessages, recentMessages } from '../services/memoryService.js';
import { requireAuth, requireProjectMember } from '../middleware/auth.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireProjectMember);

export async function presentRows(rows, projectId) {
  const ids = [...new Set(rows.flatMap((row) => [
    ...(row.meta?.usedMemoryIds ?? []), ...(row.meta?.changes ?? []).map((change) => change.memoryId)
  ]).filter(ObjectId.isValid))].map((id) => new ObjectId(id));
  const memoryRows = ids.length ? await memories.find({ _id: { $in: ids }, projectId: String(projectId) }).toArray() : [];
  const byId = new Map(memoryRows.map((memory) => [String(memory._id), memory]));
  return rows.map((row) => {
    const { _id, userId, projectId: _projectId, sessionId, role, text, createdAt, meta = {} } = row;
    const { embedding: _embedding, ...safeRow } = { _id, userId, projectId: _projectId, sessionId, role, text, createdAt, meta };
    return {
      ...safeRow,
      used: (meta.usedMemoryIds ?? []).map((id) => byId.get(String(id))).filter(Boolean).map((memory) => ({ memory })),
      changes: (meta.changes ?? []).map((change) => ({ kind: change.kind, memory: byId.get(String(change.memoryId)) })).filter((change) => change.memory)
    };
  });
}

router.get('/recent', async (req, res, next) => {
  try {
    const userId = String(req.user._id), projectId = String(req.params.projectId);
    const sessionId = await latestSession({ userId, projectId });
    if (!sessionId) return res.json({ sessionId: null, messages: [] });
    const rows = await recentMessages({ userId, projectId, sessionId });
    return res.json({ sessionId, messages: await presentRows(rows, projectId) });
  } catch (error) { return next(error); }
});

router.get('/:sessionId/messages', async (req, res, next) => {
  try {
    const userId = String(req.user._id), projectId = String(req.params.projectId), sessionId = String(req.params.sessionId);
    const before = req.query.before;
    let beforeDate;
    if (before !== undefined) {
      const value = String(before);
      beforeDate = new Date(value);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(beforeDate.getTime())) return res.status(400).json({ error: 'before must be an ISO date.' });
    }
    const rawLimit = req.query.limit === undefined ? 40 : Number(req.query.limit);
    if (!Number.isInteger(rawLimit) || rawLimit < 1) return res.status(400).json({ error: 'limit must be a positive integer.' });
    const limit = Math.min(40, rawLimit);
    if (!beforeDate && limit === 40) {
      const filter = { userId, projectId, sessionId };
      const [rows, count] = await Promise.all([
        recentMessages({ userId, projectId, sessionId }),
        messageCollection.countDocuments(filter)
      ]);
      return res.json({ messages: await presentRows(rows, projectId), hasMore: count > rows.length });
    }
    const result = await pageMessages({ userId, projectId, sessionId, before: beforeDate, limit });
    return res.json({ messages: await presentRows(result.messages, projectId), hasMore: result.hasMore });
  } catch (error) { return next(error); }
});

export default router;
