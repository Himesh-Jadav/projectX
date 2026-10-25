import { connect, dbClient, users, projects } from '../db.js';
import { recall, saveMemory } from '../services/memory.js';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let userId;
let projectId;

try {
  await connect();
  const alice = await users.findOne({ email: 'alice@quickbite.demo' });
  const project = alice && await projects.findOne({ name: 'QuickBite', ownerId: alice._id });
  if (!alice || !project) throw new Error('Seed QuickBite first with npm run seed.');
  userId = String(alice._id);
  projectId = String(project._id);
  const timestamp = new Date();
  const samples = [
    { type: 'decision', content: 'Use MongoDB as the main database for QuickBite.', reason: 'Menus and orders have flexible shapes, and we need to ship quickly.', confidence: 0.95 },
    { type: 'assumption', content: 'Most QuickBite students will use mobile phones to place orders.', reason: 'The product is designed mobile-first.', confidence: 0.8 },
    { type: 'constraint', content: 'No paid APIs may be used during the temporary demo period.', reason: 'The demo is running under a temporary spending constraint.', confidence: 0.9, expiresAt: new Date(timestamp.getTime() + 2 * 60 * 1000) }
  ];

  const inserted = [];
  for (const sample of samples) inserted.push(await saveMemory({ ...sample, userId, createdByName: 'Alice', projectId, source: { sessionId: 'smoke-session', messageId: null, quote: sample.content } }));
  console.log(`Inserted ${inserted.length} smoke-test memories.`);

  const deadline = Date.now() + 30_000;
  let results = [];
  while (Date.now() < deadline) {
    results = await recall("let's use Postgres", { projectId });
    if (results.some(({ memory }) => inserted[0]._id.equals(memory._id))) break;
    console.log('Waiting for the new memories to become searchable...');
    await pause(3000);
  }

  console.log('Results for: let\'s use Postgres');
  for (const result of results) {
    console.log(JSON.stringify({ content: result.memory.content, similarity: result.similarity, confidence: result.confidence, finalScore: result.finalScore, why: result.why }, null, 2));
  }
  if (!results.length || !inserted[0]._id.equals(results[0].memory._id)) {
    throw new Error('MongoDB decision was not the top result for the Postgres query within 30 seconds.');
  }
  console.log('Smoke check passed: MongoDB decision is the top result.');
} catch (error) {
  console.error(`Smoke check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await dbClient.close().catch(() => {});
}
