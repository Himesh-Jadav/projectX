import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { connect, dbClient, memories } from '../db.js';
import { saveMemory, supersede } from '../services/memory.js';

const userId = config.demoUserId;
const projectId = config.demoProjectId;

async function ensureSeedMemory(key, memory) {
  const existing = await memories.findOne({ userId, projectId, 'source.sessionId': 'seed', 'source.messageId': key });
  if (existing) return existing;
  return saveMemory({
    ...memory,
    userId,
    projectId,
    source: { sessionId: 'seed', messageId: key, quote: memory.content }
  });
}

export async function seedDemoData() {
  await connect();
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
  if (previous.status === 'active' && current.status === 'active') await supersede(previous._id, current._id);

  console.log('Seed complete: 2 decisions, 1 constraint, 1 overdue assumption, 1 linked outcome, and 1 superseded pair.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await seedDemoData(); }
  catch (error) { console.error(`Seed failed: ${error.message}`); process.exitCode = 1; }
  finally { await dbClient.close().catch(() => {}); }
}
