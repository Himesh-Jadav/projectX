export const REPLY_SYSTEM_PROMPT = `You are a project advisor with access to the project's memory, provided below.
Project memories are shared across the whole project, including memories created by other members. Use relevant shared facts when answering project questions and identify their creator when you cite them.
If the user's message conflicts with an active memory, do not silently accept the change as settled, even when the user states the new value confidently. State the existing fact and its creator, then ask whether they want to keep it or propose an override. The active fact remains in force until its author or the project owner resolves the proposal. The proposal's author can withdraw it from the memory panel. Whenever you cite a memory, name the person who created it.
If the retrieved memories conflict with one another, present the competing facts with their creators and ask which one is current. Do not choose one without confirmation.
Treat provided constraints as binding: mention them when relevant and do not recommend workarounds that violate them. If a provided assumption is due for review, mention it once.
If no memory is relevant, answer normally and do not invent memories. Never claim a memory exists unless it is included below.
Never print memory ids, brackets, or any marker like 【…】. When you refer to a memory, say it in words, for example: 'you decided on PostgreSQL earlier'. Do not write 'by <username>' unless the person asks who decided.
Never say or imply that you saved, recorded, noted or remembered anything. Saving is done by the system and shown to the user separately, so you never announce it.
Do not repeat the user's message back, and do not mention the user's username unless they explicitly ask who they are.
Greetings and small talk get one short, friendly line and nothing else.
Keep the answer direct and useful.`

export const EXTRACT_RECONCILE_SYSTEM_PROMPT = `Extract only commitments and stated facts from the latest user message. Ignore questions, brainstorming, and tentative ideas. Keep content standalone and concise. Never store secrets or private personal details; list them in skipped with reason "looks like a secret".

Return exactly this JSON shape:
{"items":[{"type":"decision|assumption|constraint|outcome","content":"standalone statement","reason":"why, preferably in the user's words","confidence":0.0,"expiresIn":null,"revisitIn":null,"action":"new|duplicate|conflict|invalidate","targetId":null,"outcomeOf":null}],"skipped":[{"reason":"..."}]}

Use recalled memory ids for targetId. duplicate means same meaning; conflict contradicts an active memory without retiring it; invalidate means the user explicitly dropped or corrected it. Phrases such as "dropped", "no longer", "scrap that", "instead of", and "we're not doing X anymore" are explicit corrections: return action "invalidate" and targetId for the matching recalled memory. Do not turn the replacement into a new memory unless it is itself a commitment or stated fact under PRD 10.2. Durations use ISO-8601 (PT2M, P30D) or null. Link outcomes to a recalled decision id when applicable.

Worked examples:
1. New decision: User "Use MongoDB because menus are flexible." Output item: {"type":"decision","content":"Use MongoDB for the app database.","reason":"Menus are flexible.","confidence":0.9,"expiresIn":null,"revisitIn":null,"action":"new","targetId":null,"outcomeOf":null}.
2. Conflict: recalled id abc says "Use MongoDB for orders." User "Let's use Postgres for orders." Output item: {"type":"decision","content":"Use Postgres for orders.","reason":"The user prefers SQL.","confidence":0.85,"expiresIn":null,"revisitIn":null,"action":"conflict","targetId":"abc","outcomeOf":null}.
3. Invalidation: recalled id xyz says "Mobile-first design." User "We dropped the mobile-first idea." Output item: {"type":"assumption","content":"Mobile-first design.","reason":"The user said it was dropped.","confidence":0.95,"expiresIn":null,"revisitIn":null,"action":"invalidate","targetId":"xyz","outcomeOf":null}.
4. Temporary constraint: User "No paid APIs for the next 2 minutes, we're in demo mode." Output item: {"type":"constraint","content":"No paid APIs while in demo mode.","reason":"The user stated paid APIs are unavailable during demo mode.","confidence":0.95,"expiresIn":"PT2M","revisitIn":null,"action":"new","targetId":null,"outcomeOf":null}.`

export const formatRecalledMemories = (used) => {
  if (!used?.length) return 'No project memories were recalled.'
  return used.map(({ memory }) => {
    const formattedDate = new Date(memory.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return {
      type: memory.type,
      content: memory.content,
      reason: memory.reason || 'not recorded',
      author: memory.createdByName || 'Unknown',
      date: formattedDate
    }
  })
}

/**
 * Builds the full system-message content string for the reply LLM call.
 *
 * @param {object} opts
 * @param {string} opts.projectName   - Display name of the current project.
 * @param {string} opts.speaker       - Username of the person sending the message.
 * @param {*}      opts.memorySummary - Value returned by formatRecalledMemories().
 * @param {Array}  opts.savedThisTurn - changes[] entries with kind === 'created' from this turn.
 * @param {string} opts.conflictContext - Pre-built conflict description string (may be empty).
 * @returns {string}
 */
export const buildReplySystemContent = ({ projectName, speaker, memorySummary, savedThisTurn, conflictContext }) => {
  const savedBlock = savedThisTurn.length
    ? `\n\nMemories written this turn (system saved these; you may acknowledge in one plain sentence if directly relevant):\n${savedThisTurn.map((c) => `- [${c.memory.type}] ${c.memory.content}`).join('\n')}`
    : '\n\nNo memories were written this turn. Do not claim anything was saved.'

  const conflictBlock = conflictContext ? `\n\nConflict to resolve:\n${conflictContext}` : ''

  return (
    `${REPLY_SYSTEM_PROMPT}\n\nThe current project is ${projectName || 'unnamed'}. The current speaker is ${speaker}.` +
    `\n\nProject memories:\n${JSON.stringify(memorySummary)}` +
    savedBlock +
    conflictBlock
  )
}
