import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { connect, dbClient, memories, messages, memory_events, projects, users, memberships } from '../db.js';

const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 8) throw new Error('Set DEMO_PASSWORD to a value of at least 8 characters.');

async function counts() {
  return {
    memories: await memories.countDocuments(),
    messages: await messages.countDocuments(),
    events: await memory_events.countDocuments()
  };
}

export async function migrateTeam() {
  await connect();
  console.log('Document counts before:', await counts());
  const passwordHash = await bcrypt.hash(password, 10);
  const people = {};
  for (const [name, email] of [['Alice', 'alice@quickbite.demo'], ['Bob', 'bob@quickbite.demo']]) {
    await users.updateOne({ email }, { $set: { name, email, passwordHash }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
    people[name] = await users.findOne({ email });
  }
  let project = await projects.findOne({ name: 'QuickBite', ownerId: people.Alice._id });
  if (!project) {
    const { insertedId } = await projects.insertOne({ name: 'QuickBite', ownerId: people.Alice._id, createdAt: new Date() });
    project = { _id: insertedId, name: 'QuickBite', ownerId: people.Alice._id };
  }
  const projectId = String(project._id);
  const aliceId = String(people.Alice._id);
  await memberships.updateOne({ projectId: project._id, userId: people.Alice._id }, { $setOnInsert: { role: 'owner', joinedAt: new Date(), invitedBy: people.Alice._id } }, { upsert: true });
  const legacyProjectFilter = { $or: [
    { projectId: { $in: [...new Set([config.demoProjectId, 'quickbite', 'demo-project'])] } },
    { projectId: { $not: { $type: 'string' } } },
    { projectId: { $exists: false } },
    { projectId: null },
    { projectId: '' },
    { userId: config.demoUserId }
  ] };
  await memories.updateMany(legacyProjectFilter, { $set: { projectId, userId: aliceId, createdByName: 'Alice' } });
  await messages.updateMany(legacyProjectFilter, { $set: { projectId, userId: aliceId } });
  await memory_events.updateMany(legacyProjectFilter, { $set: { projectId, userId: aliceId, createdByName: 'Alice', actorId: aliceId, actorName: 'Alice' } });
  console.log('Document counts after:', await counts());
  console.log(`QuickBite project: ${projectId}; Alice: ${aliceId}; Bob: ${String(people.Bob._id)}`);
  return { project, ...people };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await migrateTeam(); }
  catch (error) { console.error(`Team migration failed: ${error.message}`); process.exitCode = 1; }
  finally { await dbClient.close().catch(() => {}); }
}
