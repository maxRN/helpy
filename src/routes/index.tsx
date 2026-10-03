import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main>
      <h1>Sabine AI</h1>
      <p>A helpful AI agent that watches you work and records your workflows.</p>
    </main>
  )
}
