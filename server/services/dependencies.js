import { ObjectId } from 'mongodb';
import { connect, memories } from '../db.js';

export function recalledBasedOnCandidates(ids = [], recalledIds = []) {
  const recalled = new Set(recalledIds.map(String));
  return [...new Set((Array.isArray(ids) ? ids : []).filter((id) => ObjectId.isValid(String(id)) && recalled.has(String(id))).map(String))].slice(0, 3);
}

export async function sanitizeBasedOn(projectId, ids = [], recalledIds = []) {
  const candidates = recalledBasedOnCandidates(ids, recalledIds);
  if (!candidates.length) return [];
  await connect();
  const rows = await memories.find({ _id: { $in: candidates.map((id) => new ObjectId(id)) }, projectId: String(projectId), status: { $in: ['active', 'pending'] } }, { projection: { _id: 1 } }).toArray();
  return rows.map(({ _id }) => _id);
}

export async function findDependents(projectId, baseId) {
  await connect();
  return memories.find({ projectId: String(projectId), status: 'active', basedOn: baseId instanceof ObjectId ? baseId : new ObjectId(String(baseId)) }).toArray();
}
