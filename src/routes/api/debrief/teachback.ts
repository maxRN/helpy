import { createFileRoute } from '@tanstack/react-router'
import type { WorkMap } from '../../../shared/types'
import { writeTeachback } from '../../../server/debrief'

// POST /api/debrief/teachback  { workMap, language? } → { text }
export const Route = createFileRoute('/api/debrief/teachback')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as { workMap?: WorkMap; language?: 'de' | 'en' } | null
        if (!body?.workMap?.steps?.length) return Response.json({ error: 'Body must be { workMap } with steps' }, { status: 400 })
        try {
          return Response.json({ text: await writeTeachback(body.workMap, body.language === 'de' ? 'de' : 'en') })
        } catch (err) {
          console.error('[debrief/teachback]', err)
          return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
        }
      },
    },
  },
})
