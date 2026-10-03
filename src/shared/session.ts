import { create } from 'zustand'
import type { Mode, WorkMap } from './types'

interface SessionState {
  mode: Mode
  sessionId: string
  t0: number | null // Date.now() when the recording started
  offRecord: boolean
  workMap: WorkMap | null
  setMode: (mode: Mode) => void
  setT0: (t0: number | null) => void
  setOffRecord: (offRecord: boolean) => void
  setWorkMap: (workMap: WorkMap | null) => void
  newSession: () => void
}

const makeSessionId = () => `s-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`

export const useSession = create<SessionState>((set) => ({
  mode: 'capture',
  sessionId: makeSessionId(),
  t0: null,
  offRecord: false,
  workMap: null,
  setMode: (mode) => set({ mode }),
  setT0: (t0) => set({ t0 }),
  setOffRecord: (offRecord) => set({ offRecord }),
  setWorkMap: (workMap) => set({ workMap }),
  newSession: () => set({ sessionId: makeSessionId(), t0: null, offRecord: false, workMap: null }),
}))

/** Non-React access, e.g. from event handlers and the bus. */
export const session = useSession.getState
