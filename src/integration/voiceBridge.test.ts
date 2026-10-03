import { beforeEach, describe, expect, it } from 'vitest'
import { getDeps } from '../agent/deps'
import type { AppEvent as AgentEvent } from '../agent/types'
import { FIXTURE_WORKMAP } from '../erp/fixtures'
import { installStepTracker, resetStepTracker } from '../erp/stepTracker'
import { erp } from '../erp/store'
import { clearEventLog, getEventLog } from '../shared/bus'
import { useSession } from '../shared/session'
import { installVoiceBridge, workMapMarkdown } from './voiceBridge'

let seen: AgentEvent[]

beforeEach(() => {
  installStepTracker() // ErpApp does this in the app
  resetStepTracker()
  erp().reset()
  clearEventLog()
  useSession.setState({ mode: 'capture', workMap: null, t0: 1_000, offRecord: false })
  installVoiceBridge()
  seen = []
})

const listen = (type = '*') => getDeps().bus.on(type, (e) => seen.push(e))

describe('voice bridge', () => {
  it('turns ERP changes into plain-English screen events for the agent', () => {
    const off = listen()
    erp().open('4471')
    erp().update('4471', 'costCenter', '0400')
    off()
    const screen = seen.filter((e) => e.type === 'dom')
    expect(screen[0].text).toBe('Opened invoice 4471 from Midwest Machine Tools Inc. ($6,800.00, equipment)')
    expect(screen[1].text).toMatch(/^Invoice 4471: cost center 4711 .* → 0400 Capital Equipment \(capex\)$/)
    // The tutor cue for "predict" carries the invoice fields.
    expect(seen.find((e) => e.type === 'invoice_opened')?.meta?.fields).toMatchObject({ id: '4471', amount: 6800 })
  })

  it('gives the tutor the guardrail rule and Sabine\'s quote as text', () => {
    useSession.setState({ mode: 'teach', workMap: FIXTURE_WORKMAP })
    const off = listen('guardrail_violation')
    erp().commit('5102', 'post')
    off()
    expect(seen[0].meta).toMatchObject({ guardrailId: 'G1', quote: 'Equipment over five thousand is always capex.', stepId: 'S3', invoiceId: '5102' })
    expect(seen[0].meta?.rule).toContain('capex')
  })

  it('puts agent events on the shared bus and hands them back unchanged', () => {
    const off = listen('question_asked')
    getDeps().bus.emit({ id: 'q1', t: 5_000, type: 'question_asked', speaker: 'agent', text: 'Why capex?', meta: { kind: 'why' } })
    off()
    expect(getEventLog().at(-1)).toMatchObject({ source: 'voice', kind: 'question_asked', text: 'Why capex?', t: 5_000 })
    expect(seen[0]).toMatchObject({ id: 'q1', type: 'question_asked', meta: { kind: 'why' } })
  })

  it('mirrors off the record into the session', () => {
    getDeps().bus.emit({ id: 'o1', t: 1, type: 'off_record_start' })
    expect(useSession.getState().offRecord).toBe(true)
    getDeps().bus.emit({ id: 'o2', t: 2, type: 'off_record_end' })
    expect(useSession.getState().offRecord).toBe(false)
  })

  it('answers "what now?" with the next step in Sabine\'s words', () => {
    useSession.setState({ mode: 'teach', workMap: FIXTURE_WORKMAP })
    erp().open('5102')
    erp().update('5102', 'category', 'services')
    erp().update('5102', 'category', 'equipment')
    const next = getDeps().getNextStep()
    expect(next).toMatchObject({ stepId: 'S3', targetId: 'field-costCenter' })
    expect(next?.text).toContain('Equipment over five thousand is always capex.')
  })

  it('matches guardrails for "predict", but not for small equipment', () => {
    useSession.setState({ mode: 'teach', workMap: FIXTURE_WORKMAP })
    const match = (id: string) => getDeps().matchGuardrails!(erp().invoices[id] as unknown as Record<string, unknown>).map((g) => g.id)
    expect(match('5102')).toEqual(['G1'])
    expect(match('5105')).toEqual([])
    expect(match('5106')).toEqual(['G5'])
  })

  it('renders the Work Map as markdown with quotes and guardrails', () => {
    const md = workMapMarkdown(FIXTURE_WORKMAP)
    expect(md).toContain('# Work Map: Process supplier invoices')
    expect(md).toContain('[S3, target field-costCenter] Code the invoice to a cost center')
    expect(md).toContain('- G1 (stop before posting)')
  })
})
