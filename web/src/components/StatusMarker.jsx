import { Check, Clock, X, RotateCcw } from 'lucide-react'

// Status per section 8.8: shape plus word, not color alone
const StatusMarker = ({ status = 'active', className = '' }) => {
  if (status === 'pending') {
    return (
      <span className={`inline-flex items-center gap-1.5 font-mono text-xs text-neon-300 ${className}`}>
        <span className="h-2 w-2 rounded-full border border-neon-300 inline-block" />
        <span>Pending</span>
      </span>
    )
  }

  if (status === 'superseded') {
    return (
      <span className={`inline-flex items-center gap-1.5 font-mono text-xs text-jet-400 ${className}`}>
        <span className="h-2 w-2 rounded-full border border-dashed border-jet-400 inline-block" />
        <span>Replaced</span>
      </span>
    )
  }

  if (status === 'invalid') {
    return (
      <span className={`inline-flex items-center gap-1.5 font-mono text-xs text-neon-600 ${className}`}>
        <X className="h-3 w-3 stroke-[2]" />
        <span>Invalid</span>
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-xs text-cerulean-400 ${className}`}>
      <span className="h-2 w-2 rounded-full bg-cerulean-400 inline-block" />
      <span>Active</span>
    </span>
  )
}

export default StatusMarker

