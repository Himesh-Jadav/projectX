import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { config } from '../config.js';
import { connect, invites, memberships, memory_events, projects, users } from '../db.js';
import { requireAuth, requireOwner, requireProjectMember } from '../middleware/auth.js';

const router = Router();
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const idString = (id) => String(id);

function writeMemberEvent({ projectId, actor, event, memberId }) {
  return memory_events.insertOne({
    projectId: idString(projectId),
    actorId: idString(actor._id),
    actorName: actor.name,
    event,
    at: new Date(),
    details: { memberId: idString(memberId) }
  });
}

async function projectMemberList(projectId) {
  const rows = await memberships.find({ projectId }).toArray();
  const people = await Promise.all(rows.map((row) => users.findOne({ _id: row.userId }, { projection: { name: 1 } })));
  return rows.map((row, index) => ({ id: idString(row.userId), name: people[index]?.name ?? '', role: row.role }));
}

router.get('/projects', requireAuth, async (req, res, next) => {
  try {
    await connect();
    const rows = await memberships.find({ userId: req.user._id }).toArray();
    const docs = await projects.find({ _id: { $in: rows.map((row) => row.projectId) } }).toArray();
    const roleByProject = new Map(rows.map((row) => [idString(row.projectId), row.role]));
    return res.json({ projects: docs.map((project) => ({ id: idString(project._id), name: project.name, role: roleByProject.get(idString(project._id)) })) });
  } catch (error) { return next(error); }
});

router.post('/projects', requireAuth, async (req, res, next) => {
  try {
    const name = req.body?.name;
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Project name is required.' });
    await connect();
    const project = { name: name.trim(), ownerId: req.user._id, createdAt: new Date() };
    const { insertedId: projectId } = await projects.insertOne(project);
    const membership = { projectId, userId: req.user._id, role: 'owner', joinedAt: new Date(), invitedBy: req.user._id };
    await memberships.insertOne(membership);
    await writeMemberEvent({ projectId, actor: req.user, event: 'member_joined', memberId: req.user._id });
    return res.status(201).json({ project: { id: idString(projectId), name: project.name, role: 'owner' } });
  } catch (error) { return next(error); }
});

router.get('/projects/:projectId/activity', requireAuth, requireProjectMember, async (req, res, next) => {
  try {
    await connect();
    const activity = await memory_events.find({ projectId: String(req.params.projectId) }).sort({ at: -1 }).limit(50).toArray();
    return res.json({ activity });
  } catch (error) { return next(error); }
});

router.get('/projects/:projectId', requireAuth, requireProjectMember, async (req, res, next) => {
  try {
    await connect();
    const project = await projects.findOne({ _id: new ObjectId(req.params.projectId) });
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const members = await projectMemberList(project._id);
    return res.json({ project: { id: idString(project._id), name: project.name, ownerId: idString(project.ownerId), createdAt: project.createdAt }, members });
  } catch (error) { return next(error); }
});

router.post('/projects/:projectId/invites', requireAuth, requireProjectMember, requireOwner, async (req, res, next) => {
  try {
    await connect();
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_LIFETIME_MS);
    await invites.insertOne({
      projectId: new ObjectId(req.params.projectId),
      tokenHash: tokenHash(token),
      createdBy: req.user._id,
      createdAt: new Date(),
      expiresAt,
      usedAt: null,
      usedBy: null
    });
    return res.status(201).json({ url: `${config.appUrl}/invite/${token}`, expiresAt });
  } catch (error) { return next(error); }
});

router.get('/invites/:token', requireAuth, async (req, res, next) => {
  try {
    await connect();
    const invite = await invites.findOne({ tokenHash: tokenHash(req.params.token) });
    if (!invite || invite.usedAt || invite.expiresAt <= new Date()) return res.status(410).json({ error: 'Invite is used or expired.' });
    const project = await projects.findOne({ _id: invite.projectId });
    const inviter = await users.findOne({ _id: invite.createdBy }, { projection: { name: 1 } });
    if (!project) return res.status(410).json({ error: 'Invite is used or expired.' });
    return res.json({ project: { id: idString(project._id), name: project.name }, invitedBy: inviter?.name ?? '' });
  } catch (error) { return next(error); }
});

router.post('/invites/:token/accept', requireAuth, async (req, res, next) => {
  try {
    await connect();
    const hash = tokenHash(req.params.token);
    const invite = await invites.findOne({ tokenHash: hash });
    if (!invite) return res.status(410).json({ error: 'Invite is used or expired.' });
    if (invite.usedAt) {
      if (idString(invite.usedBy) === idString(req.user._id)) {
        const project = await projects.findOne({ _id: invite.projectId });
        return res.json({ ok: true, project: project ? { id: idString(project._id), name: project.name } : null, role: 'member' });
      }
      return res.status(410).json({ error: 'Invite is used or expired.' });
    }
    const now = new Date();
    if (invite.expiresAt <= now) return res.status(410).json({ error: 'Invite is used or expired.' });

    const claim = await invites.updateOne(
      { _id: invite._id, usedAt: null, expiresAt: { $gt: now } },
      { $set: { usedAt: now, usedBy: req.user._id } }
    );
    if (!claim.modifiedCount) {
      const current = await invites.findOne({ _id: invite._id });
      if (current?.usedAt && idString(current.usedBy) === idString(req.user._id)) {
        const project = await projects.findOne({ _id: invite.projectId });
        return res.json({ ok: true, project: project ? { id: idString(project._id), name: project.name } : null, role: 'member' });
      }
      return res.status(410).json({ error: 'Invite is used or expired.' });
    }

    const existing = await memberships.findOne({ projectId: invite.projectId, userId: req.user._id });
    if (!existing) {
      try {
        await memberships.insertOne({ projectId: invite.projectId, userId: req.user._id, role: 'member', joinedAt: now, invitedBy: invite.createdBy });
        await writeMemberEvent({ projectId: invite.projectId, actor: req.user, event: 'member_joined', memberId: req.user._id });
      } catch (error) {
        if (error?.code !== 11000) {
          await invites.updateOne({ _id: invite._id, usedBy: req.user._id }, { $set: { usedAt: null, usedBy: null } }).catch(() => {});
          throw error;
        }
      }
    }
    const project = await projects.findOne({ _id: invite.projectId });
    return res.json({ ok: true, project: project ? { id: idString(project._id), name: project.name } : null, role: 'member' });
  } catch (error) { return next(error); }
});

router.delete('/projects/:projectId/members/:userId', requireAuth, requireProjectMember, requireOwner, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.userId)) return res.status(404).json({ error: 'Member not found.' });
    const memberId = new ObjectId(req.params.userId);
    if (idString(memberId) === idString(req.user._id)) return res.status(400).json({ error: 'An owner cannot remove themselves.' });
    await connect();
    const result = await memberships.deleteOne({ projectId: new ObjectId(req.params.projectId), userId: memberId });
    if (!result.deletedCount) return res.status(404).json({ error: 'Member not found.' });
    await writeMemberEvent({ projectId: req.params.projectId, actor: req.user, event: 'member_removed', memberId });
    return res.json({ ok: true });
  } catch (error) { return next(error); }
});

export default router;
