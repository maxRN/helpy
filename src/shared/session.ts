import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Mode, WorkMap } from './types'

interface SessionState {
  mode: Mode
  sessionId: string
  t0: number | null // Date.now() when the recording started
  offRecord: boolean
  workMap: WorkMap | null
  /** Language Helpy speaks with the expert; switches when they ask for it ("sprich Deutsch"). */
  language: 'de' | 'en'
  setLanguage: (language: 'de' | 'en') => void
  setMode: (mode: Mode) => void
  setT0: (t0: number | null) => void
  setOffRecord: (offRecord: boolean) => void
  setWorkMap: (workMap: WorkMap | null) => void
  /** Starts a new session. Pass the capture task id so events and screenshots share one id. */
  newSession: (id?: string) => void
}

const makeSessionId = () => `s-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      mode: 'capture',
      sessionId: makeSessionId(),
      t0: null,
      offRecord: false,
      workMap: null,
      language: 'en',
      setLanguage: (language) => set({ language }),
      setMode: (mode) => set({ mode }),
      setT0: (t0) => set({ t0 }),
      setOffRecord: (offRecord) => set({ offRecord }),
      setWorkMap: (workMap) => set({ workMap }),
      newSession: (id) => set({ sessionId: id ?? makeSessionId(), t0: null, offRecord: false, workMap: null }),
    }),
    {
      // A reload mid-demo keeps the mode and the Work Map. t0 and offRecord belong to a live recording, so they reset.
      name: 'sabine-session',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ mode: s.mode, sessionId: s.sessionId, workMap: s.workMap, language: s.language }),
      skipHydration: true, // SSR: rehydrated in ErpApp's useEffect
    },
  ),
)

/** Non-React access, e.g. from event handlers and the bus. */
export const session = useSession.getState
