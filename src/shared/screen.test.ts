import { beforeEach, describe, expect, it } from 'vitest'
import { markScreenChanged, noteVisionScreen, registerAppScreen, resetScreen, screenSummary, visionScreen } from './screen'

beforeEach(() => {
  resetScreen()
  registerAppScreen(null)
})

describe('screen context freshness', () => {
  it('a description of an older frame never replaces a newer one', () => {
    noteVisionScreen('Invoice 4472 open, cost center 4711.', 2_000)
    noteVisionScreen('Inbox, no invoice open.', 1_000) // a slow answer for an older frame
    expect(visionScreen()?.text).toBe('Invoice 4472 open, cost center 4711.')
  })

  it('marks the description outdated once a newer, different frame was seen, until it is described', () => {
    noteVisionScreen('Inbox, no invoice open.', 1_000)
    markScreenChanged(3_000)
    expect(visionScreen()?.outdated).toBe(true)
    expect(screenSummary({ now: 4_000 })).toContain('changed since')

    noteVisionScreen('Invoice 4471 open.', 3_000)
    expect(visionScreen()).toEqual({ text: 'Invoice 4471 open.', at: 3_000, outdated: false })
  })

  it('a description that arrives after an even newer change is still marked outdated', () => {
    markScreenChanged(5_000)
    noteVisionScreen('Invoice 4471 open.', 3_000)
    expect(visionScreen()?.outdated).toBe(true)
  })

  it('says so when nothing is known, so the model asks instead of guessing', () => {
    expect(screenSummary()).toMatch(/^Unknown/)
  })

  it('puts the exact app state first, and gives the screenshot its age', () => {
    registerAppScreen(() => 'ProcureFlow, invoice 4471 open: cost center 0400.')
    noteVisionScreen('An invoice is open.', 10_000)
    const text = screenSummary({ now: 13_000 })
    expect(text.split('\n')[0]).toBe('App state (live, exact): ProcureFlow, invoice 4471 open: cost center 0400.')
    expect(text).toContain('Last screenshot (3 s ago): An invoice is open.')
  })

  it('without ages, an unchanged screen gives the same text over time', () => {
    noteVisionScreen('Inbox.', 1_000)
    expect(screenSummary({ now: 2_000, ages: false })).toBe(screenSummary({ now: 60_000, ages: false }))
  })
})
