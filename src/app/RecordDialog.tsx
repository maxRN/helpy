import { useMutation } from 'convex/react'
import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { loadOcrModel, useOcrModel } from '../capture/ocr'
import { useTaskRecording } from '../capture/TaskRecorder'
import { mascot } from '../mascot'
import { session } from '../shared/session'
import { useMascot } from '../shared/mascot'
import { auth } from './auth'
import { useProcesses } from './panel/processes'
import { panel } from './panel/store'
import { askWaitingQuestion, setOffRecord, speak, startVoice } from './voice'

// "Record what I do" without a window: Helpy asks in its speech bubble, you answer there,
// then it watches. While recording, clicking the robot shows pause and "I'm done" in the bubble.

type Target = { name: string; projectId?: string }
type Step =
  | { kind: 'idle' }
  | { kind: 'what' }
  | { kind: 'ready'; target: Target }
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
  /** Start the dialog; with a process, skip "what do you want to show me?". */
  open(process?: { name: string; id: string }) {
    panel.close()
    mascot.pointTo(null)
    set(process ? { kind: 'ready', target: { name: process.name, projectId: process.id } } : { kind: 'what' })
  },
  active: () => useRecordFlow.getState().step.kind !== 'idle',
  controls() {
    useRecordFlow.setState({ controlsAt: Date.now() })
  },
}

function notNow() {
  set({ kind: 'idle' })
  mascot.setState('idle')
  mascot.bubble('Okay, another time.', { ttlMs: 3000 })
}

/** Runs the dialog. Mounted once by Helpy (it needs the recorder and Convex hooks). */
export function RecordDialog() {
  const step = useRecordFlow((s) => s.step)
  const controlsAt = useRecordFlow((s) => s.controlsAt)
  const model = useOcrModel((s) => s.state.kind)
  const processes = useProcesses()
  const { start, finish, state: recorder } = useTaskRecording()
  const createProject = useMutation(api.projects.create)
  const removeProject = useMutation(api.projects.remove)
  const spoken = useRef('')

  // Ask once out loud per question (silent without ElevenLabs keys).
  const ask = (text: string) => {
    if (spoken.current === text) return
    spoken.current = text
    void speak(text)
  }

  const own = (processes ?? []).filter((p) => !p.example)

  const begin = async (target: Target) => {
    set({ kind: 'starting', target })
    const user = auth.user()
    const known = target.projectId ?? own.find((p) => p.name.toLowerCase() === target.name.toLowerCase())?.id
    let projectId = known as Id<'projects'> | undefined
    let created = false
    try {
      if (!projectId) {
        projectId = await createProject({ name: target.name, ...(user ? { createdBy: user.name } : {}) })
        created = true
      }
      await start({ _id: projectId, name: target.name }, { stay: true, ...(user ? { recordedBy: user.name } : {}) })
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
    mascot.setState('listening')
    mascot.bubble('I’m watching and listening. Work as usual and tell me what you do. Click me when you’re done.', { ttlMs: 8000 })
    void startVoice('capture')
  }

  useEffect(() => {
    switch (step.kind) {
      case 'idle':
        spoken.current = ''
        return
      case 'what': {
        const text = 'What do you want to show me today?'
        mascot.setState('listening')
        mascot.bubble(text, {
          input: {
            placeholder: 'e.g. Pay supplier invoices',
            submitLabel: 'OK',
            suggestions: [...new Set(own.map((p) => p.name))].slice(0, 3),
            onSubmit: (name) => {
              const match = own.find((p) => p.name.toLowerCase() === name.toLowerCase())
              set({ kind: 'ready', target: { name: match?.name ?? name, projectId: match?.id } })
            },
          },
          actions: [{ label: 'Not now', onClick: notNow }],
        })
        ask(text)
        return
      }
      case 'ready': {
        // Helpy reads the screen with a local model; it has to be loaded before a recording can start.
        if (model === 'failed') {
          mascot.setState('idle')
          mascot.bubble('I can’t read your screen on this computer right now.', {
            actions: [
              { label: 'Try again', primary: true, onClick: loadOcrModel },
              { label: 'Not now', onClick: notNow },
            ],
          })
          return
        }
        if (model !== 'ready') {
          mascot.setState('thinking')
          mascot.bubble('I’m still getting ready to read your screen. One moment…', { actions: [{ label: 'Not now', onClick: notNow }] })
          return
        }
        const text = `“${step.target.name}”, got it. Work like you always do and tell me what you’re doing. I’ll only ask when you pause. Ready?`
        mascot.setState('listening')
        mascot.bubble(text, {
          actions: [
            { label: 'Start recording', primary: true, onClick: () => void begin(step.target) },
            { label: 'Not now', onClick: notNow },
          ],
        })
        ask('Got it. Work like you always do and tell me what you’re doing. I’ll only ask when you pause. Ready?')
        return
      }
      case 'starting':
        mascot.setState('thinking')
        mascot.bubble('When your browser asks, choose “Entire screen” and click Share.')
        return
      case 'failed':
        mascot.setState('idle')
        mascot.bubble('I couldn’t see your screen. When your browser asks, choose “Entire screen” and click Share.', {
          actions: [
            { label: 'Try again', primary: true, onClick: () => void begin(step.target) },
            { label: 'Not now', onClick: notNow },
          ],
        })
        return
    }
    // `own` changes with every Convex update; the dialog only follows its step and the model.
  }, [step, model])

  // Clicked during a recording: pause, ask the waiting question, or finish, right in the bubble.
  useEffect(() => {
    if (!controlsAt || recorder.kind === 'idle') return
    const offRecord = session().offRecord
    const waiting = useMascot.getState().waiting !== null
    const done = async () => {
      if (session().offRecord) await setOffRecord(false)
      mascot.setState('thinking')
      mascot.bubble('Saving…')
      await finish()
    }
    mascot.bubble(
      offRecord ? 'I’m not looking or listening. Continue when you’re ready.' : waiting ? 'I’m watching and listening. I also have a question for you.' : 'I’m watching and listening.',
      {
        ttlMs: 12_000,
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
