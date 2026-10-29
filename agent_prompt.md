# Smaran.ai: Agent upgrade (PRD section 28 + Codex prompts)

Version 1.0 · 29 Oct 2026. Adds an agent loop and a proactive review on top of the working memory pipeline.
Read together with `PRD.md` (sections 6, 9, 10, 12.3, 23 to 25) and `DESIGN.md` v1.2 (sections 8.13 to 8.15).

---

## 1. The idea in simple words

**Today:** your code decides every step. Every message goes: recall, reply, extract, save. The model only fills in blanks.

**After:** the model decides the steps. For each message it looks at what memory it already has, then picks an action:

- "I need to search again with a better query."
- "This sounds like it contradicts something. Let me check."
- "This is a real decision. Save it."
- "I'm not sure what they mean. Ask first."
- "I have what I need. Answer."

Your code runs the action and shows the result back to the model. It repeats, at most 3 times, then answers. Every action is a function you already have, wrapped in a safe door. The model cannot do anything the door does not allow.

**Second part, the proactive review:** when you open a project, the system checks memory on its own and tells you what needs attention: stale assumptions, constraints about to expire, teammate proposals waiting for you, decisions with no recorded outcome. Nobody asked. That is the "acts on its own" moment.

**The safety net:** if the agent fails for any reason, the old pipeline answers instead. A switch (`AGENT_MODE=off`) turns the whole thing off.

---

## 2. What changes and what does not

| Area | Change |
|---|---|
| Database collections and indexes | **None.** No schema change, no new index. |
| Embeddings, vector search, Redis tiers, importance gate, secret guard | **None.** The agent calls them, it does not replace them. |
| Auth, projects, invites, roles, change streams | **None.** Tools run with the same user and project checks. |
| Reply prompt (PRD 10.1) | **None.** The agent's final `answer` step calls the existing reply function. |
| Extract + reconcile prompt (PRD 10.2) | Kept as the fallback. In agent mode the planner returns the same item shape instead. |
| `POST /api/projects/:projectId/chat` | Same request. Response gains `agent` and `awaiting`. |
| `GET /api/projects/:projectId/session/start` | Gains `attention[]`. The old `checkins` field stays. |
| New server file | `server/src/services/agent.js` (loop and tools) and `server/src/services/attention.js` (review scan). |
| New client pieces | Agent steps strip, attention card, ask-user message (DESIGN.md 8.13 to 8.15). |
| New env | `AGENT_MODE` (default `off`), `AGENT_MAX_STEPS` (default 3), `AGENT_TIMEOUT_MS` (default 20000). |

Codex must find the real file names first (`rg -n "reconcile|extract|recall" server/src`). The names above for existing code are from the PRD and may differ in the repo.

---

## 3. PRD section 28: Agent loop and proactive review

### 28.1 Flow

```
user message
  │
  ▼  secret guard (unchanged; a message that hits it never reaches the planner)
  ▼  embed + recall top 5 (unchanged, Redis caches apply)
  │
  ▼  AGENT_MODE=on ?  ── no ──► existing pipeline (unchanged)
  │ yes
  ▼
 loop (max AGENT_MAX_STEPS planner calls, AGENT_TIMEOUT_MS total)
   planner call (smart model, JSON) ──► { action, args, why }
   validate ──► run the tool ──► add result to the planner's context
   until action = answer or ask_user
  │
  ▼  answer: call the EXISTING reply function with recalled + found memories
  ▼  return reply, memoriesUsed, changes, conflicts, agent{steps}
```

Any failure (bad JSON, unknown action, tool error, timeout, provider error) ends the loop and runs the existing pipeline for that message. The response then has `agent.fellBack = true`.

### 28.2 Tools (a whitelist; each is a thin wrapper over existing code)

All tools run with the logged-in user and project. A project or user id coming from the model is never trusted.

