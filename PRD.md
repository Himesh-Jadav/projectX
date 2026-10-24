# Hindsight: PRD

**A long-running decision assistant with persistent memory**
MongoDB Student Hackathon · Track 1: Agentic Memory
Version 1.0 · 24 Oct 2026 · Build window: 4-5 hours · One builder, vibe coding with Codex

---

## 1. One-line pitch

Hindsight is a chat assistant for a long-running project. It quietly remembers the **decisions, assumptions, and constraints** you talk about, and uses them to push back, warn, and advise in later sessions. It also knows when a memory is wrong, replaced, or expired.

## 2. The problem

On any long project, people forget *why* something was decided. Three months later someone proposes the opposite, nobody remembers the reasoning, and the same debate happens again. Normal chatbots make this worse because every new chat starts from zero.

Hindsight fixes that. The assistant carries the project's reasoning forward and changes its answers because of it.

## 3. Goals and non-goals

**Goals**
1. Build a working end-to-end loop: say something in session 1, see it change the answer in session 2.
2. Make memory **inspectable**: the user can see what was recalled, why it was picked, and where it came from.
3. Handle the hard cases properly: correction, conflict, expiry, deletion, and secrets.
4. Use MongoDB for what it is good at: flexible memory documents, Vector Search with metadata filters, and TTL indexes.
5. Be repeatable: one command sets up the database, one command loads demo data.

**Non-goals (do not build these)**
- Login, signup, or multiple real users (one hardcoded user)
- Multiple projects UI (one hardcoded project, but every query still filters by `projectId`)
- Mobile app, notifications, email
- Fine-tuning or training anything

## 4. Hackathon alignment

This table is the checklist for the judges. Every row has to be visible in the demo.

| Track requirement | How Hindsight meets it | Where it shows in the demo |
|---|---|---|
| Persistent memory across sessions | Memory belongs to the project, not the chat thread. New chat, same memory. | Click "New session" and ask a related question |
| Decide **what** to remember | Extractor keeps only commitments: decisions, assumptions, constraints, outcomes. Chit-chat is ignored. | Chat shows "3 memories saved" after a real statement and nothing after small talk |
| Decide **how** it is retrieved | Atlas Vector Search, filtered by user, project, status, and not-expired | "Used in this reply" panel |
| Decide **when** to update, correct, forget | Reconcile step: new, duplicate, conflict, supersede, invalidate. TTL for temporary things. Hard delete on request. | Conflict card, timeline, expiry, delete |
| Memory **visibly changes** the next response | Reply cites the memory by date and reason, and the UI shows which memories were used | "Postgres?" gets pushback citing the MongoDB decision |
| Inspect stored memory and **why selected** | Score breakdown per memory (similarity, confidence, final) plus a one-line reason | Memory panel, plus opening the raw document in Atlas |
| One difficult case | We show five: correction, conflict, expiry, deletion, secret | Demo script, section 14 |
| Memory as documents: owner, type, content, source, timestamps, lifecycle | See section 7 | Atlas document view |
| Vector Search with filters | Section 9 | Retrieval |
| TTL index for expiry | `expiresAt` + TTL index | Temporary-constraint demo |
| Change streams (when multi-user/agent) | Stretch goal only. Memory panel live-updates from a change stream so two tabs stay in sync. | Optional |

## 5. Who it is for

**Primary user:** a founder or lead developer running a project over weeks or months, who makes lots of small decisions in chat and loses the reasoning later.

**Demo project (fictional):** *QuickBite*, a food-ordering app for college canteens.

## 6. Core concept: the memory loop

Every user message goes through this loop.

```
 user message
     │
     ▼
 1. EMBED      turn the message into a vector
     │
     ▼
 2. RECALL     Vector Search over this project's active memories (top 5)
     │
     ├──────────────► 3a. REPLY     LLM answers using recalled memories
     │
     └──────────────► 3b. EXTRACT + RECONCILE    LLM finds new decisions/assumptions/
                                                 constraints and compares them to
                                                 recalled memories
     │
     ▼
 4. WRITE      save new / bump duplicate / hold conflict / invalidate
     │
     ▼
 5. RETURN     reply + memories used (with scores) + memory changes
```

Steps 3a and 3b run **in parallel** to keep latency low. Memory is read before the reply and written after it, so the next message already benefits.

## 7. Memory model

