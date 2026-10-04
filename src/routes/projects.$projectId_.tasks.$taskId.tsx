import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { api } from '../../convex/_generated/api'
import { formatDuration } from '../capture/screen'
import { RecordedTime } from '../capture/RecordedTime'
import { TaskRecorder, useTaskRecording } from '../capture/TaskRecorder'
import { ScreenshotNote } from '../capture/ScreenshotNote'
import { releasePreviews, usePendingScreenshots } from '../capture/pendingScreenshots'

export const Route = createFileRoute('/projects/$projectId_/tasks/$taskId')({ component: TaskSummary })

function TaskSummary() {
  const { projectId, taskId } = Route.useParams()
  const { data: task } = useSuspenseQuery(convexQuery(api.tasks.get, { projectId, taskId }))
  const finishTask = useMutation({ mutationFn: useConvexMutation(api.tasks.finish) })
  const navigate = Route.useNavigate()
  const removeTask = useMutation({
    mutationFn: useConvexMutation(api.tasks.remove),
    onSuccess: () => navigate({ to: '/projects/$projectId', params: { projectId } }),
  })
  const { state, processingTasks, retryProcessing } = useTaskRecording()
  const isActiveTask = 'task' in state && state.task.taskId === taskId
  const background = processingTasks.find((entry) => entry.task.taskId === taskId)
  const previews = usePendingScreenshots((state) => state.screenshots).filter((shot) => shot.taskId === taskId)
  const screenshots = [
    ...(task?.screenshots ?? []).map((shot) => ({ ...shot, key: shot._id, preview: previews.find((preview) => preview.offsetMs === shot.offsetMs) })),
    ...previews.filter((preview) => !task?.screenshots.some((shot) => shot.offsetMs === preview.offsetMs)).map((preview) => ({
      key: `local-${preview.offsetMs}`, offsetMs: preview.offsetMs, capturedAt: preview.capturedAt,
      url: null, redactedUrl: null, ocr: undefined, redaction: undefined, preview,
    })),
  ].sort((a, b) => a.offsetMs - b.offsetMs)
  const inProcessing = task?.processing?.kind === 'processing' || !!background && !background.error
  const processingError = background ? background.error : task?.processing?.kind === 'failed' ? task.processing.error : null

  useEffect(() => {
    if (task) releasePreviews(taskId, task.screenshots.filter((shot) => shot.url && shot.ocr?.kind !== 'pending').map((shot) => shot.offsetMs))
  }, [taskId, task])

  return (
    <main className="projects-page task-summary">
      <Link to="/projects/$projectId" params={{ projectId }} className="back-link">← Back to project</Link>
      <header>
        <p className="eyebrow">Helpy / {task?.projectName ?? 'Task'}</p>
        <h1>{task ? isActiveTask ? 'Current task' : 'Task summary' : 'Task not found'}</h1>
      </header>
      {task ? (
        <>
          {isActiveTask && <TaskRecorder project={{ _id: task.projectId, name: task.projectName }} />}
          <section className="panel summary-details" aria-label="Task details">
            <dl>
              <div><dt>Started</dt><dd><RecordedTime timestamp={task.startedAt} /></dd></div>
              <div><dt>Task duration</dt><dd className="duration">{task.completion ? formatDuration(task.completion.durationMs) : 'Unfinished'}</dd></div>
              <div><dt>Screenshots</dt><dd>{screenshots.length}</dd></div>
              <div><dt>Status</dt><dd>{inProcessing ? 'In processing' : processingError ? 'Processing failed' : task.completion ? 'Finished' : 'Recording'}</dd></div>
            </dl>
            {inProcessing && <p className="muted" role="status">Recording finished. Screenshots and audio are still processing and uploading. Keep the recording tab open until processing finishes.</p>}
            {processingError && <p className="error" role="alert">Processing failed: {processingError}</p>}
            {background?.error && <button onClick={() => retryProcessing(task._id)}>Retry processing</button>}
            {task.completion?.error && <p className="error" role="alert">Recording ended with an error: {task.completion.error}</p>}
            {!task.completion && !isActiveTask && (
              <>
                <p className="muted">This task has not been finalized. If its recording page was closed, you can end it at the last saved screenshot.</p>
                <button disabled={finishTask.isPending} onClick={() => finishTask.mutate({
                  taskId: task._id,
                  durationMs: task.screenshots.at(-1)?.offsetMs ?? 0,
                  error: 'Recording interrupted. Duration ends at the last saved screenshot.',
                })}>{finishTask.isPending ? 'Saving…' : 'End interrupted task'}</button>
                {finishTask.error && <p className="error" role="alert">{finishTask.error.message}</p>}
              </>
            )}
            {task.completion && (
              <>
                <p className="muted">Deleting this task permanently removes its screenshots and microphone recording.</p>
                <button className="danger" disabled={isActiveTask || inProcessing || !!background || removeTask.isPending} onClick={() => removeTask.mutate({ taskId: task._id })}>
                  {removeTask.isPending ? 'Deleting…' : 'Delete task'}
                </button>
                {removeTask.error && <p className="error" role="alert">{removeTask.error.message}</p>}
              </>
            )}
          </section>
          <section className="panel tasks-section" aria-labelledby="audio-heading">
            <h2 id="audio-heading">Microphone recording</h2>
            {task.audioUrl ? (
              <>
                <audio controls preload="metadata" src={task.audioUrl} aria-label="Task microphone recording" />
                <p><a href={task.audioUrl} target="_blank" rel="noreferrer">Open audio recording</a></p>
              </>
            ) : <p className="muted">{isActiveTask ? 'Your narration will be saved when you finish the task.' : inProcessing ? 'Your microphone recording is uploading…' : 'No microphone recording was saved for this task.'}</p>}
          </section>
          <section className="tasks-section" aria-labelledby="screenshots-heading">
            <h2 id="screenshots-heading">Screenshot timeline</h2>
            {screenshots.length === 0 ? <p className="panel muted">No screenshots were captured for this task.</p> : (
              <ol className="screenshot-grid">
                {screenshots.map((screenshot, index) => (
                  <li key={screenshot.key}>
                    <figure>
                      {(screenshot.redactedUrl ?? screenshot.preview?.url ?? screenshot.url) ? (
                        <a href={screenshot.redactedUrl ?? screenshot.preview?.url ?? screenshot.url ?? undefined} target="_blank" rel="noreferrer">
                          <img src={screenshot.redactedUrl ?? screenshot.preview?.url ?? screenshot.url ?? undefined} alt={`${screenshot.redactedUrl ? 'Redacted screenshot' : 'Screenshot'} ${index + 1} at ${formatDuration(screenshot.offsetMs)}`} loading="lazy" />
                        </a>
                      ) : screenshot.ocr?.kind === 'pending' ? <p className="muted" role="status">Screenshot upload pending…</p> : <p className="error">This screenshot is unavailable.</p>}
                      <figcaption>
                        <span className="duration">+{formatDuration(screenshot.offsetMs)}</span>
                        <RecordedTime timestamp={screenshot.capturedAt} timeOnly />
                      </figcaption>
                      <p className="task-actions">
                        {screenshot.url && <a href={screenshot.url} target="_blank" rel="noreferrer">Original screenshot</a>}
                        {screenshot.redactedUrl && <a href={screenshot.redactedUrl} target="_blank" rel="noreferrer">Redacted screenshot</a>}
                      </p>
                      {screenshot.preview?.stage.kind === 'failed' ? <p className="error" role="alert">{screenshot.preview.stage.error}</p>
                        : screenshot.ocr?.kind === 'pending' || screenshot.preview && screenshot.preview.stage.kind !== 'saved' ? (
                          <p className="muted" role="status">{screenshot.preview?.stage.kind === 'uploading' ? 'Uploading redacted screenshot…' : 'Processing screenshot · Original preview'}</p>
                        ) : <ScreenshotNote ocr={screenshot.ocr} redaction={screenshot.redaction} />}
                    </figure>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      ) : <p className="muted">This task does not exist or its project has been deleted.</p>}
    </main>
  )
}
