import { Sparkles, Check, AlertTriangle } from 'lucide-react'

const renderInline = (text, prefix) => {
  const pieces = text.split(/(\*\*[^*]+?\*\*|__[^_]+?__|`[^`]+`|\*[^*\n]+?\*|_[^_\n]+?_|\[[^\]]+\]\([^)]+\))/g)
  return pieces.map((piece, index) => {
    const key = `${prefix}-${index}`
    if ((piece.startsWith('**') && piece.endsWith('**')) || (piece.startsWith('__') && piece.endsWith('__'))) {
      return <strong key={key} className="font-semibold text-jet-100">{piece.slice(2, -2)}</strong>
    }
    if (piece.startsWith('`') && piece.endsWith('`')) {
      return (
        <code key={key} className="rounded-md bg-jet-800 px-1.5 py-0.5 font-mono text-[13px] text-cerulean-300">
          {piece.slice(1, -1)}
        </code>
      )
    }
    if ((piece.startsWith('*') && piece.endsWith('*')) || (piece.startsWith('_') && piece.endsWith('_'))) {
      return <em key={key} className="italic text-jet-200">{piece.slice(1, -1)}</em>
    }
    const linkMatch = piece.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      return (
        <a
          key={key}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cerulean-300 underline underline-offset-[3px] hover:text-cerulean-400 transition-colors"
        >
          {linkMatch[1]}
        </a>
      )
    }
    return piece
  })
}

const tableCells = (line) => {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
  while (cells.length && !cells[0]) cells.shift()
  while (cells.length && !cells[cells.length - 1]) cells.pop()
  return cells
}

const isTableDivider = (line) => {
  const cells = tableCells(line)
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c))
}

const renderTableCell = (text, prefix) => {
  return text.split(/<br\s*\/?>/i).flatMap((part, index) => (
    index ? [<br key={`${prefix}-br-${index}`} />, ...renderInline(part, `${prefix}-${index}`)] : renderInline(part, `${prefix}-${index}`)
  ))
}

export const sanitizeReplyText = (text) => {
  const raw = typeof text === 'string' ? text : String(text ?? '')
  return raw.replace(/[【\[][0-9a-f]{24}[^】\]]*[】\]]/g, '')
}

const AssistantText = ({ text }) => {
  const sanitizedText = sanitizeReplyText(text)
  const lines = sanitizedText.replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let paragraph = []
  let listItems = []
  let listType = ''
  let codeLines = null

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }

  const flushList = () => {
    if (listItems.length) blocks.push({ type: listType, items: listItems })
    listItems = []
    listType = ''
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim().startsWith('```')) {
      flushParagraph()
      flushList()
      if (codeLines) {
        blocks.push({ type: 'code', text: codeLines.join('\n') })
        codeLines = null
      } else {
        codeLines = []
      }
      continue
    }
    if (codeLines) {
      codeLines.push(line)
      continue
    }
    if (!line.trim()) {
      flushParagraph()
      flushList()
      continue
    }

    if (line.includes('|') && lines[i + 1]?.includes('|') && isTableDivider(lines[i + 1])) {
      flushParagraph()
      flushList()
      const headers = tableCells(line)
      const rows = []
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(tableCells(lines[i]))
        i += 1
      }
      i -= 1
      blocks.push({ type: 'table', headers, rows })
      continue
    }

    if (/^>\s?/.test(line)) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'blockquote', text: line.replace(/^>\s?/, '') })
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph()
      if (listType !== 'unordered') flushList()
      listType = 'unordered'
      listItems.push(line.replace(/^[-*]\s+/, ''))
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      flushParagraph()
      if (listType !== 'ordered') flushList()
      listType = 'ordered'
      listItems.push(line.replace(/^\d+\.\s+/, ''))
      continue
    }

    paragraph.push(line)
  }

  flushParagraph()
  flushList()
  if (codeLines) blocks.push({ type: 'code', text: codeLines.join('\n') })

  return (
    <div className="space-y-3 [overflow-wrap:anywhere]">
      {blocks.map((block, index) => {
        if (block.type === 'unordered' || block.type === 'ordered') {
          const Tag = block.type === 'ordered' ? 'ol' : 'ul'
          return (
            <Tag
              key={`list-${index}`}
              className={`space-y-2 pl-5 ${block.type === 'ordered' ? 'list-decimal' : 'list-disc'} text-jet-200`}
            >
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx}>{renderInline(item, `list-${index}-${itemIdx}`)}</li>
              ))}
            </Tag>
          )
        }
        if (block.type === 'code') {
          return (
            <div key={`code-${index}`} className="my-3 overflow-x-auto rounded-xl border border-jet-700 bg-jet-900 p-3 font-mono text-[13px] leading-relaxed text-jet-100 scrollbar-thin">
              <pre className="whitespace-pre">
                <code>{block.text}</code>
              </pre>
            </div>
          )
        }
        if (block.type === 'blockquote') {
          return (
            <blockquote key={`quote-${index}`} className="border-l-2 border-cerulean-500/50 pl-3.5 italic text-jet-300">
              {renderInline(block.text, `quote-${index}`)}
            </blockquote>
          )
        }
        if (block.type === 'table') {
          return (
            <div key={`table-${index}`} className="my-3 overflow-x-auto rounded-xl border border-jet-700 bg-jet-900/60 p-1 scrollbar-thin">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-jet-700 bg-jet-800">
                    {block.headers.map((h, hIdx) => (
                      <th key={hIdx} className="p-2 font-semibold text-jet-100">
                        {renderTableCell(h, `th-${index}-${hIdx}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-jet-700/60">
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {block.headers.map((_, cIdx) => (
                        <td key={cIdx} className="p-2 text-jet-200">
                          {renderTableCell(row[cIdx] || '', `td-${index}-${rIdx}-${cIdx}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        return (
          <p key={`p-${index}`} className="text-base leading-[26px] text-jet-100">
            {renderInline(block.text, `p-${index}`)}
          </p>
        )
      })}
    </div>
  )
}

const ChatMessage = ({
  message,
  onShowMemory,
  onResolveConflict,
  onWithdrawConflict,
  currentUser,
  selectedMemoryId,
  busy = false
}) => {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex w-full justify-end animate-in fade-in slide-in-from-bottom-2 duration-150">
        <div className="ml-auto w-fit max-w-[75%] rounded-[18px_18px_6px_18px] border border-cerulean-500/35 bg-[#09212F] px-4 py-3 text-[15px] leading-[22px] text-[#EAF7FF] [overflow-wrap:anywhere]">
          {message.text}
        </div>
      </div>
    )
  }

  // Assistant response
  return (
    <div className="flex w-full items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-150">
      {/* 32px avatar tile */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-jet-800 text-cerulean-300">
        <Sparkles className="h-4 w-4" />
      </div>

      <div className="min-w-0 max-w-full flex-1">
        {/* Bubble */}
        <div className="w-fit max-w-full rounded-[18px_18px_18px_6px] border border-jet-700 bg-jet-850 px-[18px] py-3.5 text-base leading-[26px] text-jet-100 shadow-sm [overflow-wrap:anywhere]">
          <AssistantText text={message.text} />
        </div>

        {/* Memory off note if applicable */}
        {message.memoryOff && (
          <div className="mt-1 text-xs font-mono text-jet-400">
            Memory off
          </div>
        )}

        {/* Memory chips per section 8.5 */}
        {message.used && message.used.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {message.used.map(({ memory }) => {
              if (!memory) return null
              const memId = String(memory._id || '')
              const isSelected = selectedMemoryId === memId
              const chipType = (memory.type || 'memory').toUpperCase()
              const chipContent = memory.content.slice(0, 40) + (memory.content.length > 40 ? '…' : '')

              return (
                <button
                  key={memId}
                  type="button"
                  onClick={() => onShowMemory && onShowMemory(memory)}
                  title={memory.content}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-all duration-150 ${
                    isSelected
                      ? 'border-neon-500 bg-[#401B31] text-neon-300 shadow-[0_0_0_1px_rgba(255,61,139,0.50),0_0_28px_rgba(255,61,139,0.22)]'
                      : 'border-[#642142] bg-[#2D1728] text-neon-300 hover:bg-[#401B31] hover:shadow-[0_0_20px_rgba(255,61,139,0.35)]'
                  }`}
                >
                  <span className="font-mono text-xs uppercase tracking-wider text-neon-300">
                    {chipType}
                  </span>
                  <span className="text-jet-400">·</span>
                  <span className="font-sans text-[13px] text-neon-300 truncate max-w-[220px]">
                    {chipContent}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Conflict card inline per section 8.5 */}
        {message.conflicts && message.conflicts.length > 0 && (
          <div className="mt-4 space-y-3">
            {message.conflicts.map((conflict) => {
              const pendingMemory = conflict.pending
              if (!pendingMemory) return null
              const canResolve = conflict.canResolveNow !== false
              const isAuthor = pendingMemory.userId === currentUser?.id

              return (
                <div
                  key={String(pendingMemory._id || Math.random())}
                  className="rounded-2xl border border-[#642142] bg-[#231523] p-4 text-jet-100"
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-semibold text-neon-300 tracking-wider">
                      CONFLICT
                    </span>
                    <span className="text-jet-400">
                      {pendingMemory.createdByName ? `by ${pendingMemory.createdByName}` : ''}
                      {pendingMemory.createdAt ? ` · ${new Date(pendingMemory.createdAt).toLocaleDateString()}` : ''}
                    </span>
                  </div>

                  <p className="mt-2 text-[15px] font-medium text-jet-100">
                    {pendingMemory.content}
                  </p>

                  {pendingMemory.reason && (
                    <p className="mt-1 text-[13px] text-jet-300">
                      {pendingMemory.reason}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-2 pt-2 border-t border-[#642142]/40">
                    {canResolve ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onResolveConflict && onResolveConflict(pendingMemory, 'override')}
                          className="h-9 rounded-xl bg-neon-500 px-4 text-sm font-medium text-jet-950 transition-all hover:bg-neon-400 hover:shadow-[0_0_20px_rgba(255,61,139,0.35)] active:translate-y-px active:bg-neon-600 disabled:bg-jet-800 disabled:text-jet-500"
                        >
                          Override
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onResolveConflict && onResolveConflict(pendingMemory, 'keep')}
                          className="h-9 rounded-xl border border-jet-700 bg-transparent px-4 text-sm font-medium text-jet-100 transition hover:bg-jet-800 active:translate-y-px"
                        >
                          Keep
                        </button>
                      </>
                    ) : isAuthor ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onWithdrawConflict && onWithdrawConflict(pendingMemory)}
                        className="h-9 rounded-xl bg-transparent px-4 text-sm font-medium text-jet-300 hover:bg-jet-800 hover:text-jet-100 transition-colors"
                      >
                        Withdraw
                      </button>
                    ) : (
                      <span className="text-xs text-jet-300">
                        Waiting for {conflict.targetAuthorName || conflict.target?.createdByName || 'author'} review
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Saved notification */}
        {message.changes && message.changes.filter((c) => c.kind === 'created').length > 0 && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-cerulean-300">
            <Check className="h-3.5 w-3.5" />
            <span>
              {message.changes.filter((c) => c.kind === 'created').length}{' '}
              {message.changes.filter((c) => c.kind === 'created').length === 1 ? 'memory' : 'memories'} saved
            </span>
          </div>
        )}

        {/* Notices */}
        {message.notices && message.notices.filter((n) => !n.toLowerCase().includes('not saved: looks like a secret')).map((notice, nIdx) => (
          <div key={nIdx} className="mt-1.5 flex items-center gap-1.5 text-xs text-neon-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{notice}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export const TypingIndicator = () => (
  <div className="flex w-full items-start gap-3 animate-in fade-in duration-150">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-jet-800 text-cerulean-300">
      <Sparkles className="h-4 w-4" />
    </div>
    <div className="flex h-10 items-center gap-1.5 rounded-[18px_18px_18px_6px] border border-jet-700 bg-jet-850 px-4">
      <span className="h-1.5 w-1.5 rounded-full bg-cerulean-400 animate-pulse" />
      <span className="h-1.5 w-1.5 rounded-full bg-cerulean-400 animate-pulse [animation-delay:200ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-cerulean-400 animate-pulse [animation-delay:400ms]" />
    </div>
  </div>
)

export default ChatMessage

