import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/projects/$projectId')({ component: Project })

function Project() {
  const { projectId } = Route.useParams()
  const { data: project } = useSuspenseQuery(convexQuery(api.projects.get, { projectId }))
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
        <section className="panel" aria-labelledby="details-heading">
          <h2 id="details-heading">Project details</h2>
          <dl>
            <dt>Name</dt>
            <dd>{project.name}</dd>
          </dl>
          <button
            className="danger"
            disabled={removeProject.isPending}
            onClick={() => removeProject.mutate({ projectId: project._id })}
          >
            {removeProject.isPending ? 'Deleting…' : 'Delete project'}
          </button>
          {removeProject.error && <p role="alert" className="error">{removeProject.error.message}</p>}
        </section>
      ) : (
        <p className="muted">This project does not exist or has been deleted.</p>
      )}
    </main>
  )
}
