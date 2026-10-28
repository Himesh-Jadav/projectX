import { useState, useEffect, useRef } from 'react'
import { X, AlertTriangle } from 'lucide-react'

const DeleteWorkspaceDialog = ({ project, onClose, onDeleted, api }) => {
  const [review, setReview] = useState(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef(null)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !pending) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [pending, onClose])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      if (!review) {
        const result = await api(`/api/projects/${project.id}/deletion-review`, { method: 'POST' })
        setReview(result)
      } else {
        await api(`/api/projects/${project.id}`, {
          method: 'DELETE',
          body: JSON.stringify({ token: review.token, name, password })
        })
        onDeleted(project.id)
      }
    } catch (failure) {
      setError(failure.message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      role="presentation"
      onClick={() => { if (!pending) onClose() }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,5,7,0.72)] p-4 backdrop-blur-[6px] animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-workspace-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[500px] rounded-[20px] border border-transparent hairline-border bg-jet-850 p-6 shadow-[0_16px_48px_rgba(0,0,0,0.6)] animate-in zoom-in-98 duration-200 text-jet-100"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between border-b border-jet-700/60 pb-3">
            <div>
              <span className="font-mono text-xs uppercase tracking-wider text-neon-400">
                Step {review ? '2' : '1'} of 2
              </span>
              <h2 id="delete-workspace-title" className="font-display text-lg font-semibold text-jet-100">
                Delete workspace permanently?
              </h2>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={onClose}
              aria-label="Close delete dialog"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-jet-400 hover:bg-jet-800 hover:text-jet-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-sm leading-relaxed text-jet-300">
            <strong className="text-jet-100">{project.name}</strong> and its chats, memories, invitations and activity will be permanently removed for all members. This cannot be undone. Your account and other workspaces will remain.
          </p>

          {review && (
            <div className="space-y-3 rounded-xl bg-jet-900/80 p-3 border border-jet-700">
              <p className="font-mono text-xs text-jet-400">
                {review.counts.messages} messages · {review.counts.memories} memories · {review.counts.memberships} members
              </p>
              <div>
                <label className="block text-xs font-semibold uppercase text-jet-300 mb-1">
                  Type <span className="text-neon-300">{review.name}</span> to confirm
                </label>
                <input
                  autoFocus
                  required
                  autoComplete="off"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-10 w-full rounded-xl border border-jet-500 bg-jet-900 px-3 text-sm text-jet-100 focus:border-neon-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-jet-300 mb-1">
                  Your account password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 w-full rounded-xl border border-jet-500 bg-jet-900 px-3 text-sm text-jet-100 focus:border-neon-400 focus:outline-none"
                />
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-neon-600/40 bg-neon-700/20 p-2.5 text-xs text-neon-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-neon-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={pending}
              onClick={onClose}
              className="h-10 rounded-xl border border-jet-700 px-4 text-sm font-medium text-jet-300 hover:bg-jet-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || (review && (name !== review.name || !password))}
              className="h-10 rounded-xl bg-neon-700 px-4 text-sm font-medium text-white transition hover:bg-[#C2145F] disabled:bg-jet-800 disabled:text-jet-500"
            >
              {pending ? 'Please wait…' : review ? 'Permanently delete workspace' : 'Continue to verification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default DeleteWorkspaceDialog

