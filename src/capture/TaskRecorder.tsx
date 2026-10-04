import { Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { z } from 'zod'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { clearEventLog, emitEvent } from '../shared/bus'
import { processFrame, resetFrameEvents } from './frameEvents'
import { useSession } from '../shared/session'
import { formatDuration, openScreenCapture } from './screen'
import type { ScreenRecording } from './screen'
import { loadOcrModel, useOcrModel } from './ocr'
import { OCR_MODELS } from './ocr-contract'
import { loadPiiModel, usePiiModel } from './pii'
import { processScreenshot } from './pipeline'

const uploadResponse = z.object({ storageId: z.string() })
type Project = Pick<Doc<'projects'>, '_id' | 'name'>
type Task = { project: Project; taskId: Id<'tasks'>; startedAt: number }
type RecordingState =
  | { kind: 'idle' }
  | { kind: 'starting'; project: Project }
  | { kind: 'recording' | 'saving' | 'save-failed'; task: Task }
/** `stay`: after finishing, keep the user where they are instead of opening the task summary (Helpy). */
type ActiveTask = { task: Task; recording: ScreenRecording; audioStorageId: string | null; saving: boolean; stay: boolean }
const TaskRecordingContext = createContext<ReturnType<typeof useRecordingController> | null>(null)

export function TaskRecordingProvider({ children }: { children: ReactNode }) {
  const recording = useRecordingController()
  return <TaskRecordingContext.Provider value={recording}>{children}</TaskRecordingContext.Provider>
}

export function useTaskRecording() {
  const recording = useContext(TaskRecordingContext)
  if (!recording) throw new Error('TaskRecordingProvider is missing.')
  return recording
}

function useRecordingController() {
  const createTask = useMutation(api.tasks.create)
  const generateUploadUrl = useMutation(api.tasks.generateUploadUrl)
  const addScreenshot = useMutation(api.tasks.addScreenshot)
  const finishTask = useMutation(api.tasks.finish)
  const navigate = useNavigate()
  const [state, setState] = useState<RecordingState>({ kind: 'idle' })
  const [error, setError] = useState('')
  const [savedCount, setSavedCount] = useState(0)
  const active = useRef<ActiveTask | null>(null)
  const pendingCapture = useRef<Awaited<ReturnType<typeof openScreenCapture>> | null>(null)
  const mounted = useRef(true)
  const busy = state.kind !== 'idle'

  useBlocker({
    shouldBlockFn: () => false,
    enableBeforeUnload: busy,
  })

  const upload = useCallback(async (taskId: Id<'tasks'>, blob: Blob) => {
    const url = await generateUploadUrl({ taskId })
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': blob.type }, body: blob, signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) throw new Error(`Recording upload failed (${response.status}).`)
    const data: unknown = await response.json()
    return uploadResponse.parse(data).storageId
  }, [generateUploadUrl])

  const saveRecording = useCallback(async (task: ActiveTask) => {
    const { durationMs, error, audio } = await task.recording.finish()
    if (audio && !task.audioStorageId) {
      task.audioStorageId = await upload(task.task.taskId, audio)
      emitEvent({ source: 'system', kind: 'audio_saved', t: durationMs, meta: { taskId: task.task.taskId, storageId: task.audioStorageId } })
    }
    await finishTask({ taskId: task.task.taskId, durationMs, error, ...(task.audioStorageId ? { audioStorageId: task.audioStorageId } : {}) })
    return { durationMs, error }
  }, [finishTask, upload])

  const finish = useCallback(async () => {
    const task = active.current
    if (!task || task.saving) return
    task.saving = true
    setState({ kind: 'saving', task: task.task })
    setError('')
    try {
      const result = await saveRecording(task)
      useSession.getState().setT0(null)
      emitEvent({ source: 'system', kind: 'task_finished', t: result.durationMs, meta: { taskId: task.task.taskId } })
      active.current = null
      setState({ kind: 'idle' })
      if (!task.stay) await navigate({ to: '/projects/$projectId/tasks/$taskId', params: { projectId: task.task.project._id, taskId: task.task.taskId } })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the task.')
      setState(active.current ? { kind: 'save-failed', task: task.task } : { kind: 'idle' })
    } finally {
      task.saving = false
    }
  }, [saveRecording, navigate])

  useEffect(() => {
    mounted.current = true
    loadOcrModel()
    void loadPiiModel().catch(() => undefined)
    return () => {
      mounted.current = false
      pendingCapture.current?.close()
      const task = active.current
      if (task) {
        if (!task.saving) void saveRecording(task)
          .catch((error: unknown) => console.error('Could not finish the task after closing the app.', error))
        useSession.getState().setT0(null)
      }
    }
  }, [saveRecording])

  async function start(project: Project, { stay = false, recordedBy }: { stay?: boolean; recordedBy?: string } = {}) {
    if (busy) return
    if (useOcrModel.getState().state.kind !== 'ready' || usePiiModel.getState().state.kind !== 'ready') {
      setError('Wait for text recognition and PII redaction to finish loading before starting a task.')
      return
    }
    setState({ kind: 'starting', project })
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
      taskId = await createTask({ projectId: project._id, startedAt: capture.startedAt, ...(recordedBy ? { recordedBy } : {}) })
      const createdTaskId = taskId
      if (!mounted.current) {
        capture.close()
        await finishTask({ taskId, durationMs: 0, error: 'The recording page was closed before capture started.' })
        return
      }
      const recording = capture.start({
        onScreenshot: async ({ blob, ...timestamps }) => {
          let processed: Awaited<ReturnType<typeof processScreenshot>>
          try { processed = await processScreenshot(blob) }
          catch (failure) {
            const storageId = await upload(createdTaskId, blob)
            const screenshotId = await addScreenshot({ taskId: createdTaskId, storageId, ...timestamps, processing: {
              kind: 'failed', error: failure instanceof Error ? failure.message : 'Screenshot processing failed.',
            } })
            if (mounted.current) setSavedCount((count) => count + 1)
            emitEvent({ source: 'system', kind: 'screenshot_saved', t: timestamps.offsetMs, meta: { taskId: createdTaskId, screenshotId, storageId, processingFailed: true } })
            throw failure
          }
          void processFrame(processed.redacted, timestamps.capturedAt, timestamps.offsetMs).catch((failure: unknown) => console.warn('[frame]', failure))
          const uploadStarted = performance.now()
          const [storageId, redactedStorageId] = await Promise.all([upload(createdTaskId, processed.original), upload(createdTaskId, processed.redacted)])
          const screenshotId = await addScreenshot({ taskId: createdTaskId, storageId, ...timestamps, processing: { kind: 'completed', redactedStorageId,
            result: processed.ocr, redaction: { ...processed.redaction, timings: {
              ...processed.redaction.timings, uploadMs: performance.now() - uploadStarted,
            } } } })
          if (mounted.current) setSavedCount((count) => count + 1)
          emitEvent({ source: 'system', kind: 'screenshot_saved', t: timestamps.offsetMs, meta: { taskId: createdTaskId, storageId } })
          emitEvent({ source: 'system', kind: 'screenshot_analyzed', t: timestamps.offsetMs, meta: {
            taskId: createdTaskId, screenshotId, model: processed.ocr.model, regions: processed.ocr.regions.length,
            redactions: processed.redaction.spans.length, ...processed.redaction.timings,
          } })
        },
        onStopped: () => { void finish() },
      })
      const task = { project, taskId, startedAt: capture.startedAt }
      active.current = { task, recording, audioStorageId: null, saving: false, stay }
      useSession.getState().newSession(taskId)
      useSession.getState().setMode('capture')
      useSession.getState().setT0(capture.startedAt)
      clearEventLog()
      resetFrameEvents()
      emitEvent({ source: 'system', kind: 'task_started', meta: { taskId } })
      setState({ kind: 'recording', task })
    } catch (failure) {
      pendingCapture.current?.close()
      const message = failure instanceof Error ? failure.message : 'Could not start screen and microphone recording.'
      setError(message)
      if (taskId) {
        try {
          await finishTask({ taskId, durationMs: 0, error: message })
        } catch (error) {
          setError(`${message} Could not finalize the task: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      setState({ kind: 'idle' })
    } finally {
      pendingCapture.current = null
    }
  }

  return { state, error, savedCount, start, finish }
}

export function TaskRecorder({ project }: { project: Project }) {
  const { state, error, savedCount, start } = useTaskRecording()
  const { state: model, modelId } = useOcrModel()
  const { state: pii } = usePiiModel()
  const ready = model.kind === 'ready' && pii.kind === 'ready'
  const busy = state.kind !== 'idle'
  const owner = state.kind === 'idle' ? null : state.kind === 'starting' ? state.project : state.task.project

  if (owner && owner._id !== project._id) {
    return (
      <section className="panel recording-panel" aria-label="Current task">
        <h2>A task is already in progress</h2>
        <p className="muted">Finish the task in {owner.name} before starting another.</p>
        <ReturnToTaskLink />
      </section>
    )
  }

  return (
    <section className="panel recording-panel" aria-labelledby="recording-heading">
      <h2 id="recording-heading">{busy ? 'Current task' : 'Record a task'}</h2>
      {state.kind === 'recording' ? (
        <div className="recording-status" role="status">
          <span className="recording-dot" aria-hidden="true" />
          Recording your screen and microphone · <RecordingClock startedAt={state.task.startedAt} />
        </div>
      ) : (
        <p className="muted">
          {state.kind === 'saving' ? 'Recording stopped. Saving audio and finishing PII redaction and screenshot uploads…'
            : state.kind === 'save-failed' ? 'Recording stopped. Retry saving to open your summary.'
              : 'Share an entire screen and allow microphone access. We save screenshots every 2 seconds and record your narration. Click Done when you finish.'}
        </p>
      )}
      {busy && <p className="muted">{savedCount} screenshots saved</p>}
      <div className="task-actions">
        {busy ? <FinishTaskButton /> : <button disabled={!ready} onClick={() => { void start(project) }}>
          {ready ? 'New task' : 'Preparing screenshot pipeline…'}
        </button>}
        <Link to="/" className="task-link">Example ERP</Link>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!busy && ready && <p className="muted model-ready">{OCR_MODELS[modelId].label} and PII redaction are ready. Original and redacted screenshots will both be saved.</p>}
    </section>
  )
}

export function ActiveTaskBar() {
  const { state, savedCount, error } = useTaskRecording()
  if (state.kind === 'idle') return null
  const project = state.kind === 'starting' ? state.project : state.task.project

  return (
    <aside className="recording-bar" aria-label="Active task">
      <div className="recording-bar-details" role="status">
        <span>
          {state.kind === 'recording' ? 'Recording screen and microphone' : state.kind === 'starting' ? 'Starting task' : state.kind === 'saving' ? 'Saving task' : 'Task needs saving'}
          {' · '}{project.name}
        </span>
        {state.kind === 'recording' && <RecordingClock startedAt={state.task.startedAt} />}
        <span>{savedCount} screenshots saved</span>
      </div>
      <nav aria-label="Recording navigation">
        <Link to="/">Example ERP</Link>
        <ReturnToTaskLink />
        <FinishTaskButton />
      </nav>
      {error && <p className="error" role="alert">{error}</p>}
    </aside>
  )
}

function ReturnToTaskLink() {
  const { state } = useTaskRecording()
  if (state.kind === 'idle') return null
  return state.kind === 'starting' ? (
    <Link to="/projects/$projectId" params={{ projectId: state.project._id }}>Return to task</Link>
  ) : (
    <Link to="/projects/$projectId/tasks/$taskId" params={{ projectId: state.task.project._id, taskId: state.task.taskId }}>Return to task</Link>
  )
}

function FinishTaskButton() {
  const { state, finish } = useTaskRecording()
  return (
    <button disabled={state.kind === 'starting' || state.kind === 'saving'} onClick={() => { void finish() }}>
      {state.kind === 'starting' ? 'Starting…' : state.kind === 'saving' ? 'Saving…' : state.kind === 'save-failed' ? 'Retry saving' : 'Done'}
    </button>
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
