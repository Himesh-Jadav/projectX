import { useState, useRef, useEffect } from 'react'
import { PanelLeft, BookOpen, Plus, Trash2, ChevronDown, User, LogOut, Settings } from 'lucide-react'

const Sidebar = ({
  projectList = [],
  projectId,
  onSelectProject,
  onDeleteProject,
  projectSearch,
  onChangeSearch,
  newProjectName,
  onChangeNewProjectName,
  onCreateProject,
  creatingProject,
  user,
  onOpenAccount,
  onLogout,
  onToggleCollapse,
  isCollapsed = false
}) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef(null)

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false)
      }
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false)
      }
    }
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [userMenuOpen])

  const filteredProjects = projectList.filter((p) =>
    p.name.toLowerCase().includes((projectSearch || '').toLowerCase())
  )

  const handleOpenAccountSettings = () => {
    setUserMenuOpen(false)
    if (onOpenAccount) onOpenAccount()
  }

  const handleUserLogout = () => {
    setUserMenuOpen(false)
    if (onLogout) onLogout()
  }

  return (
    <aside
      aria-label="Sidebar navigation"
      className="flex h-full w-[280px] flex-col border-r border-jet-650 bg-jet-900 p-3 select-none"
    >
      {/* 1. Logo row, 64px tall */}
      <div className="flex h-16 shrink-0 items-center justify-between px-1">
        <a
          href="#"
          aria-label="Smaran.ai home"
          tabIndex={0}
          className="flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-cerulean-300 rounded-lg"
        >
          <img src="/dark_logo.png" alt="Smaran.ai" className="h-8 w-auto object-contain" />
        </a>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-jet-400 hover:bg-jet-800 hover:text-jet-100 transition-colors duration-150"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 2. Projects label & count */}
      <div className="mt-2 mb-2 flex items-center justify-between px-2">
        <span className="font-sans text-xs font-semibold uppercase tracking-[0.08em] text-jet-300">
          Projects
        </span>
        <span className="rounded bg-jet-800 px-2 py-0.5 font-mono text-xs text-jet-300">
          {projectList.length}
        </span>
      </div>

      {/* 3. Search input */}
      <div className="px-1 mb-3">
        <input
          type="text"
          value={projectSearch}
          onChange={(e) => onChangeSearch(e.target.value)}
          placeholder="Search workspaces"
          aria-label="Search workspaces"
          className="h-10 w-full rounded-xl border border-jet-700 bg-jet-850 px-3 text-sm text-jet-100 placeholder-jet-400 focus:border-cerulean-400 focus:ring-3 focus:ring-cerulean-500/25 focus:outline-none transition-all duration-150"
        />
      </div>

      {/* 4. Project list (scrolls on its own) */}
      <nav
        aria-label="Workspaces"
        className="flex-1 space-y-1 overflow-y-auto px-1 scrollbar-thin"
      >
        {filteredProjects.map((project) => {
          const isSelected = project.id === projectId
          return (
            <div
              key={project.id}
              className={`group relative flex h-11 items-center justify-between rounded-xl px-3 transition-colors duration-150 ${
                isSelected
                  ? 'bg-cerulean-tint text-cerulean-300 font-medium'
                  : 'text-jet-300 hover:bg-jet-800 hover:text-jet-100'
              }`}
            >
              {isSelected && (
                <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-cerulean-400" />
              )}
              <button
                type="button"
                onClick={() => onSelectProject(project.id)}
                aria-current={isSelected ? 'page' : undefined}
                className="flex flex-1 items-center gap-2.5 overflow-hidden text-left text-sm focus-visible:outline-none"
              >
                <BookOpen className={`h-4 w-4 shrink-0 ${isSelected ? 'text-cerulean-400' : 'text-jet-400'}`} />
                <span className="truncate">{project.name}</span>
              </button>

              {project.role === 'owner' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteProject(project)
                  }}
                  title={`Delete ${project.name}`}
                  aria-label={`Delete workspace ${project.name}`}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex h-7 w-7 items-center justify-center rounded-lg text-jet-400 hover:bg-jet-700 hover:text-neon-400 transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )
        })}

        {filteredProjects.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-jet-400">
            No matching workspaces
          </p>
        )}
      </nav>

      {/* 5. New workspace (pinned above user block) */}
      <form onSubmit={onCreateProject} className="mt-3 border-t border-jet-650 pt-3 px-1">
        <label
          htmlFor="sidebar-new-workspace-input"
          className="mb-1 block font-sans text-xs font-semibold uppercase tracking-[0.08em] text-jet-300"
        >
          New workspace
        </label>
        <input
          id="sidebar-new-workspace-input"
          type="text"
          maxLength={120}
          value={newProjectName}
          onChange={(e) => onChangeNewProjectName(e.target.value)}
          placeholder="Workspace name"
          aria-label="Workspace name"
          className="mb-2 h-10 w-full rounded-xl border border-jet-700 bg-jet-850 px-3 text-sm text-jet-100 placeholder-jet-400 focus:border-cerulean-400 focus:ring-3 focus:ring-cerulean-500/25 focus:outline-none transition-all duration-150"
        />
        <button
          type="submit"
          disabled={creatingProject}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-jet-700 bg-transparent px-3 text-sm font-medium text-jet-100 hover:border-[#3A4157] hover:bg-jet-800 active:translate-y-px disabled:border-jet-650 disabled:text-jet-500 transition-all duration-150"
        >
          <Plus className="h-4 w-4" />
          <span>{creatingProject ? 'Creating...' : 'Create workspace'}</span>
        </button>
      </form>

      {/* 6. User block (bottom, 64px) with popover */}
      <div className="relative mt-3 border-t border-jet-650 pt-2 px-1" ref={userMenuRef}>
        <button
          type="button"
          onClick={() => setUserMenuOpen((prev) => !prev)}
          aria-expanded={userMenuOpen}
          aria-haspopup="menu"
          aria-label="User settings menu"
          className="flex h-14 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-jet-800 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-cerulean-300"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-jet-800 font-sans text-sm font-semibold text-cerulean-300 uppercase">
            {user?.username ? user.username.slice(0, 1) : <User className="h-4 w-4" />}
          </div>
          <div className="flex flex-1 flex-col overflow-hidden">
            <span className="truncate text-sm font-semibold text-jet-100">
              {user?.username || 'User'}
            </span>
            <span className="truncate text-xs text-jet-400">
              Account settings
            </span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-jet-400" />
        </button>

        {/* Popover */}
        {userMenuOpen && (
          <div
            role="menu"
            aria-label="User options"
            className="absolute bottom-16 left-1 right-1 z-50 rounded-2xl border border-jet-700 bg-jet-850 p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.6)] animate-in fade-in zoom-in-95 duration-150"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleOpenAccountSettings}
              className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm text-jet-200 hover:bg-jet-800 hover:text-jet-100 transition-colors"
            >
              <Settings className="h-4 w-4 text-jet-400" />
              <span>Account settings</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleUserLogout}
              className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm text-neon-400 hover:bg-jet-800 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Log out</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

export default Sidebar

