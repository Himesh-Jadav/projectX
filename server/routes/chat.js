import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { connect, projects } from '../db.js';
import { appendRecentMessages, recallLongTerm, recentMessages, rememberExchange } from '../services/memoryService.js';
import { hasSecret } from '../services/secrets.js';
import { callLLM } from '../services/llm.js';
import { formatRecalledMemories, REPLY_SYSTEM_PROMPT } from '../services/prompts.js';
import { requireAuth, requireProjectMember, userRateLimit } from '../middleware/auth.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireProjectMember, userRateLimit);
const safeMemory = (memory) => {
  if (!memory) return memory;
  const { embedding, ...safe } = memory;
  return safe;
};

router.post('/', async (req, res, next) => {
  const { sessionId, message, memoryEnabled = true } = req.body ?? {};
  if (typeof sessionId !== 'string' || !sessionId.trim() || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'sessionId and message are required.' });
  }
  if (typeof memoryEnabled !== 'boolean') return res.status(400).json({ error: 'memoryEnabled must be a boolean.' });

  const userId = String(req.user._id);
  const projectId = String(req.params.projectId);
  const speaker = req.user.username;
  const session = { userId, projectId, sessionId };
  const notices = [];
  if (hasSecret(message)) {
    notices.push('Not saved: looks like a secret.');
    return res.json({
      reply: 'That looks like a secret or credential. I have not stored it or sent it for analysis. If it is real, rotate it before continuing.',
      used: [], changes: [], conflicts: [], notices
    });
  }

  let history = [];
  let used = [];
  if (memoryEnabled) {
    history = await recentMessages(session);
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
  if (asksProjectName && projectName) {
    const reply = `The project is named ${projectName}.`;
    if (memoryEnabled) {
      await appendRecentMessages(session, [{ role: 'user', text: message }, { role: 'assistant', text: reply }]);
    }
    return res.json({ reply, used: used.map((entry) => ({ ...entry, memory: safeMemory(entry.memory) })), changes: [], conflicts: [], notices });
  }

  const changes = [];
  const conflicts = [];
  const userMessageId = new ObjectId();
  if (memoryEnabled) {
    try {
      const result = await rememberExchange({ userId, projectId, speaker, message, sourceMessageId: userMessageId, existingMemoryCandidates: used.map(({ memory }) => memory) });
      if (result?.kind === 'created') changes.push({ kind: 'created', memory: result.memory });
      if (result?.kind === 'conflict') conflicts.push(result);
    } catch (error) {
      notices.push('The new statement could not be checked against project memory.');
      console.error(`Memory importance gate failed: ${error.message}`);
    }
  }
  const conflictContext = conflicts.map(({ target, pending }) =>
    `A proposed memory conflicts with an existing one. Do not say the new statement is already decided or saved as current. Tell the user the existing statement (“${target.content ?? target.text}”, recorded by ${target.createdByName || 'a teammate'}) conflicts with the new statement (“${pending.content ?? pending.text}”, stated by ${pending.createdByName || speaker}). Ask whether they want to keep the existing statement or override it with the new one. They can also withdraw their proposal using the chat controls.`
  ).join('\n');
  const replyMessages = [
    { role: 'system', content: `${REPLY_SYSTEM_PROMPT}\n\nThe current project is ${projectName || 'unnamed'}. The current speaker is ${speaker}. Cite every memory with its creator's name.\n\nProject memories:\n${JSON.stringify(memorySummary)}${conflictContext ? `\n\nConflict to resolve:\n${conflictContext}` : ''}` },
    ...history.map(({ role, text }) => ({ role, content: text })),
    { role: 'user', content: `${speaker} says: ${message}` }
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

  if (memoryEnabled) {
    await appendRecentMessages(session, [{ role: 'user', text: message }, { role: 'assistant', text: reply }]);
  }

  res.json({
    reply,
    used: used.map((entry) => ({ ...entry, memory: safeMemory(entry.memory) })),
    changes,
    conflicts: conflicts.map((conflict) => ({ ...conflict, pending: safeMemory(conflict.pending), target: safeMemory(conflict.target) })),
    notices
  });
});

export default router;
