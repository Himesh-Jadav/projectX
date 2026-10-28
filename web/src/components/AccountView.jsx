import { useState } from 'react'
import { ArrowLeft, User, LogOut } from 'lucide-react'

const AccountView = ({
  user,
  projectList = [],
  onBack,
  onSaved,
  onLogout,
  api
}) => {
  const [username, setUsername] = useState(user?.username || '')
  const [usernamePassword, setUsernamePassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')

  const handleUpdateUsername = async (event) => {
    event.preventDefault()
    setPending(true)
    setMessage('')
    try {
      const { user: saved } = await api('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ username, currentPassword: usernamePassword })
      })
      onSaved(saved)
      setUsernamePassword('')
      setMessage('Username updated.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setPending(false)
    }
  }

  const handleChangePassword = async (event) => {
    event.preventDefault()
    if (newPassword !== confirmPassword) {
      setMessage('New passwords do not match.')
      return
    }
    setPending(true)
    setMessage('')
    try {
      await api('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword })
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Password updated. Other sessions have been signed out.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setPending(false)
    }
  }

  const handleUsernameChange = (event) => {
    setUsername(event.target.value)
  }

  const handleUsernamePasswordChange = (event) => {
    setUsernamePassword(event.target.value)
  }

  const handleCurrentPasswordChange = (event) => {
    setCurrentPassword(event.target.value)
  }

  const handleNewPasswordChange = (event) => {
    setNewPassword(event.target.value)
  }

  const handleConfirmPasswordChange = (event) => {
    setConfirmPassword(event.target.value)
  }

  return (
    <div className="mx-auto w-full max-w-[640px] px-6 py-8 animate-in fade-in slide-in-from-bottom-1 duration-200">
      {/* Back to chat ghost button with an arrow at top left of column per section 8.12 */}
      <button
        type="button"
        onClick={onBack}
        tabIndex={0}
        aria-label="Back to chat"
        className="mb-4 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-jet-300 transition-colors duration-150 hover:bg-jet-800 hover:text-jet-100 focus-visible:outline-2 focus-visible:outline-cerulean-300"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to chat</span>
      </button>

      {/* h1 Account (Bricolage 28/600) */}
      <h1 className="font-display mb-6 text-[28px] font-semibold tracking-tight text-jet-100">
        Account
      </h1>

      {message && (
        <div role="status" className="mb-4 rounded-xl border border-cerulean-500/30 bg-cerulean-tint p-3 text-sm text-cerulean-300">
          {message}
        </div>
      )}

      {/* Stacked cards (jet-850, border jet-700, radius 16, padding 24, 16px gap) */}
      <div className="space-y-4">
        {/* Card 1: Profile */}
        <section className="rounded-2xl border border-jet-700 bg-jet-850 p-6">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-jet-800 font-display text-2xl font-bold uppercase text-cerulean-300">
              {user?.username ? user.username.slice(0, 1) : <User className="h-8 w-8" />}
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold text-jet-100">
                {user?.username}
              </h3>
              <p className="font-mono text-xs text-jet-400">
                {user?.email}
              </p>
            </div>
          </div>

          <form onSubmit={handleUpdateUsername} className="space-y-4 border-t border-jet-700/60 pt-4">
            <h4 className="text-sm font-semibold text-jet-200">Update username</h4>
            <div>
              <label htmlFor="account-username" className="mb-1 block font-sans text-xs font-semibold uppercase tracking-[0.08em] text-jet-300">
                Username
              </label>
              <input
                id="account-username"
                type="text"
                value={username}
                onChange={handleUsernameChange}
                pattern="[A-Za-z0-9_]{3,30}"
                minLength={3}
                maxLength={30}
                required
                className="h-11 w-full rounded-xl border border-jet-500 bg-jet-900 px-3 text-[15px] text-jet-100 placeholder-jet-400 transition-all hover:border-jet-400 focus:border-cerulean-400 focus:outline-none focus:ring-3 focus:ring-cerulean-500/25"
              />
            </div>
            <div>
              <label htmlFor="account-current-password" className="mb-1 block font-sans text-xs font-semibold uppercase tracking-[0.08em] text-jet-300">
                Current password
              </label>
              <input
                id="account-current-password"
                type="password"
                value={usernamePassword}
                onChange={handleUsernamePasswordChange}
                required
                className="h-11 w-full rounded-xl border border-jet-500 bg-jet-900 px-3 text-[15px] text-jet-100 placeholder-jet-400 transition-all hover:border-jet-400 focus:border-cerulean-400 focus:outline-none focus:ring-3 focus:ring-cerulean-500/25"
              />
            </div>
            <button
              type="submit"
              disabled={pending || username.trim().toLowerCase() === user?.username?.toLowerCase()}
              className="h-10 rounded-xl bg-cerulean-500 px-4 text-sm font-medium text-jet-950 transition-all duration-150 hover:bg-cerulean-400 hover:shadow-[0_0_20px_rgba(27,163,230,0.35)] active:translate-y-px active:bg-cerulean-600 disabled:bg-jet-800 disabled:text-jet-500"
            >
              {pending ? 'Saving...' : 'Save username'}
            </button>
          </form>
        </section>

        {/* Card 2: Workspaces and roles */}
        <section className="rounded-2xl border border-jet-700 bg-jet-850 p-6">
          <h3 className="font-display mb-4 text-base font-semibold text-jet-100">
            Workspaces ({projectList.length})
          </h3>
          <div className="space-y-2">
            {projectList.map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between rounded-xl border border-jet-700/60 bg-jet-900/60 p-3"
              >
                <div>
                  <h4 className="text-sm font-medium text-jet-100">{project.name}</h4>
                  <span className="font-mono text-xs text-jet-400">
                    ID: {project.id}
                    {project.memberCount ? ` · ${project.memberCount} members` : ''}
                  </span>
                </div>
                <span className="rounded-lg border border-jet-700 bg-jet-800 px-2 py-0.5 font-mono text-xs uppercase text-cerulean-300">
                  {project.role || 'Member'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Card 3: Password & Session */}
        <section className="space-y-6 rounded-2xl border border-jet-700 bg-jet-850 p-6">
          <form onSubmit={handleChangePassword} className="space-y-4">
            <h3 className="font-display text-base font-semibold text-jet-100">
              Change password
            </h3>
            <div>
              <label htmlFor="account-change-password-current" className="mb-1 block font-sans text-xs font-semibold uppercase tracking-[0.08em] text-jet-300">
                Current password
              </label>
              <input
                id="account-change-password-current"
                type="password"
                value={currentPassword}
                onChange={handleCurrentPasswordChange}
                required
                className="h-11 w-full rounded-xl border border-jet-500 bg-jet-900 px-3 text-[15px] text-jet-100 placeholder-jet-400 transition-all hover:border-jet-400 focus:border-cerulean-400 focus:outline-none focus:ring-3 focus:ring-cerulean-500/25"
              />
            </div>
            <div>
              <label htmlFor="account-change-password-new" className="mb-1 block font-sans text-xs font-semibold uppercase tracking-[0.08em] text-jet-300">
                New password
              </label>
              <input
                id="account-change-password-new"
                type="password"
                minLength={8}
                value={newPassword}
                onChange={handleNewPasswordChange}
                required
                className="h-11 w-full rounded-xl border border-jet-500 bg-jet-900 px-3 text-[15px] text-jet-100 placeholder-jet-400 transition-all hover:border-jet-400 focus:border-cerulean-400 focus:outline-none focus:ring-3 focus:ring-cerulean-500/25"
              />
            </div>
            <div>
              <label htmlFor="account-change-password-confirm" className="mb-1 block font-sans text-xs font-semibold uppercase tracking-[0.08em] text-jet-300">
                Confirm new password
              </label>
              <input
                id="account-change-password-confirm"
                type="password"
                minLength={8}
                value={confirmPassword}
                onChange={handleConfirmPasswordChange}
                required
                className="h-11 w-full rounded-xl border border-jet-500 bg-jet-900 px-3 text-[15px] text-jet-100 placeholder-jet-400 transition-all hover:border-jet-400 focus:border-cerulean-400 focus:outline-none focus:ring-3 focus:ring-cerulean-500/25"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="h-10 rounded-xl bg-cerulean-500 px-4 text-sm font-medium text-jet-950 transition-all duration-150 hover:bg-cerulean-400 hover:shadow-[0_0_20px_rgba(27,163,230,0.35)] active:translate-y-px active:bg-cerulean-600 disabled:bg-jet-800 disabled:text-jet-500"
            >
              Change password
            </button>
          </form>

          <div className="flex items-center justify-between border-t border-jet-700/60 pt-4">
            <div>
              <h4 className="text-sm font-medium text-jet-200">Sign out</h4>
              <p className="text-xs text-jet-400">Sign out of your active session on this device.</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              tabIndex={0}
              aria-label="Log out"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-jet-700 bg-transparent px-4 text-sm font-medium text-jet-100 transition-all duration-150 hover:border-[#3A4157] hover:bg-jet-800 active:bg-jet-700 focus-visible:outline-2 focus-visible:outline-cerulean-300"
            >
              <LogOut className="h-4 w-4" />
              <span>Log out</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

export default AccountView
