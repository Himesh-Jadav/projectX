import { callLLM } from './llm.js';
import { EXTRACT_RECONCILE_SYSTEM_PROMPT } from './prompts.js';

const itemTypes = new Set(['decision', 'assumption', 'constraint', 'outcome']);
const actions = new Set(['new', 'duplicate', 'conflict', 'invalidate']);

function durationDate(duration, base) {
  if (duration == null) return null;
  if (typeof duration !== 'string') throw new TypeError('Duration must be an ISO-8601 string or null.');
  const match = duration.match(/^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match || duration === 'P' || duration === 'PT') throw new TypeError(`Invalid ISO-8601 duration: ${duration}`);
  const [, years = 0, months = 0, weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0] = match;
  const date = new Date(base);
  date.setUTCFullYear(date.getUTCFullYear() + Number(years));
  date.setUTCMonth(date.getUTCMonth() + Number(months));
  date.setTime(date.getTime() + ((Number(weeks) * 7 + Number(days)) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000);
  return date;
}

function validate(payload, base = new Date()) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items) || !Array.isArray(payload.skipped)) {
    throw new TypeError('Expected an object with items[] and skipped[].');
  }
  const items = payload.items.map((item, index) => {
    if (!item || !itemTypes.has(item.type) || !actions.has(item.action)) throw new TypeError(`Item ${index} has an invalid type or action.`);
    if (typeof item.content !== 'string' || !item.content.trim() || typeof item.reason !== 'string') throw new TypeError(`Item ${index} is missing content or reason.`);
    if (typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1) throw new TypeError(`Item ${index} confidence must be between 0 and 1.`);
    const targetId = item.targetId ?? null;
    if (['duplicate', 'conflict', 'invalidate'].includes(item.action) && (typeof targetId !== 'string' || !targetId)) throw new TypeError(`Item ${index} action ${item.action} requires targetId.`);
    return {
      ...item, expiresIn: item.expiresIn ?? null, revisitIn: item.revisitIn ?? null,
      targetId, outcomeOf: item.outcomeOf ?? null,
      expiresAt: item.action === 'new' && item.expiresIn ? durationDate(item.expiresIn, base) : null,
      revisitAfter: item.action === 'new' && item.revisitIn ? durationDate(item.revisitIn, base) : null
    };
  });
  if (payload.skipped.some((entry) => !entry || typeof entry.reason !== 'string')) throw new TypeError('Every skipped item must have a reason.');
  return { items, skipped: payload.skipped };
}

export async function extractAndReconcile(message, recalledMemories = []) {
  const context = recalledMemories.map(({ memory }) => ({
    id: String(memory._id), type: memory.type, content: memory.content, reason: memory.reason, status: memory.status
  }));
  return callLLM({ role: 'fast', json: true, validate, messages: [
    { role: 'system', content: EXTRACT_RECONCILE_SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify({ userMessage: message, recalledMemories: context }) }
  ] });
}
