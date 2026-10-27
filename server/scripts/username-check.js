import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';

const testDatabase = `smaran_test_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
process.env.DB_NAME = testDatabase;
const { connect, dbClient } = await import('../db.js');
const { ensureSchema } = await import('../services/schema.js');
const { default: auth } = await import('../routes/auth.js');
const { default: projects } = await import('../routes/projects.js');
const app = express();
app.use(express.json(), cookieParser());
app.use('/api/auth', auth);
app.use('/api', projects);
app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
async function request(path, method = 'GET', body, cookie = '') {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
    method, headers: { 'content-type': 'application/json', cookie }, ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
const signup = (username, email = `${randomUUID()}@example.invalid`) => request('/auth/signup', 'POST', { username, email, password: 'test-only-password' });
try {
  const db = await connect();
  await db.collection('users').insertOne({ name: 'Legacy User', email: 'legacy@example.invalid' });
  await ensureSchema(db);
  const legacy = await db.collection('users').findOne({ email: 'legacy@example.invalid' });
  assert.equal(legacy.username, 'legacy_user'); assert.equal(legacy.name, undefined);
  const owner = await signup('Ankit_01', 'owner@example.invalid');
  assert.equal(owner.status, 201); assert.equal(owner.body.user.username, 'ankit_01'); assert.equal(owner.body.user.name, undefined);
  for (const username of ['ankit_01', 'ANKIT_01', ' ankit_01 ']) {
    const duplicate = await signup(username);
    assert.equal(duplicate.status, 409); assert.match(duplicate.body.error, /username is already taken/i);
  }
  for (const username of ['ab', 'bad name', 'x'.repeat(31), 'user@email']) assert.equal((await signup(username)).status, 400);
  const emailDuplicate = await signup('other_username', 'owner@example.invalid');
  assert.equal(emailDuplicate.status, 409); assert.match(emailDuplicate.body.error, /email/);
  const race = await Promise.all([signup('race_user'), signup('RACE_USER')]);
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
  assert.match(race.find((r) => r.status === 409).body.error, /username is already taken/i);
  await assert.rejects(db.collection('users').insertOne({ username: 'ANKIT_01', email: 'direct@example.invalid' }), (error) => error.code === 11000);
  const login = await request('/auth/login', 'POST', { email: 'owner@example.invalid', password: 'test-only-password' });
  assert.equal(login.body.user.username, 'ankit_01');
  assert.equal((await request('/auth/me', 'GET', undefined, owner.cookie)).body.user.username, 'ankit_01');
  const member = await signup('member_01');
  const projectId = (await request('/projects', 'GET', undefined, owner.cookie)).body.projects[0].id;
  const invite = await request(`/projects/${projectId}/invitations`, 'POST', { username: 'MEMBER_01' }, owner.cookie);
  assert.equal(invite.status, 201); assert.equal(invite.body.invitation.username, 'member_01');
  const pending = (await request('/invitations', 'GET', undefined, member.cookie)).body.invitations[0];
  assert.equal(pending.invitedBy, 'ankit_01');
  assert.equal((await request(`/invitations/${pending.id}/accept`, 'POST', {}, member.cookie)).status, 200);
  const details = await request(`/projects/${projectId}`, 'GET', undefined, owner.cookie);
  assert.ok(details.body.members.some((m) => m.username === 'member_01'));
  assert.equal((await request('/auth/profile', 'PATCH', { username: 'renamed_owner', currentPassword: 'wrong' }, owner.cookie)).status, 401);
  assert.equal((await request('/auth/profile', 'PATCH', { username: 'member_01', currentPassword: 'test-only-password' }, owner.cookie)).status, 409);
  const renamed = await request('/auth/profile', 'PATCH', { username: 'renamed_owner', currentPassword: 'test-only-password', email: 'ignored@example.invalid' }, owner.cookie);
  assert.equal(renamed.status, 200); assert.equal(renamed.body.user.username, 'renamed_owner'); assert.equal(renamed.body.user.email, 'owner@example.invalid');
  assert.equal((await request('/auth/profile', 'PATCH', { currentPassword: 'wrong', newPassword: 'new-test-password' }, owner.cookie)).status, 401);
  const changed = await request('/auth/profile', 'PATCH', { currentPassword: 'test-only-password', newPassword: 'new-test-password' }, owner.cookie);
  assert.equal(changed.status, 200); assert.ok(changed.cookie);
  assert.equal((await request('/auth/me', 'GET', undefined, owner.cookie)).status, 401);
  assert.equal((await request('/auth/me', 'GET', undefined, changed.cookie)).body.user.username, 'renamed_owner');
  assert.equal((await request('/auth/login', 'POST', { email: 'owner@example.invalid', password: 'test-only-password' })).status, 401);
  assert.equal((await request('/auth/login', 'POST', { email: 'owner@example.invalid', password: 'new-test-password' })).status, 200);
  console.log('PASS: username migration/uniqueness, signup, invites, profile rename, password verification, email protection and old-session invalidation.');
} finally {
  await new Promise((resolve) => server.close(resolve));
  if (!testDatabase.startsWith('smaran_test_')) throw new Error('Unsafe test database cleanup.');
  await dbClient.db(testDatabase).dropDatabase();
  await dbClient.close();
}
