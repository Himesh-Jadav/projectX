import { config } from '../config.js';
import { connect, dbClient, memories, messages, memory_events } from '../db.js';
import { seedDemoData } from './seed.js';

try {
  await connect();
  const scope = { userId: config.demoUserId, projectId: config.demoProjectId };
  const projectMemories = await memories.find(scope, { projection: { _id: 1 } }).toArray();
  const memoryIds = projectMemories.map(({ _id }) => _id);
  const eventFilter = {
    $or: [
      scope,
      ...(memoryIds.length ? [{ memoryId: { $in: memoryIds } }] : [])
    ]
  };
  const [eventResult, messageResult, memoryResult] = await Promise.all([
    memory_events.deleteMany(eventFilter),
    messages.deleteMany(scope),
    memories.deleteMany(scope)
  ]);
  console.log(`Reset demo project: deleted ${memoryResult.deletedCount} memories, ${messageResult.deletedCount} messages, and ${eventResult.deletedCount} events.`);
  await seedDemoData();
} catch (error) {
  console.error(`Demo reset failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await dbClient.close().catch(() => {});
}
