import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { config } from '../config.js';
import { connect, invites, memberships, memory_events, projects, users } from '../db.js';
import { requireAuth, requireOwner, requireProjectMember } from '../middleware/auth.js';
import { attachProjectStream } from '../services/realtime.js';

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
    let rows = await memberships.find({ userId: req.user._id }).toArray();
    if (!rows.length) {
      const { insertedId: projectId } = await projects.insertOne({ name: `${req.user.name}'s workspace`, ownerId: req.user._id, createdAt: new Date() });
      await memberships.insertOne({ projectId, userId: req.user._id, role: 'owner', joinedAt: new Date(), invitedBy: req.user._id });
      rows = [{ projectId, role: 'owner' }];
    }
    const docs = await projects.find({ _id: { $in: rows.map((row) => row.projectId) } }).toArray();
    const roleByProject = new Map(rows.map((row) => [idString(row.projectId), row.role]));
    return res.json({ projects: docs.map((project) => ({ id: idString(project._id), name: project.name, role: roleByProject.get(idString(project._id)) })) });
  } catch (error) { return next(error); }
});

router.post('/projects', requireAuth, async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim() : 'My workspace';
    await connect();
    const project = { name: name.trim(), ownerId: req.user._id, createdAt: new Date() };
    const { insertedId: projectId } = await projects.insertOne(project);
    const membership = { projectId, userId: req.user._id, role: 'owner', joinedAt: new Date(), invitedBy: req.user._id };
    await memberships.insertOne(membership);
    await writeMemberEvent({ projectId, actor: req.user, event: 'member_joined', memberId: req.user._id });
    return res.status(201).json({ project: { id: idString(projectId), name: project.name, role: 'owner' } });
  } catch (error) { return next(error); }
});

router.post('/projects/:projectId/invitations', requireAuth, requireProjectMember, requireOwner, async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim();
    if (!username) return res.status(400).json({ error: 'Enter a username or email.' });
    await connect();
    const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const target = await users.findOne({ $or: [{ email: username.toLowerCase() }, { name: { $regex: `^${escapedUsername}$`, $options: 'i' } }] });
    if (!target) return res.status(404).json({ error: 'No account found for that username.' });
    if (idString(target._id) === idString(req.user._id)) return res.status(400).json({ error: 'You are already a member of this workspace.' });
    const projectId = new ObjectId(req.params.projectId);
    if (await memberships.findOne({ projectId, userId: target._id })) return res.status(409).json({ error: 'That user is already a workspace member.' });
    const existing = await invites.findOne({ kind: 'user', projectId, invitedUserId: target._id, status: 'pending' });
    if (existing) return res.status(409).json({ error: 'An invitation is already pending for that user.' });
    const project = await projects.findOne({ _id: projectId }, { projection: { name: 1 } });
    const { insertedId } = await invites.insertOne({ kind: 'user', projectId, invitedUserId: target._id, invitedBy: req.user._id, status: 'pending', createdAt: new Date() });
    return res.status(201).json({ invitation: { id: idString(insertedId), username: target.name, workspace: project?.name } });
  } catch (error) { return next(error); }
});

router.get('/invitations', requireAuth, async (req, res, next) => {
  try {
    await connect();
    const rows = await invites.find({ kind: 'user', invitedUserId: req.user._id, status: 'pending' }).sort({ createdAt: -1 }).toArray();
    const invitations = await Promise.all(rows.map(async (row) => {
      const [project, inviter] = await Promise.all([projects.findOne({ _id: row.projectId }, { projection: { name: 1 } }), users.findOne({ _id: row.invitedBy }, { projection: { name: 1 } })]);
      return project ? { id: idString(row._id), workspaceId: idString(row.projectId), workspace: project.name, invitedBy: inviter?.name || 'A teammate' } : null;
    }));
    return res.json({ invitations: invitations.filter(Boolean) });
  } catch (error) { return next(error); }
});

router.post('/invitations/:invitationId/:action', requireAuth, async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.invitationId) || !['accept', 'decline'].includes(req.params.action)) return res.status(404).json({ error: 'Invitation not found.' });
    await connect();
    const invitationId = new ObjectId(req.params.invitationId);
    const invitation = await invites.findOne({ _id: invitationId, kind: 'user', invitedUserId: req.user._id, status: 'pending' });
    if (!invitation) return res.status(404).json({ error: 'Invitation not found.' });
    if (req.params.action === 'accept') {
      await memberships.updateOne({ projectId: invitation.projectId, userId: req.user._id }, { $setOnInsert: { role: 'member', joinedAt: new Date(), invitedBy: invitation.invitedBy } }, { upsert: true });
      await writeMemberEvent({ projectId: invitation.projectId, actor: req.user, event: 'member_joined', memberId: req.user._id });
    }
    await invites.updateOne({ _id: invitationId, status: 'pending' }, { $set: { status: req.params.action === 'accept' ? 'accepted' : 'declined', respondedAt: new Date() } });
    return res.json({ ok: true, action: req.params.action, workspaceId: idString(invitation.projectId) });
  } catch (error) { return next(error); }
});

router.get('/projects/:projectId/activity', requireAuth, requireProjectMember, async (req, res, next) => {
  try {
    await connect();
    const activity = await memory_events.find({ projectId: String(req.params.projectId) }).sort({ at: -1 }).limit(50).toArray();
    return res.json({ activity });
  } catch (error) { return next(error); }
});

router.get('/projects/:projectId/stream', requireAuth, requireProjectMember, (req, res) => {
  attachProjectStream(req, res);
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
