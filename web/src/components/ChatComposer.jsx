import { useRef } from 'react'
import { ArrowRight, Brain, BrainOff } from 'lucide-react'

const ChatComposer = ({
  draft = '',
  onChangeDraft,
  onSendMessage,
  busy = false,
  memoryEnabled = true,
  onToggleMemory
}) => {
  const textareaRef = useRef(null)

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (draft.trim() && !busy) {
        onSendMessage(event)
      }
    }
  }

  const handleChange = (event) => {
    onChangeDraft(event.target.value)
    if (textareaRef.current) {
      textareaRef.current.style.height = '48px'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (draft.trim() && !busy) {
      onSendMessage(event)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="group relative rounded-[24px] border border-jet-700 bg-jet-850/80 p-3 backdrop-blur-[16px] transition-all duration-200 focus-within:hairline-border focus-within:shadow-[0_0_0_1px_rgba(27,163,230,0.55),0_0_28px_rgba(27,163,230,0.22)]"
    >
      <textarea
        ref={textareaRef}
        rows={1}
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Type your request..."
        aria-label="Message Smaran.ai"
        className="w-full resize-none bg-transparent px-2 pt-1 text-base leading-6 text-jet-100 placeholder-jet-400 focus:outline-none min-h-[48px] max-h-[150px] scrollbar-thin"
      />

      <div className="mt-2 flex items-center justify-between border-t border-jet-650/40 pt-2 px-1">
        {/* Left: Memory toggle button */}
        <button
          type="button"
          onClick={onToggleMemory}
          title="Memory on/off"
          aria-label={memoryEnabled ? 'Memory is on' : 'Memory is off'}
          className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
            memoryEnabled
              ? 'bg-neon-500/12 text-neon-300 hover:bg-neon-500/20'
              : 'text-jet-400 hover:bg-jet-800 hover:text-jet-300'
          }`}
        >
          {memoryEnabled ? (
            <Brain className="h-4 w-4" />
          ) : (
            <BrainOff className="h-4 w-4" />
          )}
        </button>

        {/* Right: Send button per section 8.1 */}
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          aria-label="Send message"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-cerulean-500 text-jet-950 transition-all hover:bg-cerulean-400 hover:shadow-[0_0_20px_rgba(27,163,230,0.35)] active:translate-y-px active:bg-cerulean-600 disabled:bg-jet-800 disabled:text-jet-500 disabled:cursor-not-allowed"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </form>
  )
}

export default ChatComposer

