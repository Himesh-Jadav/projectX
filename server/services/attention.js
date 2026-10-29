import { ObjectId } from 'mongodb';
import { connect, memories, projects } from '../db.js';

const DAY = 24 * 60 * 60 * 1000;
const safeId = (value) => String(value?._id ?? value ?? '');
const text = (memory) => String(memory.content ?? memory.text ?? '');
const item = (kind, memory, detail, actions) => ({ kind, memoryId: safeId(memory), title: text(memory), detail, actions });

// Pure helper used by the deterministic verify:agent test and by getAttention.
export function buildAttention({ user, project, documents, pendingDocuments = [], now = new Date() }) {
  const viewerId = safeId(user?._id);
  const ownerId = safeId(project?.ownerId);
  const active = documents.filter((memory) => memory.status === 'active');
  const activeById = new Map(active.map((memory) => [safeId(memory), memory]));
  const canResolve = viewerId && viewerId === ownerId;
  const pending = pendingDocuments.filter((memory) => {
    const target = activeById.get(String(memory.targetOf));
    return target && (canResolve || String(target.userId) === viewerId);
  }).map((memory) => {
    const target = activeById.get(String(memory.targetOf));
    return item('pending_review', memory, `Proposed change to: ${text(target)}`, [
      { label: 'Override', endpoint: 'resolve', action: 'override' },
      { label: 'Keep', endpoint: 'resolve', action: 'keep' }
    ]);
  });
  const allById = new Map(documents.map((memory) => [safeId(memory), memory]));
  const dependentReviews = active.flatMap((memory) => (memory.basedOn ?? []).map((baseId) => ({ memory, base: allById.get(String(baseId)) })).filter(({ base }) => base && ['invalid', 'superseded'].includes(base.status) && (!memory.lastConfirmedAt || new Date(memory.lastConfirmedAt) < new Date(base.statusChangedAt ?? base.updatedAt ?? base.createdAt))).map(({ memory, base }) => ({ ...item('dependent_review', memory, `Based on: ${text(base)} (no longer true)`, [{ label: 'Still valid', endpoint: 'confirm' }, { label: 'Review', endpoint: 'composer', baseTitle: text(base) }]), baseTitle: text(base) })));
  const stale = active.filter((memory) => memory.type === 'assumption' && (
    (memory.revisitAfter && new Date(memory.revisitAfter) <= now) ||
    (new Date(memory.createdAt || now).getTime() <= now.getTime() - 7 * DAY && !memory.lastConfirmedAt)
  )).map((memory) => item('stale_assumption', memory, 'This assumption is due for review.', [
    { label: 'Still true', endpoint: 'confirm' }, { label: 'No longer true', endpoint: 'invalidate' }
  ]));
  const expiring = active.filter((memory) => memory.type === 'constraint' && memory.expiresAt && new Date(memory.expiresAt) > now && new Date(memory.expiresAt) <= new Date(now.getTime() + DAY))
    .map((memory) => item('expiring_constraint', memory, `Expires ${new Date(memory.expiresAt).toLocaleString()}.`, [{ label: 'OK', endpoint: 'client' }]));
  const decisions = active.filter((memory) => memory.type === 'decision' && new Date(memory.createdAt || now).getTime() <= now.getTime() - 7 * DAY);
  const outcomes = new Set(active.filter((memory) => memory.type === 'outcome' && memory.outcomeOf).map((memory) => String(memory.outcomeOf)));
  const noOutcome = decisions.filter((memory) => !outcomes.has(safeId(memory))).map((memory) => item('decision_no_outcome', memory, 'No outcome has been recorded.', [{ label: 'Add outcome', endpoint: 'composer' }]));
  const order = ['pending_review', 'dependent_review', 'stale_assumption', 'expiring_constraint', 'decision_no_outcome'];
  return [...pending, ...dependentReviews, ...stale, ...expiring, ...noOutcome].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).slice(0, 8);
}

export async function getAttention({ user, project }) {
  await connect();
  const projectId = safeId(project?._id ?? project?.id);
  if (!ObjectId.isValid(projectId)) return [];
  const projectDoc = project?.ownerId ? project : await projects.findOne({ _id: new ObjectId(projectId) }, { projection: { ownerId: 1 } });
  const [documents, pendingDocuments] = await Promise.all([
    memories.find({ projectId }).toArray(),
    memories.find({ projectId, status: 'pending' }).toArray()
  ]);
  const visibleToViewer = (memory) => !memory.private || String(memory.userId) === String(user?._id);
  return buildAttention({ user, project: projectDoc, documents: documents.filter(visibleToViewer), pendingDocuments: pendingDocuments.filter(visibleToViewer) });
}
