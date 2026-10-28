import { Sparkles, Plus } from 'lucide-react'

const EmptyStateView = ({
  newProjectName,
  onChangeNewProjectName,
  onCreateProject,
  creatingProject
}) => {
  return (
    <div className="flex h-full w-full items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-[440px] rounded-[20px] border border-jet-700 bg-jet-850 p-8 shadow-2xl text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-jet-800 text-cerulean-300">
          <Sparkles className="h-6 w-6" />
        </div>

        <h1 className="font-display text-2xl font-semibold text-jet-100 mb-2">
          Create a workspace
        </h1>

        <p className="text-sm text-jet-300 mb-6">
          Create a workspace to start chatting and saving project memories.
        </p>

        <form onSubmit={onCreateProject} className="space-y-4 text-left">
          <div>
            <label
              htmlFor="empty-workspace-name"
              className="block font-sans text-xs font-semibold uppercase tracking-[0.08em] text-jet-300 mb-1"
            >
              Workspace name
            </label>
            <input
              id="empty-workspace-name"
              type="text"
              placeholder="My workspace (optional)"
              value={newProjectName}
              onChange={(e) => onChangeNewProjectName(e.target.value)}
              className="h-11 w-full rounded-xl border border-jet-500 bg-jet-900 px-3 text-sm text-jet-100 placeholder-jet-400 focus:border-cerulean-400 focus:outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={creatingProject}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-cerulean-500 font-medium text-jet-950 transition hover:bg-cerulean-400 active:translate-y-px disabled:bg-jet-800 disabled:text-jet-500"
          >
            <Plus className="h-4 w-4" />
            <span>{creatingProject ? 'Creating...' : 'Create workspace'}</span>
          </button>
        </form>
      </div>
    </div>
  )
}

export default EmptyStateView

