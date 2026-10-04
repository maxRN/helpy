import { beforeEach, describe, expect, it } from 'vitest'
import { helpyApp, parentPage, useHelpyApp } from './store'

beforeEach(() => {
  useHelpyApp.setState({ page: { name: 'processes' }, processesView: { query: '', category: 'all' } })
})

describe('Recorded processes: back navigation', () => {
  it('goes one level up: step -> its workflow -> the list; nothing above the list', () => {
    expect(parentPage({ name: 'step', processId: 'p1', stepId: 'S3' })).toEqual({ name: 'workflow', processId: 'p1' })
    expect(parentPage({ name: 'workflow', processId: 'p1' })).toEqual({ name: 'processes' })
    expect(parentPage({ name: 'processes' })).toBeNull()
    expect(parentPage({ name: 'company' })).toBeNull()
  })

  it('back returns to the list as the user left it (search and category kept)', () => {
    helpyApp.setProcessesView({ query: 'kramer', category: 'ERP' })
    helpyApp.go({ name: 'workflow', processId: 'p1' })
    helpyApp.go({ name: 'step', processId: 'p1', stepId: 'S2' })
    helpyApp.back()
    expect(useHelpyApp.getState().page).toEqual({ name: 'workflow', processId: 'p1' })
    helpyApp.back()
    expect(useHelpyApp.getState().page).toEqual({ name: 'processes' })
    expect(useHelpyApp.getState().processesView).toEqual({ query: 'kramer', category: 'ERP' })
    helpyApp.back() // at the top: stays
    expect(useHelpyApp.getState().page).toEqual({ name: 'processes' })
  })
})
