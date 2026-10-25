# Smaran.ai: PRD

**A long-running decision assistant with persistent memory**
MongoDB Student Hackathon · Track 1: Agentic Memory
Version 1.1 · 25 Oct 2026 · v1.0 core loop built; v1.1 adds team mode (login, projects, invites, shared memory). Sections 23-27 are new and win over earlier sections if they disagree.

---

## 1. One-line pitch

Smaran.ai is a chat assistant for a long-running project. It quietly remembers the **decisions, assumptions, and constraints** you talk about, and uses them to push back, warn, and advise in later sessions. It also knows when a memory is wrong, replaced, or expired.

**Team mode (v1.1):** a whole team shares one project memory. Every decision is stored with the name of the person who made it, and the assistant can point out when one person's idea conflicts with another person's earlier decision.

## 2. The problem

On any long project, people forget *why* something was decided. Three months later someone proposes the opposite, nobody remembers the reasoning, and the same debate happens again. Normal chatbots make this worse because every new chat starts from zero.

Smaran.ai fixes that. The assistant carries the project's reasoning forward and changes its answers because of it.

## 3. Goals and non-goals

**Goals**
1. Build a working end-to-end loop: say something in session 1, see it change the answer in session 2.
2. Make memory **inspectable**: the user can see what was recalled, why it was picked, and where it came from.
3. Handle the hard cases properly: correction, conflict, expiry, deletion, and secrets.
4. Use MongoDB for what it is good at: flexible memory documents, Vector Search with metadata filters, and TTL indexes.
5. Be repeatable: one command sets up the database, one command loads demo data.
6. (v1.1) Work as a team product: people sign up, create projects, invite others, and share one project memory that updates live. Details in sections 23-27.

