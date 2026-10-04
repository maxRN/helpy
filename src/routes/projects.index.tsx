import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/projects/')({ component: Projects })

function Projects() {
  const { data: projects } = useSuspenseQuery(convexQuery(api.projects.list, {}))
  const [name, setName] = useState('')
  const createProject = useMutation({
    mutationFn: useConvexMutation(api.projects.create),
    onSuccess: () => setName(''),
  })

  return (
    <main className="projects-page">
      <Link to="/" className="back-link">← Helpy</Link>
      <header>
        <p className="eyebrow">Helpy</p>
        <h1>Projects</h1>
        <p className="muted">Create a project to keep your work together.</p>
      </header>

      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault()
          createProject.mutate({ name })
        }}
      >
        <label htmlFor="project-name">Project name</label>
        <div className="form-row">
          <input
            id="project-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Website redesign"
            required
            disabled={createProject.isPending}
          />
          <button type="submit" disabled={createProject.isPending || !name.trim()}>
            {createProject.isPending ? 'Creating…' : 'Create project'}
          </button>
        </div>
        {createProject.error && <p role="alert" className="error">{createProject.error.message}</p>}
      </form>

      <section aria-labelledby="projects-heading">
        <h2 id="projects-heading">Your projects <span className="count">{projects.length}</span></h2>
        {projects.length === 0 ? (
          <div className="panel empty-state">
            <h3>No projects yet</h3>
            <p className="muted">Give your first project a name to get started.</p>
          </div>
        ) : (
          <ul className="project-list">
            {projects.map((project) => (
              <li key={project._id}>
                <Link to="/projects/$projectId" params={{ projectId: project._id }}>
                  <span>{project.name}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
