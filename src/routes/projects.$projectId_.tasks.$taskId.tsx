import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import { formatDuration } from '../capture/screen'
import { RecordedTime } from '../capture/RecordedTime'

export const Route = createFileRoute('/projects/$projectId_/tasks/$taskId')({ component: TaskSummary })

function TaskSummary() {
  const { projectId, taskId } = Route.useParams()
  const { data: task } = useSuspenseQuery(convexQuery(api.tasks.get, { projectId, taskId }))
  const finishTask = useMutation(api.tasks.finish)
  const [isFinishing, setIsFinishing] = useState(false)
  const [error, setError] = useState('')

  return (
    <main className="projects-page task-summary">
      <Link to="/projects/$projectId" params={{ projectId }} className="back-link">← Back to project</Link>
      <header>
        <p className="eyebrow">Sabine AI / {task?.projectName ?? 'Task'}</p>
        <h1>{task ? 'Task summary' : 'Task not found'}</h1>
      </header>
      {task ? (
        <>
          <section className="panel summary-details" aria-label="Task details">
            <dl>
              <div><dt>Started</dt><dd><RecordedTime timestamp={task.startedAt} /></dd></div>
              <div><dt>Task duration</dt><dd className="duration">{task.completion ? formatDuration(task.completion.durationMs) : 'Unfinished'}</dd></div>
              <div><dt>Screenshots</dt><dd>{task.screenshots.length}</dd></div>
            </dl>
            {task.completion?.error && <p className="error" role="alert">Recording ended with an error: {task.completion.error}</p>}
            {!task.completion && (
              <>
                <p className="muted">This task has not been finalized. If its recording page was closed, you can end it at the last saved screenshot.</p>
                <button disabled={isFinishing} onClick={async () => {
                  setIsFinishing(true)
                  setError('')
                  try {
                    const lastScreenshot = task.screenshots.at(-1)
                    await finishTask({ taskId: task._id, durationMs: lastScreenshot?.offsetMs ?? 0, error: 'Recording interrupted. Duration ends at the last saved screenshot.' })
                  } catch (failure) {
                    setError(failure instanceof Error ? failure.message : 'Could not finish this task.')
                  } finally {
                    setIsFinishing(false)
                  }
                }}>{isFinishing ? 'Saving…' : 'End interrupted task'}</button>
                {error && <p className="error" role="alert">{error}</p>}
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
