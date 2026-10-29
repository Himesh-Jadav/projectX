# Agent verification plan

This is a checklist for the later live verification. Do not run the live demo checks casually: `npm run verify` includes `verify:step1`, which starts the app and sends real extraction, reply, and embedding requests. The agent is configured for up to three planner calls plus a reply call per chat turn.

## Local checks that do not spend model quota

These tests use local fixtures and stubbed planner/tool calls:

```powershell
npm test
npm run verify:agent
```

Expected agent checks: small talk answers without writes; decision check/save/answer; ask-user with no writes; teammate conflict held pending; fallback-triggering invalid planner/tool errors; cross-project target rejection; secret blocked before planner; agent-off legacy path; attention returns the four kinds and hides a pending review the viewer cannot resolve.

## Live API calls to make later

Use a seeded test project and test users. Keep `AGENT_MODE=on` only for the agent cases. Do not paste real API keys or secrets into chat. Each chat can spend up to `AGENT_MAX_STEPS` planner calls and one reply call; cases that intentionally exercise fallback can also use the legacy extraction/reply flow.

1. **Sign in**

   `POST /api/auth/login`

   Save the authenticated cookie for the subsequent requests. Use the project owner for project setup and attention visibility checks, and a project teammate for the cross-person conflict case.

2. **Small talk, no write**

   `POST /api/projects/{projectId}/chat`

   Body: `{ "sessionId": "agent-small-talk", "message": "Hi, how are you?", "memoryEnabled": true }`

   Expect one `answer` agent step and no memory changes.

3. **New decision**

   Post `We will use Postgres for order storage.` to the same chat endpoint with a fresh session. Expect `save_memory` with action `new`, followed by `answer`; check the project memory list for exactly one new active decision.

4. **Ambiguous change**

   Seed an active MongoDB decision, then as a teammate post `Let's use Postgres for orders.` Expect `ask_user`, the question in `reply`, `awaiting.question/options`, and no write. If testing `attention`, fetch `GET /api/projects/{projectId}/session/start` as the owner and confirm the teammate proposal is visible there.

5. **Cross-person conflict**

   With the same active MongoDB decision, post a direct contradictory committed statement as the teammate. Expect a pending proposal, never a superseded old memory. As the owner, check the existing attention/review API and verify the proposal is visible and resolvable.

6. **Fallbacks**

   To exercise live fallback, temporarily configure the planner provider to return invalid JSON, an unknown action, or a tool failure, then post a chat message. Expect a normal legacy reply and `agent.fellBack: true`. Restore provider configuration immediately afterward. Local `verify:agent` already tests planner/tool failures without provider calls.

7. **Secret guard**

   Post a fake test string such as `sk_test_abc123def456ghi789`. Expect the secret warning, no planner run, and no saved memory. Do not use a real credential.

8. **Agent off and thread reopen**

   Set `AGENT_MODE=off`, restart the server, and post the same benign message. Expect the legacy response plus `agent: { ran: false, steps: [] }`. Then set agent mode on, ask an ambiguous question, and reopen that session via `GET /api/projects/{projectId}/sessions/{sessionId}/messages`; confirm the assistant message `meta.agentSteps` and `meta.awaiting` are present.

9. **Attention scan and visibility**

   Seed a project with: (a) an active assumption whose `revisitAfter` is in the past, (b) an active constraint expiring within 24 hours, (c) a pending proposal targeting an active memory, and (d) an active decision older than seven days with no active linked outcome. Call `GET /api/projects/{projectId}/session/start` as the project owner. Expect `attention` alongside the unchanged `checkIns`, with all four kinds in this order: `pending_review`, `stale_assumption`, `expiring_constraint`, `decision_no_outcome`. Check each item has only `kind`, `memoryId`, `title`, `detail`, and `actions`; verify the list is capped at eight.

   Repeat as a non-owner who is neither the target memory's author nor the project owner. Confirm that pending proposal is absent from `attention`, while other visible attention kinds remain. A non-owner who authored the target memory should be able to see its pending review. Confirm this scan makes no model call.

10. **Attention card and action behavior**

   Open a project/session with attention rows. Confirm one card appears in the empty thread in place of quick actions, or as the first item in a thread with messages. It should show up to four rows, at most one pending-review row, and a `+N more` control that opens Memory on the All tab. Confirm the card alone does not switch the background mode.

   Test `Still true` and `No longer true` on an assumption, and `Override` and `Keep` on a pending proposal; verify each uses the existing endpoint and updates the memory as expected. `OK` should dismiss the constraint row in the client only. `Add outcome` should populate `Outcome of "<decision title>": ` and focus the composer. Dismiss or act on a stale assumption, reopen the project, and confirm it is not raised again for that browser. Confirm dismissed expiring-constraint and no-outcome rows return on a later session start.

11. **Ask-user choices**

   Cause an agent turn to return `awaiting.question` and options. Confirm the assistant reply shows `Needs your answer` and up to three option pills. Click an option and verify its exact text is sent as the next user message. Reopen the thread and confirm the ask-user UI is restored from the persisted `meta.awaiting`.

## Full live suite

Run this only when ready to spend the demo's normal model/embedding quota:

```powershell
npm run verify
```

It runs reply checks and `verify:step1`, which exercises a live end-to-end demo including extraction, replies, embedding recall, temporary expiry, conflict, correction, secret handling, and deletion.