### 7.1 Memory types

| Type | Meaning | Example |
|---|---|---|
| `decision` | A choice that was made | "Use MongoDB for orders" |
| `assumption` | Something believed true but not verified | "Most users will be on mobile" |
| `constraint` | A limit we must respect, sometimes temporary | "No paid APIs until Friday" |
| `outcome` | What actually happened after a decision | "Postgres migration took 2 days" |

### 7.2 Lifecycle

```
            ┌──────────── user confirms override ───────────┐
            │                                               ▼
 [pending] ─┴─ user says keep ──► deleted        [active] ──► [superseded]
                                                    │  ▲          (replaced by a newer memory)
                         user says "that's no       │  │
                         longer true" ─────────────►│  └── re-confirmed (lastConfirmedAt updated)
                                                    ▼
                                                [invalid]     (wrong or dropped, kept for history)

 expiresAt passes ──► document is removed by the TTL index
 user clicks delete ─► document is hard-deleted
```

- **active**: used in retrieval.
- **pending**: a new memory that contradicts an existing one and is waiting for the user's Override or Keep. Never used in retrieval.
- **superseded**: replaced by a newer memory. Kept so the timeline can show the chain. Not used in retrieval.
- **invalid**: user said it is wrong or dropped. Kept for history. Not used in retrieval.

### 7.3 `memories` document

```json
{
  "_id": "ObjectId",
  "userId": "demo-user",
  "projectId": "quickbite",
  "type": "decision",
  "content": "Use MongoDB as the main database",
  "reason": "Menus and orders have flexible shapes; we must ship in 5 days",
  "status": "active",
  "confidence": 0.9,
  "private": false,

  "source": {
    "sessionId": "s_01",
    "messageId": "m_014",
    "quote": "We're using MongoDB because the menus are flexible..."
  },

  "supersedes": null,
  "supersededBy": null,
  "targetOf": null,
  "invalidReason": null,
  "outcomeOf": null,

  "createdAt": "2026-10-24T10:00:00Z",
  "updatedAt": "2026-10-24T10:00:00Z",
  "lastConfirmedAt": "2026-10-24T10:00:00Z",
  "confirmCount": 1,
  "revisitAfter": null,
  "expiresAt": null,

  "embedding": [0.012, -0.044, "... 768 numbers"],
  "embeddingModel": "gemini-embedding-001"
}
```

Notes on fields:
- `revisitAfter`: only on assumptions. Drives check-ins.
- `expiresAt`: only on temporary constraints. Drives TTL.
- `outcomeOf`: only on outcomes. Points to the decision's `_id`.
- `supersedes` / `supersededBy`: the chain used by the timeline.
- `source.quote`: the exact user words the memory came from. This is what makes "why do you remember this?" answerable.
- `embeddingModel`: stored so we never mix vectors from different models.

### 7.4 Other collections

**`messages`**: chat history. `{ sessionId, userId, projectId, role, text, retrievedMemoryIds[], memoryChanges[], createdAt }`

**`memory_events`**: audit trail. `{ memoryId, event: created|confirmed|superseded|invalidated|deleted|conflict_held|conflict_rejected, at, details }`. When a memory is deleted, the event stores **no content**, only that a deletion happened.

## 8. Indexes

