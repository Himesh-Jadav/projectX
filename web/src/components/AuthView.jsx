import { useState } from 'react'
import { ArrowRight, User, Lock, Mail, AlertTriangle } from 'lucide-react'

const FloatingInput = ({
  id,
  type = 'text',
  label,
  value,
  onChange,
  icon: IconComponent,
  required = false,
  minLength,
  maxLength,
  pattern,
  title,
  autoComplete
}) => {
  const [isFocused, setIsFocused] = useState(false)
  const isFloating = isFocused || (value && value.length > 0)

  const handleFocus = () => {
    setIsFocused(true)
  }

  const handleBlur = () => {
    setIsFocused(false)
  }

  return (
    <div className="relative pt-4">
      {IconComponent && (
        <div className="pointer-events-none absolute bottom-2.5 left-0 flex items-center">
          <IconComponent
            className={`h-4 w-4 transition-colors duration-150 ${
              isFocused ? 'text-cerulean-300' : 'text-jet-400'
            }`}
          />
        </div>
      )}

      <label
        htmlFor={id}
        className={`pointer-events-none absolute select-none transition-all duration-150 ${
          IconComponent ? 'left-6' : 'left-0'
        } ${
          isFloating
            ? `top-0 text-xs font-medium ${isFocused ? 'text-cerulean-300' : 'text-jet-300'}`
            : 'top-5 text-[15px] text-jet-400'
        }`}
      >
        {label}
      </label>

      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        pattern={pattern}
        title={title}
        autoComplete={autoComplete}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={`w-full border-b-2 bg-transparent pb-2 pt-1 text-[15px] text-jet-100 transition-colors focus:outline-none ${
          IconComponent ? 'pl-6' : 'pl-0'
        } ${
          isFocused ? 'border-cerulean-400' : 'border-jet-500 hover:border-jet-400'
        }`}
      />
    </div>
  )
}

