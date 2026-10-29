import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { config } from '../config.js';
import { connect, messages as messageCollection, projects } from '../db.js';
import { appendRecentMessages, recallLongTerm, recentMessages, rememberExchange } from '../services/memoryService.js';
import { hasSecret } from '../services/secrets.js';
import { callLLM } from '../services/llm.js';
import { formatRecalledMemories, REPLY_SYSTEM_PROMPT, buildReplySystemContent } from '../services/prompts.js';
import { requireAuth, requireProjectMember, userRateLimit } from '../middleware/auth.js';
import { runAgent } from '../services/agent.js';
import { presentRows } from './conversations.js';
import { persistMessagePair } from '../services/threadStore.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireProjectMember, userRateLimit);
const safeMemory = (memory) => {
  if (!memory) return memory;
  const { embedding, ...safe } = memory;
  return safe;
};
const projectQueues = new Map();
function messageMeta(used = [], changes = [], agentSteps = [], awaiting = null) {
  return {
    usedMemoryIds: used.map(({ memory }) => memory?._id).filter(Boolean).map(String),
    changes: changes.map((change) => ({ kind: change.kind, memoryId: String(change.memory?._id ?? change.memoryId ?? change.pending?._id ?? '') })).filter((change) => change.memoryId),
    agentSteps: Array.isArray(agentSteps) ? agentSteps : [],
    awaiting: awaiting ?? null
  };
}
function persistConversation(session, input, reply, meta) {
  void (async () => {
    await appendRecentMessages(session, [
      { role: 'user', text: hasSecret(input) ? '[hidden: looks like a secret]' : input, meta: { usedMemoryIds: [], changes: [], agentSteps: [] }, createdAt: new Date() },
      { role: 'assistant', text: reply, meta, createdAt: new Date() }
    ]);
    await persistMessagePair({ session, input, reply, meta, secretGuard: hasSecret, collection: messageCollection });
  })().catch((error) => console.error(`Conversation persistence failed: ${error.message}`));
}
async function serializeProject(projectId, task) {
  const previous = projectQueues.get(projectId) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  projectQueues.set(projectId, tail);
  await previous;
  try { return await task(); }
  finally { release(); if (projectQueues.get(projectId) === tail) projectQueues.delete(projectId); }
}

router.get('/', async (req, res, next) => {
  try {
    const scope = req.query.scope === 'team' ? 'team' : 'personal';
    const sessionId = scope === 'team' ? 'team' : String(req.query.sessionId || 'personal');
    const messages = await recentMessages({ userId: String(req.user._id), projectId: String(req.params.projectId), sessionId, scope });
    return res.json({ scope, messages: await presentRows(messages, String(req.params.projectId)) });
  } catch (error) { return next(error); }
});

