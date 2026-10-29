import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { recalledBasedOnCandidates } from '../services/dependencies.js';
import { buildAttention } from '../services/attention.js';

const baseId = new ObjectId();
const dependentId = new ObjectId();
const projectId = 'project-a';
const at = new Date('2026-01-02T00:00:00Z');
const base = { _id: baseId, projectId, type: 'assumption', status: 'invalid', content: 'Mobile first', statusChangedAt: at, createdAt: new Date('2025-01-01') };
const decision = { _id: dependentId, projectId, type: 'decision', status: 'active', content: 'Build mobile UI', basedOn: [baseId], lastConfirmedAt: new Date('2025-12-31') };

assert.deepEqual(recalledBasedOnCandidates([baseId, new ObjectId(), baseId], [baseId]), [String(baseId)]);
const ids = [baseId, ...Array.from({ length: 4 }, () => new ObjectId())];
assert.equal(recalledBasedOnCandidates(ids, ids).length, 3);
const before = { _id: String(decision._id), basedOn: decision.basedOn.map(String), status: decision.status, content: decision.content };
let attention = buildAttention({ user: { _id: 'owner' }, project: { ownerId: 'owner' }, documents: [base, decision], now: new Date('2026-01-03') });
assert.equal(attention.find((row) => row.kind === 'dependent_review')?.memoryId, String(dependentId));
assert.equal(attention.find((row) => row.kind === 'dependent_review')?.actions[0].label, 'Still valid');
decision.lastConfirmedAt = new Date('2026-01-03T00:00:00Z');
attention = buildAttention({ user: { _id: 'owner' }, project: { ownerId: 'owner' }, documents: [base, decision], now: new Date('2026-01-04') });
assert.equal(attention.some((row) => row.kind === 'dependent_review'), false);
assert.deepEqual({ _id: String(decision._id), basedOn: decision.basedOn.map(String), status: decision.status, content: decision.content }, before);
base.statusChangedAt = new Date('2026-01-05T00:00:00Z');
attention = buildAttention({ user: { _id: 'owner' }, project: { ownerId: 'owner' }, documents: [base, decision], now: new Date('2026-01-06') });
assert.equal(attention.some((row) => row.kind === 'dependent_review'), true);
console.log('PASS dependency filtering, pending review, confirmation dismissal, renewed base change, and no automatic dependent mutation');
