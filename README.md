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

The build runs TypeScript checks before bundling. Preview serves the production build locally. `npm test` runs the unit tests (Vitest).

Copy `.env.example` to `.env` and fill in the keys. Keys are read with `process.env` in server routes only.

## Project layout

| Path | Owner | What |
|---|---|---|
| `src/shared/` | P1 | Shared contract: types, event bus, session store, element registry, input activity |
| `src/erp/` | P1 | ProcureFlow mini ERP, seed invoices, guardrail engine, Teach step tracker |
| `src/server/anthropic.ts` | P1 | Server-only Anthropic client and `generateJson()` helper |
| `src/agent/` | P2 | ElevenLabs voice agents, pause detector, question policy, tutor |
| `src/capture/`, `src/debrief/` | P3 | Screen share, frames, recording, clips, debrief window |
| `src/app/`, `src/mascot/`, `src/workmap/`, `src/teach-ui/` | P4 | App shell, mascot, Work Map view, Teach UI |
| `src/routes/api/` | all | Server routes (`POST /api/frame`, …) |

Rules: emit everything that happens through `emitEvent()` from `src/shared/bus.ts`. Register anything the mascot should point at with `useTarget(id)` from `src/erp/useTarget.ts`. Touch browser-only APIs (`window`, `localStorage`, screen capture, ElevenLabs) only in `useEffect` or event handlers, because pages render on the server first.

Hand-offs between roles:

- **Work Map prompt (P3):** put `catalogForPrompt()` from `src/erp/catalog.ts` into the prompt, so steps use real `targetId`s (`field-costCenter`, `action-hold`, …) and guardrails use real fields and supplier ids. `TARGETS` lists the same ids for the tutor's `point_to` tool (P2).
- **Work Map → Teach:** call `startTeach(workMap)` from `src/erp/teach.ts`. It recompiles the guardrails from Sabine's words via `POST /api/guardrails/compile` (Opus), downgrades any rule that Sabine's own finished invoices break to "ask", stores the Work Map and switches to Teach mode.
- **Teach cases:** 5102 ($7,200 equipment, must become capex), 5103 (Kramer in December, must be held), 5104 (Brno intercompany, needs a second approval), 5105 ($1,900 equipment, opex is fine and must not be stopped).
- Mode and Work Map survive a page reload (localStorage). **Reset demo** in the ERP header resets the invoices only.

In dev, the event panel (bottom left) shows every `AppEvent` live. Its **Teach (fixture)** button loads a hand-written Work Map from `src/erp/fixtures.ts`, so the guardrails can be tested before the real pipeline exists.

Edit `src/routes/index.tsx` for the home page and `src/routes/__root.tsx` for the shared document layout. Add routes under `src/routes`; TanStack Router generates `src/routeTree.gen.ts` automatically.

For production, run `npm run build` followed by `npm start`. Nitro serves the app from `.output/server/index.mjs` and uses the `PORT` environment variable supplied by Railway.

The app is live at [sabine-ai-production.up.railway.app](https://sabine-ai-production.up.railway.app).
Railway automatically deploys pushes to `main` in [maxRN/sabine-ai](https://github.com/maxRN/sabine-ai). Manage the service in the [Railway dashboard](https://railway.com/project/ebd389b6-7753-4899-a19c-a4a8f9444f9e/service/f32ebfc7-df13-454c-8493-dd019170435a?environmentId=77184c62-0bf5-4208-b595-e1768dca5688).

Pull requests, including bot PRs, get a temporary Railway preview environment with its own URL. Railway posts the preview link on the PR and removes the environment when the PR is merged or closed.
