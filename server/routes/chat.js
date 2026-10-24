import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { config } from '../config.js';
import { connect, messages } from '../db.js';
import { recall, saveMemory, confirmMemory, invalidate } from '../services/memory.js';
import { extractAndReconcile } from '../services/extract.js';
import { hasSecret } from '../services/secrets.js';
import { callLLM } from '../services/llm.js';
import { formatRecalledMemories, REPLY_SYSTEM_PROMPT } from '../services/prompts.js';

const router = Router();
const safeMemory = (memory) => {
  if (!memory) return memory;
  const { embedding, ...safe } = memory;
  return safe;
};

router.post('/', async (req, res) => {
  const { sessionId, message, memoryEnabled = true } = req.body ?? {};
  if (typeof sessionId !== 'string' || !sessionId.trim() || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'sessionId and message are required.' });
  }
  if (typeof memoryEnabled !== 'boolean') return res.status(400).json({ error: 'memoryEnabled must be a boolean.' });

  const userId = config.demoUserId;
  const projectId = config.demoProjectId;
  const notices = [];
  const secretDetected = hasSecret(message);
  if (secretDetected) {
    notices.push('Not saved: looks like a secret.');
    return res.json({
      reply: 'That looks like a secret or credential. I have not stored it or sent it for analysis. If it is real, rotate it before continuing.',
      used: [], changes: [], conflicts: [], notices
    });
  }

  let used = [];
  if (memoryEnabled) {
    try { used = await recall(message, { userId, projectId }); }
    catch (error) { notices.push('Memory recall was unavailable for this reply.'); console.error(`Memory recall failed: ${error.message}`); }
  }

  let history = [];
  if (memoryEnabled) {
    try {
      await connect();
      history = await messages.find({ sessionId, userId, projectId }).sort({ createdAt: -1 }).limit(6).toArray();
      history.reverse();
    } catch (error) { console.error(`Chat history lookup failed: ${error.message}`); }
  }

  const memorySummary = formatRecalledMemories(used);
  const replyMessages = [
    { role: 'system', content: `${REPLY_SYSTEM_PROMPT}\n\nProject memories:\n${JSON.stringify(memorySummary)}` },
    ...history.map(({ role, text }) => ({ role, content: text })),
    { role: 'user', content: message }
  ];

  const settled = await Promise.allSettled([
    callLLM({ role: 'smart', messages: replyMessages }),
    memoryEnabled ? extractAndReconcile(message, used) : Promise.resolve(null)
  ]);
  let reply;
  if (settled[0].status === 'fulfilled') reply = settled[0].value;
  else {
    reply = 'I could not reach an assistant model just now. Your project memory is still available; please try again shortly.';
    notices.push('The assistant provider is temporarily unavailable.');
    console.error(`Reply generation failed: ${settled[0].reason?.message ?? settled[0].reason}`);
  }

  const changes = [];
  const conflicts = [];
  if (memoryEnabled && settled[1].status === 'rejected') {
    notices.push("Couldn't update memory this time.");
    console.error(`Memory extraction failed: ${settled[1].reason?.message ?? settled[1].reason}`);
  }

  const userMessageId = new ObjectId();
  const assistantMessageId = new ObjectId();
  if (memoryEnabled && settled[1].status === 'fulfilled' && settled[1].value) {
    const extracted = settled[1].value;
    if (extracted.skipped.length) notices.push('Some content was skipped and not saved.');
    for (const item of extracted.items) {
      try {
        const target = item.targetId ? used.find(({ memory }) => String(memory._id) === item.targetId)?.memory : null;
        if (item.action === 'new') {
          const saved = await saveMemory({
            userId, projectId, type: item.type, content: item.content, reason: item.reason,
            confidence: item.confidence, expiresAt: item.expiresAt, revisitAfter: item.revisitAfter,
            outcomeOf: item.outcomeOf ? new ObjectId(item.outcomeOf) : null,
            source: { sessionId, messageId: userMessageId, quote: message }
          });
          changes.push({ kind: 'created', memory: safeMemory(saved) });
        } else if (item.action === 'duplicate') {
          if (!target) throw new Error('The duplicate target was not among recalled memories.');
          const confirmed = await confirmMemory(target._id);
          changes.push({ kind: 'confirmed', memory: safeMemory(confirmed) });
        } else if (item.action === 'conflict') {
          if (!target || target.status !== 'active') throw new Error('The conflict target was not an active recalled memory.');
          const pending = await saveMemory({
            userId, projectId, type: item.type, content: item.content, reason: item.reason,
            confidence: item.confidence, status: 'pending', targetOf: target._id,
            outcomeOf: item.outcomeOf ? new ObjectId(item.outcomeOf) : null,
            source: { sessionId, messageId: userMessageId, quote: message }
          });
          conflicts.push({ pending: safeMemory(pending), target: safeMemory(target) });
          changes.push({ kind: 'conflict_held', memory: safeMemory(pending) });
        } else if (item.action === 'invalidate') {
          if (!target) throw new Error('The invalidation target was not among recalled memories.');
          const invalidated = await invalidate(target._id, item.reason || 'Marked as no longer true by the user.');
          changes.push({ kind: 'invalidated', memory: safeMemory(invalidated) });
        }
      } catch (error) {
        notices.push('A memory change could not be applied.');
        console.error(`Memory action failed (${item.action}): ${error.message}`);
      }
    }
  }

  if (memoryEnabled) {
    try {
      await connect();
      const timestamp = new Date();
      await messages.insertMany([
        { _id: userMessageId, sessionId, userId, projectId, role: 'user', text: message, retrievedMemoryIds: used.map(({ memory }) => memory._id), memoryChanges: changes.map(({ kind, memory }) => ({ kind, memoryId: memory?._id })), createdAt: timestamp },
        { _id: assistantMessageId, sessionId, userId, projectId, role: 'assistant', text: reply, retrievedMemoryIds: used.map(({ memory }) => memory._id), memoryChanges: changes.map(({ kind, memory }) => ({ kind, memoryId: memory?._id })), createdAt: new Date(timestamp.getTime() + 1) }
      ]);
    } catch (error) {
      notices.push('Chat history could not be saved.');
      console.error(`Chat message write failed: ${error.message}`);
    }
  }

  return res.json({
    reply,
    used: used.map((entry) => ({ ...entry, memory: safeMemory(entry.memory) })),
    changes,
    conflicts,
    notices
  });
});

export default router;
