import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, AlertTriangle, X, PanelLeft } from 'lucide-react'
import { AmbientProvider, useAmbient } from './components/AmbientContext'
import Backdrop from './components/Backdrop'
import Sidebar from './components/Sidebar'
import WorkspaceView from './components/WorkspaceView'
import AccountView from './components/AccountView'
import EmptyStateView from './components/EmptyStateView'
import AuthView from './components/AuthView'
import InviteDialog from './components/InviteDialog'
import DeleteWorkspaceDialog from './components/DeleteWorkspaceDialog'

const idOf = (memory) => String(memory?._id ?? '')

const responseText = (value) => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    for (const key of ['reply', 'text', 'content', 'message']) {
      if (typeof value[key] === 'string') return value[key]
    }
    return JSON.stringify(value, null, 2)
  }
  return value == null ? '' : String(value)
}

const api = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  })
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
  return data
}

const useProjectStream = (projectId, onEvent) => {
  useEffect(() => {
    if (!projectId || !onEvent) return undefined
    let polling = false
    let timer
    const stream = new EventSource(`/api/projects/${encodeURIComponent(projectId)}/stream`, { withCredentials: true })
    stream.addEventListener('memory', (event) => {
      let payload = {}
      try { payload = JSON.parse(event.data) } catch {}
      onEvent(payload)
    })
    stream.onerror = () => {
      if (polling) return
      polling = true
      stream.close()
      timer = setInterval(() => onEvent(null), 3000)
    }
    return () => {
      stream.close()
      clearInterval(timer)
    }
  }, [projectId, onEvent])
}

