# Sabine AI

This is a helpful AI agent that watches you work and records your workflows.

Built with [TanStack Start](https://tanstack.com/start/latest), React, TypeScript, and Vite.

Run locally with Node.js 22.12 or newer:

```sh
npm ci
npm run dev
```

Open http://localhost:3000.

```sh
npm run typecheck
npm run build
npm run preview
```

The build runs TypeScript checks before bundling. Preview serves the production build locally.

Edit `src/routes/index.tsx` for the home page and `src/routes/__root.tsx` for the shared document layout. Add routes under `src/routes`; TanStack Router generates `src/routeTree.gen.ts` automatically.

For production, run `npm run build` followed by `npm start`. Nitro serves the app from `.output/server/index.mjs` and uses the `PORT` environment variable supplied by Railway.

The app is live at [sabine-ai-production.up.railway.app](https://sabine-ai-production.up.railway.app).
Railway automatically deploys pushes to `main` in [maxRN/sabine-ai](https://github.com/maxRN/sabine-ai). Manage the service in the [Railway dashboard](https://railway.com/project/ebd389b6-7753-4899-a19c-a4a8f9444f9e/service/f32ebfc7-df13-454c-8493-dd019170435a?environmentId=77184c62-0bf5-4208-b595-e1768dca5688).

Pull requests, including bot PRs, get a temporary Railway preview environment with its own URL. Railway posts the preview link on the PR and removes the environment when the PR is merged or closed.
