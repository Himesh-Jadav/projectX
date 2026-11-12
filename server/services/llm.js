import { config } from '../config.js';

const TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS) || 8_000
const EXTRACTION_TIMEOUT_MS = 20_000
const COOLDOWN_MS = 60_000
const MAX_ATTEMPTS = 3;
const cooldowns = new Map();

// ---------------------------------------------------------------------------
// Call counter – used by verify:all to enforce the 60-call hard cap.
// Incremented once per outbound HTTP request to a model or embedding provider.
// Reset between test runs with resetCallCounter().
// ---------------------------------------------------------------------------
const callStats = {
  total: 0,
  modelCalls: 0,
  embeddingCalls: 0,
  byProvider: { groq: 0, gemini: 0, openrouter: 0 },
  byRole: { fast: 0, smart: 0, embedding: 0 }
}

export const getCallStats = () => ({
  total: callStats.total,
  modelCalls: callStats.modelCalls,
  embeddingCalls: callStats.embeddingCalls,
  byProvider: { ...callStats.byProvider },
  byRole: { ...callStats.byRole }
})

export const getCallCount = () => callStats.modelCalls
export const getCallsByCaller = () => ({ ...callStats.byProvider })

export const resetCallStats = () => {
  callStats.total = 0
  callStats.modelCalls = 0
  callStats.embeddingCalls = 0
  callStats.byProvider = { groq: 0, gemini: 0, openrouter: 0 }
  callStats.byRole = { fast: 0, smart: 0, embedding: 0 }
}
export const resetCallCounter = resetCallStats

export const recordModelCall = (providerName, role) => {
  callStats.total += 1
  callStats.modelCalls += 1
  callStats.byProvider[providerName] = (callStats.byProvider[providerName] ?? 0) + 1
  callStats.byRole[role] = (callStats.byRole[role] ?? 0) + 1
}

export const recordEmbeddingCall = (providerName = 'gemini', role = 'embedding') => {
  callStats.total += 1
  callStats.embeddingCalls += 1
  callStats.byProvider[providerName] = (callStats.byProvider[providerName] ?? 0) + 1
  callStats.byRole[role] = (callStats.byRole[role] ?? 0) + 1
}

export const setCallHardCap = () => {}

export class LLMProviderError extends Error {
  constructor(message, options = {}) { super(message, options); this.name = 'LLMProviderError'; this.code = 'LLM_PROVIDER_ERROR'; }
}
export class LLMJSONError extends Error {
  constructor(message, options = {}) { super(message, options); this.name = 'LLMJSONError'; this.code = 'LLM_INVALID_JSON'; }
}

function providersFor(role) {
  const fast = role === 'fast';
  return [
    { name: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', keys: config.groqApiKeys, model: fast ? config.fastModel : config.smartModel },
    { name: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', keys: config.geminiApiKeys, model: fast ? config.geminiFastModel : config.geminiSmartModel },
    { name: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions', keys: config.openrouterApiKeys, model: fast ? config.openrouterFastModel : config.openrouterSmartModel }
  ];
}

function parseJSON(content, strict = false) {
  return JSON.parse(strict ? content.trim() : content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}

async function completion(role, messages, json, outerSignal) {
  let attempts = 0;
  let lastError;
  const now = Date.now();

  for (const provider of providersFor(role)) {
    for (const key of provider.keys) {
      if (attempts >= MAX_ATTEMPTS) break;
      const cooldownKey = `${provider.name}:${key}`;
      if ((cooldowns.get(cooldownKey) ?? 0) > now) continue;
      attempts += 1;
      const controller = new AbortController();
      const relayAbort = () => controller.abort(outerSignal?.reason);
      if (outerSignal?.aborted) relayAbort();
      else outerSignal?.addEventListener('abort', relayAbort, { once: true });
      const timeoutMs = json ? EXTRACTION_TIMEOUT_MS : TIMEOUT_MS;
      const timer = setTimeout(() => controller.abort(new Error(`Timeout after ${timeoutMs / 1000} seconds`)), timeoutMs);
      try {
        const response = await fetch(provider.url, {
          method: 'POST', signal: controller.signal,
          headers: {
            'content-type': 'application/json', authorization: `Bearer ${key}`,
            ...(provider.name === 'openrouter' ? { 'HTTP-Referer': 'https://smaran.ai', 'X-Title': 'Smaran.ai' } : {})
          },
          body: JSON.stringify({
            model: provider.model, messages, temperature: 0.2,
            // Structured extraction needs room for both reasoning and the full JSON object.
            max_tokens: json ? 2048 : role === 'fast' ? 300 : 900,
            ...(json ? { response_format: { type: 'json_object' } } : {})
          })
        });
        // Count every outbound attempt before reading the result.
        recordModelCall(provider.name, role)
        if (response.ok) {
          const payload = await response.json();
          const content = payload.choices?.[0]?.message?.content;
          if (typeof content !== 'string') throw new LLMProviderError(`${provider.name} returned no message content.`);
          return content;
        }
        const detail = await response.text().catch(() => '');
        lastError = new LLMProviderError(`${provider.name} returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ''}`)
        if (response.status === 429 || response.status >= 500) {
          const retryHeader = response.headers?.get?.('retry-after')
          const retrySec = retryHeader ? Number(retryHeader) : NaN
          const cooldownDuration = Number.isFinite(retrySec) && retrySec > 0 ? retrySec * 1000 : COOLDOWN_MS
          cooldowns.set(cooldownKey, Date.now() + cooldownDuration)
        }
      } catch (error) {
        if (outerSignal?.aborted) throw new LLMProviderError('LLM request aborted.', { cause: outerSignal.reason ?? error });
        lastError = error.name === 'AbortError' || controller.signal.aborted
          ? new LLMProviderError(`${provider.name} timed out after ${timeoutMs / 1000} seconds.`, { cause: error }) : error;
        if (controller.signal.aborted) cooldowns.set(cooldownKey, Date.now() + COOLDOWN_MS);
      } finally { clearTimeout(timer); outerSignal?.removeEventListener('abort', relayAbort); }
    }
    if (attempts >= MAX_ATTEMPTS) break;
  }
  if (attempts === 0) throw new LLMProviderError('All configured LLM keys are cooling down or no provider keys are configured.');
  throw lastError ?? new LLMProviderError('All LLM providers failed.');
}

export async function callLLM({ role, messages, json = false, validate, signal, strictJSON = false }) {
  if (!['fast', 'smart'].includes(role)) throw new TypeError('role must be "fast" or "smart".');
  if (!Array.isArray(messages) || messages.length === 0) throw new TypeError('messages must be a non-empty array.');
  if (!json) return completion(role, messages, false, signal);

  let repairMessages = messages;
  let parseError;
  for (let repair = 0; repair < 2; repair += 1) {
    let content;
    try { content = await completion(role, repairMessages, true, signal); }
    catch (error) {
      if (repair === 1) throw new LLMJSONError('LLM could not repair its invalid JSON response.', { cause: error });
      throw error;
    }
    try {
      const parsed = parseJSON(content, strictJSON);
      return typeof validate === 'function' ? validate(parsed) : parsed;
    }
    catch (error) {
      parseError = error;
      if (strictJSON) throw new LLMJSONError('LLM returned invalid strict JSON.', { cause: error });
      if (repair === 0) repairMessages = [...messages,
        { role: 'assistant', content },
        { role: 'user', content: `Repair the previous response. Return only one valid JSON object that follows the requested schema. Do not add markdown or explanation. Validation error: ${error.message}` }
      ];
    }
  }
  throw new LLMJSONError('LLM returned invalid JSON after one repair attempt.', { cause: parseError });
}
