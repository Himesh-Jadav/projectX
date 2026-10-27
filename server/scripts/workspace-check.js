// Integration checks use an isolated temporary database, never application records.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';

const testDatabase = `smaran_test_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
process.env.DB_NAME = testDatabase;
const { config } = await import('../config.js');
const { connect, dbClient } = await import('../db.js');
const { default: router } = await import('../routes/projects.js');
const app = express();
app.use(express.json(), cookieParser());
app.use('/api', router);
app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const owner = new ObjectId();
const member = new ObjectId();
const password = randomUUID();
const cookie = (id) => `sid=${jwt.sign({}, config.jwtSecret, { subject: String(id), expiresIn: '5m' })}`;
async function request(path, method = 'GET', body, user = owner) {
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie: cookie(user) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
try {
  const db = await connect();
  assert.equal(db.databaseName, testDatabase);
  assert.equal((await db.listCollections().toArray()).length, 7);
  await db.collection('users').insertMany([
    { _id: owner, email: 'owner@test.invalid', username: 'test_owner', passwordHash: await bcrypt.hash(password, 4) },
    { _id: member, email: 'member@test.invalid', username: 'test_member', passwordHash: await bcrypt.hash(password, 4) }
  ]);
  const created = await request('/projects', 'POST', { name: 'Delete test workspace' });
  assert.equal(created.status, 201);
  const id = created.body.project.id;
  const other = (await request('/projects', 'POST', { name: 'Keep test workspace' })).body.project.id;
  await db.collection('memberships').insertOne({ projectId: new ObjectId(id), userId: member, role: 'member' });
  for (const name of ['memories', 'messages', 'invites', 'memory_events']) {
    await db.collection(name).insertMany([{ projectId: id }, { projectId: new ObjectId(id) }, { projectId: other }]);
  }
  // Multiple direct-user invitations are valid without a tokenHash.
  assert.equal(await db.collection('invites').countDocuments(), 3);
  assert.equal((await request(`/projects/${id}/deletion-review`, 'POST', undefined, member)).status, 403);
  assert.equal((await request(`/projects/${id}`, 'DELETE', {}, member)).status, 403);
  assert.equal((await request(`/projects/${id}`, 'DELETE', { name: created.body.project.name, password })).status, 400);
  const review = await request(`/projects/${id}/deletion-review`, 'POST');
  assert.equal(review.status, 200);
  assert.equal(review.body.counts.messages, 2);
  const input = { token: review.body.token, name: created.body.project.name, password };
  assert.equal((await request(`/projects/${id}`, 'DELETE', { ...input, password: 'wrong' })).status, 400);
  assert.equal((await request(`/projects/${id}`, 'DELETE', { ...input, name: 'wrong' })).status, 400);
  assert.equal((await request(`/projects/${other}`, 'DELETE', input)).status, 400);
  const expired = jwt.sign({ purpose: 'delete-workspace', projectId: id }, config.jwtSecret, { subject: String(owner), audience: 'workspace-deletion', expiresIn: -1 });
  assert.equal((await request(`/projects/${id}`, 'DELETE', { ...input, token: expired })).status, 400);
  assert.equal(await db.collection('messages').countDocuments({ projectId: { $in: [id, new ObjectId(id)] } }), 2);
  assert.equal((await request(`/projects/${id}`, 'DELETE', input)).status, 200);
  for (const name of ['memories', 'messages', 'invites', 'memory_events', 'memberships']) {
    assert.equal(await db.collection(name).countDocuments({ projectId: { $in: [id, new ObjectId(id)] } }), 0, `${name} cascade`);
    assert.ok(await db.collection(name).countDocuments({ projectId: { $in: [other, new ObjectId(other)] } }), `${name} sibling preserved`);
  }
  assert.equal(await db.collection('users').countDocuments(), 2);
  assert.equal((await request(`/projects/${id}`, 'DELETE', input)).status, 404);
  const finalReview = await request(`/projects/${other}/deletion-review`, 'POST');
  assert.equal((await request(`/projects/${other}`, 'DELETE', { token: finalReview.body.token, name: 'Keep test workspace', password })).status, 200);
  assert.deepEqual((await request('/projects')).body.projects, []);
  console.log('PASS: owner checks, review token, expiry, name/password verification, atomic cascade, sibling/account preservation, replay rejection, and empty workspace list.');
} finally {
  await new Promise((resolve) => server.close(resolve));
  if (config.dbName !== testDatabase || !testDatabase.startsWith('smaran_test_')) throw new Error('Refusing to clean up an application database.');
  await dbClient.db(testDatabase).dropDatabase();
  await dbClient.close();
}
