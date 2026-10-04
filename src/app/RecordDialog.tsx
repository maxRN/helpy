import { useMutation } from 'convex/react'
import { useEffect } from 'react'
import { create } from 'zustand'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { loadOcrModel, useOcrModel } from '../capture/ocr'
import { loadPiiModel, usePiiModel } from '../capture/pii'
import { useTaskRecording } from '../capture/TaskRecorder'
import { speech, useListener } from '../integration/listener'
import { mascot } from '../mascot'
import { useMascot } from '../shared/mascot'
import { session } from '../shared/session'
import { auth } from './auth'
import { helpyApp } from './helpy-app/store'
import { panel } from './panel/store'
import { UNNAMED } from './recordName'
import { askWaitingQuestion, setOffRecord, startVoice } from './voice'

// "Record what I do" without a window: Helpy asks in its bubble what to call the task (typed, so nothing
// said to Helpy ends up as the name), then sharing the screen and the microphone starts. No spoken intro:
// Helpy stays quiet until there is a real question. While recording, clicking the robot shows pause and
// "I'm done" in the bubble.

/** Recording an existing process again keeps its name; a new one gets the name typed in the bubble. */
type Target = { projectId?: string; name?: string }
type Step =
  | { kind: 'idle' }
  /** Waiting for the screen-reading model; `auto` starts right away when it is ready (still inside the click). */
  | { kind: 'ready'; target: Target; auto: boolean }
  | { kind: 'starting'; target: Target }
  | { kind: 'failed'; target: Target }

interface RecordFlow {
  step: Step
  /** Bumped when the robot is clicked during a recording: show pause and "I'm done". */
  controlsAt: number
}

export const useRecordFlow = create<RecordFlow>()(() => ({ step: { kind: 'idle' }, controlsAt: 0 }))

const set = (step: Step) => useRecordFlow.setState({ step })

export const recordFlow = {
  /** Start recording (from a click: the browser only allows screen sharing right after one). */
  open(process?: { name: string; id: string }) {
    panel.close()
    helpyApp.close() // show the work, not Helpy's app
    mascot.pointTo(null)
    if (process) return set({ kind: 'ready', target: { projectId: process.id, name: process.name }, auto: true })
    // A new task: ask for its name first. Submitting (Enter or the button) is a fresh user gesture,
    // so the browser still allows screen sharing afterwards.
    mascot.setState('idle')
    mascot.bubble('What should I call this task?', {
      input: {
        placeholder: 'e.g. Supplier invoices, month-end',
        submitLabel: 'Start',
        suggestions: ['Supplier invoices', 'Month-end close'],
        onSubmit: (name) => {
          mascot.bubble(null)
          set({ kind: 'ready', target: { name: name.slice(0, 80) }, auto: true })
        },
      },
      actions: [{ label: 'Not now', onClick: notNow }],
    })
  },
  active: () => useRecordFlow.getState().step.kind !== 'idle',
  controls() {
    useRecordFlow.setState({ controlsAt: Date.now() })
  },
}

function notNow() {
  set({ kind: 'idle' })
  mascot.setState('idle')
  mascot.bubble('Okay, another time.')
}