**Vector index** on `memories` (name: `memory_vector`):

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "userId" },
    { "type": "filter", "path": "projectId" },
    { "type": "filter", "path": "status" },
    { "type": "filter", "path": "type" }
  ]
}
```

`numDimensions` **must** match the embedding model's output. We request 768 dimensions from `gemini-embedding-001`.

**TTL index** on `memories`: `{ expiresAt: 1 }` with `expireAfterSeconds: 0`. Documents without `expiresAt` are ignored by TTL.

**Normal indexes:** `{ userId, projectId, status, createdAt }` for the memory list; `{ sessionId, createdAt }` on `messages`.

**Two things to know before building:**
1. The TTL cleanup job runs roughly once a minute, so a memory can outlive its `expiresAt` by up to about a minute. Retrieval therefore also drops anything where `expiresAt <= now`, so behaviour is correct to the second.
2. A newly inserted document takes a few seconds before Vector Search can find it. Seed data ahead of the demo, and never test "insert then search" in the same instant.

## 9. Retrieval design

1. Embed the user message with task type `RETRIEVAL_QUERY` (memories are embedded with `RETRIEVAL_DOCUMENT`).
2. Run `$vectorSearch` with `filter: { userId, projectId, status: "active" }`, `numCandidates: 100`, `limit: 8`.
3. App-side: drop anything with `expiresAt <= now`.
4. Keep only results with similarity ≥ **0.55** (tune on build day).
5. Compute `finalScore = similarity × confidence`. Keep the top **5**.
6. For each decision returned, also pull its linked `outcome` memories (if any).
7. Return each memory with a **score breakdown** and a one-line **why** (for example: "Matched your message about the database; decision from Oct 24").

Retrieval always returns the breakdown so the UI can show it. That is the "why was this selected" requirement.

## 10. LLM behaviour

### 10.1 Reply call

System prompt rules:
- You are a project advisor with access to the project's memory (provided below).
- If the user's message conflicts with a memory, say so **plainly**, cite the memory's date and reason, and ask whether they want to override it.
- If a constraint applies to what the user is asking, mention it.
- If an assumption is due for review, mention it once.
- If no memory is relevant, answer normally and do not invent memories.
- Never claim a memory exists that was not provided.

### 10.2 Extract + reconcile call (one call, JSON out)

Input: the user message, plus the recalled memories (with ids).
Output:

```json
{
  "items": [
    {
      "type": "decision | assumption | constraint | outcome",
      "content": "short, standalone statement",
      "reason": "why, in the user's words if possible",
      "confidence": 0.0,
      "expiresIn": "ISO-8601 duration or null",
      "revisitIn": "ISO-8601 duration or null",
      "action": "new | duplicate | conflict | invalidate",
      "targetId": "memory id or null",
      "outcomeOf": "memory id or null"
    }
  ],
  "skipped": [{ "reason": "looks like a secret" }]
}
```

Extraction rules (precision beats recall; a noisy memory is worse than a missed one):
- Only extract something the user **committed to or stated as true**. Questions, brainstorming, and "maybe" are not memories.
- Make each `content` understandable on its own, without the chat.
- Convert relative time ("until Friday", "for 2 minutes") into `expiresIn`.
- `duplicate` means the same meaning as an existing active memory.
- `conflict` means it contradicts an existing active memory but the user did not say the old one is dead. Needs confirmation.
- `invalidate` means the user said the old one is dropped, wrong, or no longer true. Applies directly.
- **Never store** passwords, API keys, tokens, card numbers, government IDs, or private personal details. Put them in `skipped`.

### 10.3 Secret guard (before any LLM call)

A regex pass catches obvious secrets (`sk-...`, `AKIA...`, long random tokens, password-looking text, card-number shapes). If it hits, the message is still answered but is **never sent to the extractor** and nothing is stored. The UI shows "Not saved: looks like a secret."

## 11. Functional requirements

**P0 = must exist for the demo. P1 = strong upgrade. P2 = only if time is left.**

| ID | Requirement | Pri | Acceptance test |
|---|---|---|---|
| FR-01 | Chat with the assistant inside one project | P0 | Send a message, get a reply |
| FR-02 | Extract decisions, assumptions, constraints from each message | P0 | "We use MongoDB because X" creates a decision with a reason |
| FR-03 | Store each as a document with owner, type, content, source, timestamps, lifecycle, embedding | P0 | Document visible in Atlas with all fields |
| FR-04 | Recall by Vector Search filtered by user, project, active, not expired | P0 | Unrelated project/user/superseded memories never come back |
| FR-05 | Recalled memory visibly changes the reply | P0 | Postgres message gets a reply citing the MongoDB decision |
| FR-06 | Memory panel shows used memories with scores and why | P0 | Panel updates after every reply |
| FR-07 | Memory persists across sessions | P0 | "New session" then ask about an earlier decision |
| FR-08 | Conflict detection with Override / Keep card | P0 | Override flips old to superseded and new to active |
| FR-09 | Chat-based correction ("we dropped X") invalidates a memory | P0 | Old memory leaves retrieval, stays in history |
| FR-10 | Temporary constraints expire via TTL (plus retrieval backstop) | P0 | A 2-minute constraint stops warning after 2 minutes |
| FR-11 | Delete a memory permanently | P0 | Gone from Atlas and never retrieved again |
| FR-12 | Secret guard | P0 | A pasted key is not stored and the UI says so |
| FR-13 | `npm run setup` creates indexes; `npm run seed` loads demo data; `npm run demo:reset` wipes and reseeds | P0 | Fresh clone works in under 5 minutes |
| FR-14 | LLM provider fallback chain | P0 | Kill the first key; the app still replies |
| FR-15 | "Memory on/off" toggle to show before/after | P1 | Same message gives a generic reply with memory off |
| FR-16 | Supersede timeline view | P1 | Shows MongoDB → Postgres with dates and reasons |
| FR-17 | Assumption check-ins at session start | P1 | Overdue assumption is raised once, answer updates it |
| FR-18 | Outcome tracking | P1 | "Migration took 2 days" attaches to the decision and appears in later advice |
| FR-19 | Live panel via change stream (two tabs stay in sync) | P2 | Edit in tab A appears in tab B |
| FR-20 | Recency/confidence decay in ranking | P2 | Old unconfirmed memories rank lower |
| FR-21 | Private flag and export | P2 | Private memories excluded from export |

## 12. System design

### 12.1 Stack (decided)

- **Backend:** Node 20 + Express, official `mongodb` driver, plain JavaScript
- **Frontend:** React + Vite, plain CSS, no UI library
- **Database:** MongoDB Atlas free (M0) cluster
- **LLMs:** Groq (primary) → Gemini (fallback) → OpenRouter free (last resort), all through OpenAI-compatible calls
- **Embeddings:** `gemini-embedding-001`, 768 dimensions

### 12.2 Folder structure

```
hindsight/
  .env.example
  package.json
  server/
    index.js              Express app
    config.js             env + constants
    db.js                 Mongo connection
    routes/
      chat.js             POST /api/chat
      memories.js         list, resolve, delete, timeline
      session.js          session start + check-ins
    services/
      llm.js              provider wrapper with fallback
      embeddings.js       embed docs / queries
      memory.js           recall(), save(), supersede(), invalidate()
      extract.js          extract + reconcile call, JSON validation
      secrets.js          secret guard
      prompts.js          all prompt text in one place
    scripts/
      setup.js            create collections and indexes, wait until ready
      seed.js             demo data
      smoke.js            insert + search from the command line
      reset.js            wipe project data and reseed
  web/
    src/ App.jsx, Chat.jsx, MemoryPanel.jsx, ConflictCard.jsx, Timeline.jsx