const AppContent = () => {
  const { ambient } = useAmbient()

  // Authentication & Projects state
  const [user, setUser] = useState(null)
  const [projectId, setProjectId] = useState('')
  const [projectList, setProjectList] = useState([])
  const [authPending, setAuthPending] = useState(true)
  const [authError, setAuthError] = useState('')
  const [authMode, setAuthMode] = useState('login')
  const [login, setLogin] = useState({ username: '', email: '', password: '' })
  const [invitations, setInvitations] = useState([])

  // Workspace & dialog states
  const [projectSearch, setProjectSearch] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const [deleteProject, setDeleteProject] = useState(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteExpiry, setInviteExpiry] = useState('')
  const [members, setMembers] = useState([])
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [activity, setActivity] = useState([])

  // Invite link parsing
  const [inviteToken, setInviteToken] = useState(() => window.location.pathname.match(/^\/invite\/([^/]+)/)?.[1] || '')
  const [invitePreview, setInvitePreview] = useState(null)
  const [inviteError, setInviteError] = useState('')

  // Shell views & responsiveness
  const [accountViewActive, setAccountViewActive] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('smaran:sidebar-collapsed') === 'true'
    } catch {
      return false
    }
  })
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false)

  // Chat conversation state
  const [conversationScope, setConversationScope] = useState('personal')
  const [sessionId, setSessionId] = useState('personal')
  const [messages, setMessages] = useState([])
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const [draft, setDraft] = useState('')
  const [memoryEnabled, setMemoryEnabled] = useState(true)
  const [checkIns, setCheckIns] = useState([])
  const [busy, setBusy] = useState(false)
  const [pageError, setPageError] = useState('')

  // Memory panel data
  const [memoryTab, setMemoryTab] = useState('used')
  const [lastUsed, setLastUsed] = useState([])
  const [allMemories, setAllMemories] = useState([])
  const [needsReview, setNeedsReview] = useState([])
  const [selectedMemoryId, setSelectedMemoryId] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [timeline, setTimeline] = useState([])
  const [timelineLoading, setTimelineLoading] = useState(false)

  // Toast notification
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const startedRef = useRef(false)
  const [sessionLoading, setSessionLoading] = useState(true)

  const projectPath = useCallback((path) => `/api/projects/${projectId}${path}`, [projectId])

  const notify = useCallback((message, kind = 'success') => {
    setToast({ message, kind })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  // Backdrop mode calculation per section 12.3:
  // not logged in -> "smoke-strong"
  // workspace, thread has 0 messages -> "smoke-soft"
  // anything else -> "calm"
  const backdropMode = useMemo(() => {
    if (!user) return 'smoke-strong'
    if (accountViewActive || !projectId) return 'calm'
    if (sessionLoading) return 'calm'
    if (messages.length === 0) return 'smoke-soft'
    return 'calm'
  }, [user, accountViewActive, projectId, sessionLoading, messages.length])

  // Key listener for closing overlays (Esc key rule per section 2)
  useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (inviteOpen) {
          setInviteOpen(false)
          return
        }
        if (deleteProject) {
          setDeleteProject(null)
          return
        }
        if (mobileSidebarOpen) {
          setMobileSidebarOpen(false)
          return
        }
        if (memoryPanelOpen) {
          setMemoryPanelOpen(false)
          return
        }
        if (accountViewActive) {
          setAccountViewActive(false)
          return
        }
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [inviteOpen, deleteProject, mobileSidebarOpen, memoryPanelOpen, accountViewActive])

  // Initial user & project load
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const { user: currentUser } = await api('/api/auth/me')
        const { projects } = await api('/api/projects')
        const { invitations: pendingInvites = [] } = await api('/api/invitations')
        setUser(currentUser)
        setProjectList(projects || [])
        setInvitations(pendingInvites)
        let remembered = ''
        try { remembered = localStorage.getItem('smaran:lastProject') || localStorage.getItem('hindsight:lastProject') || '' } catch {}
        const defaultProject = projects?.some((p) => p.id === remembered) ? remembered : (projects?.[0]?.id || '')
        setProjectId(defaultProject)
      } catch {
        // Not logged in
      } finally {
        setAuthPending(false)
      }
    }
    fetchInitialData()
  }, [])

  // Invite token fetch
  useEffect(() => {
    if (!user || !inviteToken) return
    api(`/api/invites/${encodeURIComponent(inviteToken)}`)
      .then(setInvitePreview)
      .catch((error) => setInviteError(error.message))
  }, [user, inviteToken])

  const handleToggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem('smaran:sidebar-collapsed', String(next)) } catch {}
      return next
    })
  }

  const handleSignIn = async (event) => {
    event.preventDefault()
    setAuthError('')
    try {
      const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login'
      const { user: currentUser } = await api(endpoint, { method: 'POST', body: JSON.stringify(login) })
      const { projects } = await api('/api/projects')
      const { invitations: pendingInvites = [] } = await api('/api/invitations')
      setUser(currentUser)
      setProjectList(projects || [])
      setInvitations(pendingInvites)
      let remembered = ''
      try { remembered = localStorage.getItem('smaran:lastProject') || '' } catch {}
      setProjectId(projects?.some((p) => p.id === remembered) ? remembered : (projects?.[0]?.id || ''))
    } catch (error) {
      setAuthError(error.message)
    }
  }

  const handleJoinInvite = async () => {
    try {
      const result = await api(`/api/invites/${encodeURIComponent(inviteToken)}/accept`, { method: 'POST', body: JSON.stringify({}) })
      const { projects } = await api('/api/projects')
      startedRef.current = false
      setProjectList(projects || [])
      setProjectId(result.project?.id || '')
      try { window.history.replaceState({}, '', '/') } catch {}
      setInviteToken('')
      setInvitePreview(null)
      setInviteError('')
    } catch (error) {
      setInviteError(error.message)
    }
  }

  const handleCreateProject = async (event) => {
    event.preventDefault()
    if (creatingProject) return
    setCreatingProject(true)
    try {
      const { project } = await api('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: newProjectName.trim() || 'My workspace' })
      })
      startedRef.current = false
      setProjectList((items) => [...items, project])
      setProjectId(project.id)
      setNewProjectName('')
      setAccountViewActive(false)
      setMobileSidebarOpen(false)
    } catch (error) {
      notify(error.message, 'warning')
    } finally {
      setCreatingProject(false)
    }
  }

  const handleWorkspaceDeleted = (id) => {
    const remaining = projectList.filter((project) => project.id !== id)
    setProjectList(remaining)
    setDeleteProject(null)
    if (id === projectId) {
      startedRef.current = false
      const nextId = remaining[0]?.id || ''
      setProjectId(nextId)
      setMessages([])
      setLastUsed([])
      setAllMemories([])
      setNeedsReview([])
      setMembers([])
      setActivity([])
      setDraft('')
      try {
        localStorage.setItem('smaran:lastProject', nextId)
      } catch {}
    }
    notify('Workspace permanently deleted.')
  }

  const loadProjectDetails = useCallback(async () => {
    if (!projectId) return
    const [detail, feed] = await Promise.all([
      api(`/api/projects/${projectId}`),
      api(`/api/projects/${projectId}/activity`)
    ])
    setMembers(detail.members || [])
    setActivity(feed.activity || [])
  }, [projectId])

  const loadActivity = useCallback(async () => {
    if (!projectId) return
    const result = await api(`/api/projects/${projectId}/activity`)
    setActivity(result.activity || [])
  }, [projectId])

  const refreshMemories = useCallback(async () => {
    if (!projectId) return
    const params = new URLSearchParams()
    if (typeFilter !== 'all') params.set('type', typeFilter)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    const result = await api(projectPath(`/memories${params.size ? `?${params}` : ''}`))
    setAllMemories(result.memories || [])
    setNeedsReview(result.needsReview || [])
  }, [typeFilter, statusFilter, projectId, projectPath])

  const handleOpenInvites = async () => {
    setInviteOpen(true)
    setInviteUrl('')
    setInviteExpiry('')
    setInviteUsername('')
    try {
      await loadProjectDetails()
    } catch (error) {
      notify(error.message, 'warning')
    }
  }

  const handleInviteUser = async (event) => {
    event.preventDefault()
    if (!inviteUsername.trim()) return
    setInviteBusy(true)
    try {
      const result = await api(`/api/projects/${projectId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ username: inviteUsername.trim() })
      })
      notify(`Invitation sent to ${result.invitation.username}.`)
      setInviteUsername('')
    } catch (error) {
      notify(error.message, 'warning')
    } finally {
      setInviteBusy(false)
    }
  }

  const handleRespondToInvitation = async (invitation, action) => {
    try {
      await api(`/api/invitations/${invitation.id}/${action}`, { method: 'POST', body: JSON.stringify({}) })
      const [{ projects }, { invitations: pendingInvites = [] }] = await Promise.all([
        api('/api/projects'),
        api('/api/invitations')
      ])
      setProjectList(projects || [])
      setInvitations(pendingInvites)
      if (action === 'accept') {
        startedRef.current = false
        setProjectId(invitation.workspaceId)
        setMessages([])
        setLastUsed([])
      }
    } catch (error) {
      notify(error.message, 'warning')
    }
  }

  const handleCreateInviteLink = async () => {
    try {
      const result = await api(`/api/projects/${projectId}/invites`, { method: 'POST', body: JSON.stringify({}) })
      setInviteUrl(result.url)
      setInviteExpiry(result.expiresAt)
    } catch (error) {
      notify(error.message, 'warning')
    }
  }

  const handleRemoveMember = async (member) => {
    try {
      await api(`/api/projects/${projectId}/members/${member.id}`, { method: 'DELETE' })
      await loadProjectDetails()
    } catch (error) {
      notify(error.message, 'warning')
    }
  }

  const handleLogout = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
    startedRef.current = false
    setUser(null)
    setProjectId('')
    setProjectList([])
    setAccountViewActive(false)
    setMessages([])
  }

  const handleStreamEvent = useCallback((event) => {
    refreshMemories().catch(() => {})
    loadProjectDetails().catch(() => {})
    if (memoryTab === 'activity') loadActivity()
    if (event?.actorName) {
      const kind = event.memoryType
      const description = kind ? `added ${['assumption', 'outcome'].includes(kind) ? 'an' : 'a'} ${kind}` : 'added a memory'
      notify(`${event.actorName} ${event.kind === 'member_joined' ? 'joined the project' : event.kind === 'member_removed' ? 'removed a member' : description}`, 'neutral')
    }
  }, [memoryTab, refreshMemories, loadProjectDetails, loadActivity, notify])

  const startSession = useCallback(async (fresh = false, scope = conversationScope) => {
    if (!projectId) return
    let nextId = scope === 'team' ? 'team' : ''
    setDraft('')
    setLastUsed([])
    setCheckIns([])
    setSelectedMemoryId('')
    setMemoryTab('used')
    setPageError('')
    setBusy(false)
    setHasOlderMessages(false)
    if (fresh) {
      setMessages([])
      setSessionLoading(false)
    } else {
      setSessionLoading(true)
    }
    try {
      if (scope !== 'team' && !fresh) {
        const recent = await api(projectPath('/sessions/recent'))
        nextId = recent.sessionId || `personal_${crypto.randomUUID()}`
      } else if (scope !== 'team' && fresh) nextId = `personal_${crypto.randomUUID()}`
      setSessionId(nextId)
      const result = await api(projectPath(`/session/start?sessionId=${encodeURIComponent(nextId)}`))
      setCheckIns(result.checkIns || [])
      const conversation = scope === 'team'
        ? await api(projectPath(`/chat?scope=${scope}&sessionId=${encodeURIComponent(nextId)}`))
        : await api(projectPath(`/sessions/${encodeURIComponent(nextId)}/messages?limit=40`))
      setMessages((conversation.messages || []).map((msg) => ({ ...msg, localId: crypto.randomUUID() })))
      setHasOlderMessages(Boolean(conversation.hasMore))
    } catch (error) {
      setPageError(error.message)
    } finally {
      setSessionLoading(false)
    }
  }, [conversationScope, projectId, projectPath])

  const loadOlderMessages = useCallback(async () => {
    const oldest = messages[0]?.createdAt
    if (!sessionId || !oldest || loadingOlderMessages || !hasOlderMessages) return
    setLoadingOlderMessages(true)
    try {
      const before = encodeURIComponent(new Date(oldest).toISOString())
      const result = await api(projectPath(`/sessions/${encodeURIComponent(sessionId)}/messages?before=${before}&limit=40`))
      setMessages((current) => [
        ...result.messages.map((msg) => ({ ...msg, localId: crypto.randomUUID() })),
        ...current
      ])
      setHasOlderMessages(Boolean(result.hasMore))
    } catch (error) { setPageError(error.message) }
    finally { setLoadingOlderMessages(false) }
  }, [messages, sessionId, loadingOlderMessages, hasOlderMessages, projectPath])

  useEffect(() => {
    if (startedRef.current || !projectId) return
    startedRef.current = true
    startSession(false)
  }, [projectId, startSession])

  useEffect(() => {
    if (conversationScope !== 'team' || !projectId || busy) return undefined
    const refreshTeamConversation = async () => {
      try {
        const result = await api(projectPath('/chat?scope=team&sessionId=team'))
        setMessages((result.messages || []).map((msg) => ({ ...msg, localId: crypto.randomUUID() })))
      } catch {}
    }
    const timer = setInterval(refreshTeamConversation, 3000)
    return () => clearInterval(timer)
  }, [conversationScope, projectId, projectPath, busy])

  useEffect(() => {
    if (projectId) {
      try { localStorage.setItem('smaran:lastProject', projectId) } catch {}
      refreshMemories().catch(() => {})
    }
  }, [projectId, refreshMemories])

  useProjectStream(user ? projectId : '', handleStreamEvent)

  const handleSendMessage = async (event) => {
    event?.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setPageError('')
    setMessages((items) => [...items, { role: 'user', text, localId: crypto.randomUUID() }])
    setBusy(true)
    try {
      const result = await api(projectPath('/chat'), {
        method: 'POST',
        body: JSON.stringify({ sessionId, scope: conversationScope, message: text, memoryEnabled })
      })
      setMessages((items) => [
        ...items,
        {
          role: 'assistant',
          text: responseText(result.reply),
          used: result.used || [],
          changes: result.changes || [],
          conflicts: result.conflicts || [],
          notices: result.notices || [],
          memoryOff: !memoryEnabled,
          localId: crypto.randomUUID()
        }
      ])
      setLastUsed(result.used || [])
      const savedCount = (result.changes || []).filter((c) => c.kind === 'created').length
      const secretNotice = (result.notices || []).find((n) => n.toLowerCase().includes('not saved: looks like a secret'))
      if (secretNotice) notify('Not saved: looks like a secret', 'warning')
      else if (savedCount) notify(`${savedCount} ${savedCount === 1 ? 'memory' : 'memories'} saved`)
      else if ((result.conflicts || []).length) notify('Conflict held for your review.', 'neutral')
      else if ((result.notices || []).length) notify(result.notices[0], 'warning')
      await refreshMemories().catch(() => {})
    } catch (error) {
      setMessages((items) => [
        ...items,
        {
          role: 'assistant',
          text: 'I could not send that just now. Please try again.',
          localId: crypto.randomUUID(),
          failed: true
        }
      ])
      notify(error.message, 'warning')
    } finally {
      setBusy(false)
    }
  }

  const handleResolveConflict = async (memory, action) => {
    if (!memory?._id) return
    setBusy(true)
    try {
      await api(projectPath(`/memories/${idOf(memory)}/resolve`), {
        method: 'POST',
        body: JSON.stringify({ action })
      })
      setMessages((items) =>
        items.map((msg) => ({
          ...msg,
          conflicts: (msg.conflicts || []).filter(({ pending }) => idOf(pending) !== idOf(memory))
        }))
      )
      notify(action === 'override' ? 'Decision updated. The previous choice is in the timeline.' : 'Kept the current decision.')
      await refreshMemories()
      if (memoryTab === 'timeline') loadTimeline()
    } catch (error) {
      notify(error.message, 'warning')
    } finally {
      setBusy(false)
    }
  }

  const handleWithdrawConflict = async (memory) => {
    if (!memory?._id) return
    try {
      await api(projectPath(`/memories/${idOf(memory)}/withdraw`), {
        method: 'POST',
        body: JSON.stringify({})
      })
      setMessages((items) =>
        items.map((msg) => ({
          ...msg,
          conflicts: (msg.conflicts || []).filter(({ pending }) => idOf(pending) !== idOf(memory))
        }))
      )
      notify('Your pending memory was withdrawn.', 'neutral')
      await refreshMemories()
    } catch (error) {
      notify(error.message, 'warning')
    }
  }

  const handleMutateMemory = async (memory, action) => {
    if (!memory?._id) return
    try {
      if (action === 'delete') await api(projectPath(`/memories/${idOf(memory)}`), { method: 'DELETE' })
      if (action === 'invalidate') await api(projectPath(`/memories/${idOf(memory)}/invalidate`), { method: 'POST', body: JSON.stringify({ reason: 'Marked no longer true from the memory panel.' }) })
      if (action === 'confirm') await api(projectPath(`/memories/${idOf(memory)}/confirm`), { method: 'POST', body: JSON.stringify({}) })
      setCheckIns((items) => items.filter((item) => idOf(item.memory) !== idOf(memory)))
      notify(action === 'delete' ? 'Memory permanently deleted.' : action === 'confirm' ? 'Assumption confirmed.' : 'Memory invalidated.')
      await refreshMemories()
    } catch (error) {
      notify(error.message, 'warning')
    }
  }

  const loadTimeline = async () => {
    setTimelineLoading(true)
    try {
      const response = await api(projectPath('/memories?status=superseded'))
      const old = response.memories || []
      const chains = await Promise.all(old.map(async (memory) => {
        try {
          return (await api(projectPath(`/memories/${idOf(memory)}/chain`))).chain || [memory]
        } catch {
          return [memory]
        }
      }))
      const unique = new Map()
      chains.flat().forEach((mem) => unique.set(idOf(mem), mem))
      setTimeline([...unique.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)))
    } catch (error) {
      notify(error.message, 'warning')
    } finally {
      setTimelineLoading(false)
    }
  }

  const handleSelectMemoryTab = (nextTab) => {
    setMemoryTab(nextTab)
    if (nextTab === 'timeline') loadTimeline()
    if (nextTab === 'all') refreshMemories().catch((error) => notify(error.message, 'warning'))
    if (nextTab === 'activity') loadActivity().catch((error) => notify(error.message, 'warning'))
  }

  const handleSelectMemory = (memory) => {
    setSelectedMemoryId(idOf(memory))
    setMemoryTab('used')
    setMemoryPanelOpen(true)
  }

  const handleSelectProject = (id) => {
    if (id === projectId) return
    startedRef.current = false
    setProjectId(id)
    setSessionLoading(true)
    setMessages([])
    setLastUsed([])
    setMobileSidebarOpen(false)
    setAccountViewActive(false)
    try {
      localStorage.setItem('smaran:lastProject', id)
    } catch {}
  }

  const currentProject = projectList.find((p) => p.id === projectId)

  // App root: Backdrop is mounted ONCE behind everything (fixed inset-0 z-0), rest sits at relative z-10
  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-jet-950 text-jet-100 font-sans">
      {/* Background system mounted once at root per section 12.3 */}
      <Backdrop mode={backdropMode} animated={ambient} />

      {authPending ? (
        <div className="relative z-10 flex h-full w-full items-center justify-center font-display text-jet-300">
          <p className="text-sm">Loading your project…</p>
        </div>
      ) : !user || inviteToken ? (
        <main className="relative z-10 h-full w-full">
          <AuthView
            authMode={authMode}
            onChangeAuthMode={setAuthMode}
            loginForm={login}
            onChangeLoginForm={setLogin}
            onSubmit={handleSignIn}
            authError={authError}
            inviteToken={inviteToken}
            invitePreview={invitePreview}
            inviteError={inviteError}
            onJoinInvite={handleJoinInvite}
          />
        </main>
      ) : (
        <div className="relative z-10 flex h-full w-full overflow-hidden">
          {/* Desktop Sidebar: 280px at 1024px and up (lg), collapsible */}
        {!sidebarCollapsed && (
          <div className="hidden lg:block shrink-0 h-full">
            <Sidebar
              projectList={projectList}
              projectId={projectId}
              onSelectProject={handleSelectProject}
              onDeleteProject={setDeleteProject}
              projectSearch={projectSearch}
              onChangeSearch={setProjectSearch}
              newProjectName={newProjectName}
              onChangeNewProjectName={setNewProjectName}
              onCreateProject={handleCreateProject}
              creatingProject={creatingProject}
              user={user}
              onOpenAccount={() => setAccountViewActive(true)}
              onLogout={handleLogout}
              onToggleCollapse={handleToggleSidebarCollapse}
              isCollapsed={false}
            />
          </div>
        )}

        {/* Collapsed sidebar trigger bar (when sidebar is collapsed on desktop) */}
        {sidebarCollapsed && (
          <div className="hidden lg:flex shrink-0 h-full w-12 flex-col items-center border-r border-jet-650 bg-jet-900 py-3">
            <button
              type="button"
              onClick={handleToggleSidebarCollapse}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-jet-400 hover:bg-jet-800 hover:text-jet-100 transition-colors"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Mobile Left Drawer Sidebar below 1024px (lg) */}
        {mobileSidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            {/* Scrim */}
            <div
              role="presentation"
              onClick={() => setMobileSidebarOpen(false)}
              className="fixed inset-0 bg-[rgba(5,5,7,0.72)] backdrop-blur-[6px] animate-in fade-in duration-200"
            />
            {/* Drawer */}
            <div className="relative z-50 h-full w-[280px] shadow-2xl animate-in slide-in-from-left duration-200">
              <Sidebar
                projectList={projectList}
                projectId={projectId}
                onSelectProject={handleSelectProject}
                onDeleteProject={setDeleteProject}
                projectSearch={projectSearch}
                onChangeSearch={setProjectSearch}
                newProjectName={newProjectName}
                onChangeNewProjectName={setNewProjectName}
                onCreateProject={handleCreateProject}
                creatingProject={creatingProject}
                user={user}
                onOpenAccount={() => {
                  setAccountViewActive(true)
                  setMobileSidebarOpen(false)
                }}
                onLogout={handleLogout}
                onToggleCollapse={() => setMobileSidebarOpen(false)}
                isCollapsed={false}
              />
            </div>
          </div>
        )}

        {/* Main Area: Shows exactly ONE of Workspace, Account, EmptyState */}
        <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0 transition-opacity duration-200">
          {accountViewActive ? (
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              <AccountView
                user={user}
                projectList={projectList}
                onBack={() => setAccountViewActive(false)}
                onSaved={setUser}
                onLogout={handleLogout}
                api={api}
              />
            </div>
          ) : !projectId ? (
            <EmptyStateView
              newProjectName={newProjectName}
              onChangeNewProjectName={setNewProjectName}
              onCreateProject={handleCreateProject}
              creatingProject={creatingProject}
            />
          ) : (
            <WorkspaceView
              project={currentProject}
              messages={messages}
              hasOlderMessages={hasOlderMessages}
              loadingOlderMessages={loadingOlderMessages}
              onLoadOlderMessages={loadOlderMessages}
              busy={busy}
              draft={draft}
              onChangeDraft={setDraft}
              onSendMessage={handleSendMessage}
              memoryEnabled={memoryEnabled}
              onToggleMemoryEnabled={() => setMemoryEnabled((v) => !v)}
              memoryPanelOpen={memoryPanelOpen}
              onToggleMemoryPanel={() => setMemoryPanelOpen((v) => !v)}
              onCloseMemoryPanel={() => setMemoryPanelOpen(false)}
              onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
              onOpenInvite={handleOpenInvites}
              isOwner={currentProject?.role === 'owner'}
              invitationsCount={invitations.length}
              onOpenInvitations={handleOpenInvites}
              onNewSession={() => startSession(true)}
              conversationScope={conversationScope}
              onChangeConversationScope={(scope) => {
                setConversationScope(scope)
                startSession(false, scope)
              }}
              checkIns={checkIns}
              onMutateMemory={handleMutateMemory}
              pageError={pageError}
              onRetrySession={() => startSession(false)}
              allMemories={allMemories}
              lastUsed={lastUsed}
              needsReview={needsReview}
              activity={activity}
              timeline={timeline}
              timelineLoading={timelineLoading}
              memoryTab={memoryTab}
              onSelectMemoryTab={handleSelectMemoryTab}
              selectedMemoryId={selectedMemoryId}
              onSelectMemory={handleSelectMemory}
              onResolveConflict={handleResolveConflict}
              onWithdrawConflict={handleWithdrawConflict}
              currentUser={user}
              typeFilter={typeFilter}
              onChangeTypeFilter={setTypeFilter}
              statusFilter={statusFilter}
              onChangeStatusFilter={setStatusFilter}
            />
          )}
        </main>
      </div>
      )}

      {/* Global Overlays: only one at a time per section 2 */}
      {inviteOpen && (
        <InviteDialog
          project={currentProject}
          onClose={() => setInviteOpen(false)}
          invitations={invitations}
          onRespondInvitation={handleRespondToInvitation}
          members={members}
          onInviteUser={handleInviteUser}
          inviteBusy={inviteBusy}
          inviteUsername={inviteUsername}
          onChangeInviteUsername={setInviteUsername}
          onCreateInviteLink={handleCreateInviteLink}
          inviteUrl={inviteUrl}
          inviteExpiry={inviteExpiry}
          onRemoveMember={handleRemoveMember}
          currentUser={user}
        />
      )}

      {deleteProject && (
        <DeleteWorkspaceDialog
          project={deleteProject}
          onClose={() => setDeleteProject(null)}
          onDeleted={handleWorkspaceDeleted}
          api={api}
        />
      )}

      {/* Toast notification per section 8.9 (floats at bottom center) */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2.5 rounded-2xl border border-jet-700 bg-jet-800 px-4 py-2.5 shadow-[0_16px_48px_rgba(0,0,0,0.6)] animate-in fade-in slide-in-from-bottom-3 duration-180 border-l-[3px] ${
            toast.kind === 'warning'
              ? 'border-l-neon-500 text-neon-300'
              : 'border-l-cerulean-400 text-jet-100'
          }`}
        >
          {toast.kind === 'warning' ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-neon-400" />
          ) : (
            <Check className="h-4 w-4 shrink-0 text-cerulean-400" />
          )}
          <span className="text-xs font-medium">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss toast"
            className="ml-1 text-jet-400 hover:text-jet-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

const App = () => {
  return (
    <AmbientProvider>
      <AppContent />
    </AmbientProvider>
  )
}

export default App
