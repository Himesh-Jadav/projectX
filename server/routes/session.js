import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { connect, memories } from '../db.js';
import { requireAuth, requireProjectMember } from '../middleware/auth.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireProjectMember);

router.get('/start', async (req, res, next) => {
  try {
    await connect();
    const now = new Date();
    const soon = new Date(now.getTime() + 10 * 60 * 1000);
    const filterBase = { projectId: String(req.params.projectId), status: 'active' };
    const [assumptions, constraints] = await Promise.all([
      memories.find({ ...filterBase, type: 'assumption', revisitAfter: { $lt: now } }).sort({ revisitAfter: 1 }).toArray(),
      memories.find({ ...filterBase, type: 'constraint', expiresAt: { $gt: now, $lte: soon } }).sort({ expiresAt: 1 }).toArray()
    ]);
    const checkIns = [...assumptions.map(({ embedding, ...memory }) => ({ kind: 'assumption_due', memory })), ...constraints.map(({ embedding, ...memory }) => ({ kind: 'constraint_expiring', memory }))];
    return res.json({ sessionId: req.query.sessionId ?? null, checkIns });
  } catch (error) { return next(error); }
});

export default router;
