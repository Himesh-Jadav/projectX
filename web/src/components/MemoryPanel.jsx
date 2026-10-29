import { X, Sparkles, BookOpen, Clock } from 'lucide-react'
import MemoryCard from './MemoryCard'

const formatDateLabel = (value) => {
  if (!value) return 'Just now'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return 'Recently'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

const MemoryPanel = ({
  allMemories = [],
  lastUsed = [],
  needsReview = [],
  activity = [],
  timeline = [],
  historicalTimeline = null,
  timelineAsOf = '',
  onTimelineAsOf,
  timelineLoading = false,
  tab = 'used',
  onSelectTab,
  onClose,
  selectedId = '',
  onSelectMemory,
  onMutateMemory,
  onResolveConflict,
  onWithdrawConflict,
  currentUser,
  currentProjectRole,
  typeFilter = 'all',
  onChangeTypeFilter,
  statusFilter = 'all',
  onChangeStatusFilter
}) => {
  const isOwner = currentProjectRole === 'owner'
  const typeFilterOptions = [
    { id: 'all', label: 'All types' },
    { id: 'decision', label: 'Decisions' },
    { id: 'assumption', label: 'Assumptions' },
    { id: 'constraint', label: 'Constraints' },
    { id: 'outcome', label: 'Outcomes' }
  ]

  const statusFilterOptions = [
    { id: 'all', label: 'All statuses' },
    { id: 'active', label: 'Active' },
    { id: 'pending', label: 'Pending' },
    { id: 'superseded', label: 'Superseded' },
    { id: 'invalid', label: 'Invalid' }
  ]

  return (
    <aside
      aria-label="Project memory"
      className="flex h-full w-[380px] flex-col border-l border-jet-650 bg-jet-900 select-none overflow-hidden"
    >
      {/* Header, 56px */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-jet-650 px-4">
        <div className="flex items-center gap-2.5">
          <h3 className="font-display text-[17px] font-semibold text-jet-100">
            Memory
          </h3>
          <span className="rounded-lg bg-jet-800 px-2 py-0.5 font-mono text-xs text-jet-300">
            {allMemories.length}
          </span>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close memory panel"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-jet-400 hover:bg-jet-800 hover:text-jet-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tabs: segmented control per section 8.6 */}
      <div className="p-3 border-b border-jet-650">
        <div
          role="tablist"
          aria-label="Memory tabs"
          className="flex h-10 items-center rounded-xl border border-jet-650 bg-jet-950 p-1 gap-1"
        >
          {['used', 'all', 'timeline', 'activity'].map((tabKey) => {
            const isActive = tab === tabKey
            const labelMap = {
              used: 'Used',
              all: 'All',
              timeline: 'Timeline',
              activity: 'Activity'
            }
            return (
              <button
                key={tabKey}
                role="tab"
                type="button"
                aria-selected={isActive}
                onClick={() => onSelectTab(tabKey)}
                className={`flex-1 h-8 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-jet-800 text-neon-300 shadow-sm'
                    : 'text-jet-400 hover:text-jet-300'
                }`}
              >
                {labelMap[tabKey]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Body: scrolls on its own */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
        {/* Tab 1: Used */}
        {tab === 'used' && (
          <>
            {lastUsed.length > 0 ? (
              <>
                <div className="flex items-center gap-2 text-xs font-mono text-jet-400 mb-2">
                  <span className="h-2 w-2 rounded-full bg-cerulean-400 inline-block" />
                  <span>Shaped the latest reply</span>
                </div>
                {lastUsed.map((entry) => {
                  const mem = entry.memory
                  if (!mem) return null
                  const memId = String(mem._id || '')
                  const mayChange = mem.userId === currentUser?.id || isOwner
                  return (
                    <MemoryCard
                      key={memId}
                      memory={mem}
                      used
                      score={entry.finalScore ?? entry.similarity}
                      why={entry.why}
                      selected={selectedId === memId}
                      onSelect={onSelectMemory}
                      mayChange={mayChange}
                      onInvalidate={(m) => onMutateMemory(m, 'invalidate')}
                      onDelete={(m) => onMutateMemory(m, 'delete')}
                    />
                  )
                })}
              </>
            ) : (
              <div className="py-12 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-jet-500 mb-2" />
                <h4 className="text-sm font-medium text-jet-200">No memories used yet</h4>
                <p className="mt-1 text-xs text-jet-400 max-w-[260px] mx-auto">
                  When a project memory helps with a reply, it will appear here with match scores and sources.
                </p>
                <button
                  type="button"
                  onClick={() => onSelectTab('all')}
                  className="mt-4 text-xs text-cerulean-300 hover:text-cerulean-400 underline underline-offset-4"
                >
                  Browse all memories
                </button>
              </div>
            )}
          </>
        )}

        {/* Tab 2: All */}
        {tab === 'all' && (
          <>
            {/* Filter controls */}
            <div className="flex items-center gap-2 mb-3">
              <select
                value={typeFilter}
                onChange={(e) => onChangeTypeFilter(e.target.value)}
                aria-label="Filter by type"
                className="h-8 flex-1 rounded-xl border border-jet-700 bg-jet-850 px-2.5 text-xs text-jet-200 focus:border-cerulean-400 focus:outline-none"
              >
                {typeFilterOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => onChangeStatusFilter(e.target.value)}
                aria-label="Filter by status"
                className="h-8 flex-1 rounded-xl border border-jet-700 bg-jet-850 px-2.5 text-xs text-jet-200 focus:border-cerulean-400 focus:outline-none"
              >
                {statusFilterOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Needs your review block per section 8.6 */}
            {needsReview.length > 0 && (
              <div className="mb-4 rounded-2xl border border-[#642142] bg-[#231523]/50 p-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-neon-300">Needs your review</span>
                  <span className="rounded bg-neon-700/40 px-1.5 py-0.5 font-mono text-neon-300 text-[11px]">
                    {needsReview.length}
                  </span>
                </div>
                {needsReview.map((mem) => (
                  <MemoryCard
                    key={`review-${String(mem._id || Math.random())}`}
                    memory={mem}
                    onResolve={onResolveConflict}
                    onSelect={onSelectMemory}
                  />
                ))}
              </div>
            )}

            {/* Memory list */}
            {allMemories.length > 0 ? (
              allMemories.map((mem) => {
                const memId = String(mem._id || '')
                const isAuthor = mem.userId === currentUser?.id
                const isUnderReview = needsReview.some((item) => String(item._id || '') === memId)
                return (
                  <MemoryCard
                    key={memId}
                    memory={mem}
                    selected={selectedId === memId}
                    onSelect={onSelectMemory}
                    onResolve={mem.status === 'pending' && isUnderReview ? onResolveConflict : undefined}
                    onWithdraw={mem.status === 'pending' && isAuthor ? onWithdrawConflict : undefined}
                    mayChange={isAuthor || isOwner}
                    onInvalidate={(m) => onMutateMemory(m, 'invalidate')}
                    onDelete={(m) => onMutateMemory(m, 'delete')}
                  />
                )
              })
            ) : (
              <p className="py-10 text-center text-xs text-jet-400">
                No memories yet. Say what you've decided.
              </p>
            )}
          </>
        )}

        {/* Tab 3: Timeline per section 8.6 */}
        {tab === 'timeline' && (
          <div>
            <div className="flex items-center gap-2 text-xs text-jet-400 mb-3">
              <Clock className="h-3.5 w-3.5" />
              <span>Follow how project decisions have changed.</span>
            </div>

            {timeline.length > 0 && (() => {
              const min = Math.min(...timeline.map((item) => new Date(item.createdAt).getTime()).filter(Number.isFinite))
              const now = Date.now()
              const selected = timelineAsOf ? Number(timelineAsOf) : now
              return <div className="mb-4 rounded-xl border border-jet-700 bg-jet-850 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-jet-300">{timelineAsOf ? `As of ${formatDateLabel(selected)}` : 'Now'}</span>
                  <button type="button" onClick={() => onTimelineAsOf?.('')} className="rounded-lg border border-jet-700 px-2.5 py-1 text-xs text-jet-200 hover:bg-jet-800">Now</button>
                </div>
                <input aria-label="Timeline date" type="range" min={min} max={now} step={86400000} value={Math.max(min, Math.min(now, selected))} onChange={(event) => onTimelineAsOf?.(event.target.value)} className="h-1 w-full cursor-pointer accent-cerulean-400" />
              </div>
            })()}

            {timelineAsOf && <div className="mb-3 rounded-lg border border-dashed border-cerulean-400/60 px-3 py-2 text-xs font-mono text-cerulean-300">As of {formatDateLabel(Number(timelineAsOf))}</div>}

            {timelineLoading ? (
              <div className="py-8 text-center text-xs text-jet-400">
                Loading history…
              </div>
            ) : (timelineAsOf ? (historicalTimeline || []) : timeline).length > 0 ? (
              <div className="relative pl-4 space-y-4 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-jet-700">
                {(timelineAsOf ? (historicalTimeline || []) : timeline).map((item) => {
                  const isActive = timelineAsOf ? true : item.status === 'active'
                  return (
                    <div key={String(item._id || Math.random())} className="relative">
                      {/* Node dot */}
                      <span
                        className={`absolute -left-4 top-1.5 h-3 w-3 rounded-full ${
                          isActive
                            ? 'bg-cerulean-400 ring-4 ring-cerulean-500/20'
                            : 'border border-dashed border-jet-500 bg-jet-900'
                        }`}
                      />
                      <div className={`rounded-xl border ${timelineAsOf ? 'border-dashed border-cerulean-400/60' : 'border-jet-700'} bg-jet-850 p-3`}>
                        <div className="flex items-center justify-between text-xs font-mono text-jet-400">
                          <span className="uppercase text-cerulean-300 font-sans font-semibold">
                            {item.type || 'Decision'}
                          </span>
                          <span>{formatDateLabel(item.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-jet-100">
                          {item.content}
                        </p>
                        {item.reason && (
                          <p className="mt-1 text-xs text-jet-300">
                            {item.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-jet-400">
                No changes to trace. When a decision is updated, its history will appear here.
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Activity per section 8.6 */}
        {tab === 'activity' && (
          <div className="space-y-2">
            <div className="text-xs text-jet-400 mb-2">
              Project activity, newest first.
            </div>
            {activity.map((event) => {
              const eventId = String(event._id || Math.random())
              const eventAction = event.event === 'member_joined'
                ? 'joined'
                : event.event === 'member_removed'
                ? 'removed a member'
                : event.event === 'created'
                ? 'saved a memory'
                : event.event.replaceAll('_', ' ')

              return (
                <div
                  key={eventId}
                  className="rounded-xl border border-jet-700/60 bg-jet-850/60 p-2.5 text-xs text-jet-300"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-cerulean-300">
                      {event.actorName || 'A teammate'}
                    </span>
                    <span className="font-mono text-[11px] text-jet-400">
                      {formatDateLabel(event.at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-jet-200">
                    {eventAction}
                    {event.details?.content ? `: ${event.details.content}` : ''}
                  </p>
                </div>
              )
            })}
            {activity.length === 0 && (
              <div className="py-8 text-center text-xs text-jet-400">
                No recent activity.
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

export default MemoryPanel

