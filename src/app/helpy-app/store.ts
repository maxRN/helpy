import { create } from 'zustand'
import { auth } from '../auth'
import type { Category } from '../panel/processes'
import { panel } from '../panel/store'

// Helpy's own app window (opened from the robot's panel or desktop): company info, recorded processes,
// a process as a workflow, and one step as a concrete guide with its decision tree.

export type AppPage =
  | { name: 'company' }
  | { name: 'processes' }
  | { name: 'workflow'; processId: string }
  | { name: 'step'; processId: string; stepId: string }

/** The list of recorded processes as the user left it, so "back" returns to the same view. */
export interface ProcessesView {
  query: string
  category: Category | 'all'
}

interface HelpyAppState {
  open: boolean
  maximized: boolean
  page: AppPage
  processesView: ProcessesView
}

export const useHelpyApp = create<HelpyAppState>()(() => ({
  open: false,
  maximized: false,
  page: { name: 'company' },
  processesView: { query: '', category: 'all' },
}))

/** The view one level up inside "Recorded processes": a step's workflow, a workflow's list. null at the top. */
export function parentPage(page: AppPage): AppPage | null {
  if (page.name === 'step') return { name: 'workflow', processId: page.processId }
  if (page.name === 'workflow') return { name: 'processes' }
  return null
}

export const helpyApp = {
  /** Opens the window; without a page it shows the last one (Company info the first time). */
  open(page?: AppPage) {
    useHelpyApp.setState((s) => ({ open: true, page: page ?? s.page }))
    if (auth.user()) panel.close()
    else panel.show({ name: 'signin' })
  },
  go(page: AppPage) {
    useHelpyApp.setState({ page })
  },
  /** One level up (see parentPage); nothing at the top. */
  back() {
    const up = parentPage(useHelpyApp.getState().page)
    if (up) useHelpyApp.setState({ page: up })
  },
  setProcessesView(view: Partial<ProcessesView>) {
    useHelpyApp.setState((s) => ({ processesView: { ...s.processesView, ...view } }))
  },
  close() {
    useHelpyApp.setState({ open: false })
  },
  toggleMaximize() {
    useHelpyApp.setState((s) => ({ maximized: !s.maximized }))
  },
}
