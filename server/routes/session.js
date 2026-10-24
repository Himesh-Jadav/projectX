import { Router } from 'express';
import { config } from '../config.js';
import { connect, memories } from '../db.js';

const router = Router();

router.get('/start', async (req, res, next) => {
  try {
    await connect();
    const now = new Date();
    const soon = new Date(now.getTime() + 10 * 60 * 1000);
    const filterBase = { userId: config.demoUserId, projectId: config.demoProjectId, status: 'active' };
    const [assumptions, constraints] = await Promise.all([
      memories.find({ ...filterBase, type: 'assumption', revisitAfter: { $lt: now } }).sort({ revisitAfter: 1 }).toArray(),
      memories.find({ ...filterBase, type: 'constraint', expiresAt: { $gt: now, $lte: soon } }).sort({ expiresAt: 1 }).toArray()
    ]);
    const checkIns = [...assumptions.map(({ embedding, ...memory }) => ({ kind: 'assumption_due', memory })), ...constraints.map(({ embedding, ...memory }) => ({ kind: 'constraint_expiring', memory }))];
    res.json({ sessionId: req.query.sessionId ?? null, checkIns });
  } catch (error) { next(error); }
});

export default router;
