import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { config } from '../config.js';
import { connect, memories, memory_events } from '../db.js';
import { confirmMemory, deleteMemory, invalidate, supersede } from '../services/memory.js';

const router = Router();
const validId = (value) => ObjectId.isValid(value);
const scope = { userId: config.demoUserId, projectId: config.demoProjectId };

router.get('/', async (req, res, next) => {
  try {
    await connect();
    const filter = { ...scope };
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.type) filter.type = String(req.query.type);
    const documents = await memories.find(filter).sort({ createdAt: -1 }).toArray();
    res.json({ memories: documents.map(({ embedding, ...memory }) => memory) });
  } catch (error) { next(error); }
});

router.post('/:id/resolve', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body ?? {};
    if (!validId(id)) return res.status(400).json({ error: 'Invalid memory id.' });
    if (!['override', 'keep'].includes(action)) return res.status(400).json({ error: 'action must be override or keep.' });
    await connect();
    const pendingId = new ObjectId(id);
    const pending = await memories.findOne({ _id: pendingId, ...scope, status: 'pending' });
    if (!pending) return res.status(404).json({ error: 'Pending memory not found.' });
    const targetId = pending.targetOf;
    if (action === 'override') {
      if (!targetId) return res.status(409).json({ error: 'Pending memory has no conflict target.' });
      const target = await memories.findOne({ _id: targetId, ...scope, status: 'active' });
      if (!target) return res.status(409).json({ error: 'Conflict target is no longer active.' });
      const result = await supersede(targetId, pendingId);
      const { embedding: _oldEmbedding, ...oldMemory } = result.previous;
      const { embedding: _newEmbedding, ...newMemory } = result.next;
      return res.json({ action, old: oldMemory, memory: newMemory });
    }

    await memory_events.insertOne({ memoryId: pendingId, event: 'conflict_rejected', at: new Date(), details: targetId ? { targetId } : {}, userId: pending.userId, projectId: pending.projectId });
    await deleteMemory(pendingId);
    return res.json({ action, deleted: true });
  } catch (error) { next(error); }
});

router.post('/:id/invalidate', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid memory id.' });
    await connect();
    const exists = await memories.findOne({ _id: new ObjectId(req.params.id), ...scope });
    if (!exists) return res.status(404).json({ error: 'Memory not found.' });
    const memory = await invalidate(req.params.id, req.body?.reason);
    const { embedding, ...safe } = memory;
    res.json({ memory: safe });
  } catch (error) { next(error); }
});

router.post('/:id/confirm', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid memory id.' });
    await connect();
    const exists = await memories.findOne({ _id: new ObjectId(req.params.id), ...scope });
    if (!exists) return res.status(404).json({ error: 'Memory not found.' });
    const memory = await confirmMemory(req.params.id);
    const { embedding, ...safe } = memory;
    res.json({ memory: safe });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid memory id.' });
    await connect();
    const exists = await memories.findOne({ _id: new ObjectId(req.params.id), ...scope });
    if (!exists) return res.status(404).json({ error: 'Memory not found.' });
    res.json(await deleteMemory(req.params.id));
  } catch (error) { next(error); }
});

router.get('/:id/chain', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid memory id.' });
    await connect();
    let current = await memories.findOne({ _id: new ObjectId(req.params.id), ...scope });
    if (!current) return res.status(404).json({ error: 'Memory not found.' });
    const seen = new Set();
    while (current.supersedes && !seen.has(String(current.supersedes))) {
      seen.add(String(current._id));
      const previous = await memories.findOne({ _id: current.supersedes, ...scope });
      if (!previous) break;
      current = previous;
    }
    const chain = [];
    while (current && !seen.has(`down:${current._id}`)) {
      seen.add(`down:${current._id}`);
      const { embedding, ...safe } = current;
      chain.push(safe);
      if (!current.supersededBy) break;
      current = await memories.findOne({ _id: current.supersededBy, ...scope });
    }
    res.json({ chain });
  } catch (error) { next(error); }
});

export default router;
