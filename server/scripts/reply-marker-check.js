// Integration check: raw memory markers must not appear in rendered assistant replies.
// Runs in Node with no external test runner – exit 0 = PASS, exit 1 = FAIL.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import esbuild from 'file:///C:/UI/prac/hi/865994/web/node_modules/esbuild/lib/main.js'
import React from 'file:///C:/UI/prac/hi/865994/web/node_modules/react/index.js'
import ReactDOMServer from 'file:///C:/UI/prac/hi/865994/web/node_modules/react-dom/server.node.js'
import { formatRecalledMemories, REPLY_SYSTEM_PROMPT } from '../services/prompts.js'

// ─── helper: transpile ChatMessage.jsx to a module loadable in Node ──────────
const buildChatMessageModule = () => {
  let source = fs.readFileSync(
    'c:/UI/prac/hi/865994/web/src/components/ChatMessage.jsx',
    'utf8'
  )
  // Stub icon imports – not needed for rendering text
  source = source.replace(
    "import { Sparkles, Check, AlertTriangle } from 'lucide-react'",
    'const Sparkles = () => null; const Check = () => null; const AlertTriangle = () => null;'
  )
  // Inject react import so the data-URL module resolves it
  source =
    "import React from 'file:///C:/UI/prac/hi/865994/web/node_modules/react/index.js';\n" +
    source

  const { code } = esbuild.transformSync(source, { loader: 'jsx', format: 'esm' })
  return 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
}

// ─── Test 1: sanitizeReplyText strips the marker ──────────────────────────────
{
  const { sanitizeReplyText } = await import(buildChatMessageModule())

  const marker = '【6ae09909f70d1dbe719c2216 – decision · by himesh_02】'
  const input = `You chose PostgreSQL earlier ${marker} for persistent storage.`
  const output = sanitizeReplyText(input)

  assert.ok(
    !output.includes('6ae09909f70d1dbe719c2216'),
    'FAIL: sanitizeReplyText must remove the 【...】 marker'
  )
  assert.ok(
    output.includes('You chose PostgreSQL'),
    'FAIL: sanitizeReplyText must keep the surrounding text'
  )
  assert.equal(input, `You chose PostgreSQL earlier ${marker} for persistent storage.`,
    'FAIL: original string must not be modified'
  )
  console.log('PASS 1: sanitizeReplyText strips 【hex-id…】 and preserves surrounding text')
}

// ─── Test 2: [hex-id …] square-bracket form is also stripped ─────────────────
{
  const { sanitizeReplyText } = await import(buildChatMessageModule())

  const input = 'We agreed [6ae09909f70d1dbe719c2216 decision] on this.'
  const output = sanitizeReplyText(input)

  assert.ok(
    !output.includes('6ae09909f70d1dbe719c2216'),
    'FAIL: sanitizeReplyText must also remove the [...] square-bracket marker form'
  )
  console.log('PASS 2: sanitizeReplyText strips [hex-id …] (square-bracket form)')
}

// ─── Test 3: marker absent from React-rendered HTML ──────────────────────────
{
  const { default: ChatMessage } = await import(buildChatMessageModule())

  const marker = '【6ae09909f70d1dbe719c2216 – decision · by himesh_02】'
  const replyText = `Here is the answer ${marker} inline.`
  const message = { role: 'assistant', text: replyText }

  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(ChatMessage, { message })
  )

  assert.ok(
    !html.includes('6ae09909f70d1dbe719c2216'),
    'FAIL: rendered HTML must not contain the raw memory marker id'
  )
  assert.ok(
    html.includes('Here is the answer'),
    'FAIL: rendered HTML must contain the clean reply text'
  )
  assert.equal(
    message.text,
    replyText,
    'FAIL: the stored message.text must not be mutated by rendering'
  )
  console.log('PASS 3: ChatMessage component renders without the memory marker in HTML')
}

// ─── Test 4: formatRecalledMemories returns plain fields, no id in text ───────
{
  const fakeMemories = [
    {
      memory: {
        _id: '6ae09909f70d1dbe719c2216',
        type: 'decision',
        content: 'Use PostgreSQL for the database.',
        reason: 'Better relational support.',
        createdByName: 'himesh_02',
        createdAt: new Date('2026-10-01T00:00:00Z')
      }
    }
  ]
  const result = formatRecalledMemories(fakeMemories)

  assert.ok(Array.isArray(result), 'FAIL: formatRecalledMemories must return an array')
  const item = result[0]
  assert.equal(item.type, 'decision', 'FAIL: item.type must be "decision"')
  assert.equal(item.content, 'Use PostgreSQL for the database.', 'FAIL: item.content must be the memory content')
  assert.equal(item.author, 'himesh_02', 'FAIL: item.author must be the creator name')
  assert.ok(typeof item.date === 'string', 'FAIL: item.date must be a string')
  assert.equal(typeof item.id, 'undefined', 'FAIL: item.id must not be exposed in the plain-fields object')
  assert.equal(typeof item.text, 'undefined', 'FAIL: item.text (old bracket format) must not be present')

  const json = JSON.stringify(item)
  assert.ok(
    !json.includes('6ae09909f70d1dbe719c2216'),
    'FAIL: the memory id must not appear in the serialised context object'
  )
  console.log('PASS 4: formatRecalledMemories returns plain fields with no ids in the visible text')
}

// ─── Test 5: REPLY_SYSTEM_PROMPT contains the required instruction line ───────
{
  assert.ok(
    REPLY_SYSTEM_PROMPT.includes('Never print memory ids, brackets, or any marker'),
    'FAIL: REPLY_SYSTEM_PROMPT must include the marker-suppression instruction'
  )
  console.log('PASS 5: REPLY_SYSTEM_PROMPT contains the marker-suppression instruction')
}

console.log('\nAll checks passed.')

