import { connect, dbClient } from '../db.js';
import { config } from '../config.js';
import { ensureSchema, collectionNames } from '../services/schema.js';

try {
  await connect();
  const names = process.argv.slice(2);
  for (const name of names.length ? names : [config.dbName]) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid database name.');
    const database = dbClient.db(name);
    await ensureSchema(database);
    const counts = {};
    for (const collection of collectionNames) counts[collection] = await database.collection(collection).countDocuments();
    console.log(JSON.stringify({ database: name, counts }));
  }
} catch (error) {
  console.error(`Schema repair failed: ${error.message}`);
  process.exitCode = 1;
} finally { await dbClient.close(); }