```

### 12.3 API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/chat` | Body: `{ sessionId, message, memoryEnabled }`. Returns `{ reply, used: [{memory, similarity, confidence, finalScore, why}], changes: [{kind, memory}], conflicts: [{pending, target}], notices: [] }` |
| GET | `/api/session/start?sessionId=` | Returns check-ins: overdue assumptions and constraints expiring soon |
| GET | `/api/memories` | Query: `status`, `type`. All memories for the panel |
| POST | `/api/memories/:id/resolve` | Body: `{ action: "override" \| "keep" }` for a pending memory |
| POST | `/api/memories/:id/invalidate` | Manual "this is no longer true" |
| POST | `/api/memories/:id/confirm` | Answer to a check-in; updates `lastConfirmedAt` |
| DELETE | `/api/memories/:id` | Permanent delete |
| GET | `/api/memories/:id/chain` | Supersede chain for the timeline |
| GET | `/api/health` | DB and provider status |

### 12.4 LLM provider layer

- Keys come from `.env` as comma-separated lists: `GROQ_API_KEYS`, `GEMINI_API_KEYS`, `OPENROUTER_API_KEYS`.
- Two **roles**, each with its own model, so they use separate rate-limit buckets:
  - `fast` (extraction): Groq `llama-3.1-8b-instant`
  - `smart` (reply): Groq `openai/gpt-oss-120b` (or `llama-3.3-70b-versatile`)
  - Confirm exact model names in each console on build day. Keep them in `.env`, never hardcoded.
- On 429, 5xx, or timeout (8 s): mark that key as cooling down for 60 s and try the next key/provider. Maximum 3 attempts per call.
- **Free-tier reality:** Groq and Gemini limits apply per organisation/project, not per key. Extra keys only help if they come from **different accounts or projects**. Ask teammates to each create their own Groq account and Google Cloud project.
- JSON output: ask for JSON, validate it, retry once with a repair instruction, then give up on extraction. **A reply must never fail because extraction failed.** Show "Couldn't update memory this time."
- **Embeddings do not fall back to a different model.** If one key is limited, try the next Google project key using the **same model**. Cache embeddings by text hash so nothing is embedded twice.
- Token budget: about 3K tokens per message across both calls. Keep recalled memories short and keep chat history to the last 6 messages.

