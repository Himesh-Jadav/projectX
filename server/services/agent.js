import { ObjectId } from 'mongodb';
import { config } from '../config.js';
import { callLLM } from './llm.js';
import { recallLongTerm, applyItems } from './memoryService.js';
import { memories } from '../db.js';
import { hasSecret } from './secrets.js';

const toolList = [
  { name: 'search_memory', args: { query: 'string' } },
  { name: 'check_conflict', args: { statement: 'string' } },
  { name: 'save_memory', args: { type: 'decision|assumption|constraint|outcome', content: 'string', reason: 'string', confidence: 'number', expiresIn: 'ISO-8601 duration|null', revisitIn: 'ISO-8601 duration|null', action: 'new|duplicate|conflict|invalidate', targetId: 'memory id|null', outcomeOf: 'memory id|null' } },
  { name: 'ask_user', args: { question: 'string', options: 'string[0..3]' } },
  { name: 'answer', args: {} }
];
const plannerPrompt = ({ message, turns, recalled, steps }) => `Plan one action. Return only JSON with exactly {"action":"tool name","args":{},"why":"one short sentence"}.\nRules:\n- Prefer answer when nothing needs checking. Small talk, questions, brainstorming and maybe never lead to save_memory.\n- Only save_memory something the user committed to or stated as true. Apply PRD 10.2: questions, brainstorming and maybe are not memories; content is standalone; relative time becomes expiresIn; duplicate means same meaning; conflict means contradiction without retiring old; invalidate means explicitly dropped/wrong/no longer true; never store secrets or private personal details.\n- Use check_conflict before save_memory when a statement touches a topic recalled memories cover.\n- Use ask_user only when two readings lead to different writes. Ask once, with at most 3 short options.\n- Never print memory ids in why or user-facing text. Never claim a memory exists that was not provided.\nTools: ${JSON.stringify(toolList)}\nInput: ${JSON.stringify({ userMessage: message, lastSixTurns: turns.slice(-6), recalledMemories: recalled.map(({ memory }) => ({ id: String(memory._id), type: memory.type, content: memory.content ?? memory.text, reason: memory.reason, author: memory.createdByName, date: memory.createdAt })), steps })}`;
const validPlan = (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === 'action,args,why' && typeof v.action === 'string' && v.args && typeof v.args === 'object' && !Array.isArray(v.args) && typeof v.why === 'string' && v.why.length <= 200 && !hasSecret(v.why) && !/[a-f\d]{24}/i.test(v.why);
const sanitizeSummary = (s) => String(s).replace(/[a-f\d]{24}/gi, '[memory]').replace(/(?:sk-[A-Za-z0-9_-]{8,}|sk_test_[A-Za-z0-9_-]+)/g, '[secret]').slice(0, 120);

export async function runAgent({ user, project, message, turns = [], recalled = [], signal, reply, dependencies = {} }) {
  const started = Date.now(), steps = [], found = [], written = [], planner = dependencies.planner ?? (async (prompt, innerSignal) => callLLM({ role: 'smart', json: true, strictJSON: true, signal: innerSignal, messages: [{ role: 'system', content: 'Return exactly one JSON tool plan. No prose.' }, { role: 'user', content: prompt }], validate: (v) => { if (!validPlan(v)) throw new Error('invalid planner response'); return v; } }));
  const userId = user?._id == null ? '' : String(user._id), projectId = project?._id == null ? '' : String(project._id);
  if (!userId || !projectId) throw new Error('invalid agent context');
  if (hasSecret(message)) throw new Error('secret guard');
  const callTool = dependencies.callTool;
  const controller = new AbortController();
  const relay = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', relay, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('agent timeout')), config.agentTimeoutMs);
  const memoriesCol = dependencies.memories ?? memories;
  try {
    for (let n = 1; n <= config.agentMaxSteps; n += 1) {
      if (controller.signal.aborted) throw controller.signal.reason ?? new Error('agent timeout');
      const plan = await planner(plannerPrompt({ message, turns, recalled: [...recalled, ...found], steps }), controller.signal);
      if (!validPlan(plan)) throw new Error('invalid planner response');
      const { action, args } = plan;
      const stepStart = Date.now();
      let summary;
      if (action === 'answer') {
        if (Object.keys(args).length) throw new Error('invalid answer arguments');
        if (typeof reply !== 'function') throw new Error('reply function unavailable');
        const answer = await reply({ used: dedupe([...recalled, ...found]), changes: written });
        steps.push({ n, action, why: sanitizeSummary(plan.why), summary: 'answered', ms: Date.now() - stepStart });
        return { reply: answer.reply, used: dedupe([...recalled, ...found]), changes: written, conflicts: answer.conflicts ?? [], steps, awaiting: null };
      }
      if (action === 'ask_user') {
        if (Object.keys(args).some(k => !['question','options'].includes(k)) || typeof args.question !== 'string' || !args.question.trim() || hasSecret(args.question) || /[a-f\d]{24}/i.test(args.question) || !Array.isArray(args.options) || args.options.length > 3 || args.options.some(x => typeof x !== 'string' || !x.trim() || x.length >= 40 || hasSecret(x) || /[a-f\d]{24}/i.test(x))) throw new Error('invalid ask_user arguments');
        steps.push({ n, action, why: sanitizeSummary(plan.why), summary: 'asked 1 question', ms: Date.now() - stepStart });
        return { reply: args.question, used: dedupe([...recalled, ...found]), changes: [], conflicts: [], steps, awaiting: { question: args.question, options: args.options } };
      }
      if (action === 'search_memory' || action === 'check_conflict') {
        const key = action === 'search_memory' ? 'query' : 'statement';
        if (Object.keys(args).length !== 1 || typeof args[key] !== 'string' || !args[key].trim() || args[key].length > 500 || hasSecret(args[key])) throw new Error('invalid recall arguments');
        const rows = callTool ? await callTool(action, args, { user, project }) : await recallLongTerm(args[key], userId, projectId);
        if (!Array.isArray(rows)) throw new Error('recall returned invalid result');
        found.push(...rows);
        summary = `${rows.length} matches`;
      } else if (action === 'save_memory') {
        const expected = ['action','confidence','content','expiresIn','outcomeOf','reason','revisitIn','targetId','type'];
        if (Object.keys(args).sort().join(',') !== expected.join(',')) throw new Error('invalid save fields');
        if (!['decision','assumption','constraint','outcome'].includes(args.type) || typeof args.content !== 'string' || !args.content.trim() || args.content.length > 1000 || hasSecret(args.content) || typeof args.reason !== 'string' || args.reason.length > 1000 || !Number.isFinite(args.confidence) || args.confidence < 0 || args.confidence > 1 || !['new','duplicate','conflict','invalidate'].includes(args.action) || (args.expiresIn !== null && typeof args.expiresIn !== 'string') || (args.revisitIn !== null && typeof args.revisitIn !== 'string') || (args.targetId !== null && typeof args.targetId !== 'string') || (args.outcomeOf !== null && typeof args.outcomeOf !== 'string')) throw new Error('invalid save arguments');
        if (['conflict','invalidate'].includes(args.action) && !args.targetId) throw new Error('targetId required');
        if (args.targetId) {
          if (!ObjectId.isValid(args.targetId) || !(await memoriesCol.findOne({ _id: new ObjectId(args.targetId), projectId, status: { $in: ['active','pending'] } }))) throw new Error('target is not active or pending in this project');
        }
        if (args.outcomeOf && (!ObjectId.isValid(args.outcomeOf) || !(await memoriesCol.findOne({ _id: new ObjectId(args.outcomeOf), projectId, status: 'active', type: 'decision' })))) throw new Error('outcomeOf is not an active decision in this project');
        const item = { ...args, expiresAt: args.expiresIn ? expiryDate(args.expiresIn) : null, revisitAfter: args.revisitIn ? expiryDate(args.revisitIn) : null };
        const result = callTool ? await callTool('save_memory', item, { user, project }) : await applyItems({ user, project, items: [item], recalled: [...recalled, ...found] });
        if (result) { if (Array.isArray(result)) written.push(...result.filter(Boolean)); else written.push(result); }
        summary = result?.kind === 'conflict' ? 'proposal held for review' : result?.kind === 'created' ? 'memory saved' : 'memory checked';
      } else throw new Error('unknown tool');
      steps.push({ n, action, why: sanitizeSummary(plan.why), summary: sanitizeSummary(summary), ms: Date.now() - stepStart });
      if (Date.now() - started > config.agentTimeoutMs) throw new Error('agent timeout');
    }
    throw new Error('agent step budget exhausted');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', relay); }
}

function dedupe(rows) { const seen = new Set(); return rows.filter(row => { const id = String(row?.memory?._id ?? ''); if (!id || seen.has(id)) return false; seen.add(id); return true; }); }
function expiryDate(duration) { if (!/^P(?=\d|T)(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/.test(duration)) throw new Error('invalid ISO-8601 duration'); const m = duration.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/); return new Date(Date.now() + ((+m[1]||0)*86400+(+m[2]||0)*3600+(+m[3]||0)*60+(+m[4]||0))*1000); }