/** Runs the dialog. Mounted once by Helpy (it needs the recorder and Convex hooks). */
export function RecordDialog() {
  const step = useRecordFlow((s) => s.step)
  const controlsAt = useRecordFlow((s) => s.controlsAt)
  const model = useOcrModel((s) => s.state.kind)
  const pii = usePiiModel((s) => s.state.kind)
  const { start, finish, state: recorder, error } = useTaskRecording()
  const createProject = useMutation(api.projects.create)
  const removeProject = useMutation(api.projects.remove)

  const begin = async (target: Target) => {
    if (useRecordFlow.getState().step.kind === 'starting') return // one start per click
    set({ kind: 'starting', target })
    const user = auth.user()
    let projectId = target.projectId as Id<'projects'> | undefined
    let created = false
    try {
      if (!projectId) {
        projectId = await createProject({ name: target.name ?? UNNAMED, ...(user ? { createdBy: user.name } : {}) })
        created = true
      }
      await start({ _id: projectId, name: target.name ?? UNNAMED }, { stay: true, ...(user ? { recordedBy: user.name } : {}) })
    } catch (err) {
      console.warn('[helpy] recording did not start', err)
    }
    if (session().t0 === null) {
      // Sharing was cancelled or failed: no empty process is left behind.
      if (created && projectId) await removeProject({ projectId }).catch(() => undefined)
      set({ kind: 'failed', target })
      return
    }
    set({ kind: 'idle' })
    panel.setActivity({ kind: 'recording', processId: projectId! })
    mascot.setState('thinking')
    mascot.bubble('One moment, I’m turning on my ears…')
    await startVoice('capture')

    // No spoken intro: nothing to talk over. Helpy only speaks when it has a real question in a pause.
    mascot.setState('listening')
    mascot.bubble(
      speech.active()
        ? `Recording “${target.name ?? 'your task'}”. Work as usual and tell me what you do. I only ask in real pauses. Click me when you’re done.`
        : 'I can’t hear you right now, but I’m watching your screen. Just start, and click me when you’re done.',
      { topic: 'notice' },
    )
  }

  useEffect(() => {
    switch (step.kind) {
      case 'idle':
        return
      case 'ready': {
        // Helpy reads the screen with a local model; it has to be loaded before a recording can start.
        if (model === 'failed' || pii === 'failed') {
          mascot.setState('idle')
          mascot.bubble('I can’t read your screen on this computer right now.', {
            actions: [
              { label: 'Try again', primary: true, onClick: () => { loadOcrModel(); void loadPiiModel().catch(() => undefined) } },
              { label: 'Not now', onClick: notNow },
            ],
          })
          return
        }
        if (model !== 'ready' || pii !== 'ready') {
          mascot.setState('thinking')
          mascot.bubble('I’m still getting ready to read your screen. One moment…', { actions: [{ label: 'Not now', onClick: notNow }] })
          return
        }
        if (step.auto) {
          void begin(step.target)
          return
        }
        // Ready later than the click: the browser needs a new click to share the screen.
        mascot.setState('idle')
        mascot.bubble('I’m ready now.', {
          actions: [
            { label: 'Start recording', primary: true, onClick: () => void begin(step.target) },
            { label: 'Not now', onClick: notNow },
          ],
        })
        return
      }
      case 'starting':
        mascot.setState('thinking')
        mascot.bubble('When your browser asks, choose “Entire screen”, click Share and allow the microphone.')
        return
      case 'failed':
        mascot.setState('idle')
        mascot.bubble('I couldn’t start. Choose “Entire screen”, click Share and allow the microphone, then try again.', {
          actions: [
            { label: 'Try again', primary: true, onClick: () => void begin(step.target) },
            { label: 'Not now', onClick: notNow },
          ],
        })
        return
    }
  }, [step, model, pii])

  // The models finished loading after the click: the next start needs its own click.
  useEffect(() => {
    if (step.kind === 'ready' && step.auto && (model !== 'ready' || pii !== 'ready')) set({ ...step, auto: false })
  }, [step, model, pii])

  const done = async () => {
    if (session().offRecord) await setOffRecord(false)
    mascot.setState('thinking')
    mascot.bubble('Finishing the recording…')
    await finish()
  }

  // Finishing failed (network): say so and offer to try again; the recording is still there.
  useEffect(() => {
    if (recorder.kind !== 'save-failed') return
    mascot.setState('idle')
    mascot.bubble(`I couldn’t save the recording yet.${error ? ` (${error})` : ''}`, {
      actions: [{ label: 'Try again', primary: true, onClick: () => void done() }],
    })
    // done() only needs the latest finish(), which is stable per recording.
  }, [recorder.kind, error])

  // Clicked during a recording: pause, ask the waiting question, or finish, right in the bubble.
  useEffect(() => {
    if (!controlsAt || recorder.kind === 'idle') return
    const offRecord = session().offRecord
    const waiting = useMascot.getState().waiting !== null
    // Scribe (live listening): say when Helpy can't hear, so nobody talks into the void.
    const ears = useListener.getState()
    const hearing = ears.status === 'error' ? ` I can’t hear you right now (${ears.error}), but I still watch the screen.` : ears.status === 'connecting' ? ' I’m turning on my ears…' : ''
    mascot.bubble(
      offRecord
        ? 'I’m not looking or listening. Continue when you’re ready.'
        : `I’m watching and listening.${hearing}${waiting ? ' I also have a question for you.' : ''}`,
      {
        actions: [
          { label: 'I’m done', primary: true, onClick: () => void done() },
          offRecord
            ? { label: 'Continue recording', onClick: () => void setOffRecord(false).then(recordFlow.controls) }
            : { label: 'Pause', onClick: () => void setOffRecord(true).then(recordFlow.controls) },
          ...(waiting && !offRecord ? [{ label: 'Ask me now', onClick: () => void askWaitingQuestion() }] : []),
        ],
      },
    )
  }, [controlsAt])

  return null
}
