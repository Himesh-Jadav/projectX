export const collectionNames = ['users', 'projects', 'memberships', 'invites', 'memories', 'messages', 'memory_events'];

// MongoDB otherwise creates collections lazily, leaving unused features absent.
export async function ensureSchema(database) {
  for (const name of collectionNames) {
    try { await database.createCollection(name); }
    catch (error) { if (error.code !== 48) throw error; }
  }
  await database.collection('users').createIndex({ email: 1 }, { unique: true, name: 'users_email_unique' });
  const users = database.collection('users');
  if (await users.findOne({ name: { $exists: true } })) {
    const records = await users.find({}, { projection: { name: 1, username: 1 } }).toArray();
    const seen = new Set();
    const migrated = records.map((user) => {
      const username = (user.username || user.name || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 30);
      if (username.length < 3 || seen.has(username)) throw new Error('Existing user names need unique usernames before migration.');
      seen.add(username);
      return { id: user._id, username };
    });
    for (const user of migrated) await users.updateOne({ _id: user.id }, { $set: { username: user.username }, $unset: { name: '' } });
  }
  await users.createIndex({ username: 1 }, { unique: true, name: 'users_username_unique', collation: { locale: 'en', strength: 2 } });
  await database.collection('memberships').createIndex({ projectId: 1, userId: 1 }, { unique: true, name: 'memberships_project_user_unique' });
  await database.collection('memberships').createIndex({ userId: 1 }, { name: 'memberships_user' });
  const invites = database.collection('invites');
  const existing = (await invites.listIndexes().toArray()).find((index) => index.name === 'invites_tokenHash_unique');
  // User invitations have no tokenHash; only link invitations should be unique by token.
  if (existing && !existing.partialFilterExpression) await invites.dropIndex(existing.name);
  await invites.createIndex({ tokenHash: 1 }, { unique: true, partialFilterExpression: { tokenHash: { $type: 'string' } }, name: 'invites_tokenHash_unique' });
  await invites.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'invites_expiresAt_ttl' });
  await database.collection('memories').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'memories_expiresAt_ttl' });
  await database.collection('memories').createIndex({ userId: 1, projectId: 1, status: 1, createdAt: -1 }, { name: 'memories_owner_status_createdAt' });
  await database.collection('memories').createIndex({ projectId: 1, basedOn: 1 }, { name: 'project_basedOn' });
  await database.collection('messages').createIndex({ projectId: 1, userId: 1, sessionId: 1, createdAt: 1 }, { name: 'messages_project_user_session_createdAt' });
  for (const name of ['memories', 'messages', 'memory_events', 'invites']) {
    await database.collection(name).createIndex({ projectId: 1 }, { name: `${name}_project` });
  }
}
