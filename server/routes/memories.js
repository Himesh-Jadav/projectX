import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { connect, memories, memory_events, projects } from '../db.js';
import { confirmMemory, deleteMemory, getMemory, invalidate, supersede, withdrawMemory } from '../services/memory.js';
import { requireAuth, requireProjectMember } from '../middleware/auth.js';
import { wasActiveAt } from '../services/timeTravel.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireProjectMember);
const validId = (value) => ObjectId.isValid(value);
const actor = (req) => ({ projectId: String(req.params.projectId), userId: String(req.user._id), actorId: String(req.user._id), actorName: req.user.username });
const safe = (memory) => { const { embedding, dependents, ...doc } = memory; return doc; };

router.get('/', async (req, res, next) => {
  try {
    const asOf = req.query.asOf == null ? null : new Date(String(req.query.asOf));
    const rawAsOf = req.query.asOf == null ? '' : String(req.query.asOf);
    const datePart = rawAsOf.slice(0, 10);
    if (req.query.asOf != null && (!Number.isFinite(asOf.getTime()) || !/^\d{4}-\d\d-\d\d(?:T.*)?$/.test(rawAsOf) || new Date(`${datePart}T00:00:00.000Z`).toISOString().slice(0, 10) !== datePart)) {
      return res.status(400).json({ error: 'asOf must be a valid ISO date.' });
    }
    await connect();
    const filter = { projectId: String(req.params.projectId) };
    if (!asOf && req.query.status) filter.status = String(req.query.status);
    if (!asOf && req.query.type) filter.type = String(req.query.type);
    const [foundDocuments, pendingDocuments, ownerProject] = await Promise.all([
      memories.find(filter).sort({ createdAt: -1 }).toArray(),
      memories.find({ projectId: String(req.params.projectId), status: 'pending' }).sort({ createdAt: -1 }).toArray(),
      projects.findOne({ _id: new ObjectId(req.params.projectId) }, { projection: { ownerId: 1 } })
    ]);
    const documents = asOf ? foundDocuments.filter((memory) => wasActiveAt(memory, asOf)) : foundDocuments;
    const pendingTargetIds = pendingDocuments.map((memory) => memory.targetOf).filter(Boolean);
    const targets = await memories.find({ _id: { $in: pendingTargetIds }, projectId: String(req.params.projectId), status: 'active' }, { projection: { userId: 1 } }).toArray();
    const activeTargets = new Set(targets.map((memory) => memory._id.toString()));
    const resolvableTargets = new Set(targets.filter((memory) => memory.userId === String(req.user._id)).map((memory) => memory._id.toString()));
    const canResolve = String(ownerProject?.ownerId) === String(req.user._id);
    const needsReview = pendingDocuments.filter((memory) => activeTargets.has(String(memory.targetOf)) && (canResolve || resolvableTargets.has(String(memory.targetOf))));
    const active = asOf ? documents : await memories.find({ projectId: String(req.params.projectId), status: 'active' }, { projection: { basedOn: 1 } }).toArray();
    const supports = new Map();
    for (const memory of active) for (const base of memory.basedOn ?? []) supports.set(String(base), (supports.get(String(base)) ?? 0) + 1);
    const baseIds = [...new Set(documents.flatMap((memory) => memory.basedOn ?? []).map(String))];
    const bases = baseIds.length ? await memories.find({ _id: { $in: baseIds.map((id) => new ObjectId(id)) }, projectId: String(req.params.projectId) }, { projection: { content: 1, text: 1, status: 1, statusChangedAt: 1, updatedAt: 1, createdAt: 1 } }).toArray() : [];
    const baseMap = new Map(bases.map((memory) => [String(memory._id), memory]));
    return res.json({ memories: documents.map((memory) => ({ ...safe(memory), basedOn: (memory.basedOn ?? []).map((id) => { const base = baseMap.get(String(id)); return { id: String(id), title: base?.content ?? base?.text ?? '', status: base?.status, statusChangedAt: base?.statusChangedAt ?? base?.updatedAt ?? base?.createdAt }; }), supportsCount: supports.get(String(memory._id)) ?? 0 })), needsReview: asOf ? [] : needsReview.map(safe), ...(asOf ? { asOf: asOf.toISOString() } : {}) });
  } catch (error) { return next(error); }
});

