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
import { loadPiiModel, usePiiModel } from './pii'
import { processScreenshot } from './pipeline'
import { addPreview, releasePreviews, updatePreview, usePendingScreenshots } from './pendingScreenshots'

const uploadResponse = z.object({ storageId: z.string() })
type Project = Pick<Doc<'projects'>, '_id' | 'name'>
type Task = { project: Project; taskId: Id<'tasks'>; startedAt: number }
type RecordingState =
  | { kind: 'idle' }
  | { kind: 'starting'; project: Project }
  | { kind: 'recording' | 'saving' | 'save-failed'; task: Task }
/** `stay`: after finishing, keep the user where they are instead of opening the task summary (Helpy). */
type ActiveTask = { task: Task; recording: ScreenRecording; audioStorageId: string | null; saving: boolean; processing: boolean; stay: boolean }
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
  const updateScreenshot = useMutation(api.tasks.updateScreenshot)
  const completeProcessing = useMutation(api.tasks.completeProcessing)
  const failProcessing = useMutation(api.tasks.failProcessing)
  const navigate = useNavigate()
  const [state, setState] = useState<RecordingState>({ kind: 'idle' })
  const [error, setError] = useState('')
  const [savedCount, setSavedCount] = useState(0)
  const active = useRef<ActiveTask | null>(null)
  const background = useRef(new Map<Id<'tasks'>, ActiveTask>())
  const failedScreenshots = useRef(new Map<Id<'tasks'>, Map<number, () => Promise<void>>>())
  const [processingTasks, setProcessingTasks] = useState<{ task: Task; error: string | null }[]>([])
  const pendingCapture = useRef<Awaited<ReturnType<typeof openScreenCapture>> | null>(null)
  const mounted = useRef(true)
  const busy = state.kind !== 'idle'

  useBlocker({
    shouldBlockFn: () => false,
    enableBeforeUnload: busy || processingTasks.length > 0,
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

  const processRecording = useCallback(async (task: ActiveTask, retry = false) => {
    if (task.processing) return
    task.processing = true
    background.current.set(task.task.taskId, task)
    setProcessingTasks((tasks) => [...tasks.filter((entry) => entry.task.taskId !== task.task.taskId), { task: task.task, error: null }])
    const stopped = task.recording.finish()
    try {
      const retryJobs = retry ? [...(failedScreenshots.current.get(task.task.taskId)?.values() ?? [])] : []
      const retries = Promise.allSettled(retryJobs.map((job) => job()))
      const audioUpload = stopped.audio.then(async (audio) => {
        if (audio && !task.audioStorageId) {
          task.audioStorageId = await upload(task.task.taskId, audio)
          if (useSession.getState().sessionId === task.task.taskId) emitEvent({ source: 'system', kind: 'audio_saved', t: stopped.durationMs, meta: { taskId: task.task.taskId, storageId: task.audioStorageId } })
        }
      })
      const [result, audioResult] = await Promise.allSettled([stopped.completed, audioUpload, retries])
      if (result.status === 'rejected') throw result.reason
      if (audioResult.status === 'rejected') throw audioResult.reason
      const failed = failedScreenshots.current.get(task.task.taskId)
      if (failed?.size) throw new Error(result.value.error ?? 'Some screenshots could not be processed or uploaded.')
      await completeProcessing({ taskId: task.task.taskId, error: retryJobs.length ? null : result.value.error, ...(task.audioStorageId ? { audioStorageId: task.audioStorageId } : {}) })
      background.current.delete(task.task.taskId)
      failedScreenshots.current.delete(task.task.taskId)
      if (!window.location.pathname.endsWith(`/tasks/${task.task.taskId}`)) {
        releasePreviews(task.task.taskId, usePendingScreenshots.getState().screenshots.filter((shot) => shot.taskId === task.task.taskId).map((shot) => shot.offsetMs))
      }
      setProcessingTasks((tasks) => tasks.filter((entry) => entry.task.taskId !== task.task.taskId))
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Could not finish processing the task.'
      setProcessingTasks((tasks) => tasks.map((entry) => entry.task.taskId === task.task.taskId ? { ...entry, error: message } : entry))
      await failProcessing({ taskId: task.task.taskId, error: message }).catch((error: unknown) => console.error('Could not report the processing failure.', error))
    } finally {
      task.processing = false
    }
  }, [upload, completeProcessing, failProcessing])

  const finish = useCallback(async () => {
    const task = active.current
    if (!task || task.saving) return
    task.saving = true
    setState({ kind: 'saving', task: task.task })
    setError('')
    try {
      const stopped = task.recording.finish()
      await finishTask({ taskId: task.task.taskId, durationMs: stopped.durationMs, error: null, processing: true })
      useSession.getState().setT0(null)
      emitEvent({ source: 'system', kind: 'task_finished', t: stopped.durationMs, meta: { taskId: task.task.taskId } })
      active.current = null
      setError('')
      setState({ kind: 'idle' })
      task.saving = false
      void processRecording(task)
      if (!task.stay) await navigate({ to: '/projects/$projectId/tasks/$taskId', params: { projectId: task.task.project._id, taskId: task.task.taskId } })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the task.')
      setState(active.current ? { kind: 'save-failed', task: task.task } : { kind: 'idle' })
    } finally {
      task.saving = false
    }
  }, [finishTask, processRecording, navigate])

  useEffect(() => {
    mounted.current = true
    loadOcrModel()
    void loadPiiModel().catch(() => undefined)
    return () => {
      mounted.current = false
      pendingCapture.current?.close()
      const task = active.current
      if (task) {
        if (!task.saving) {
          const stopped = task.recording.finish()
          void finishTask({ taskId: task.task.taskId, durationMs: stopped.durationMs, error: null, processing: true })
            .then(() => processRecording(task))
            .catch((error: unknown) => console.error('Could not finish the task after closing the app.', error))
        }
        useSession.getState().setT0(null)
      }
    }
  }, [finishTask, processRecording])

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
        onScreenshot: async (screenshot) => {
          const { blob, ...timestamps } = screenshot
          addPreview(createdTaskId, screenshot)
          let screenshotId: Id<'screenshots'> | undefined
          let originalStorageId: string | undefined
          let redactedStorageId: string | undefined
          let uploadMs = 0
          let processed: Awaited<ReturnType<typeof processScreenshot>> | undefined
          const jobs = failedScreenshots.current.get(createdTaskId) ?? new Map<number, () => Promise<void>>()
          failedScreenshots.current.set(createdTaskId, jobs)
          async function saveScreenshot() {
            updatePreview(createdTaskId, timestamps.offsetMs, { kind: 'processing' })
            try {
              screenshotId ??= await addScreenshot({ taskId: createdTaskId, ...timestamps })
              const registeredId = screenshotId
              const originalUpload = (async () => {
                if (!originalStorageId) {
                  const started = performance.now()
                  originalStorageId = await upload(createdTaskId, blob)
                  uploadMs += performance.now() - started
                }
                await updateScreenshot({ screenshotId: registeredId, storageId: originalStorageId, processing: { kind: 'pending' } })
                return originalStorageId
              })()
              const processing = (async () => {
                processed ??= await processScreenshot(blob)
                updatePreview(createdTaskId, timestamps.offsetMs, { kind: 'uploading' }, processed.redacted)
                return processed
              })()
              const [analysis, original] = await Promise.allSettled([processing, originalUpload])
              if (original.status === 'rejected') throw original.reason
              if (analysis.status === 'rejected') throw analysis.reason
              const result = analysis.value
              if (active.current?.task.taskId === createdTaskId && !active.current.saving) {
                void processFrame(result.redacted, timestamps.capturedAt, timestamps.offsetMs).catch((failure: unknown) => console.warn('[frame]', failure))
              }
              if (!redactedStorageId) {
                const started = performance.now()
                redactedStorageId = result.redacted === result.original ? original.value : await upload(createdTaskId, result.redacted)
                uploadMs += performance.now() - started
              }
              await updateScreenshot({ screenshotId: registeredId, storageId: original.value, processing: { kind: 'completed', redactedStorageId,
                result: result.ocr, redaction: { ...result.redaction, timings: {
                  ...result.redaction.timings, uploadMs,
                } } } })
              updatePreview(createdTaskId, timestamps.offsetMs, { kind: 'saved' })
              jobs.delete(timestamps.offsetMs)
              if (mounted.current && active.current?.task.taskId === createdTaskId) setSavedCount((count) => count + 1)
              if (useSession.getState().sessionId === createdTaskId) {
                emitEvent({ source: 'system', kind: 'screenshot_saved', t: timestamps.offsetMs, meta: { taskId: createdTaskId, storageId: original.value } })
                emitEvent({ source: 'system', kind: 'screenshot_analyzed', t: timestamps.offsetMs, meta: {
                  taskId: createdTaskId, screenshotId, model: result.ocr.model, regions: result.ocr.regions.length,
                  redactions: result.redaction.spans.length, ...result.redaction.timings,
                } })
              }
            } catch (failure) {
              jobs.set(timestamps.offsetMs, saveScreenshot)
              const message = failure instanceof Error ? failure.message : 'Screenshot processing failed.'
              updatePreview(createdTaskId, timestamps.offsetMs, { kind: 'failed', error: message })
              if (screenshotId) await updateScreenshot({ screenshotId, processing: { kind: 'failed', error: message } })
              throw failure
            }
          }
          await saveScreenshot()
        },
        onStopped: () => { void finish() },
      })
      const task = { project, taskId, startedAt: capture.startedAt }
      active.current = { task, recording, audioStorageId: null, saving: false, processing: false, stay }
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

  function retryProcessing(taskId: Id<'tasks'>) {
    const task = background.current.get(taskId)
    if (task) void processRecording(task, true)
  }

  return { state, error, savedCount, start, finish, processingTasks, retryProcessing }
}

export function TaskRecorder({ project }: { project: Project }) {
  const { state, error, savedCount, start } = useTaskRecording()
  const { state: model } = useOcrModel()
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
          {state.kind === 'saving' ? 'Recording stopped. Finishing the task…'
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
      {!busy && model.kind === 'loading' && <p className="muted" role="status">{model.message} {Math.floor(model.progress)}%.</p>}
      {!busy && model.kind === 'failed' && <>
        <p className="error" role="alert">Text recognition could not start: {model.error}</p>
        <button onClick={loadOcrModel}>Retry loading text recognition</button>
      </>}
      {!busy && pii.kind === 'loading' && <p className="muted" role="status">{pii.message} {Math.floor(pii.progress)}%.</p>}
      {!busy && pii.kind === 'failed' && <>
        <p className="error" role="alert">PII redaction could not start: {pii.error}</p>
        <button onClick={() => { void loadPiiModel().catch(() => undefined) }}>Retry loading PII redaction</button>
      </>}
      {!busy && ready && <p className="muted model-ready">Tesseract.js and PII redaction are ready. Original and redacted screenshots will both be saved.</p>}
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
