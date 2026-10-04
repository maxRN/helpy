import { create } from 'zustand'
import { mascot } from '../../mascot'
import { auth } from '../auth'

export type View =
  | { name: 'signin' }
  | { name: 'home' }
  | { name: 'process'; processId: string }
  | { name: 'learning' }
  | { name: 'moment'; stepId: string; processId?: string }
  | { name: 'report' }

/** What Helpy is busy with right now; clicking the robot opens the matching view (recording: controls in the bubble). */
export type Activity = { kind: 'recording'; processId: string } | { kind: 'learning'; processId: string } | null

interface PanelState {
  open: boolean
  view: View
  activity: Activity
}

export const usePanel = create<PanelState>()(() => ({ open: false, view: { name: 'home' }, activity: null }))

const activityView = (a: Activity): View => (a?.kind === 'learning' ? { name: 'learning' } : { name: 'home' })

export const panel = {
  show(view?: View) {
    mascot.pointTo(null)
    // Nothing without signing in first.
    usePanel.setState((s) => ({ open: true, view: !auth.user() ? { name: 'signin' } : (view ?? activityView(s.activity)) }))
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