## 13. UI

Design direction: **minimal, premium, calm, modern.**

- Warm off-white background, near-black text, one muted accent colour (deep green or indigo). No gradients, no neon.
- Lots of whitespace. One clean sans-serif font (Inter or system). Thin 1px borders, very soft shadows, 12-16px rounded corners.
- Motion is subtle: fade or slide of 150-200 ms. No bouncing.
- Light mode only for the hackathon.

**Layout:** two panels.

- **Left (about 58%): chat.** Message bubbles, input at the bottom. Under each assistant reply, small "memory chips" showing which memories it used. Click a chip to highlight it in the right panel.
- **Right (about 42%): memory panel** with three tabs:
  1. **Used in this reply**: recalled memories, each with a score bar and the "why" line.
  2. **All memories**: filter by type and status. Each card has Invalidate and Delete.
  3. **Timeline**: supersede chains, for example "MongoDB → Postgres".
- **Top bar:** project name, "New session" button, **Memory on/off** switch.
- **Conflict card** appears inline in the chat: "This conflicts with a decision from Oct 24: *Use MongoDB* (reason: …). Override or keep?"
- **Memory card** content: type badge, content, reason, created date, status dot, score breakdown (only in "Used" tab), small "source quote" expander.
- **Toasts:** "3 memories saved", "Not saved: looks like a secret."

## 14. Demo script (about 4 minutes)

Prep: run `npm run demo:reset`, open the app and Atlas side by side.

**Session 1: memory is created**
1. Type: *"We're building QuickBite, a food ordering app for college canteens. We're using MongoDB because menus and orders have flexible shapes, and we have to ship in 5 days."*
   → Saves a decision (MongoDB) and a constraint (5-day deadline). Toast shows the count.
2. Type: *"I'm assuming most students will order from their phones, so mobile-first."*
   → Saves an assumption with a review date.
3. Type: *"No paid APIs for the next 2 minutes, we're in demo mode."*
   → Saves a temporary constraint with `expiresAt`. Open Atlas and show the field.
4. Click **New session**.

**Session 2: memory changes behaviour**
5. Type: *"Let's use Postgres for the orders table, I like SQL."*
   → Reply pushes back, citing the MongoDB decision, date, and reason. Panel shows the memory, its similarity score, and the why-line. Conflict card appears.
6. Type: *"Orders turned out to be very relational."* → click **Override**.
   → Old decision becomes superseded, new one active. Open the Timeline tab.
7. Type: *"Add a paid SMS OTP service for login."*
   → Warns about the no-paid-API constraint.

**Hard cases**
8. **Expiry:** wait for the 2 minutes to pass, then repeat step 7's message → no warning. Show the TTL index in Atlas.
9. **Correction:** *"We dropped the mobile-first idea, we're doing kiosks in canteens."* → assumption becomes invalid, shown in history only.
10. **Secret:** *"Our Stripe key is sk_test_abc123..."* → "Not saved: looks like a secret."
11. **Deletion:** delete a memory in the panel, then ask about it → the assistant no longer knows.
12. **Before/after:** switch Memory off, repeat step 5 → generic reply. Switch on → grounded reply.

Close with: "Memory is project-level, inspectable, correctable, and it forgets on purpose."

## 15. Seed data

`npm run seed` loads a small set so a cold start already looks alive:
- 2 decisions (auth approach, hosting choice), 1 constraint with a long expiry, 1 assumption with an overdue `revisitAfter`, 1 outcome linked to a decision.
- One superseded pair so the Timeline tab has something to show before the live demo.
- Seed memories are embedded with the same model and the same task type as live ones.

## 16. Edge cases

| Case | Behaviour |
|---|---|
| Duplicate statement | Bump `lastConfirmedAt` and `confirmCount`. Do not insert. |
| Vague message ("sounds good") | Extractor returns nothing. No toast. |
| Extractor returns bad JSON | One repair retry, then skip. Reply still sent. |
| All providers rate-limited | Friendly message; the app keeps running; memory panel still works. |
| Conflict left unanswered | Stays `pending`, never retrieved. Shown again in the panel. |
| User asks about a deleted memory | Assistant has no trace of it. |
| Memory expires mid-conversation | Retrieval backstop excludes it immediately. |
| Two memories contradict each other and both are active | Should not happen. Reconcile blocks it. If it does, the reply flags the contradiction. |
| Vector index not ready | `setup` waits for the index to be queryable before finishing. |

