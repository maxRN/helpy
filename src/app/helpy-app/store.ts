import { create } from 'zustand'

// Helpy's own app window (opened from the robot's panel): company info, recorded processes,
// a process as a workflow, and one step as a concrete guide with its decision tree.

export type AppPage =
  | { name: 'company' }
  | { name: 'processes' }
  | { name: 'workflow'; processId: string }
  | { name: 'step'; processId: string; stepId: string }

interface HelpyAppState {
  open: boolean
  maximized: boolean
  page: AppPage
}

export const useHelpyApp = create<HelpyAppState>()(() => ({ open: false, maximized: false, page: { name: 'company' } }))

export const helpyApp = {
  /** Opens the window; without a page it shows the last one (Company info the first time). */
  open(page?: AppPage) {
    useHelpyApp.setState((s) => ({ open: true, page: page ?? s.page }))
  },
  go(page: AppPage) {
    useHelpyApp.setState({ page })
  },
  close() {
    useHelpyApp.setState({ open: false })
  },
  toggleMaximize() {
    useHelpyApp.setState((s) => ({ maximized: !s.maximized }))
  },
}