const AuthView = ({
  authMode = 'login',
  onChangeAuthMode,
  loginForm,
  onChangeLoginForm,
  onSubmit,
  authError,
  inviteToken,
  invitePreview,
  inviteError,
  onJoinInvite
}) => {
  if (inviteToken) {
    return (
      <div className="relative flex min-h-screen w-full flex-col items-center justify-center p-4">
        {/* Logo at the top of the screen: centred, 24px from top, 40px desktop, 32px mobile */}
        <div className="absolute top-6 inset-x-0 flex justify-center">
          <img src="/dark_logo.png" alt="Smaran.ai" className="h-8 sm:h-10 w-auto object-contain" />
        </div>

        <div className="w-full max-w-[400px] rounded-[20px] border border-white/10 bg-[#0A0B10]/60 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-[20px] text-jet-100">
          <h1 className="font-display mb-2 text-2xl font-semibold tracking-tight text-jet-100">
            {invitePreview ? `Join ${invitePreview.project.name}` : 'Join project'}
          </h1>
          <p className="mb-6 text-sm text-jet-300">
            {invitePreview ? `Invited by ${invitePreview.invitedBy}` : inviteError || 'Loading invite…'}
          </p>

          {inviteError && (
            <div role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-neon-400/40 bg-neon-700/20 p-2.5 text-xs text-neon-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-neon-400" />
              <span>{inviteError}</span>
            </div>
          )}

          {invitePreview && (
            <button
              type="button"
              onClick={onJoinInvite}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-cerulean-500 font-medium text-jet-950 transition-all duration-150 hover:bg-cerulean-400 hover:shadow-[0_0_20px_rgba(27,163,230,0.35)] active:translate-y-px active:bg-cerulean-600"
            >
              <span>Join workspace</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    )
  }

  const handleSelectLogin = () => {
    onChangeAuthMode('login')
  }

  const handleSelectSignup = () => {
    onChangeAuthMode('signup')
  }

  const handleUsernameChange = (event) => {
    onChangeLoginForm({ ...loginForm, username: event.target.value })
  }

  const handleEmailChange = (event) => {
    onChangeLoginForm({ ...loginForm, email: event.target.value })
  }

  const handlePasswordChange = (event) => {
    onChangeLoginForm({ ...loginForm, password: event.target.value })
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center p-4">
      {/* 8.7: Logo at the top of the screen: centred, 24px from top (h-40px desktop, 32px mobile) */}
      <div className="absolute top-6 inset-x-0 flex justify-center">
        <img src="/dark_logo.png" alt="Smaran.ai" className="h-8 sm:h-10 w-auto object-contain" />
      </div>

      {/* 8.7: Glass card: centred, width 400, fill rgba(10,11,16,0.62) with blur(20px), border 1px rgba(255,255,255,0.10), radius 20, padding 32 */}
      <div className="w-full max-w-[400px] rounded-[20px] border border-white/10 bg-[#0A0B10]/60 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-[20px] text-jet-100">
        <div className="mb-6 text-center">
          <h1 className="font-display text-[28px] font-semibold tracking-tight text-jet-100">
            {authMode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mt-1 text-sm text-jet-300">
            {authMode === 'login'
              ? 'Sign in to access your project memories'
              : 'Start capturing decisions that stay with you'}
          </p>
        </div>

        {/* Log in / Sign up segmented control */}
        <div className="mb-6 flex h-10 rounded-xl border border-jet-700 bg-jet-900/80 p-1">
          <button
            type="button"
            onClick={handleSelectLogin}
            className={`flex-1 rounded-lg text-xs font-medium transition-all duration-150 ${
              authMode === 'login'
                ? 'bg-jet-800 text-jet-100 shadow'
                : 'text-jet-400 hover:text-jet-200'
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={handleSelectSignup}
            className={`flex-1 rounded-lg text-xs font-medium transition-all duration-150 ${
              authMode === 'signup'
                ? 'bg-jet-800 text-jet-100 shadow'
                : 'text-jet-400 hover:text-jet-200'
            }`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {authMode === 'signup' && (
            <div>
              <FloatingInput
                id="auth-username"
                label="Username"
                value={loginForm.username}
                onChange={handleUsernameChange}
                icon={User}
                required
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9_]{3,30}"
                title="3-30 letters, numbers or underscores"
                autoComplete="username"
              />
              <span className="mt-1 block text-[11px] text-jet-400">
                3-30 letters, numbers or underscores
              </span>
            </div>
          )}

          <FloatingInput
            id="auth-email"
            type="email"
            label="Email"
            value={loginForm.email}
            onChange={handleEmailChange}
            icon={Mail}
            required
            autoComplete="email"
          />

          <FloatingInput
            id="auth-password"
            type="password"
            label="Password"
            value={loginForm.password}
            onChange={handlePasswordChange}
            icon={Lock}
            required
            minLength={authMode === 'signup' ? 8 : undefined}
            autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
          />

          {authError && (
            <div role="alert" className="mt-3 flex items-center gap-2 rounded-xl border border-neon-400/30 bg-neon-700/20 p-2.5 text-xs text-neon-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-neon-400" />
              <span>{authError}</span>
            </div>
          )}

          <button
            type="submit"
            className="group mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-cerulean-500 font-medium text-jet-950 transition-all duration-150 hover:bg-cerulean-400 hover:shadow-[0_0_20px_rgba(27,163,230,0.35)] active:translate-y-px active:bg-cerulean-600"
          >
            <span>{authMode === 'signup' ? 'Sign up' : 'Log in'}</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-1" />
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-jet-300">
          {authMode === 'login' ? (
            <span>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={handleSelectSignup}
                className="font-medium text-cerulean-300 transition-colors hover:text-cerulean-400 focus-visible:outline-2 focus-visible:outline-cerulean-300"
              >
                Sign up
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{' '}
              <button
                type="button"
                onClick={handleSelectLogin}
                className="font-medium text-cerulean-300 transition-colors hover:text-cerulean-400 focus-visible:outline-2 focus-visible:outline-cerulean-300"
              >
                Log in
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default AuthView
