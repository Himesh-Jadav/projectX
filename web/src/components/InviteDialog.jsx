import { useState, useEffect, useRef } from 'react'
import { X, Copy, Check } from 'lucide-react'

const formatDateLabel = (value) => {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return 'Recently'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

const InviteDialog = ({
  project,
  onClose,
  invitations = [],
  onRespondInvitation,
  members = [],
  onInviteUser,
  inviteBusy = false,
  inviteUsername,
  onChangeInviteUsername,
  onCreateInviteLink,
  inviteUrl,
  inviteExpiry,
  onRemoveMember,
  currentUser
}) => {
  const [copied, setCopied] = useState(false)
  const dialogRef = useRef(null)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleCopyLink = () => {
    if (!inviteUrl) return
    navigator.clipboard?.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isOwner = project?.role === 'owner'

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,5,7,0.72)] p-4 backdrop-blur-[6px] animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] rounded-[20px] border border-transparent hairline-border bg-jet-850 p-6 shadow-[0_16px_48px_rgba(0,0,0,0.6)] animate-in zoom-in-98 duration-200 text-jet-100 max-h-[90vh] overflow-y-auto scrollbar-thin"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-jet-700/60 pb-3">
          <h2 id="invite-dialog-title" className="font-display text-lg font-semibold text-jet-100">
            {isOwner ? `Invite to ${project?.name}` : 'Workspace Invitations'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-jet-400 hover:bg-jet-800 hover:text-jet-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Existing pending invitations if any */}
        {invitations.length > 0 && (
          <div className="mt-4 space-y-2 border-b border-jet-700/60 pb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-jet-300">
              Pending invitations
            </h3>
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-xl bg-jet-900 p-3"
              >
                <div>
                  <span className="text-sm font-medium text-jet-100">{inv.workspace}</span>
                  <p className="text-xs text-jet-400">From {inv.invitedBy}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRespondInvitation(inv, 'accept')}
                    className="h-8 rounded-lg bg-cerulean-500 px-3 text-xs font-medium text-jet-950 hover:bg-cerulean-400"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => onRespondInvitation(inv, 'decline')}
                    className="h-8 rounded-lg border border-jet-700 px-3 text-xs font-medium text-jet-300 hover:bg-jet-800"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Invite by username form (owner only) */}
        {isOwner && (
          <div className="mt-4 space-y-4">
            <form onSubmit={onInviteUser} className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-jet-300">
                Invite teammate
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteUsername}
                  onChange={(e) => onChangeInviteUsername(e.target.value)}
                  placeholder="Username or email"
                  aria-label="Username or email"
                  className="h-10 flex-1 rounded-xl border border-jet-500 bg-jet-900 px-3 text-sm text-jet-100 placeholder-jet-400 focus:border-cerulean-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={inviteBusy || !inviteUsername.trim()}
                  className="h-10 rounded-xl bg-cerulean-500 px-4 text-sm font-medium text-jet-950 transition-all hover:bg-cerulean-400 disabled:bg-jet-800 disabled:text-jet-500"
                >
                  {inviteBusy ? 'Sending...' : 'Invite'}
                </button>
              </div>
            </form>

            <div className="pt-2">
              <button
                type="button"
                onClick={onCreateInviteLink}
                className="h-10 rounded-xl border border-jet-700 bg-transparent px-4 text-sm font-medium text-jet-100 hover:bg-jet-800 transition-colors"
              >
                Create invite link
              </button>

              {inviteUrl && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={inviteUrl}
                      className="h-10 flex-1 rounded-xl border border-jet-700 bg-jet-900 px-3 font-mono text-xs text-jet-200 select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-jet-700 bg-jet-800 px-3 text-xs font-medium text-jet-100 hover:bg-jet-700 transition-colors"
                    >
                      {copied ? <Check className="h-4 w-4 text-cerulean-400" /> : <Copy className="h-4 w-4" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  {inviteExpiry && (
                    <p className="text-[11px] font-mono text-jet-400">
                      Expires {formatDateLabel(inviteExpiry)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Member list */}
        <div className="mt-5 space-y-2 border-t border-jet-700/60 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-jet-300">
            Members ({members.length})
          </h3>
          <div className="space-y-1.5 max-h-[180px] overflow-y-auto scrollbar-thin">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-xl bg-jet-900/60 px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-medium text-jet-100">{member.username}</span>
                  <span className="ml-2 rounded border border-jet-700 px-1.5 py-0.5 font-mono text-[10px] uppercase text-jet-400">
                    {member.role}
                  </span>
                </div>
                {isOwner && member.id !== currentUser?.id && (
                  <button
                    type="button"
                    onClick={() => onRemoveMember(member)}
                    className="text-jet-400 hover:text-neon-400 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-xl border border-jet-700 px-4 text-xs font-medium text-jet-300 hover:bg-jet-800 hover:text-jet-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default InviteDialog

