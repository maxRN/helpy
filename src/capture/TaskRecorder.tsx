import { useBlocker, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { clearEventLog, emitEvent } from '../shared/bus'
import { useSession } from '../shared/session'
import { formatDuration, openScreenCapture } from './screen'
import type { ScreenRecording } from './screen'

const uploadResponse = z.object({ storageId: z.string() })
type Phase = 'idle' | 'starting' | 'recording' | 'saving' | 'save-failed'
type ActiveTask = { taskId: Id<'tasks'>; recording: ScreenRecording; saving: boolean }

export function TaskRecorder({ projectId, onBusyChange }: {
  projectId: Id<'projects'>
  onBusyChange: (busy: boolean) => void
}) {
  const createTask = useMutation(api.tasks.create)
  const generateUploadUrl = useMutation(api.tasks.generateUploadUrl)
  const addScreenshot = useMutation(api.tasks.addScreenshot)
  const finishTask = useMutation(api.tasks.finish)
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [savedCount, setSavedCount] = useState(0)
  const [startedAt, setStartedAt] = useState(0)
  const active = useRef<ActiveTask | null>(null)
  const pendingCapture = useRef<Awaited<ReturnType<typeof openScreenCapture>> | null>(null)
  const mounted = useRef(true)
  const busy = phase !== 'idle'

  useEffect(() => onBusyChange(busy), [busy, onBusyChange])
  useBlocker({
    shouldBlockFn: () => {
      if (!active.current && !pendingCapture.current && phase !== 'starting') return false
      setError('Finish and save this task before leaving the project.')
      return true
    },
    enableBeforeUnload: busy,
  })

  const finish = useCallback(async () => {
    const task = active.current
    if (!task || task.saving) return
    task.saving = true
    setPhase('saving')
    setError('')
    try {
      const result = await task.recording.finish()
      await finishTask({ taskId: task.taskId, ...result })
      useSession.getState().setT0(null)
      emitEvent({ source: 'system', kind: 'action', t: result.durationMs, meta: { action: 'task_finished', taskId: task.taskId } })
      active.current = null
      setPhase('idle')
      await navigate({ to: '/projects/$projectId/tasks/$taskId', params: { projectId, taskId: task.taskId } })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the task.')
      setPhase(active.current ? 'save-failed' : 'idle')
    } finally {
      task.saving = false
    }
  }, [finishTask, navigate, projectId])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      pendingCapture.current?.close()
      const task = active.current
      if (task) {
        void task.recording.finish().then((result) => finishTask({ taskId: task.taskId, ...result }))
          .catch((error: unknown) => console.error('Could not finish the task after leaving the page.', error))
        useSession.getState().setT0(null)
      }
    }
  }, [finishTask])

  async function start() {
    if (busy) return
    setPhase('starting')
    setError('')
    setSavedCount(0)
    let taskId: Id<'tasks'> | null = null
    try {
      const capture = await openScreenCapture()
      pendingCapture.current = capture
      if (!mounted.current) {
        capture.close()
        return
      }
      taskId = await createTask({ projectId, startedAt: capture.startedAt })
      const createdTaskId = taskId
      if (!mounted.current) {
        capture.close()
        await finishTask({ taskId, durationMs: 0, error: 'The recording page was closed before capture started.' })
        return
      }
      const recording = capture.start({
        onScreenshot: async ({ blob, ...timestamps }) => {
          const url = await generateUploadUrl({ taskId: createdTaskId })
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': blob.type },
            body: blob,
            signal: AbortSignal.timeout(120_000),
          })
          if (!response.ok) throw new Error(`Screenshot upload failed (${response.status}).`)
          const data: unknown = await response.json()
          const { storageId } = uploadResponse.parse(data)
          await addScreenshot({ taskId: createdTaskId, storageId, ...timestamps })
          if (mounted.current) setSavedCount((count) => count + 1)
          emitEvent({ source: 'vision', kind: 'action', t: timestamps.offsetMs, meta: { action: 'screenshot_saved', taskId: createdTaskId, storageId } })
        },
        onStopped: () => { void finish() },
      })
      active.current = { taskId, recording, saving: false }
      setStartedAt(capture.startedAt)
      useSession.getState().newSession()
      useSession.getState().setT0(capture.startedAt)
      clearEventLog()
      emitEvent({ source: 'system', kind: 'action', meta: { action: 'task_started', taskId } })
      setPhase('recording')
    } catch (failure) {
      pendingCapture.current?.close()
      const message = failure instanceof Error ? failure.message : 'Could not start screen capture.'
      setError(message)
      if (taskId) {
        try {
          await finishTask({ taskId, durationMs: 0, error: message })
        } catch (error) {
          setError(`${message} Could not finalize the task: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      setPhase('idle')
    } finally {
      pendingCapture.current = null
    }
  }

  return (
    <section className="panel recording-panel" aria-labelledby="recording-heading">
      <h2 id="recording-heading">{busy ? 'Current task' : 'Record a task'}</h2>
      {phase === 'recording' ? (
        <div className="recording-status" role="status">
          <span className="recording-dot" aria-hidden="true" />
          Recording your screen · <RecordingClock startedAt={startedAt} />
        </div>
      ) : (
        <p className="muted">
          {phase === 'saving' ? 'Screen capture stopped. Finishing screenshot uploads and saving your task…'
            : phase === 'save-failed' ? 'Screen capture stopped. Retry saving to open your summary.'
              : 'Share an entire screen to save a screenshot every 2 seconds. Click Done when you finish.'}
        </p>
      )}
      {busy && <p className="muted">{savedCount} screenshots saved</p>}
      <button
        disabled={phase === 'starting' || phase === 'saving'}
        onClick={() => { void (phase === 'idle' ? start() : finish()) }}
      >
        {phase === 'idle' ? 'New task' : phase === 'starting' ? 'Starting…'
          : phase === 'saving' ? 'Saving…' : phase === 'save-failed' ? 'Retry saving' : 'Done'}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}

function RecordingClock({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt)
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 1_000)
    return () => clearInterval(timer)
  }, [startedAt])
  return <span className="duration">{formatDuration(elapsed)}</span>
}
