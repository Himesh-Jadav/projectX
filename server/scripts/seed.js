import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { connect, dbClient, memories, users, projects, memberships } from '../db.js';
import { saveMemory, supersede } from '../services/memory.js';

let userId;
let projectId;

async function ensureTeam() {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 8) throw new Error('Set DEMO_PASSWORD to a value of at least 8 characters.');
  const passwordHash = await bcrypt.hash(password, 10);
  const people = {};
  for (const [name, email] of [['Alice', 'alice@quickbite.demo'], ['Bob', 'bob@quickbite.demo']]) {
    await users.updateOne({ email }, { $set: { username: name.toLowerCase(), email, passwordHash }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
    people[name] = await users.findOne({ email });
  }
  let project = await projects.findOne({ name: 'QuickBite', ownerId: people.Alice._id });
  if (!project) {
    const { insertedId } = await projects.insertOne({ name: 'QuickBite', ownerId: people.Alice._id, createdAt: new Date() });
    project = { _id: insertedId };
  }
  userId = String(people.Alice._id);
  projectId = String(project._id);
  await memberships.updateOne({ projectId: project._id, userId: people.Alice._id }, { $setOnInsert: { role: 'owner', joinedAt: new Date(), invitedBy: people.Alice._id } }, { upsert: true });
  if (process.argv.includes('--with-bob')) {
    await memberships.updateOne({ projectId: project._id, userId: people.Bob._id }, { $setOnInsert: { role: 'member', joinedAt: new Date(), invitedBy: people.Alice._id } }, { upsert: true });
  } else await memberships.deleteOne({ projectId: project._id, userId: people.Bob._id });
}

async function ensureSeedMemory(key, memory) {
  const existing = await memories.findOne({ userId, projectId, 'source.sessionId': 'seed', 'source.messageId': key });
  if (existing) return existing;
  return saveMemory({
    ...memory,
    userId,
    createdByName: 'Alice',
    projectId,
    source: { sessionId: 'seed', messageId: key, quote: memory.content }
  });
}

export async function seedDemoData() {
  await connect();
  await ensureTeam();
  const now = new Date();
  const authDecision = await ensureSeedMemory('auth-decision', {
    type: 'decision', content: 'Use email magic links for QuickBite authentication.',
    reason: 'A passwordless flow keeps the canteen ordering demo simple for students.', confidence: 0.88
  });
  await ensureSeedMemory('hosting-decision', {
    type: 'decision', content: 'Host the QuickBite demo API on Render.',
    reason: 'A managed host keeps the hackathon deployment quick.', confidence: 0.84
  });
  await ensureSeedMemory('free-tier-constraint', {
    type: 'constraint', content: 'Keep QuickBite demo infrastructure within the free tier.',
    reason: 'The demo budget is limited.', confidence: 0.9,
    expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
  });
  await ensureSeedMemory('menu-update-assumption', {
    type: 'assumption', content: 'Canteen operators will update QuickBite menus once each morning.',
    reason: 'The demo assumes menus change on a daily schedule.', confidence: 0.72,
    revisitAfter: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  });
  await ensureSeedMemory('auth-outcome', {
    type: 'outcome', content: 'Email magic-link sign-in worked in the first QuickBite user test.',
    reason: 'The initial student test completed successfully.', confidence: 0.86,
    outcomeOf: authDecision._id
  });

  const previous = await ensureSeedMemory('deployment-old', {
    type: 'decision', content: 'Use one shared environment for QuickBite staging and production.',
    reason: 'The first deployment plan used one environment.', confidence: 0.7
  });
  const current = await ensureSeedMemory('deployment-current', {
    type: 'decision', content: 'Use separate staging and production environments for QuickBite.',
    reason: 'Separate environments protect production during testing.', confidence: 0.9
  });
  if (previous.status === 'active' && current.status === 'active') await supersede(projectId, previous._id, current._id, { userId, actorName: 'Alice' });

  console.log('Seed complete: 2 decisions, 1 constraint, 1 overdue assumption, 1 linked outcome, and 1 superseded pair.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await seedDemoData(); }
  catch (error) { console.error(`Seed failed: ${error.message}`); process.exitCode = 1; }
  finally { await dbClient.close().catch(() => {}); }
}
