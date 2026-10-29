# Smaran.ai: Final spec (features, changes, status)

Version 1.0 · 29 Oct 2026. One page that says what Smaran.ai is, what is already built, what still has to be built, and exactly what changes in the database, the backend and the UI.

Companion files: `PROMPTS_FINAL.md` (every Codex prompt, in order), `DESIGN.md` v1.3 (all visuals), `PRD.md` (original requirements), `AGENT_PROMPT.md` (the full contract for the agent loop).

**Honest status:** nothing in sections 4 to 6 has been run in your repo yet. Those are plans plus prompts. Section 3 is built and tested.

---

## 1. What Smaran.ai is

An assistant for long-running projects that **remembers what you decided and why, notices when something changes, and tells you what it affects.** It is built for the MongoDB Student Hackathon, Track 1 (Agentic Memory).

One-line pitch: "Existing assistants remember who you are. Smaran.ai remembers what you decided, why, and what depends on it."

---

## 2. Status at a glance

| # | Feature | Status |
|---|---|---|
| 1 | Memory loop (recall, reply, extract, save) with Atlas vector search | Built, tested |
| 2 | Memory types and lifecycle (active, pending, superseded, invalid) | Built, tested |
| 3 | Conflict handling with Override or Keep, history timeline | Built, tested |
| 4 | Auto-expiry (TTL), secret guard, importance gate | Built, tested |
| 5 | Team mode: login, projects, invites, roles, shared memory, review of conflicts, live updates | Built, tested |
| 6 | Redis tiers: session turns, embedding cache, recall cache | Built, working in logs |
| 7 | Fixes: Redis reconnect, expired constraints in the cache, reply claims "recorded", missed expiry and corrections | Done (reconnect confirmed by hand) |
| 7b | Conversation storage: full chat in plain MongoDB `messages`, Redis on top, thread reopens with memory chips | Done, live checks pending |
| 8 | UI redesign: sidebar shell, 768px chat column, smoke background, login and account pages | Done (confirm with DESIGN.md section 11) |
| 9 | Agent loop: the model chooses its own steps, shown in an Agent steps strip | **In progress**: planner file only, finish with G1b, then G3 |
| 10 | Proactive review: the system raises stale assumptions, expiring constraints, pending reviews, missing outcomes | **To build** (G2) |
| 11 | Dependency-aware memory: decisions know what they rest on, and the system flags them when it changes | **To build** (D1) |
| 12 | Time travel: see what the project believed on a past date | Stretch (T1) |
| 13 | Pitch deck | 3 of 12 slides done |

---

## 3. Built features (what judges will see working)

1. **Memory loop.** Each message is embedded, recalled (top 5 by meaning), answered with those memories, then analysed for new decisions, assumptions, constraints and outcomes. Memory is read before the reply and written after it.
2. **Four memory types**, each with a reason, a confidence, optional expiry and an optional review date.
3. **Lifecycle.** New memories are active. Contradictions become pending until resolved. Old ones become superseded or invalid, never silently deleted, so the history stays.
4. **Conflict handling.** The reply cites the old memory, its reason and its date. The user clicks Override or Keep.
5. **Forgetting on purpose.** Temporary constraints expire by a TTL index. Small talk and brainstorming are not saved (importance gate). Secrets never reach the extractor (secret guard).
6. **Team mode.** Login (JWT cookie), multiple projects, one-time invite links, owner and member roles, memories attributed to their author. A conflict between two people waits for the original author or the owner, with live updates through change streams and an Activity feed.
7. **Speed.** Redis keeps the last 40 turns, caches embeddings for 24 hours and recall results for 60 seconds. If Redis is down the app still answers.

---

## 4. Features to build

### 4.1 Fixes (F1 to F3)

| Fix | Problem | Change |
|---|---|---|
| F1 Redis reconnect | After Redis restarts the app keeps a closed client and the cache stays off until a restart | Reset the cached client on `end` or a fatal error, throttle reconnects to one per 5 seconds |
| F2 Expired constraints | The 60-second recall cache can return a constraint that has already expired | Filter `expiresAt <= now` after reading the cache and cap the cache TTL at the soonest expiry. Clearing the cache on writes already exists |
| F3 Reply honesty | Replies say "I've recorded that as a project note" when nothing was saved, and echo the username | Reply prompt: never claim to save, record or note anything. Pass the list of memories actually written this turn |

Also fixed by prompt C (UI package): raw memory ids such as `【6ae0…】` appearing in replies.

### 4.2 UI redesign (A, B, C), details in DESIGN.md

