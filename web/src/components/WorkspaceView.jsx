import { useRef, useEffect } from 'react'
import { Sparkles, Check, X, Users, User } from 'lucide-react'
import Topbar from './Topbar'
import ChatMessage, { TypingIndicator } from './ChatMessage'
import ChatComposer from './ChatComposer'
import MemoryPanel from './MemoryPanel'

const QUICK_ACTIONS = [
  'Decided on MongoDB for the main database',
  'Assuming most students will use mobile phones',
  'Constraint: no paid APIs during demo period',
  'Targeting launch for next semester'
]

const WorkspaceView = ({
  project,
  messages = [],
  hasOlderMessages = false,
  loadingOlderMessages = false,
  onLoadOlderMessages,
  busy = false,
  draft = '',
  onChangeDraft,
  onSendMessage,
  memoryEnabled = true,
  onToggleMemoryEnabled,
  memoryPanelOpen = false,
  onToggleMemoryPanel,
  onCloseMemoryPanel,
  onOpenMobileSidebar,
  onOpenInvite,
  isOwner = false,
  invitationsCount = 0,
  onOpenInvitations,
  onNewSession,
  conversationScope = 'personal',
  onChangeConversationScope,
  checkIns = [],
  onMutateMemory,
  pageError = '',
  onRetrySession,
  allMemories = [],
  lastUsed = [],
  needsReview = [],
  activity = [],
  timeline = [],
  timelineLoading = false,
  memoryTab = 'used',
  onSelectMemoryTab,
  selectedMemoryId = '',
  onSelectMemory,
  onResolveConflict,
  onWithdrawConflict,
  currentUser,
  typeFilter = 'all',
  onChangeTypeFilter,
  statusFilter = 'all',
  onChangeStatusFilter
}) => {
  const feedEndRef = useRef(null)
  const feedContainerRef = useRef(null)

  const hasMessages = messages.length > 0

  useEffect(() => {
    if (feedContainerRef.current) {
      feedContainerRef.current.scrollTo({
        top: feedContainerRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }, [messages, busy])

  const handleQuickAction = (text) => {
    onChangeDraft(text)
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Header (56px inside Main) */}
      <Topbar
        projectName={project?.name || 'Workspace'}
        onOpenMobileSidebar={onOpenMobileSidebar}
        memoryCount={allMemories.length}
        memoryOpen={memoryPanelOpen}
        onToggleMemory={onToggleMemoryPanel}
        onOpenInvite={onOpenInvite}
        isOwner={isOwner}
        invitationsCount={invitationsCount}
        onOpenInvitations={onOpenInvitations}
        onNewSession={onNewSession}
        hasMessages={hasMessages}
        isLive={true}
      />

      {/* Main body: Chat column + optional docked Memory panel */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex flex-1 flex-col overflow-hidden relative">
          {/* Scrollable thread region */}
          <div
            ref={feedContainerRef}
            className="flex-1 overflow-y-auto px-4 sm:px-6 pt-4 pb-12 scrollbar-thin"
          >
            <div className="mx-auto w-full max-w-[768px] space-y-6">
              {/* Scope selector */}
              <div className="flex items-center justify-between border-b border-jet-650/60 pb-3">
                <div>
                  <span className="font-sans text-xs font-semibold uppercase tracking-[0.08em] text-jet-300">
                    {conversationScope === 'team' ? 'Team conversation' : 'Personal conversation'}
                  </span>
                  <p className="text-xs text-jet-400">
                    {conversationScope === 'team'
                      ? 'Everyone in this project shares this recent conversation.'
                      : 'Only you can see this recent conversation.'}
                  </p>
                </div>
                <div
                  role="group"
                  aria-label="Conversation scope"
                  className="flex h-8 items-center rounded-xl border border-jet-700 bg-jet-900 p-0.5 gap-0.5"
                >
                  <button
                    type="button"
                    aria-pressed={conversationScope === 'personal'}
                    onClick={() => onChangeConversationScope('personal')}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                      conversationScope === 'personal'
                        ? 'bg-jet-800 text-cerulean-300 shadow'
                        : 'text-jet-400 hover:text-jet-200'
                    }`}
                  >
                    <User className="h-3 w-3" />
                    <span>Personal</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={conversationScope === 'team'}
                    onClick={() => onChangeConversationScope('team')}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                      conversationScope === 'team'
                        ? 'bg-jet-800 text-cerulean-300 shadow'
                        : 'text-jet-400 hover:text-jet-200'
                    }`}
                  >
                    <Users className="h-3 w-3" />
                    <span>Team</span>
                  </button>
                </div>
              </div>

              {/* Check-ins card per section 8.5 */}
              {checkIns.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-mono text-neon-300">
                    <span className="h-2 w-2 rounded-full bg-neon-400 animate-pulse" />
                    <span>Things to revisit ({checkIns.length})</span>
                  </div>
                  {checkIns.map((item) => {
                    const mem = item.memory
                    if (!mem) return null
                    const memId = String(mem._id || '')
                    return (
                      <div
                        key={memId}
                        className="flex items-center justify-between rounded-2xl border-l-[3px] border-l-cerulean-400 border border-jet-700 bg-jet-850 p-4 shadow-sm"
                      >
                        <div>
                          <p className="text-sm font-medium text-jet-100">
                            {mem.content}
                          </p>
                          <small className="font-mono text-xs text-jet-400">
                            {item.kind === 'assumption_due' ? 'Assumption to review' : 'Expiring soon'}
                          </small>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onMutateMemory(mem, 'confirm')}
                            className="h-8 rounded-lg border border-jet-700 bg-transparent px-3 text-xs font-medium text-jet-100 hover:bg-jet-800"
                          >
                            Still true
                          </button>
                          <button
                            type="button"
                            onClick={() => onMutateMemory(mem, 'invalidate')}
                            className="h-8 rounded-lg bg-transparent px-2.5 text-xs font-medium text-jet-400 hover:text-neon-400 hover:bg-jet-800"
                          >
                            No longer true
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Page error banner */}
              {pageError && (
                <div className="flex items-center justify-between rounded-xl border border-neon-600/40 bg-neon-700/20 p-3 text-xs text-neon-300">
                  <span>{pageError}</span>
                  <button
                    type="button"
                    onClick={onRetrySession}
                    className="underline hover:text-white"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Hero (empty state only) */}
              {!hasMessages && (
                <div className="pt-12 pb-6 text-center animate-in fade-in duration-300">
                  <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-jet-100 mb-3">
                    Smaran<span className="text-wordmark-ai">.ai</span>
                  </h1>
                  <p className="text-base sm:text-lg text-jet-300 max-w-[480px] mx-auto">
                    Tell me what you've decided. I'll remember why.
                  </p>

                  {/* 4 quick actions per section 8.4 */}
                  <div className="mt-8 flex flex-wrap items-center justify-center gap-2 max-w-[620px] mx-auto">
                    {QUICK_ACTIONS.map((action, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleQuickAction(action)}
                        className="h-9 rounded-full border border-jet-700 bg-jet-900 px-3.5 text-xs text-jet-300 transition-all hover:border-cerulean-500/50 hover:bg-cerulean-tint hover:text-jet-100 active:translate-y-px"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Thread messages */}
              {hasMessages && (
                <div className="space-y-6 pt-2">
                  {hasOlderMessages && (
                    <div className="text-center">
                      <button type="button" onClick={onLoadOlderMessages} disabled={loadingOlderMessages} className="rounded-lg border border-jet-700 px-3 py-1.5 text-xs text-jet-300 hover:bg-jet-800 disabled:opacity-50">
                        {loadingOlderMessages ? 'Loading older messages…' : 'Load older messages'}
                      </button>
                    </div>
                  )}
                  {messages.map((message) => (
                    <ChatMessage
                      key={message.localId || Math.random()}
                      message={message}
                      onShowMemory={onSelectMemory}
                      onResolveConflict={onResolveConflict}
                      onWithdrawConflict={onWithdrawConflict}
                      currentUser={currentUser}
                      selectedMemoryId={selectedMemoryId}
                      busy={busy}
                    />
                  ))}
                  {busy && <TypingIndicator />}
                </div>
              )}

              <div ref={feedEndRef} />
            </div>
          </div>

          {/* Composer docked to bottom with 32px fade */}
          <div className="relative shrink-0 px-4 sm:px-6 pb-6 pt-2">
            <div
              className="pointer-events-none absolute -top-8 left-0 right-0 h-8 bg-gradient-to-t from-jet-950 to-transparent"
              aria-hidden="true"
            />
            <div className="mx-auto w-full max-w-[768px]">
              <ChatComposer
                draft={draft}
                onChangeDraft={onChangeDraft}
                onSendMessage={onSendMessage}
                busy={busy}
                memoryEnabled={memoryEnabled}
                onToggleMemory={onToggleMemoryEnabled}
              />
            </div>
          </div>
        </div>

        {/* Docked Memory Panel: >= 1440px (2xl) */}
        {memoryPanelOpen && (
          <div className="hidden 2xl:block shrink-0 h-full">
            <MemoryPanel
              allMemories={allMemories}
              lastUsed={lastUsed}
              needsReview={needsReview}
              activity={activity}
              timeline={timeline}
              timelineLoading={timelineLoading}
              tab={memoryTab}
              onSelectTab={onSelectMemoryTab}
              onClose={onCloseMemoryPanel}
              selectedId={selectedMemoryId}
              onSelectMemory={onSelectMemory}
              onMutateMemory={onMutateMemory}
              onResolveConflict={onResolveConflict}
              onWithdrawConflict={onWithdrawConflict}
              currentUser={currentUser}
              currentProjectRole={project?.role}
              typeFilter={typeFilter}
              onChangeTypeFilter={onChangeTypeFilter}
              statusFilter={statusFilter}
              onChangeStatusFilter={onChangeStatusFilter}
            />
          </div>
        )}

        {/* Right drawer Memory Panel below 1440px with scrim */}
        {memoryPanelOpen && (
          <div className="2xl:hidden fixed inset-0 z-40 flex justify-end">
            {/* Scrim */}
            <div
              role="presentation"
              onClick={onCloseMemoryPanel}
              className="fixed inset-0 bg-[rgba(5,5,7,0.72)] backdrop-blur-[6px] animate-in fade-in duration-200"
            />
            {/* Drawer */}
            <div className="relative z-50 h-full w-[380px] shadow-2xl animate-in slide-in-from-right duration-200">
              <MemoryPanel
                allMemories={allMemories}
                lastUsed={lastUsed}
                needsReview={needsReview}
                activity={activity}
                timeline={timeline}
                timelineLoading={timelineLoading}
                tab={memoryTab}
                onSelectTab={onSelectMemoryTab}
                onClose={onCloseMemoryPanel}
                selectedId={selectedMemoryId}
                onSelectMemory={onSelectMemory}
                onMutateMemory={onMutateMemory}
                onResolveConflict={onResolveConflict}
                onWithdrawConflict={onWithdrawConflict}
                currentUser={currentUser}
                currentProjectRole={project?.role}
                typeFilter={typeFilter}
                onChangeTypeFilter={onChangeTypeFilter}
                statusFilter={statusFilter}
                onChangeStatusFilter={onChangeStatusFilter}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default WorkspaceView

