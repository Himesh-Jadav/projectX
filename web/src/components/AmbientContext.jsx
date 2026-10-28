import { createContext, useContext, useState, useEffect } from 'react'

const AmbientContext = createContext({
  ambient: true,
  toggleAmbient: () => {}
})

export const AmbientProvider = ({ children }) => {
  const [ambient, setAmbient] = useState(() => {
    try {
      const stored = localStorage.getItem('smaran:ambient')
      return stored !== null ? stored === 'true' : true
    } catch {
      return true
    }
  })

  const toggleAmbient = () => {
    setAmbient((prev) => {
      const next = !prev
      try {
        localStorage.setItem('smaran:ambient', String(next))
      } catch {}
      return next
    })
  }

  return (
    <AmbientContext.Provider value={{ ambient, toggleAmbient }}>
      {children}
    </AmbientContext.Provider>
  )
}

export const useAmbient = () => useContext(AmbientContext)

export default AmbientContext