- Left **sidebar** (logo, search, projects, new workspace, user block), main area shows one thing at a time (Workspace, Account or an empty state).
- **768px centred chat column**: your message hugs its text, replies hug their text, composer in the same column.
- **Memory panel** closed by default, docked on the right at 1440px and up, a drawer below.
- **Background**: a soft recoloured smoke shader on login, sign up and the empty chat, then a static glow with a very slow drift once messages exist. An Ambient toggle turns motion off.
- **Login, sign up and account pages** restyled with the existing logo at the top. No Google button and no forgot-password link (we don't have those features).
- Jet black, cerulean (you and actions) and neon rose (memory and attention). Fonts: Bricolage Grotesque, Instrument Sans, JetBrains Mono.

### 4.3 Agent loop (G1) and steps strip (G3)

- For each message the model picks the next action from a whitelist, up to 3 planner calls: `search_memory`, `check_conflict`, `save_memory`, `ask_user`, `answer`.
- Your existing functions are the tools. Writes go through the one existing write path, so the importance gate, expiry, supersede and cross-person rules still apply.
- `answer` calls the existing reply function. If anything fails the old pipeline answers (`agent.fellBack = true`). Switch: `AGENT_MODE=on|off`, default off.
- `ask_user` asks one short question with up to 3 option buttons when two readings would lead to different saves.
- The UI shows an "Agent · N steps" pill under the reply that expands to each step and its reason.

### 4.4 Proactive review (G2)

On session start the server scans memory with no model call and returns `attention[]`. The Attention card shows up to 4 rows:

| Kind | When | Buttons |
|---|---|---|
| `pending_review` | a teammate's conflicting memory waits for you | Override, Keep |
| `stale_assumption` | review date passed, or 7 days with no confirmation | Still true, No longer true |
| `expiring_constraint` | expires within 24 hours | OK |
| `decision_no_outcome` | active decision older than 7 days with no outcome | Add outcome |
| `dependent_review` (added by D1) | a decision rests on something that changed | Still valid, Review |

### 4.5 Dependency-aware memory (D1): the original idea

- Every decision, assumption or constraint can record what it **rests on** (`basedOn`: ids of other memories).
- The model sets `basedOn` only from memories that were recalled this turn, and only when the user's own words give that reason ("because", "since", "given that").
- When a base memory becomes invalid or superseded, the system finds its dependents and does three things: puts a notice in the chat response, adds a `dependent_review` row to the Attention card, and shows `Base changed` on the dependent's card.
- Example: "We dropped the mobile-first idea, we're doing kiosks." The reply says "Two decisions rested on that: the QR ordering flow and the mobile menu layout. Want to review them?" Nothing is changed automatically. The user decides.
- This is the demo moment that shows memory acting as a decision assistant, not just storage.

### 4.6 Time travel (T1, stretch)

A slider in the Timeline tab shows what the project believed on a past date. Backend: `GET /memories?asOf=<ISO date>` returns memories that were active at that moment, using `createdAt` and `statusChangedAt`. Build it only if everything above is done and checked.

---

## 5. Changes by layer

### 5.1 Database (MongoDB Atlas)

| Change | Detail | Needed by |
|---|---|---|
| New field `basedOn` on `memories` | array of ObjectId, optional, missing means empty. Validated to belong to the same project | D1 |
| New field `statusChangedAt` on `memories` | Date, set on every status change. For old documents treat the missing value as `updatedAt` or `createdAt` | D1, T1 |
| New index `project_basedOn` | multikey on `{ projectId: 1, basedOn: 1 }` for the dependents lookup | D1 |
| Atlas Vector Search index `memory_index` | **no change** (confirm it is Active, and that the old `memory_vector` is deleted) | none |
| New collections | **none** | none |
| Cleanup | delete or backfill old test memories that lack `projectId` or `status` (the vector filter excludes them). The old `messages` collection is no longer written and can be dropped | hygiene |

Redis keys: no new keys. F2 only changes how cached recall results are filtered.

### 5.2 Backend

| Area | Change |
|---|---|
| New files | `server/services/agent.js` (loop and tools), `server/services/attention.js` (review scan), `server/services/dependencies.js` (basedOn validation and dependents lookup) |
| Changed files | `memoryService.js` (F1, F2, set `statusChangedAt`, accept `basedOn`), `routes/chat.js` (agent switch, new response fields), `routes/projects.js` (attention, `asOf`), the reply prompt (F3, dependents notice) |
| Env | `AGENT_MODE` (default off), `AGENT_MAX_STEPS` (3), `AGENT_TIMEOUT_MS` (20000) in `config.js` |
| Chat response | adds `agent { ran, fellBack, steps[] }`, `awaiting { question, options[] } or null`, and dependents inside `notices[]` |
| Session start | adds `attention[]` next to the existing `checkins` |
| Memory list | each memory also returns `basedOn` (id and short title) and `supportsCount` |
| Optional | `GET /api/projects/:projectId/memories?asOf=` (T1) |
| Unchanged | auth, roles, invites, change streams, secret guard, importance gate, embeddings, Redis structure |
| Tests | `npm run verify` (existing), `verify:team` (existing), `verify:agent` (new), dependency tests (below) |

### 5.3 UI

| Component | Change | Source |
|---|---|---|
| App shell | Sidebar plus Main, one screen at a time, memory drawer or dock | DESIGN 2, 8.11 |
| Backdrop | smoke shader and calm mode, Ambient toggle | DESIGN 12 |
| Auth screens | glass card, floating-label inputs, logo on top | DESIGN 8.7 |
| Account page | profile, projects, session | DESIGN 8.12 |
| Chat column | 768px, hugging bubbles, avatar tile, composer in the same column | DESIGN 8.4, 8.5 |
| Agent steps strip | pill and expandable list | DESIGN 8.13 |
| Attention card | up to 4 rows, replaces the check-in card | DESIGN 8.14 |
| Ask-user message | label and up to 3 option buttons | DESIGN 8.15 |
| Memory card links | "Based on" chips, "Supports N", "Base changed" | DESIGN 8.16 |
| Time slider (stretch) | Timeline tab | DESIGN 8.17 |

---

## 6. Final API summary (all under `/api/projects/:projectId`)

| Route | Change |
|---|---|
| `POST /chat` | same request, response adds `agent`, `awaiting`, dependents in `notices` |
| `GET /session/start` | adds `attention[]` (keeps `checkins`) |
| `GET /memories` | adds `basedOn` and `supportsCount`; optional `asOf` (T1) |
| everything else (resolve, invalidate, confirm, delete, chain, withdraw, invites, stream, activity) | unchanged |

---

## 7. Tests to pass before the demo

1. `npm run verify` and `npm run verify:team` still pass (nothing regressed).
2. `npm run verify:agent`: the 9 tests from AGENT_PROMPT.md 28.8.
3. Dependency tests (added by D1):
   - A decision saved with a reason that matches a recalled assumption stores `basedOn` correctly.
   - `basedOn` with an id from another project is stripped and the save still works.
   - Invalidating the base returns the dependents in the same chat response and in `attention` as `dependent_review`.
   - "Still valid" hides that row until the base changes again.
4. Cache tests: F1 (reconnect) and F2 (expired constraint not returned).
5. Manual: the expired-constraint test (2 minutes), the Redis-off test, and the two-window team test.

---

## 8. Final demo script (about 6 minutes)

1. **Solo, 2 min.** Save a decision with a reason (MongoDB, flexible shapes) and a 5-day deadline. Say a conflicting thing (Postgres). Show the cited reply and the conflict card. Set "no paid APIs for 2 minutes" and show the warning, then the warning gone later.
2. **Agent, 1.5 min.** Say "Let's use Postgres for orders." The agent asks "replace or add alongside?" Click an option. Open the Agent steps strip.
3. **Dependency, 1 min.** Say "We dropped the mobile-first idea, we're doing kiosks." The reply names the two decisions that rested on it. Open a card and show "Based on" and "Base changed".
4. **Team, 1 min.** Alice and Bob: Bob's conflicting proposal waits for Alice, who overrides it live.
5. **Proactive, 30 s.** Open a new session. The Attention card appears on its own.

---

## 9. Order, time and what to cut

| Step | What | Time |
|---|---|---|
| 1 | F1, F2, F3 fixes | 30 min |
| 2 | UI prompts A, B, C | 60 to 90 min |
| 3 | G1 agent loop | 60 to 75 min |
| 4 | G3 steps strip | 20 min |
| 5 | G2 proactive review | 45 min |
| 6 | D1 dependency-aware memory | 60 to 75 min |
| 7 | T1 time travel (stretch) | 45 min |
| 8 | Finish the deck (9 slides) | 45 min |

**Cut order if time runs out:** T1, then G3, then the `expiring_constraint` and `decision_no_outcome` rows, then the UI polish prompts. **Never cut** the fallback to the old pipeline, the fixes, or the tests.

## 10. Risks

- **Free-tier rate limits:** the agent makes up to 3 planner calls plus 1 reply per message. Keep `AGENT_MODE` off until `verify:agent` passes twice, set `AGENT_MAX_STEPS=2` for the demo, add a second key per provider, and check quotas before presenting.
- **Over-saving or over-asking:** the importance gate sits inside `save_memory` and `ask_user` is allowed only when two readings change the write.
- **Wrong dependency links:** `basedOn` is set only from recalled memories and only when the user states a reason. A wrong link only produces a suggestion to review, never an automatic change.
- **Demo risk:** rehearse the 6-minute script twice at most (quota), and keep the old pipeline as the fallback.