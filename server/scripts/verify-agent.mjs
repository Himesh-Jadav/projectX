import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ObjectId } from 'mongodb';
import { runAgent } from '../services/agent.js';
import { config } from '../config.js';
import { buildAttention } from '../services/attention.js';

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL ${name}: ${error.message}`); }
}
const user = { _id: 'u1', username: 'Alice' }, project = { _id: 'p1' }, msg = 'hello';
const memory = (id, content, status = 'active') => ({ memory: { _id: id, projectId: 'p1', type: 'decision', content, status }, similarity: 0.9, confidence: 0.9, why: 'matched' });
const plan = (action, args = {}) => ({ action, args, why: 'Handle the project message.' });
function harness(sequence, state = []) {
  let writes = 0;
  const memories = { findOne: async (filter) => state.find(m => String(m._id) === String(filter._id) && m.projectId === filter.projectId && (filter.status?.$in?.includes(m.status) || filter.status === m.status)) ?? null };
  return {
    get writes() { return writes; },
    dependencies: {
      memories,
      planner: async () => { const next = sequence.shift(); if (next instanceof Error) throw next; return next; },
      callTool: async (action, args) => {
        if (action === 'save_memory') { writes += 1; const result = { kind: args.action === 'conflict' ? 'conflict' : 'created', memory: { _id: 'new1', projectId: 'p1', status: args.action === 'conflict' ? 'pending' : 'active', content: args.content }, ...(args.action === 'conflict' ? { pending: { _id: 'new1', content: args.content }, target: { _id: args.targetId, content: 'Use MongoDB', createdByName: 'Alice' }, canResolveNow: true } : {}) }; state.push(result.memory); return result; }
        if (action === 'search_memory' || action === 'check_conflict') return [memory('m1', 'Use MongoDB')];
        throw new Error('unexpected tool');
      }
    }
  };
}
const reply = async () => ({ reply: 'Hello!', conflicts: [] });

await test('1 Small talk answers without writing', async () => {
  const h = harness([plan('answer')]); const result = await runAgent({ user, project, message: msg, reply, dependencies: h.dependencies });
  assert.equal(result.reply, 'Hello!'); assert.equal(h.writes, 0); assert.deepEqual(result.steps.map(s => s.action), ['answer']);
});
await test('2 New decision checks, saves once, then answers', async () => {
  const h = harness([plan('check_conflict', { statement: 'Use Postgres for orders' }), plan('save_memory', { type:'decision', content:'Use Postgres for orders', reason:'Chosen for orders', confidence:.9, expiresIn:null, revisitIn:null, action:'new', targetId:null, outcomeOf:null, basedOn:[] }), plan('answer')]);
  const result = await runAgent({ user, project, message:'We will use Postgres for orders.', recalled:[], reply, dependencies:h.dependencies });
  assert.equal(h.writes,1); assert.deepEqual(result.steps.map(s=>s.action),['check_conflict','save_memory','answer']); assert.equal(result.changes[0].kind,'created');
});
await test('3 Ambiguous statement asks without writing', async () => {
  const h = harness([plan('ask_user',{ question:'Replace MongoDB or add Postgres alongside?', options:['Replace it','Add alongside'] })]);
  const result = await runAgent({ user, project, message:'Let us use Postgres', recalled:[memory('m1','Use MongoDB')], reply, dependencies:h.dependencies });
  assert.equal(result.reply,'Replace MongoDB or add Postgres alongside?'); assert.deepEqual(result.awaiting.options,['Replace it','Add alongside']); assert.equal(h.writes,0);
});
await test('4 Teammate contradiction is held pending and available to owner', async () => {
  const h = harness([plan('save_memory',{type:'decision',content:'Use Postgres',reason:'Teammate proposed',confidence:.9,expiresIn:null,revisitIn:null,action:'conflict',targetId:'aaaaaaaaaaaaaaaaaaaaaaaa',outcomeOf:null,basedOn:[]}),plan('answer')],[{_id:new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),projectId:'p1',status:'active',content:'Use MongoDB'}]);
  const result = await runAgent({ user:{_id:'u2',username:'Bob'}, project, message:'Use Postgres', recalled:[memory('aaaaaaaaaaaaaaaaaaaaaaaa','Use MongoDB')], reply, dependencies:h.dependencies });
  assert.equal(result.changes[0].kind,'conflict'); assert.equal(result.changes[0].memory.status,'pending'); assert.equal(result.changes[0].canResolveNow,true); assert.notEqual(result.changes[0].memory.status,'superseded');
});
await test('5 Invalid planner JSON, unknown action and tool failure raise fallback conditions', async () => {
  for (const failure of [new Error('bad JSON'), plan('unlisted'), plan('search_memory',{query:'x'})]) {
    const h = harness([failure]); if (failure.action === 'search_memory') h.dependencies.callTool = async()=>{ throw new Error('tool failed'); };
    await assert.rejects(runAgent({user,project,message:msg,reply,dependencies:h.dependencies}));
  }
});
await test('6 Cross-project target is rejected', async () => {
  const h = harness([plan('save_memory',{type:'decision',content:'Use Postgres',reason:'chosen',confidence:.9,expiresIn:null,revisitIn:null,action:'conflict',targetId:'bbbbbbbbbbbbbbbbbbbbbbbb',outcomeOf:null,basedOn:[]})],[{_id:new ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),projectId:'other',status:'active'}]);
  await assert.rejects(runAgent({user,project,message:msg,reply,dependencies:h.dependencies}),/target is not active or pending/); assert.equal(h.writes,0);
});
await test('7 Secret guard blocks planner dispatch and writes', async () => {
  let plannerCalls = 0, toolCalls = 0;
  const h = harness([plan('answer')]); h.dependencies.planner = async () => { plannerCalls += 1; return plan('answer'); };
  h.dependencies.callTool = async () => { toolCalls += 1; };
  await assert.rejects(runAgent({ user, project, message:'sk_test_abc123def456ghi789', reply, dependencies:h.dependencies }),/secret guard/);
  assert.equal(plannerCalls,0); assert.equal(toolCalls,0); assert.equal(h.writes,0);
});
await test('8 Agent off is the default and legacy route retains the existing path', async () => {
  assert.equal(config.agentMode,'off');
  const route = await readFile(new URL('../routes/chat.js', import.meta.url),'utf8');
  assert.ok(route.includes('rememberExchange({ userId, projectId, speaker, message'));
  assert.match(route,/config\.agentMode === 'on' \? \{ ran: true, fellBack: true, steps: \[\] \} : \{ ran: false, steps: \[\] \}/);
});
await test('9 Attention returns all four kinds and hides another author pending review from a non-owner', async () => {
  const now = new Date('2026-10-29T12:00:00Z');
  const old = new Date(now.getTime() - 8 * 86400000);
  const target = { _id:'target', userId:'u2', status:'active', type:'decision', content:'Use MongoDB', createdAt:old };
  const docs = [
    target,
    { _id:'assume', userId:'u1', status:'active', type:'assumption', content:'Traffic stays low', revisitAfter:old, createdAt:old },
    { _id:'constraint', status:'active', type:'constraint', content:'No deploys', expiresAt:new Date(now.getTime()+3600000), createdAt:now },
    { _id:'decision', status:'active', type:'decision', content:'Use Redis', createdAt:old },
    { _id:'outcome', status:'active', type:'outcome', content:'Redis worked', outcomeOf:'decision', createdAt:now }
  ];
  const pending = [{ _id:'pending', status:'pending', targetOf:'target', content:'Use Postgres instead' }];
  const owner = buildAttention({ user:{_id:'u1'}, project:{ownerId:'u1'}, documents:docs, pendingDocuments:pending, now });
  assert.deepEqual(owner.map((row) => row.kind), ['pending_review','stale_assumption','expiring_constraint','decision_no_outcome']);
  const teammate = buildAttention({ user:{_id:'u3'}, project:{ownerId:'u1'}, documents:docs, pendingDocuments:pending, now });
  assert.equal(teammate.some((row) => row.kind === 'pending_review'), false);
});

if (failures) process.exitCode = 1;