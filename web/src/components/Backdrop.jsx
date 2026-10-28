import { useEffect, useState } from 'react'
import SmokeBackground from './SmokeBackground'

// mode: "smoke-strong" | "smoke-soft" | "calm"
const Backdrop = ({ mode, animated = true }) => {
  const wantSmoke = animated && mode !== 'calm'
  const [mounted, setMounted] = useState(wantSmoke)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (wantSmoke) {
      setMounted(true)
      const id = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(id)
    }
    setShown(false)
    const id = setTimeout(() => setMounted(false), 700) // unmount after the fade, which also stops the GPU work
    return () => clearTimeout(id)
  }, [wantSmoke])

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-jet-950" aria-hidden="true">
      <div className="ambient-calm absolute inset-0" />
      {mounted && (
        <div className="absolute inset-0 transition-opacity duration-700 ease-out" style={{ opacity: shown ? 1 : 0 }}>
          <SmokeBackground gain={mode === 'smoke-strong' ? 0.55 : 0.38} />
        </div>
      )}
    </div>
  )
}

export default Backdrop
