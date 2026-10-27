import { connect, dbClient } from '../db.js';
import { ensureMemoryVectorIndex } from '../services/vectorIndex.js';

try {
  const database = await connect();
  await ensureMemoryVectorIndex(database.collection('memories'));
  console.log('memory_index is queryable.');
} catch (error) {
  console.error(`Memory index setup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await dbClient.close().catch(() => {});
}
