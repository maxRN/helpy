import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { api } from '../../convex/_generated/api'
import { formatDuration } from '../capture/screen'
import { RecordedTime } from '../capture/RecordedTime'
import { TaskRecorder, useTaskRecording } from '../capture/TaskRecorder'
import { ScreenshotNote } from '../capture/ScreenshotNote'

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
  const { state } = useTaskRecording()
  const isActiveTask = 'task' in state && state.task.taskId === taskId

  return (
    <main className="projects-page task-summary">
      <Link to="/projects/$projectId" params={{ projectId }} className="back-link">← Back to project</Link>
      <header>
        <p className="eyebrow">Sabine AI / {task?.projectName ?? 'Task'}</p>
        <h1>{task ? isActiveTask ? 'Current task' : 'Task summary' : 'Task not found'}</h1>
      </header>
      {task ? (
        <>
          {isActiveTask && <TaskRecorder project={{ _id: task.projectId, name: task.projectName }} />}
          <section className="panel summary-details" aria-label="Task details">
            <dl>
              <div><dt>Started</dt><dd><RecordedTime timestamp={task.startedAt} /></dd></div>
              <div><dt>Task duration</dt><dd className="duration">{task.completion ? formatDuration(task.completion.durationMs) : 'Unfinished'}</dd></div>
              <div><dt>Screenshots</dt><dd>{task.screenshots.length}</dd></div>
            </dl>
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
                <p className="muted">Deleting this task permanently removes all its screenshots.</p>
                <button className="danger" disabled={isActiveTask || removeTask.isPending} onClick={() => removeTask.mutate({ taskId: task._id })}>
                  {removeTask.isPending ? 'Deleting…' : 'Delete task'}
                </button>
                {removeTask.error && <p className="error" role="alert">{removeTask.error.message}</p>}
              </>
            )}
          </section>
          <section className="tasks-section" aria-labelledby="screenshots-heading">
            <h2 id="screenshots-heading">Screenshot timeline</h2>
            {task.screenshots.length === 0 ? <p className="panel muted">No screenshots were saved for this task.</p> : (
              <ol className="screenshot-grid">
                {task.screenshots.map((screenshot, index) => (
                  <li key={screenshot._id}>
                    <figure>
                      {screenshot.url ? (
                        <a href={screenshot.url} target="_blank" rel="noreferrer">
                          <img src={screenshot.url} alt={`Screenshot ${index + 1} at ${formatDuration(screenshot.offsetMs)}`} loading="lazy" />
                        </a>
                      ) : <p className="error">This screenshot is unavailable.</p>}
                      <figcaption>
                        <span className="duration">+{formatDuration(screenshot.offsetMs)}</span>
                        <RecordedTime timestamp={screenshot.capturedAt} timeOnly />
                      </figcaption>
                      <ScreenshotNote ocr={screenshot.ocr} />
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