router.get('/activity', async (req, res, next) => {
  try {
    await connect();
    const events = await memory_events.find({ projectId: String(req.params.projectId) }).sort({ at: -1 }).limit(50).toArray();
    return res.json({ activity: events });
  } catch (error) { return next(error); }
});

router.post('/:id/resolve', async (req, res, next) => {
  try {
    const { id, projectId } = req.params;
    const { action } = req.body ?? {};
    if (!validId(id)) return res.status(400).json({ error: 'Invalid memory id.' });
    if (!['override', 'keep'].includes(action)) return res.status(400).json({ error: 'action must be override or keep.' });
    await connect();
    const pending = await getMemory(projectId, id, { status: 'pending' });
    const project = await projects.findOne({ _id: new ObjectId(projectId) });
    const targetId = pending.targetOf;
    const target = targetId ? await getMemory(projectId, targetId).catch((error) => error.status === 404 ? null : Promise.reject(error)) : null;
    if (!target) return res.status(409).json({ error: 'Conflict target is no longer available.' });
    if (target.userId !== String(req.user._id) && String(project?.ownerId) !== String(req.user._id)) return res.status(403).json({ error: 'Only the target author or project owner can resolve this conflict.' });
    if (action === 'override') {
      if (target.status !== 'active') return res.status(409).json({ error: 'Conflict target is no longer active.' });
      const result = await supersede(projectId, targetId, pending._id, actor(req));
      return res.json({ action, old: safe(result.previous), memory: safe(result.next), dependents: result.dependents.map(safe), notices: result.dependents.length ? [`${result.dependents.length} decisions rested on this: ${result.dependents.map((memory) => (memory.content ?? memory.text).slice(0, 80)).join('; ')}`] : [] });
    }
    await memory_events.insertOne({ memoryId: pending._id, event: 'conflict_rejected', at: new Date(), details: targetId ? { targetId } : {}, ...actor(req) });
    await deleteMemory(projectId, pending._id, actor(req));
    return res.json({ action, deleted: true });
  } catch (error) { return next(error); }
});

router.post('/:id/withdraw', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid memory id.' });
    return res.json(await withdrawMemory(req.params.projectId, req.params.id, actor(req)));
  } catch (error) { return next(error); }
});

router.post('/:id/invalidate', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid memory id.' });
    const memory = await getMemory(req.params.projectId, req.params.id);
    const project = await projects.findOne({ _id: new ObjectId(req.params.projectId) });
    if (memory.userId !== String(req.user._id) && String(project?.ownerId) !== String(req.user._id)) return res.status(403).json({ error: 'Only the author or project owner can invalidate this memory.' });
    const updated = await invalidate(req.params.projectId, req.params.id, req.body?.reason, actor(req));
    return res.json({ memory: safe(updated), dependents: updated.dependents.map(safe), notices: updated.dependents.length ? [`${updated.dependents.length} decisions rested on this: ${updated.dependents.map((dependent) => (dependent.content ?? dependent.text).slice(0, 80)).join('; ')}`] : [] });
  } catch (error) { return next(error); }
});

router.post('/:id/confirm', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid memory id.' });
    return res.json({ memory: safe(await confirmMemory(req.params.projectId, req.params.id, actor(req))) });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid memory id.' });
    const memory = await getMemory(req.params.projectId, req.params.id);
    const project = await projects.findOne({ _id: new ObjectId(req.params.projectId) });
    if (memory.userId !== String(req.user._id) && String(project?.ownerId) !== String(req.user._id)) return res.status(403).json({ error: 'Only the author or project owner can delete this memory.' });
    return res.json(await deleteMemory(req.params.projectId, req.params.id, actor(req)));
  } catch (error) { return next(error); }
});

router.get('/:id/chain', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid memory id.' });
    let current = await getMemory(req.params.projectId, req.params.id);
    const seen = new Set();
    while (current.supersedes && !seen.has(String(current.supersedes))) {
      seen.add(String(current._id));
      current = await getMemory(req.params.projectId, current.supersedes).catch((error) => error.status === 404 ? null : Promise.reject(error));
      if (!current) break;
    }
    const chain = [];
    while (current && !seen.has(`down:${current._id}`)) {
      seen.add(`down:${current._id}`); chain.push(safe(current));
      if (!current.supersededBy) break;
      current = await getMemory(req.params.projectId, current.supersededBy).catch((error) => error.status === 404 ? null : Promise.reject(error));
    }
    return res.json({ chain });
  } catch (error) { return next(error); }
});

export default router;
