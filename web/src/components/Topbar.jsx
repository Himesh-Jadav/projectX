import { Menu, BookOpen, Plus, Wind } from 'lucide-react'
import { useAmbient } from './AmbientContext'

const Topbar = ({
  projectName = 'Workspace',
  onOpenMobileSidebar,
  memoryCount = 0,
  memoryOpen = false,
  onToggleMemory,
  onOpenInvite,
  isOwner = false,
  invitationsCount = 0,
  onOpenInvitations,
  hasMessages = false,
  isLive = true
}) => {
  const { ambient, toggleAmbient } = useAmbient()

  const headerBg = hasMessages
    ? 'border-b border-jet-650 bg-jet-950/70'
    : 'border-b border-transparent bg-transparent'

  return (
    <header
      className={`flex h-14 shrink-0 items-center justify-between px-4 transition-colors duration-200 select-none ${headerBg}`}
    >
      {/* Left section */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          aria-label="Open navigation menu"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-jet-400 hover:bg-jet-800 hover:text-jet-100 lg:hidden transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>

        <span className="font-display text-base font-semibold text-jet-100 truncate max-w-[200px] sm:max-w-[320px]">
          {projectName}
        </span>

        {/* Live indicator per section 8.3 */}
        <div className="flex items-center gap-1.5 ml-1">
          {isLive ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-500" />
              </span>
              <span className="font-mono text-xs text-jet-400">Live</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full border border-jet-500 inline-block" />
              <span className="font-mono text-xs text-jet-500">Polling</span>
            </>
          )}
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {/* Invitations indicator button */}
        {invitationsCount > 0 && (
          <button
            type="button"
            onClick={onOpenInvitations}
            aria-label={`View ${invitationsCount} workspace invitations`}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-jet-700 bg-transparent px-3 text-xs font-medium text-jet-200 hover:bg-jet-800 hover:border-[#3A4157] active:translate-y-px transition-all"
          >
            <span>Invitations ({invitationsCount})</span>
          </button>
        )}

        {/* Memory panel toggle */}
        <button
          type="button"
          onClick={onToggleMemory}
          aria-expanded={memoryOpen}
          aria-label="Toggle memory panel"
          className={`flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium transition-all active:translate-y-px ${
            memoryOpen
              ? 'bg-jet-800 border border-jet-650 text-neon-300'
              : 'border border-jet-700 bg-transparent text-jet-100 hover:bg-jet-800 hover:border-[#3A4157]'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          <span>Memory</span>
          <span className="font-mono text-[11px] text-neon-300">
            {memoryCount}
          </span>
        </button>

        {/* Invite button (owners only) */}
        {isOwner && (
          <button
            type="button"
            onClick={onOpenInvite}
            aria-label="Invite members"
            className="flex h-9 items-center gap-1.5 rounded-xl border border-jet-700 bg-transparent px-3 text-xs font-medium text-jet-100 hover:bg-jet-800 hover:border-[#3A4157] active:translate-y-px transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Invite</span>
          </button>
        )}

        {/* Ambient toggle (replaces sun/moon per section 8.3) */}
        <button
          type="button"
          onClick={toggleAmbient}
          title="Ambient motion on/off"
          aria-label="Toggle ambient motion"
          className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
            ambient
              ? 'text-cerulean-300 hover:bg-jet-800'
              : 'text-jet-500 hover:bg-jet-800 hover:text-jet-400'
          }`}
        >
          <Wind className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}

export default Topbar

