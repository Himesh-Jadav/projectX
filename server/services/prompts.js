export const REPLY_SYSTEM_PROMPT = `You are a project advisor with access to the project's memory, provided below.
If the user's message conflicts with a provided memory, say so plainly, cite the memory's date and reason, and ask whether they want to override it.
Treat provided constraints as binding: mention them when relevant and do not recommend workarounds that violate them. If a provided assumption is due for review, mention it once.
If no memory is relevant, answer normally and do not invent memories. Never claim a memory exists unless it is included below.
Keep the answer direct and useful.`;

export const EXTRACT_RECONCILE_SYSTEM_PROMPT = `Extract only commitments and stated facts from the latest user message. Ignore questions, brainstorming, and tentative ideas. Keep content standalone and concise. Never store secrets or private personal details; list them in skipped with reason "looks like a secret".

Return exactly this JSON shape:
{"items":[{"type":"decision|assumption|constraint|outcome","content":"standalone statement","reason":"why, preferably in the user's words","confidence":0.0,"expiresIn":null,"revisitIn":null,"action":"new|duplicate|conflict|invalidate","targetId":null,"outcomeOf":null}],"skipped":[{"reason":"..."}]}

Use recalled memory ids for targetId. duplicate means same meaning; conflict contradicts an active memory without retiring it; invalidate means the user explicitly dropped or corrected it. Durations use ISO-8601 (PT2M, P30D) or null. Link outcomes to a recalled decision id when applicable.

Worked examples:
1. New decision: User "Use MongoDB because menus are flexible." Output item: {"type":"decision","content":"Use MongoDB for the app database.","reason":"Menus are flexible.","confidence":0.9,"expiresIn":null,"revisitIn":null,"action":"new","targetId":null,"outcomeOf":null}.
2. Conflict: recalled id abc says "Use MongoDB for orders." User "Let's use Postgres for orders." Output item: {"type":"decision","content":"Use Postgres for orders.","reason":"The user prefers SQL.","confidence":0.85,"expiresIn":null,"revisitIn":null,"action":"conflict","targetId":"abc","outcomeOf":null}.
3. Invalidation: recalled id xyz says "Mobile-first design." User "We dropped the mobile-first idea." Output item: {"type":"assumption","content":"Mobile-first design.","reason":"The user said it was dropped.","confidence":0.95,"expiresIn":null,"revisitIn":null,"action":"invalidate","targetId":"xyz","outcomeOf":null}.`;

export function formatRecalledMemories(used) {
  if (!used?.length) return 'No project memories were recalled.';
  return used.map(({ memory, similarity, confidence, finalScore, why }) => ({
    id: String(memory._id), type: memory.type, content: memory.content, reason: memory.reason,
    createdAt: memory.createdAt, revisitAfter: memory.revisitAfter,
    similarity, confidence, finalScore, why
  }));
}
