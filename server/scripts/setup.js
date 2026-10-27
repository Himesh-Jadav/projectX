import { connect, dbClient } from '../db.js';
import { ensureMemoryVectorIndex } from '../services/vectorIndex.js';

async function ensureCollection(database, name) {
  const exists = await database.listCollections({ name }, { nameOnly: true }).hasNext();
  if (!exists) {
    await database.createCollection(name);
    console.log(`Created collection: ${name}`);
  } else console.log(`Collection exists: ${name}`);
}

try {
  const database = await connect();
  for (const name of ['users', 'projects', 'memberships', 'invites', 'memories', 'messages', 'memory_events']) await ensureCollection(database, name);
  await ensureMemoryVectorIndex(database.collection('memories'));
  console.log('Setup complete: memory_index is queryable.');
} catch (error) {
  console.error(`Setup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await dbClient.close().catch(() => {});
}
