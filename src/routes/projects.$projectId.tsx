import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import { TaskRecorder } from '../capture/TaskRecorder'
import { RecordedTime } from '../capture/RecordedTime'
import { formatDuration } from '../capture/screen'

export const Route = createFileRoute('/projects/$projectId')({ component: Project })

function Project() {
  const { projectId } = Route.useParams()
  const { data: project } = useSuspenseQuery(convexQuery(api.projects.get, { projectId }))
  const { data: tasks } = useSuspenseQuery(convexQuery(api.tasks.list, { projectId }))
  const [isRecording, setIsRecording] = useState(false)
  const navigate = Route.useNavigate()
  const removeProject = useMutation({
    mutationFn: useConvexMutation(api.projects.remove),
    onSuccess: () => navigate({ to: '/projects' }),
  })

  return (
    <main className="projects-page">
      <Link to="/projects" className="back-link">← All projects</Link>
      <header>
        <p className="eyebrow">Sabine AI / Project</p>
        <h1>{project ? project.name : 'Project not found'}</h1>
      </header>
      {project ? (
        <>
          <TaskRecorder projectId={project._id} onBusyChange={setIsRecording} />
          <section className="tasks-section" aria-labelledby="tasks-heading">
            <h2 id="tasks-heading">Tasks <span className="count">{tasks.length}</span></h2>
            {tasks.length === 0 ? (
              <div className="panel empty-state">
                <h3>No tasks yet</h3>
                <p className="muted">Record your first workflow to see its screenshots and duration here.</p>
              </div>
            ) : (
              <ul className="project-list">
                {tasks.map((task) => (
                  <li key={task._id}>
                    <Link to="/projects/$projectId/tasks/$taskId" params={{ projectId, taskId: task._id }}>
                      <RecordedTime timestamp={task.startedAt} />
                      <span className="task-duration">{task.completion ? formatDuration(task.completion.durationMs) : 'Unfinished'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel" aria-labelledby="details-heading">
            <h2 id="details-heading">Project details</h2>
            <dl>
              <dt>Name</dt>
              <dd>{project.name}</dd>
            </dl>
            <button
              className="danger"
              disabled={isRecording || removeProject.isPending}
              onClick={() => removeProject.mutate({ projectId: project._id })}
            >
              {removeProject.isPending ? 'Deleting…' : 'Delete project'}
            </button>
            {removeProject.error && <p role="alert" className="error">{removeProject.error.message}</p>}
          </section>
        </>
      ) : (
        <p className="muted">This project does not exist or has been deleted.</p>
      )}
    </main>
  )
}