| Tool | Args | Does | Built from |
|---|---|---|---|
| `search_memory` | `query` | Another recall with the model's own query. Returns up to 5 memories with scores. | existing recall |
| `check_conflict` | `statement` | Read-only. Returns the active memories that this statement could contradict, with similarity. | existing recall plus the reconcile compare |
| `save_memory` | `type, content, reason, confidence, expiresIn, revisitIn, action, targetId, outcomeOf` | Writes one item. `action` is `new`, `duplicate`, `conflict` or `invalidate`, the same as PRD 10.2. | existing write path, so the importance gate, expiry, supersede and cross-person rules all still apply |
| `ask_user` | `question, options[0..3]` | Ends the loop and returns the question. Nothing is written. | new, tiny |
| `answer` | none | Ends the loop and triggers the reply. | existing reply |

There is **no** separate supersede or invalidate tool. A write that changes an old memory goes through `save_memory` with `action` and `targetId`, so a teammate's conflicting proposal still becomes `pending` instead of overriding (PRD 23.5). One door means one set of rules.

### 28.3 Planner call

- Model: the smart model (`openai/gpt-oss-120b`), JSON output, temperature 0.2.
- Input: the user message, the last 6 turns (Redis tier), the recalled memories (ids, type, content, reason, author, date), the tool list with argument shapes, the steps already taken and their results.
- Output (and nothing else): `{ "action": "<tool name>", "args": { ... }, "why": "<one short sentence>" }`.
- Rules in the planner prompt:
  - Prefer `answer` when nothing needs checking. Small talk, questions, brainstorming and "maybe" never lead to `save_memory`.
  - Only `save_memory` something the user committed to or stated as true (the PRD 10.2 extraction rules apply word for word).
  - Use `check_conflict` before `save_memory` when the statement touches a topic that recalled memories already cover.
  - Use `ask_user` only when two readings lead to different writes (for example replace or add alongside). Ask once, with at most 3 short options.
  - Never print memory ids in `why` or in any user-facing text.
  - Never claim a memory exists that was not in the input.
- A step is **valid** if the JSON parses, the action is in the whitelist, and the args pass the tool's own validation. Otherwise the loop ends and the pipeline runs.

### 28.4 Asking the user

`ask_user` ends the turn. The response sets `awaiting = { question, options }` and the reply text is the question. No extra state is stored: the next user message arrives with the question in the Redis turn history, so the planner sees both the question and the answer. If an option is clicked, the client sends its text as a normal message.

### 28.5 Response shape (additions only)

```json
{
  "reply": "...",
  "used": [ ...unchanged... ],
  "changes": [ ...unchanged... ],
  "conflicts": [ ...unchanged... ],
  "agent": {
    "ran": true,
    "fellBack": false,
    "steps": [
      { "n": 1, "action": "check_conflict", "why": "Postgres may contradict the MongoDB decision", "summary": "1 match · 0.84", "ms": 920 },
      { "n": 2, "action": "ask_user", "why": "Replace or add alongside is unclear", "summary": "asked 1 question", "ms": 610 }
    ]
  },
  "awaiting": { "question": "Replace MongoDB or add Postgres alongside it?", "options": ["Replace it", "Add alongside"] }
}
```
`awaiting` is `null` when the agent did not ask anything. When `AGENT_MODE=off`, `agent.ran` is `false` and `steps` is `[]`. Step summaries never contain memory ids or secrets.

### 28.5b Persistence of agent steps

The conversation layer (`threadStore.js`, `messages` collection) stores `agent.steps` and `awaiting` in the assistant message's `meta` (`meta.agentSteps`, `meta.awaiting`), so a reopened thread shows the same Agent steps strip. No new collection and no change to memories.

### 28.6 Proactive review (`attention`)

`GET /api/projects/:projectId/session/start` also returns `attention`, computed in code with **no model call**:

| Kind | Rule | Source |
|---|---|---|
| `stale_assumption` | active assumption, `revisitAt <= now` (or older than 7 days with no `lastConfirmedAt`) | memories |
| `expiring_constraint` | active constraint with `expiresAt` within the next 24 hours | memories |
| `pending_review` | pending memories the viewer may resolve (author of the old memory or the project owner) | the existing `needsReview` logic |
| `decision_no_outcome` | active decision older than 7 days, with no linked `outcome` | memories |

