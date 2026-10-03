import { create } from 'zustand'
import { mascot } from '../../mascot'

export type View =
  | { name: 'home' }
  | { name: 'process'; processId: string }
  | { name: 'record' }
  | { name: 'questions'; processId: string }
  | { name: 'learning' }
  | { name: 'moment'; stepId: string; processId?: string }
  | { name: 'report' }

/** What Helpy is busy with right now; clicking the robot opens the matching view. */
export type Activity = { kind: 'recording'; processId: string } | { kind: 'learning'; processId: string } | { kind: 'questions'; processId: string } | null

interface PanelState {
  open: boolean
  view: View
  activity: Activity
}

export const usePanel = create<PanelState>()(() => ({ open: false, view: { name: 'home' }, activity: null }))

const activityView = (a: Activity): View =>
  a?.kind === 'recording' ? { name: 'record' } : a?.kind === 'learning' ? { name: 'learning' } : a?.kind === 'questions' ? { name: 'questions', processId: a.processId } : { name: 'home' }

export const panel = {
  show(view?: View) {
    mascot.pointTo(null)
    usePanel.setState((s) => ({ open: true, view: view ?? activityView(s.activity) }))
  },
  close() {
    usePanel.setState({ open: false })
  },
  toggle() {
    if (usePanel.getState().open) panel.close()
    else panel.show()
  },
  setActivity(activity: Activity) {
    usePanel.setState({ activity })
  },
}