router.post('/', async (req, res, next) => {
  const { sessionId, message, memoryEnabled = true, scope: requestedScope = 'personal' } = req.body ?? {};
  const scope = requestedScope === 'team' ? 'team' : 'personal';
  if (typeof sessionId !== 'string' || !sessionId.trim() || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'sessionId and message are required.' });
  }
  if (typeof memoryEnabled !== 'boolean') return res.status(400).json({ error: 'memoryEnabled must be a boolean.' });

  const userId = String(req.user._id);
  const projectId = String(req.params.projectId);
  const speaker = req.user.username;
  const effectiveSessionId = scope === 'team' ? 'team' : sessionId;
  const session = { userId, projectId, sessionId: effectiveSessionId };
  const notices = [];
  if (hasSecret(message)) {
    notices.push('Not saved: looks like a secret.');
    const reply = 'That looks like a secret or credential. I have not stored it or sent it for analysis. If it is real, rotate it before continuing.';
    res.json({
      reply,
      used: [], changes: [], conflicts: [], notices, agent: config.agentMode === 'on' ? { ran: false, fellBack: false, steps: [] } : { ran: false, steps: [] }, awaiting: null
    });
    persistConversation(session, message, reply, messageMeta());
    return;
  }

  let history = await recentMessages(session);
  let used = [];
  if (memoryEnabled) {
    try { used = await recallLongTerm(message, userId, projectId); }
    catch (error) {
      notices.push('Memory recall was unavailable for this reply.');
      console.error(`Memory recall failed: ${error.message}`);
    }
  }

  const memorySummary = formatRecalledMemories(used);
  let projectName = '';
  try {
    await connect();
    const project = await projects.findOne({ _id: new ObjectId(projectId) }, { projection: { name: 1 } });
    projectName = project?.name ?? '';
  } catch (error) { console.error(`Project context lookup failed: ${error.message}`); }
  // Workspace metadata is authoritative; answer direct name questions from the
  // database so the model cannot confuse it with the signed-in user's label.
  const asksProjectName = /\b(?:what(?:'s| is)|tell me|remind me)\b.{0,40}\b(?:project|workspace)\b.{0,20}\bname\b|\b(?:project|workspace)\b.{0,20}\bname\b.{0,20}\b(?:what|which)\b/i.test(message);
  if (asksProjectName && projectName && config.agentMode !== 'on') {
    const reply = `The project is named ${projectName}.`;
    res.json({ reply, used: used.map((entry) => ({ ...entry, memory: safeMemory(entry.memory) })), changes: [], conflicts: [], notices, agent: config.agentMode === 'on' ? { ran: false, fellBack: false, steps: [] } : { ran: false, steps: [] }, awaiting: null });
    persistConversation(session, message, reply, messageMeta(used));
    return;
  }

  if (config.agentMode === 'on') {
    try {
      const outcome = await serializeProject(projectId, () => runAgent({
        user: req.user,
        project: { _id: projectId, name: projectName },
        message,
        turns: history,
        recalled: used,
        reply: async ({ used: agentUsed, changes: agentChanges }) => {
          const agentConflicts = agentChanges.filter((entry) => entry?.kind === 'conflict');
          const conflictContext = agentConflicts.map(({ target, pending }) =>
            `A proposed memory conflicts with an existing one. Do not say the new statement is already decided or saved as current. Tell the user the existing statement (“${target.content ?? target.text}”, recorded by ${target.createdByName || 'a teammate'}) conflicts with the new statement (“${pending.content ?? pending.text}”, stated by ${pending.createdByName || speaker}). Ask whether they want to keep the existing statement or override it with the new one. They can also withdraw their proposal using the chat controls.`
          ).join('\n');
          const replyMessages = [
            { role: 'system', content: buildReplySystemContent({ projectName, speaker, memorySummary: formatRecalledMemories(agentUsed), savedThisTurn: agentChanges.filter((c) => c?.kind === 'created').map(c => ({ kind: 'created', memory: c.memory })), conflictContext }) },
            ...history.map(({ role, text }) => ({ role, content: text })),
            { role: 'user', content: message }
          ];
          let text = await callLLM({ role: 'smart', messages: replyMessages });
          if (agentConflicts.length) {
            const { target, pending } = agentConflicts[0];
            text = `You previously saved “${target.content ?? target.text}” as the current project decision. You now suggested “${pending.content ?? pending.text}”. Would you like to keep the existing decision or override it with “${pending.content ?? pending.text}”? Choose an option below.`;
          }
          return { reply: text, conflicts: agentConflicts };
        }
      }));
      const agentUsed = outcome.used ?? used;
      res.json({
        reply: outcome.reply,
        used: agentUsed.map((entry) => ({ ...entry, memory: safeMemory(entry.memory) })),
        changes: (outcome.changes ?? []).filter(c => ['created','invalidated'].includes(c?.kind)).map(c => ({ kind: c.kind, memory: safeMemory(c.memory) })),
        conflicts: (outcome.conflicts ?? []).map(c => ({ ...c, pending: safeMemory(c.pending), target: safeMemory(c.target) })),
        notices, agent: { ran: true, fellBack: false, steps: outcome.steps }, awaiting: outcome.awaiting
      });
      persistConversation(session, message, outcome.reply, messageMeta(agentUsed, outcome.changes ?? [], outcome.steps ?? [], outcome.awaiting));
      return;
    } catch (error) {
      console.error(`Agent fallback: ${String(error?.code ?? error?.name ?? 'failure').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 48)}`);
    }
  }

  const changes = [];
  const conflicts = [];
  const userMessageId = new ObjectId();
  if (memoryEnabled) {
    try {
      const result = await rememberExchange({ userId, projectId, speaker, message, sourceMessageId: userMessageId, existingMemoryCandidates: used.map(({ memory }) => memory) });
      for (const item of Array.isArray(result) ? result : [result]) {
        if (item?.kind === 'created') changes.push({ kind: 'created', memory: item.memory });
        if (item?.kind === 'invalidated') changes.push({ kind: 'invalidated', memory: item.memory });
        if (item?.kind === 'conflict') conflicts.push(item);
      }
    } catch (error) {
      notices.push('The new statement could not be checked against project memory.');
      console.error(`Memory importance gate failed: ${error.message}`);
    }
  }
  const conflictContext = conflicts.map(({ target, pending }) =>
    `A proposed memory conflicts with an existing one. Do not say the new statement is already decided or saved as current. Tell the user the existing statement (“${target.content ?? target.text}”, recorded by ${target.createdByName || 'a teammate'}) conflicts with the new statement (“${pending.content ?? pending.text}”, stated by ${pending.createdByName || speaker}). Ask whether they want to keep the existing statement or override it with the new one. They can also withdraw their proposal using the chat controls.`
  ).join('\n');
  const savedThisTurn = changes.filter((c) => c.kind === 'created');
  const replyMessages = [
    { role: 'system', content: buildReplySystemContent({ projectName, speaker, memorySummary, savedThisTurn, conflictContext }) },
    ...history.map(({ role, text }) => ({ role, content: text })),
    { role: 'user', content: message }
  ];

  let reply;
  try { reply = await callLLM({ role: 'smart', messages: replyMessages }); }
  catch (error) {
    reply = 'I could not reach an assistant model just now. Your project memory is still available; please try again shortly.';
    notices.push('The assistant provider is temporarily unavailable.');
    console.error(`Reply generation failed: ${error.message}`);
  }
  if (conflicts.length) {
    const { target, pending } = conflicts[0];
    const oldValue = target.content ?? target.text;
    const newValue = pending.content ?? pending.text;
    reply = `You previously saved “${oldValue}” as the current project decision. You now suggested “${newValue}”. Would you like to keep the existing decision or override it with “${newValue}”? Choose an option below.`;
  }

  res.json({
    reply,
    used: used.map((entry) => ({ ...entry, memory: safeMemory(entry.memory) })),
    changes,
    conflicts: conflicts.map((conflict) => ({ ...conflict, pending: safeMemory(conflict.pending), target: safeMemory(conflict.target) })),
    notices,
    agent: config.agentMode === 'on' ? { ran: true, fellBack: true, steps: [] } : { ran: false, steps: [] }, awaiting: null
  });
  persistConversation(session, message, reply, messageMeta(used, changes));
});

export default router;