- Order: `pending_review`, `stale_assumption`, `expiring_constraint`, `decision_no_outcome`. Cap the list at 8. Each item: `{ kind, memoryId, title, detail, actions }`.
- Each action maps to an endpoint that already exists: Still true calls `confirm`, No longer true calls `invalidate`, Override and Keep call `resolve`. `expiring_constraint` and `decision_no_outcome` need no new endpoint ("OK" is client-side only, and "Add outcome" just fills the composer).
- The scan is scoped to the project and to what the viewer is allowed to see. It is cheap and does not use Redis.

### 28.7 Rate limits and cost

Each message in agent mode makes up to 3 planner calls plus 1 reply call. After recall, the usual path is `save_memory` then `answer` (2 planner calls), and small talk is `answer` only (1 planner call). Use the existing provider fallback (Groq, then Gemini, then OpenRouter). Per project, allow at most 1 agent run at a time; a second message queues behind it.

### 28.8 Tests (`npm run verify:agent`)

1. Small talk: steps are `answer` only, nothing is written.
2. Clear new decision: `check_conflict` (or none) then `save_memory` (action `new`) then `answer`. One new memory exists.
3. Ambiguous statement ("let's use Postgres" when MongoDB is active): `ask_user` and nothing is written.
4. Teammate contradiction: `save_memory` with `conflict` becomes `pending`, never `superseded`, and the owner sees it in `attention`.
5. Invalid planner JSON, an unknown action, or a thrown tool error: the pipeline answers and `agent.fellBack` is true.
6. A tool call with another project's `targetId` is rejected and the loop falls back.
7. A message containing a fake key (`sk_test_abc123def456ghi789`) never reaches the planner and nothing is stored.
8. `AGENT_MODE=off` gives byte-identical behaviour to today.
9. `attention` returns the four kinds correctly for a seeded project, and a non-owner does not see another person's `pending_review`.

### 28.9 Demo add-on (about 60 seconds, after the team demo)

1. Say "Let's use Postgres for orders." The agent checks conflict, then **asks** "Replace MongoDB or add alongside?" Open the Agent steps strip.
2. Click "Add alongside". It saves a new decision and answers.
3. Open a new session. The attention card appears by itself: "2 things need your attention" (a stale assumption and an expiring constraint). Click "Still true".

---

## 4. Prompt G1: agent loop (server)

Run this after the UI prompts in `DESIGN.md` section 13 are done and checked. Paste only what is inside the block.

```
Read PRD.md sections 6, 9, 10, 12.3 and 23 to 25, and AGENT_PROMPT.md section 3 (28.1 to 28.5, 28.7, 28.8). Implement the agent loop.
Do not change the database schema, indexes, auth, routes (other than the chat response shape), the reply prompt, or any UI.

First find the real names: rg -n "reconcile|extract|recall|writeMemory|reply" server/src. Reuse those functions. Do not duplicate them.

1. Create server/src/services/agent.js exporting runAgent({ user, project, message, turns, recalled, signal }).
2. Env: AGENT_MODE (on|off, default off), AGENT_MAX_STEPS (default 3), AGENT_TIMEOUT_MS (default 20000). Put them in config.js.
3. Planner call: smart model (gpt-oss-120b via the existing provider layer with its fallbacks), JSON only, temperature 0.2. Input and rules
   exactly as AGENT_PROMPT.md 28.3. Output {action, args, why}. Parse strictly. Anything invalid ends the loop.
4. Tools, whitelist only: search_memory, check_conflict, save_memory, ask_user, answer (see 28.2). Every tool receives the user and project
   from the server session, never from the model. save_memory must go through the EXISTING write path so the importance gate, expiry,
   supersede rules and cross-person pending rule still apply. Validate every arg; reject a targetId that is not an active or pending memory
   of THIS project.
5. answer: call the existing reply function with the recalled memories plus anything found by search_memory. Do not let the planner write the reply.
6. ask_user: end the loop, return the question as the reply and set awaiting = {question, options (max 3, each under 40 chars)}. Write nothing.
7. Fallback: on any failure, timeout or exhausted budget, run the existing pipeline unchanged for this message and set agent.fellBack = true.
   Log the reason in one line (no message text, no ids).
8. In the chat route: if AGENT_MODE=on and the secret guard did not fire, call runAgent, else use the existing pipeline. Add `agent` and `awaiting`
   to the response as in 28.5. Step summaries must contain no memory ids and no secrets. Allow one agent run at a time per project (a simple in-memory queue).
9. Add scripts/verify-agent.mjs and `npm run verify:agent` covering tests 1 to 8 of 28.8, with the model stubbed where it needs to be deterministic.
10. Run npm run verify (existing) and npm run verify:agent. Report which pass, then list the files you changed.
```

