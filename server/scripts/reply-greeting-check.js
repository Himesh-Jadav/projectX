// Checks that a greeting with no memory written does not claim anything was saved.
// Exit 0 = PASS, exit 1 = FAIL.  Run with: npm run verify:reply-greeting
import assert from 'node:assert/strict'
import { buildReplySystemContent, formatRecalledMemories, REPLY_SYSTEM_PROMPT } from '../services/prompts.js'

const FORBIDDEN_SAVE_WORDS = ['recorded', 'saved', 'noted', 'remembered', 'storing', 'stored']

// ─── helpers ─────────────────────────────────────────────────────────────────
const containsSaveWord = (text) =>
  FORBIDDEN_SAVE_WORDS.some((w) => text.toLowerCase().includes(w))

// ─── Test 1: buildReplySystemContent with no saves contains the no-save directive ─
{
  const content = buildReplySystemContent({
    projectName: 'Demo',
    speaker: 'himesh_02',
    memorySummary: formatRecalledMemories([]),
    savedThisTurn: [],
    conflictContext: ''
  })

  assert.ok(
    content.includes('No memories were written this turn'),
    'FAIL: system content must include "No memories were written this turn" when savedThisTurn is empty'
  )
  assert.ok(
    content.includes('Do not claim anything was saved'),
    'FAIL: system content must include "Do not claim anything was saved" when savedThisTurn is empty'
  )
  console.log('PASS 1: empty savedThisTurn injects the no-save directive')
}

// ─── Test 2: with saves the saved block lists them and does NOT contain the no-save directive ─
{
  const savedThisTurn = [
    { kind: 'created', memory: { type: 'decision', content: 'Use PostgreSQL for the database.' } }
  ]
  const content = buildReplySystemContent({
    projectName: 'Demo',
    speaker: 'himesh_02',
    memorySummary: formatRecalledMemories([]),
    savedThisTurn,
    conflictContext: ''
  })

  assert.ok(
    content.includes('[decision] Use PostgreSQL for the database.'),
    'FAIL: system content must list the saved memory type and content'
  )
  assert.ok(
    !content.includes('No memories were written this turn'),
    'FAIL: system content must not include the no-save directive when saves exist'
  )
  console.log('PASS 2: non-empty savedThisTurn lists the saves and omits the no-save directive')
}

// ─── Test 3: REPLY_SYSTEM_PROMPT contains all three new rules ─────────────────
{
  assert.ok(
    REPLY_SYSTEM_PROMPT.includes('Never say or imply that you saved, recorded, noted or remembered'),
    'FAIL: REPLY_SYSTEM_PROMPT must include the no-announce-save rule'
  )
  assert.ok(
    REPLY_SYSTEM_PROMPT.includes('Do not repeat the user\'s message back'),
    'FAIL: REPLY_SYSTEM_PROMPT must include the no-repeat-message rule'
  )
  assert.ok(
    REPLY_SYSTEM_PROMPT.includes('Greetings and small talk get one short, friendly line'),
    'FAIL: REPLY_SYSTEM_PROMPT must include the greeting rule'
  )
  console.log('PASS 3: REPLY_SYSTEM_PROMPT contains all three new behavioural rules')
}

// ─── Test 4: a simulated greeting reply must not contain forbidden save words ─
// We simulate what the LLM *should* reply (and must not reply) for a greeting.
{
  // Correct: a short friendly response
  const goodReply = 'Hey! How can I help with your project today?'
  assert.ok(
    !containsSaveWord(goodReply),
    `FAIL: a correct greeting reply must not contain save words, got: "${goodReply}"`
  )

  // Bad: the old buggy pattern the model was producing
  const badReply = "Got it, 'hey there' from you, himesh_02. I've recorded that as a project note."
  assert.ok(
    containsSaveWord(badReply),
    'FAIL: the bad-reply fixture must contain a forbidden save word (sanity-check the detector)'
  )

  // Verify the system prompt injected for a greeting with no saves would prevent the bad reply
  const systemContent = buildReplySystemContent({
    projectName: 'Demo',
    speaker: 'himesh_02',
    memorySummary: formatRecalledMemories([]),
    savedThisTurn: [],
    conflictContext: ''
  })
  assert.ok(
    systemContent.includes('Greetings and small talk get one short, friendly line'),
    'FAIL: greeting system content must contain the greeting constraint'
  )
  assert.ok(
    systemContent.includes('Do not claim anything was saved'),
    'FAIL: greeting system content must forbid claiming saves'
  )
  console.log('PASS 4: greeting with no memory written produces a system prompt that forbids "recorded/saved/noted"')
}

console.log('\nAll checks passed.')