## 17. Design choices to explain to judges

- **One `memories` collection with a `type` field**: types share 90% of their fields, and type-specific fields (`expiresAt`, `revisitAfter`, `outcomeOf`) are simply absent when unused. That is the document model doing its job.
- **Status instead of deleting everything**: superseded and invalid memories keep the history, so the assistant can explain *how* a decision changed. Deletion is separate and permanent, for privacy.
- **`pending` status**: contradictions need a human decision, and a pending document survives a page refresh without any server-side state.
- **Metadata filters inside the vector query**: one query enforces user, project, and lifecycle together, so stale memories cannot leak into answers.
- **TTL plus a retrieval check**: TTL is lazy by up to about a minute, so correctness comes from the check and cleanup comes from TTL.
- **One combined extract + reconcile call**: fewer tokens, fewer rate-limit hits, and one place that decides what changes.

## 18. Build plan (4-5 hours)

| Time | Work | Gate (do not move on until true) |
|---|---|---|
| 0:00-0:30 | Atlas M0 cluster, API keys, repo, `.env`, `setup.js` | Vector index shows "ready" |
| 0:30-1:15 | `embeddings.js`, `memory.js`, `smoke.js` | Script inserts a memory and finds it by meaning |
| 1:15-2:15 | `llm.js` with fallback, `extract.js`, `secrets.js`, `/api/chat` | curl: message in, reply + saved memories out |
| 2:15-3:00 | Reconcile actions: conflict, resolve, invalidate, delete, TTL | Every hard case works from curl |
| 3:00-4:00 | Web UI: chat, memory panel, conflict card, toggle | Full demo script runs in the browser |
| 4:00-4:30 | Timeline, check-ins, outcomes (P1) | Only if the gate above passed |
| 4:30-5:00 | Seed, `demo:reset`, rehearse twice, fix | Demo runs clean from a reset |

**Cut line:** if you are behind at the 3:00 mark, drop all P1 and P2 items and spend the time on rehearsal. A smooth P0 demo beats a broken P1 one.

## 19. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Free-tier rate limits during the demo | Demo stalls | Fallback chain, separate models per role, caching, practise with `demo:reset` |
| Over-extraction fills memory with noise | Looks sloppy | Precision-first prompt, confidence field, only commitments |
| LLM misses a contradiction | Weak hard-case demo | Rehearsed demo messages, reconcile prompt tested early with examples |
| Vector index delay | "Memory not found" on stage | Seed ahead, pause a few seconds after inserts in the script |
| Dimension or model mismatch | Zero search results | Store `embeddingModel`, one config constant for dimensions |
| Secrets pasted into the demo | Real keys leaked | Secret guard plus demo uses fake keys only |
| Time overrun | Incomplete demo | Gates and the cut line in section 18 |

## 20. Success criteria

The project is a success if, in a live run:
1. A statement in session 1 visibly changes the reply in session 2.
2. The judge can see which memory was used, its score, and its source.
3. All five hard cases (correction, conflict, expiry, deletion, secret) work on stage.
4. We can open Atlas and show the documents, the vector index, and the TTL index.
5. We can explain every design choice in section 17 in one sentence each.

## 21. After the hackathon

| Stage | What changes |
|---|---|
| v2: Teammate mode | Add `ownerId` and workspace scoping, a second agent panel, a change stream for live shared memory |
| v3: Ingest | Pull decisions from meeting notes, Slack, PRs, and docs |
| v4: Proactive | Weekly digest, "assumptions at risk" alerts, warnings when a commit or ticket contradicts a decision |
| v5: Memory layer for coding agents | Expose Hindsight as an MCP server so Codex and Claude Code read and write project decisions directly |

## 22. Open questions

1. Final product name (Hindsight is a placeholder).
2. Exact model names available on Groq and Gemini on build day.
3. Whether the Atlas cluster in use supports MongoDB's automated embeddings. The plan assumes **not**, and uses Gemini embeddings so setup is predictable.