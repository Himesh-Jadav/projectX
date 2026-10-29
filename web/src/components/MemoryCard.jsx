import { useState } from 'react'
import { Trash2, X, ChevronDown, Sparkles } from 'lucide-react'
import StatusMarker from './StatusMarker'

const formatDateLabel = (value) => {
  if (!value) return 'Just now'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return 'Recently'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

const getTypeLabel = (type) => {
  const map = {
    decision: 'Decision',
    assumption: 'Assumption',
    constraint: 'Constraint',
    outcome: 'Outcome'
  }
  return map[type] || type || 'Memory'
}
const hasUnconfirmedBase = (memory) => (memory.basedOn ?? []).some((base) => ['invalid', 'superseded'].includes(base.status) && (!memory.lastConfirmedAt || new Date(memory.lastConfirmedAt).getTime() < new Date(base.statusChangedAt).getTime()))

const MemoryCard = ({
  memory,
  used = false,
  score,
  why,
  selected = false,
  onSelect,
  onDelete,
  onInvalidate,
  onResolve,
  onWithdraw,
  mayChange = true,
  compact = false
}) => {
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const percent = Math.max(0, Math.min(100, Math.round((score ?? 0) * 100)))

  const handleClick = () => {
    if (onSelect) onSelect(memory)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (onSelect) onSelect(memory)
    }
  }

  const handleToggleQuote = (event) => {
    event.stopPropagation()
    setQuoteOpen((prev) => !prev)
  }

  const handleConfirmDelete = (event) => {
    event.stopPropagation()
    setConfirmDelete(true)
  }

  const handleCancelDelete = (event) => {
    event.stopPropagation()
    setConfirmDelete(false)
  }

  const handleExecuteDelete = (event) => {
    event.stopPropagation()
    if (onDelete) onDelete(memory)
    setConfirmDelete(false)
  }

  const handleInvalidate = (event) => {
    event.stopPropagation()
    if (onInvalidate) onInvalidate(memory)
  }

  const handleResolveKeep = (event) => {
    event.stopPropagation()
    if (onResolve) onResolve(memory, 'keep')
  }

  const handleResolveOverride = (event) => {
    event.stopPropagation()
    if (onResolve) onResolve(memory, 'override')
  }

  const handleWithdraw = (event) => {
    event.stopPropagation()
    if (onWithdraw) onWithdraw(memory)
  }

  const selectedClasses = selected
    ? 'border-neon-500 shadow-[0_0_0_1px_rgba(255,61,139,0.50),0_0_28px_rgba(255,61,139,0.22)]'
    : 'border-jet-650 hover:border-jet-700 hover:bg-[#13151E]'

  return (
    <article
      tabIndex={0}
      role="button"
      aria-label={`Memory: ${memory.content}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      id={`memory-${memory._id}`}
      className={`group relative rounded-2xl bg-jet-850 p-4 transition-all duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)] focus-visible:outline-2 focus-visible:outline-cerulean-300 ${selectedClasses}`}
    >
      {/* Top row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs uppercase tracking-[0.06em] text-jet-300 border border-jet-700 rounded-lg px-2 py-0.5">{getTypeLabel(memory.type)}</span>
          {['assumption', 'constraint'].includes(memory.type) && Number(memory.supportsCount) > 0 ? <span className="font-mono text-[11px] text-jet-300 border border-jet-700 rounded-lg px-2 py-0.5">Supports {memory.supportsCount}</span> : null}
        </div>
        <div className="flex items-center gap-2">{hasUnconfirmedBase(memory) && <span className="text-xs text-cerulean-300">Base changed</span>}<StatusMarker status={memory.status || 'active'} /></div>
      </div>

      {/* Content */}
      <h3 className="mt-2 text-[15px] font-medium leading-snug text-jet-100">
        {memory.content}
      </h3>

      {/* Reason */}
      {memory.reason && (
        <p className="mt-1 text-[13px] leading-[19px] text-jet-300">
          {memory.reason}
        </p>
      )}
      {memory.basedOn?.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5"><span className="font-mono text-[11px] text-jet-400">Based on</span>{memory.basedOn.slice(0,2).map((base) => <button key={base.id} type="button" title={base.title} onClick={(event) => { event.stopPropagation(); const target = document.getElementById(`memory-${base.id}`); target?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => { target?.classList.add('border-neon-500'); setTimeout(() => target?.classList.remove('border-neon-500'), 1200) }, 250) }} className="max-w-[190px] truncate rounded-full border border-jet-700 bg-jet-800 px-2.5 py-1 text-xs text-cerulean-300">{base.title.slice(0,28)}</button>)}{memory.basedOn.length > 2 && <span className="rounded-full border border-jet-700 px-2 py-1 text-xs text-jet-300">+{memory.basedOn.length - 2}</span>}</div>}

      {/* Author & date footer */}
      <div className="mt-2.5 flex items-center justify-between text-xs font-mono text-jet-400">
        <span>
          {memory.createdByName ? `by ${memory.createdByName}` : ''}
          {memory.createdByName ? ' · ' : ''}
          {formatDateLabel(memory.createdAt)}
        </span>
      </div>

      {/* Used tab extras: score bar and why */}
      {used && (
        <div className="mt-3 rounded-xl bg-jet-900/60 p-2.5">
          <div className="flex items-center justify-between font-mono text-xs text-jet-400">
            <span>Match score</span>
            <strong className="text-jet-100 font-semibold">{percent}%</strong>
          </div>
          <div className="mt-1.5 h-1 w-full rounded-sm bg-jet-800 overflow-hidden">
            <div
              className="h-full rounded-sm bg-score-gradient transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-jet-300">
            {why || 'Relevant to the current conversation.'}
          </p>
        </div>
      )}

      {/* Source quote details */}
      {memory.source?.quote && (
        <div className="mt-2.5">
          <button
            type="button"
            onClick={handleToggleQuote}
            className="inline-flex items-center gap-1 text-xs text-cerulean-300 hover:text-cerulean-400 focus-visible:outline-none transition-colors"
            aria-expanded={quoteOpen}
          >
            <span>{quoteOpen ? 'Hide source quote' : 'Source'}</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${quoteOpen ? 'rotate-180' : ''}`} />
          </button>
          {quoteOpen && (
            <blockquote className="mt-1.5 border-l-2 border-cerulean-500/50 pl-3 text-xs italic text-jet-300">
              “{memory.source.quote}”
            </blockquote>
          )}
        </div>
      )}

      {/* Actions */}
      {!compact && (
        <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-jet-650" onClick={(e) => e.stopPropagation()}>
          {memory.status === 'pending' ? (
            <div className="flex items-center gap-2">
              {onResolve && (
                <>
                  <button
                    type="button"
                    onClick={handleResolveOverride}
                    className="h-7 rounded-lg bg-neon-500 px-2.5 text-xs font-medium text-jet-950 transition hover:bg-neon-400 active:translate-y-px"
                  >
                    Override
                  </button>
                  <button
                    type="button"
                    onClick={handleResolveKeep}
                    className="h-7 rounded-lg border border-jet-700 bg-transparent px-2.5 text-xs font-medium text-jet-100 transition hover:bg-jet-800 active:translate-y-px"
                  >
                    Keep
                  </button>
                </>
              )}
              {onWithdraw && (
                <button
                  type="button"
                  onClick={handleWithdraw}
                  className="h-7 rounded-lg bg-transparent px-2.5 text-xs font-medium text-jet-300 transition hover:bg-jet-800 hover:text-jet-100"
                >
                  Withdraw
                </button>
              )}
              {!onResolve && !onWithdraw && (
                <span className="text-xs text-jet-400 font-mono">Waiting for review</span>
              )}
            </div>
          ) : (
            <div className="ml-auto flex items-center gap-1.5 opacity-90 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              {confirmDelete ? (
                <div className="flex items-center gap-1.5 bg-jet-900 rounded-lg px-2 py-1 border border-jet-700">
                  <span className="text-xs text-jet-300">Delete permanently?</span>
                  <button
                    type="button"
                    onClick={handleExecuteDelete}
                    className="h-6 rounded bg-neon-700 px-2 text-[11px] font-medium text-white hover:bg-[#C2145F]"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelDelete}
                    className="h-6 rounded bg-transparent px-2 text-[11px] font-medium text-jet-300 hover:text-jet-100"
                  >
                    No
                  </button>
                </div>
              ) : (
                <>
                  {mayChange && memory.status === 'active' && onInvalidate && (
                    <button
                      type="button"
                      onClick={handleInvalidate}
                      aria-label="Invalidate memory"
                      className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-jet-400 hover:bg-jet-800 hover:text-jet-200 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Invalidate</span>
                    </button>
                  )}
                  {mayChange && onDelete && (
                    <button
                      type="button"
                      onClick={handleConfirmDelete}
                      aria-label="Delete memory"
                      title="Delete memory"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-jet-400 hover:bg-jet-800 hover:text-neon-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

export default MemoryCard

