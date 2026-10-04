import type { QueryClient } from '@tanstack/react-query'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { ActiveTaskBar, TaskRecordingProvider } from '../capture/TaskRecorder'

import appCss from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Helpy — Learn from the expert',
      },
      { name: 'description', content: 'Helpy learns workflows from screen activity and narration, then teaches the next person with expert reasoning and guided practice.' },
      { property: 'og:title', content: 'Helpy — Learn from the expert' },
      { property: 'og:description', content: 'Capture expert workflows. Build a Work Map. Teach the next person.' },
      { property: 'og:type', content: 'website' },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      // Helpy's head as the tab icon (files in public/)
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
  }),
  component: RootLayout,
  shellComponent: RootDocument,
})

function RootLayout() {
  return (
    <TaskRecordingProvider>
      <ActiveTaskBar />
      <Outlet />
    </TaskRecordingProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}

        <Scripts />
      </body>
    </html>
  )
}