---

## 5. Prompt G2: proactive review (server and client)

```
Read AGENT_PROMPT.md section 3 (28.6, test 9) and DESIGN.md sections 8.5, 8.14 and 8.15.
Do not change the schema or add endpoints. Implement the proactive review.

Server:
1. Create server/src/services/attention.js exporting getAttention({ user, project }) with NO model call. Four kinds, ordering, cap of 8 and
   field shape exactly as in 28.6. Reuse the existing needsReview logic for pending_review (only memories the viewer may resolve).
2. Extend GET /api/projects/:projectId/session/start to return attention[] next to the existing checkins (keep checkins).
3. Add test 9 of 28.8 to npm run verify:agent.

Client (restyle rules from DESIGN.md, no new colors):
4. Turn the existing check-in card into the Attention card from DESIGN.md 8.14: one card, up to 4 rows, "+N more" opens the Memory panel
   on the All tab. Row buttons call the existing endpoints (confirm, invalidate, resolve). "OK" is client-side only. "Add outcome" fills
   the composer with `Outcome of "<decision title>": ` and focuses it.
5. Show the card when a session starts or a project opens. Empty state: it replaces the quick actions row. With messages: first item in the thread.
   It must not switch the background mode (only real messages do).
6. Keep the "raised once per assumption" rule for stale_assumption. Expiring constraints and no-outcome rows reappear on the next session start.
7. Render the ask-user message per DESIGN.md 8.15 using response.awaiting. Clicking an option sends it as the user's message.
8. Report which checklist items you verified and list the files changed.
```

---

## 6. Prompt G3: Agent steps strip (client)

```
Read DESIGN.md section 8.13 and 12.5 (smooth actions). Client only. Do not change behaviour or API calls.

1. Under each reply that has response.agent.ran === true, render the Agent steps strip exactly as in 8.13: a collapsed pill
   "Agent · N steps" (or "Pipeline" when agent.fellBack), expandable to a vertical list. Use lucide icons per action
   (Search, GitCompare, Save, MessageCircleQuestion, MessageSquare). Only save_memory rows use neon-300 for the icon.
2. The pill is a <button> with aria-expanded. Expand over 200ms with the grid-template-rows 0fr to 1fr technique, rows staggered 40ms.
   prefers-reduced-motion: opacity only.
3. Hide the strip when Memory is off and when agent.ran is false.
4. Align the strip's left edge with the reply bubble inside the 768px column, 8px under the bubble and above the memory chips.
5. Keep every step text to plain words. Never show ids.
6. Report PASS or FAIL for the DESIGN.md checklist items that apply, then list the files you changed.
```

---

## 7. Order and time

| # | What | Time | Depends on |
|---|---|---|---|
| 1 | DESIGN.md prompts A, B, C | in progress | none |
| 2 | G1 agent loop | about 60 to 75 min | 1 |
| 3 | G3 steps strip | about 20 min | 2 |
| 4 | G2 proactive review | about 45 min | 1 (server part can run in parallel with 2) |

Cut order if time runs out: G3 first (the loop still works without the strip), then the `decision_no_outcome` and `expiring_constraint` rows. Do not cut the fallback or the tests.

## 8. Risks

- **Free-tier rate limits** (3 planner calls plus 1 reply per message). Mitigation: step cap, one run at a time per project, provider fallback, and `AGENT_MODE=off` in a pinch.
- **The model over-saves or over-asks.** Mitigation: the planner prompt rules, the importance gate inside `save_memory`, and `ask_user` only when two readings change the write.
- **Latency** (2 to 4 calls). Mitigation: recall happens before the planner, small talk is one planner call, and the timeout falls back to the pipeline.
- **A model-chosen id pointing at another project.** Mitigation: ids are validated against the server-side project in every tool.
- **Demo risk.** Keep `AGENT_MODE` off until `verify:agent` passes twice in a row, then turn it on and rehearse the 60-second script.