**Non-goals (do not build these)**
- Email sending, social login (OAuth), email verification, password reset
- Roles beyond owner and member
- Private (author-only) memories inside a shared project
- Chat between people, notifications, billing
- Mobile app
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
| Change streams (when multi-user/agent) | Required in v1.1. One change stream feeds live updates to every teammate in a project (section 25). | Alice's change appears in Bob's window with no refresh |

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
  "userId": "64f1c0aa11b2c3d4e5f60001",
  "createdByName": "Alice",
  "projectId": "64f1c0aa11b2c3d4e5f60002",
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
- (v1.1) `userId` is the **author** of the memory. `createdByName` is copied at write time so the UI can say "Alice decided..." without a lookup. `projectId` and `userId` are stored as **strings** (the string form of the ObjectId) so filters always match. See section 23.

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
2. Run `$vectorSearch` with `filter: { projectId, status: "active" }` (v1.1: no `userId` filter, because memory is shared by the whole project; the vector index does not need to change), `numCandidates: 100`, `limit: 8`.
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
| FR-19 | Live updates via change stream (teammates' changes appear without refresh) | P0 (v1.1) | Alice's change shows in Bob's window within 2 seconds |
| FR-20 | Recency/confidence decay in ranking | P2 | Old unconfirmed memories rank lower |
| FR-21 | Private flag and export | P2 | Not part of v1.1 (see non-goals) |
| FR-22 | Accounts: signup, login, logout with a cookie session | P0 (v1.1) | Login works; no cookie means 401 |
| FR-23 | Multiple projects; a user sees only their own | P0 (v1.1) | Bob never sees a project he is not in |
| FR-24 | Invite link adds a member (owner only, single use, expires) | P0 (v1.1) | Bob joins via the link; reusing it fails |
| FR-25 | One shared project memory; every memory shows its author | P0 (v1.1) | Bob sees "by Alice" on her memories |
| FR-26 | Cross-person conflict: pending, reviewed by the author or owner, withdrawable | P0 (v1.1) | Bob's Postgres proposal waits for Alice |
| FR-27 | Permissions per section 23.4; non-members get 404 | P0 (v1.1) | Tests 2-6 in section 27.2 pass |
| FR-28 | Activity feed with actor names | P1 (v1.1) | Activity tab lists who did what |
| FR-29 | Owner can remove a member | P2 (v1.1) | Removed member loses access at once |
| FR-30 | Migration, seed and reset updated for team mode | P0 (v1.1) | `migrate:team` keeps Phase 1 data intact |

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

**v1.1:** with team mode, every route above except `/api/health` lives under `/api/projects/:projectId/...` and needs login and membership. The full route list is in section 24.

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

**v1.1 UI note:** the visual direction in this section is superseded by `UI_PROMPT.md` (dark glass, based on the Ruixen Moon Chat component). Team mode adds only these screens and controls: a login/signup card, a project switcher, an invite dialog with the members list, a "Needs your review" list, and an Activity tab. Nothing else.

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
| v2: Teammate mode | **Built in v1.1** (sections 23-27) |
| v3: Ingest | Pull decisions from meeting notes, Slack, PRs, and docs |
| v4: Proactive | Weekly digest, "assumptions at risk" alerts, warnings when a commit or ticket contradicts a decision |
| v5: Memory layer for coding agents | Expose Hindsight as an MCP server so Codex and Claude Code read and write project decisions directly |

## 22. Open questions

1. Final product name (Hindsight is a placeholder).
2. Exact model names available on Groq and Gemini on build day.
3. Whether the Atlas cluster in use supports MongoDB's automated embeddings. The plan assumes **not**, and uses Gemini embeddings so setup is predictable.
4. Whether change streams work on the M0 cluster in use. It should (M0 is a replica set), but test it in the first 10 minutes of step T4.

---

## 23. Team mode (v1.1)

Team mode turns the app from one person's assistant into a shared project brain. Several people join a project, and everyone's decisions land in one shared memory. **If anything here disagrees with sections 1-22, this section wins.**

### 23.1 What changes

| Area | v1.0 | v1.1 |
|---|---|---|
| People | One hardcoded user | Accounts with login |
| Projects | One hardcoded project | Many; each user sees only the ones they belong to |
| Memory scope | One user inside one project | The **project**, shared by every member |
| Authorship | Not tracked | Every memory records who created it |
| Conflicts | You against your past self | Can be between two people |
| Live updates | Stretch goal | Required (change streams) |

### 23.2 New collections

- **`users`**: `{ _id, email (unique, lowercase), name, passwordHash, createdAt }`
- **`projects`**: `{ _id, name, ownerId, createdAt }`
- **`memberships`**: `{ projectId, userId, role: "owner" | "member", joinedAt, invitedBy }`
- **`invites`**: `{ projectId, tokenHash, createdBy, createdAt, expiresAt, usedAt, usedBy }`

Indexes:
- `users`: unique on `email`.
- `memberships`: unique on `{ projectId, userId }`, plus `{ userId }`.
- `invites`: unique on `tokenHash`, plus a **TTL index** on `expiresAt` (`expireAfterSeconds: 0`). Old invites clean themselves up.
- **No vector index change.** It already filters on `projectId` and `status`. Recall simply stops filtering by `userId`.

### 23.3 Changes to existing collections

- `memories`: `userId` now means the **author**; add `createdByName`. Store `projectId` and `userId` as strings.
- `memory_events`: add `projectId`, `actorId`, `actorName`. New event types: `conflict_withdrawn`, `conflict_stale`, `member_joined`, `member_removed`. Delete events still carry **no memory content**.
- `messages`: `userId` is the speaker. Each person has their own chat sessions. **Memory is what is shared, not the chats.**

### 23.4 Roles and permissions

| Action | Owner | Member |
|---|---|---|
| Create a project | any logged-in user (becomes its owner) | same |
| See the project, memories, activity | yes | yes |
| Chat (this creates memories) | yes | yes |
| Invite people, remove members | yes | no |
| Delete or invalidate a memory | any memory | only ones they created |
| Resolve a conflict (Override / Keep) | any | only conflicts against memories they created |
| Withdraw a pending memory | any | only their own |
| Answer an assumption check-in | yes | yes |

A person who is not a member gets a **404**, never a 403, so the project's existence does not leak.

### 23.5 Conflicts between people (the core story)

1. Bob says "let's use Postgres". Reconcile finds that it conflicts with Alice's active MongoDB decision.
2. The new memory is saved as `pending`, authored by Bob. Bob's reply names Alice and shows a card: "This conflicts with Alice's decision from 24 Oct. Waiting for her review," with a **Withdraw** button.
3. Alice's panel shows it **live** under "Needs your review", with Override and Keep.
4. **Who can resolve:** the author of the old memory, or the project owner. If Bob contradicts his *own* memory, he resolves it immediately in his own chat.
5. **Override:** pending becomes active, the old memory becomes superseded, and the two link to each other. **Keep:** the pending memory is deleted. **Withdraw:** same, done by Bob. Each writes a `memory_events` entry with the actor.
6. If the target is superseded, invalidated, or deleted while other pending items still point at it, those pending items are deleted with a `conflict_stale` event.
7. If Alice is offline, the item waits and appears in her "Needs your review" list when she returns. Pending items are never used in retrieval.

### 23.6 Attribution

- The LLM sees each memory as: `[decision · by Alice · 24 Oct] Use MongoDB ... (reason: ...)`.
- The current speaker goes with the message: `Bob says: ...`.
- Reply rule: when citing a memory, say who made it ("Alice decided...").
- Extraction always attributes new memories to the current speaker.

## 24. Authentication and project API

### 24.1 Auth (keep it plain)

- Email + password. `bcryptjs` (cost 10). Minimum 8 characters. Email lowercased and unique. Wrong email and wrong password give the same error.
- Session: a JWT (HS256) signed with `JWT_SECRET`, valid 7 days, stored in an **httpOnly cookie** named `sid` (`SameSite=Lax`, `Secure` in production). No tokens in localStorage.
- **Not building:** email verification, password reset, OAuth, account lockout.
- Rate limit: 20 chat requests per minute per user, in memory. This protects the shared free LLM quota.
- Secrets (`JWT_SECRET`, `DEMO_PASSWORD`) live in `.env`. `.env.example` has placeholders only.

### 24.2 Middleware

- `requireAuth`: reads the cookie and loads the user, else 401.
- `requireProjectMember`: checks `memberships` for `(projectId, userId)`, else **404**. Attaches the membership.
- `requireOwner`: member with role `owner`, else 403.
- **Never fetch a memory by id alone.** Always query `{ _id, projectId }`. Otherwise a member of project A could read or change a memory from project B by guessing its id.

### 24.3 Routes

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | public | `{ name, email, password }`, creates the user and logs in |
| POST | `/api/auth/login` | public | `{ email, password }`, sets the cookie |
| POST | `/api/auth/logout` | user | clears the cookie |
| GET | `/api/auth/me` | user | current user |
| GET | `/api/projects` | user | the user's projects, with role |
| POST | `/api/projects` | user | `{ name }`, creates a project and makes the user its owner |
| GET | `/api/projects/:projectId` | member | project and members list |
| POST | `/api/projects/:projectId/invites` | owner | returns `{ url, expiresAt }`. The token is shown **once**; only its hash is stored. Single use, expires in 7 days. |
| GET | `/api/invites/:token` | user | preview: project name and who invited |
| POST | `/api/invites/:token/accept` | user | joins the project as member (used or expired gives 410) |
| DELETE | `/api/projects/:projectId/members/:userId` | owner | removes a member (an owner cannot remove themselves) |
| GET | `/api/projects/:projectId/activity` | member | latest 50 events with actor names |
| GET | `/api/projects/:projectId/stream` | member | live events (SSE), see section 25 |
| POST | `/api/projects/:projectId/memories/:id/withdraw` | author of a pending memory | deletes the pending memory |

Every route from section 12.3 moves under `/api/projects/:projectId/...` (for example `POST /api/projects/:projectId/chat` and `GET /api/projects/:projectId/memories`). `GET .../memories` also returns a separate `needsReview` list: pending memories against memories the viewer may resolve. The chat response's `conflicts[]` gains `targetAuthorName` and `canResolveNow`.

### 24.4 Migration, seed and reset

- `npm run migrate:team` (idempotent, never deletes data): creates users **Alice** and **Bob** (password from `DEMO_PASSWORD`), creates project **QuickBite** owned by Alice, and attaches every existing memory, message and event to it (`projectId` = the new project's id string, `userId` = Alice's id string, `createdByName` = "Alice"). Prints document counts before and after.
- `npm run seed`: seeds Alice, Bob and QuickBite with Alice as owner. **Bob is not a member**, because the demo invites him live. `--with-bob` adds him as a member for faster testing.
- `npm run demo:reset`: removes all memories, messages, events and invites for QuickBite, removes Bob's membership, then reseeds.

## 25. Real-time with change streams

- The server opens **one** change stream on `memories` and `memory_events` (not one per user) and fans each event out to the SSE clients of the matching project.
- Endpoint: `GET /api/projects/:projectId/stream` (members only). The payload is built on the server: `{ kind, memoryId, actorName, summary, at }`. Raw documents are never sent.
- A change stream's delete event carries only the `_id`. So deletions and TTL expiries are announced by the `memory_events` insert (written before the memory is removed), and the client simply refetches the list.
- A keep-alive comment every 25 seconds. The browser reconnects by itself, and on reconnect it refetches memories.
- Change streams need a replica set. Atlas M0 is one, but **test it in the first 10 minutes** of step T4.
- **Fallback:** if streams fail, the client polls `GET .../memories` every 3 seconds. The demo still works, but we lose the change-streams box, so use it only as a safety net.

## 26. Team demo script (about 5 minutes)

Two windows: **A** is Alice (normal window) and **B** is Bob (incognito). Prep: `npm run demo:reset`, and log both in.

1. **A:** open QuickBite and send the three messages from section 14 steps 1-3 (MongoDB decision, mobile-first assumption, temporary no-paid-API constraint).
2. **A:** click **Invite** and copy the link.
3. **B:** open the link and click Join. QuickBite appears, and Alice's memories show **her name**.
4. **B:** send "Let's use Postgres for the orders table." The reply says *"Alice decided on MongoDB on 24 Oct because..."*, and a "Waiting for Alice's review" card appears.
5. **A (no refresh):** "Needs your review" shows Bob's proposal. Click **Override**. Both windows update, and the Activity tab shows who did what.
6. **B:** "Add a paid SMS OTP service for login." The warning cites Alice's constraint.
7. **Permissions:** in B, try to delete Alice's memory. The button is not there, and a direct API call returns 403.
8. **Isolation:** Alice creates a second project, "Secret". Bob never sees it in his project list.
9. A quick round of the hard cases from section 14: correction, secret, expiry, delete.

Close with: "One shared memory. Everyone's decisions, everyone's accountability, live."

## 27. Team build plan, tests and risks

### 27.1 Build plan

| Step | Work | Time | Gate |
|---|---|---|---|
| T1 | Auth: users, signup, login, cookie, middleware | 45 min | Signup, login, `/me`, logout work from curl |
| T2 | Projects, memberships, invites | 60 min | Alice invites, Bob accepts; non-members get 404 |
| T3 | Routes under projects, authorship, cross-person conflicts, migration | 60 min | Phase 1 tests still pass; Bob's Postgres message cites Alice and Alice can resolve it |
| T4 | Change streams and SSE | 45 min | Two open streams see each other's changes in under 2 seconds |
| T5 | UI: login, project switcher, invite dialog, review list, Activity tab | 75 min | Team demo runs in two windows |
| T6 | Team tests and rehearsal | 30 min | `verify:team` all pass |

**Cut order if time runs out:** (1) remove-member, (2) Activity tab, (3) SSE (use polling), (4) the multi-project UI (keep one project, but keep real auth and invites). **Never cut the authorization checks, and never cut cross-person conflicts**, since that is the story.

### 27.2 Tests (`npm run verify:team`)

1. Signup and login work; a wrong password gives 401; `/me` without a cookie gives 401.
2. A non-member request to any project route gets 404.
3. A member of project A asking for a project B memory id through project A's route gets 404.
4. Recall in project A never returns project B memories, even with identical text.
5. Invites: a token works once; an expired or used token fails; only the owner can create one.
6. A member cannot delete or invalidate someone else's memory (403); the owner can.
7. Bob's contradicting message creates a `pending` memory authored by Bob. Alice can resolve it; Bob cannot resolve Alice's conflict but can withdraw his own.
8. Resolving by override deletes other pending items for the same target (`conflict_stale`).
9. Replies and conflict cards name the correct author.
10. A memory saved by Alice reaches Bob's SSE connection within 2 seconds; a non-member's connection gets nothing.
11. The Phase 1 tests (`verify:step1`) still pass.

### 27.3 Edge cases

| Case | Behaviour |
|---|---|
| Two people contradict the same memory at the same moment | Both become pending; resolving one marks the other stale. |
| Owner removes a member | Their memories stay (they belong to the project); their access ends at once. |
| A removed member had pending conflicts | Those pending items are deleted. |
| Invite link opened while logged out | Go to login, then return to the invite. |
| Same person accepts twice | Idempotent: already a member. |
| User belongs to many projects | Memory, chat and stream are always scoped by the project in the URL. |
| Shared LLM quota runs out | Fallback chain, then a friendly message. The per-user rate limit stops one person from burning it all. |

### 27.4 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Authorization bug leaks memory across projects | The worst failure for a memory product | One middleware on every route, lookups always by `{ _id, projectId }`, tests 2-4 |
| Auth work eats the timeline | No time left for the memory story | Plain email + password, nothing extra, cut order above |
| Change streams unsupported or flaky | Weak live demo | Test early, polling fallback |
| Two users and rehearsals share the free LLM quota | Demo stalls | Per-user rate limit, caching, separate models per role |
| Migration damages the working Phase 1 data | Lose the working demo | Additive and idempotent; note document counts before and after; commit to git first |
| The demo needs two windows | Confusing on stage | Practise with one normal and one incognito window, pre-logged-in |

### 27.5 Design choices to explain to judges

- **Memory is shared per project, not per user.** The point of a team is shared reasoning: a decision Alice made should stop Bob from repeating the debate.
- **Every memory has an author.** "Why?" now also answers "who?", which is what makes the memory trustworthy.
- **The author of a decision resolves conflicts against it.** Whoever owns the decision decides whether to change it, with the project owner as a backstop.
- **Invite links, not emails.** No email service to set up, and the demo is identical.
- **One change stream for the whole server.** It scales with the number of projects, not the number of connected users.
- **Invite tokens are stored as hashes, with a TTL.** A database leak does not leak working invites, and the same TTL feature cleans them up.