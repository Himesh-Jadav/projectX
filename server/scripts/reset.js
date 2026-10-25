import { ObjectId } from 'mongodb';
import { connect, dbClient, memories, messages, memory_events, invites, memberships, projects, users } from '../db.js';
import { seedDemoData } from './seed.js';

try {
  await connect();
  const alice = await users.findOne({ email: 'alice@quickbite.demo' });
  if (!alice) throw new Error('Alice is missing. Run npm run seed or npm run migrate:team first.');
  const project = await projects.findOne({ name: 'QuickBite', ownerId: alice._id });
  if (!project) throw new Error('QuickBite project is missing. Run npm run seed or npm run migrate:team first.');
  const projectId = String(project._id);
  const [eventResult, messageResult, memoryResult, inviteResult] = await Promise.all([
    memory_events.deleteMany({ projectId }),
    messages.deleteMany({ projectId }),
    memories.deleteMany({ projectId }),
    invites.deleteMany({ projectId: project._id })
  ]);
  const bob = await users.findOne({ email: 'bob@quickbite.demo' });
  if (bob) await memberships.deleteOne({ projectId: project._id, userId: bob._id });
  console.log(`Reset QuickBite: deleted ${memoryResult.deletedCount} memories, ${messageResult.deletedCount} messages, ${eventResult.deletedCount} events, and ${inviteResult.deletedCount} invites.`);
  await seedDemoData();
} catch (error) {
  console.error(`Demo reset failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await dbClient.close().catch(() => {});
}
