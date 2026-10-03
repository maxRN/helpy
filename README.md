# Sabine AI

This is a helpful AI agent that watches you work and records your workflows.

Built with [TanStack Start](https://tanstack.com/start/latest), React, TypeScript, Vite, and [Convex](https://convex.dev).

Use Node.js 22.12 or newer.

## Local development without a Convex account

From a fresh clone, run:

```sh
npm ci
npm run dev:convex
```

When prompted, choose to develop locally without an account. You do not need a Convex login or a team invitation. The first setup needs internet to install dependencies and download the local backend; afterward, the backend can run offline.

Keep that terminal running. Convex applies changes to `convex/schema.ts` and backend functions automatically. In a second terminal, start the app:

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000). Convex writes the local deployment URL to `.env.local` and keeps the database in `.convex/`. Local data survives restarts and is separate from the cloud databases. These paths are ignored by Git.

For subsequent sessions, run `npm run dev:convex` and `npm run dev` in separate terminals.

See the [Convex local development documentation](https://docs.convex.dev/cli/local-deployments) for more details.

To switch an existing cloud checkout to a local backend, run `npx convex dev --configure` and choose a local deployment. The app itself does not provide offline persistence or sync.

## Cloud development

```sh
npm ci
npx convex login
npm run dev:convex
# In another terminal:
npm run dev
```

During Convex setup, select the existing `max-grosse / sabine-ai` project. Teammates need an invitation to the Convex team and their own login; each can use their own development deployment. The CLI writes the selected deployment and public URL to ignored `.env.local`. Commit `convex/` and its generated types, but never `.env.local` or deploy keys.

Open http://localhost:3000. Projects are available at `/projects/` and support create, list, view, and delete. Access is intentionally public.

## Task recording

The app starts loading Florence-2-base-ft when the page mounts. The first visit downloads the pinned ONNX model from Hugging Face into the browser's Cache Storage on the user's device. Later visits reuse those files, including without access to Hugging Face. The app requests persistent browser storage; clearing site data or browser eviction can remove the cache. The cache belongs to this site's origin and browser profile, so opening a different deployment or browser requires its own download.

Open a project and wait until text recognition is ready, then click **New task**. The button stays disabled until the model files are downloaded, cached, and the model has completed a warmup. The recording controller also checks readiness before requesting screen sharing or creating a task. Download, storage, and model startup failures show an error with **Retry loading model**. The app requires WebGPU and a desktop browser that supports screen capture and reports the selected display surface, such as current Chrome or Edge. Choose **Entire Screen** in the browser's sharing dialog. Screen sharing works on HTTPS and localhost, and the browser asks for permission for every task.

The app captures a full-resolution JPEG when recording starts and every 2 seconds afterward. A worker triggers capture while you work in other apps; browser suspension, screen locking, or putting the computer to sleep can delay or interrupt capture. Keep the app tab open. You can navigate within the app while recording: click **Example ERP** to work in ProcureFlow, then **Return to task** in the active-task bar to view the live screenshot timeline and finish recording. The recorder stays mounted in the shared app layout, so switching pages keeps the same task running. Only one task can record at a time. Closing or refreshing the tab ends screen sharing.

Each screenshot is saved first, then a browser worker runs Florence's `<OCR_WITH_REGION>` task locally. It stores the recognized text and four corner coordinates for each region, in pixels relative to the original screenshot's top left. The OCR result also includes image dimensions, the model name, and its pinned revision. Screenshot pixels are sent to Convex for storage; OCR runs on the device and sends no images to Hugging Face or an inference service. Vision and token embeddings use float32 weights; the text encoder and decoder use q4 weights. Inference runs sequentially in a worker so it does not block the page.

Click **Done** on the task page or in the active-task bar, or stop sharing through the browser, to stop capture, finish pending text recognition and uploads, and open the task summary. Task duration ends when capture stops, excluding time spent processing screenshots. The summary shows each screenshot's capture time and offset from the task's start. Expand **Text note** under a screenshot to see the recognized text and its positions. Click a screenshot to open the full image.

The screenshot's `ocr` field records `pending`, `completed` with structured regions, or `failed` with an error note. Older screenshots without this field remain readable and are labeled as predating text recognition. An OCR failure stops capture and preserves uploaded screenshots. Output that reaches Florence's 1,024-token context limit is reported as incomplete rather than saved as a successful analysis. Each inference has a two-minute timeout. If 30 screenshots are already waiting for OCR, the app stops recording and drains the existing queue instead of letting it grow without limit. OCR quality depends on the image and model; small text and dense screens may be missed, and the model can return spurious text even on a blank image. Review extracted notes before relying on them.

Tasks and screenshot metadata live in Convex's `tasks` and `screenshots` tables. Image bytes go directly from the browser to Convex File Storage using generated upload URLs. The app stores each file's `_storage` ID with its task and timestamps, then obtains its display URL in the summary query. Click **Delete task** on a completed task's summary to permanently remove that task, its screenshot records, and its image files from Convex storage. A task must be finished before it can be deleted. Deleting a project also deletes its tasks and their stored screenshots. Capture and upload failures stop the recording and appear on the summary; if saving the task fails, the recording page offers **Retry saving**. A task left unfinished by a closed tab can be finalized from its summary at the last saved screenshot, with the interrupted duration labeled explicitly.

No Railway bucket or S3 credentials are required. Local and cloud development use the same Convex upload API. With a local Convex backend, uploads stay on that backend alongside the local database; with a cloud development deployment, uploads go to that deployment, separate from production. Run both `npm run dev:convex` and `npm run dev` as described above.

Access to tasks and screenshots follows the current public project model. Convex file URLs grant download access to anyone who has the URL. Before using this app for private workflows, add user authentication and project authorization, and serve images through an authenticated HTTP action if access must be checked for every download. See [Convex File Storage](https://docs.convex.dev/file-storage/overview) and [uploading files](https://docs.convex.dev/file-storage/upload-files).

```sh
npm run typecheck
npm run build
npm run preview
```

The build runs TypeScript checks before bundling. Preview serves the production build locally. `npm test` runs the unit tests (Vitest).

Copy `.env.example` to `.env` and fill in any server API keys needed for the AI features. Those keys are read with `process.env` in server routes only. `VITE_CONVEX_URL` is public and normally supplied by the Convex CLI in `.env.local`.

Convex stores project names in the `projects` table defined in `convex/schema.ts`. Its queries and mutations live in `convex/projects.ts`. The router configures Convex and TanStack Query for server rendering and live updates. Commit `convex/_generated` so a fresh checkout can typecheck before connecting to Convex. Regenerate these files with `npm run convex:codegen` when needed.

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
- **Teach cases:** 5102 ($7,200 equipment, must become capex), 5103 (Kramer in December, must be held), 5104 (Brno intercompany, needs a second approval), 5105 ($1,900 equipment, opex is fine and must not be stopped), 5106 (supplier not in the vendor master, must be held; the rule comes from the debrief, not the live task).
- Mode and Work Map survive a page reload (localStorage). **Reset demo** in the ERP header resets the invoices only.

In dev, the event panel (bottom left) shows every `AppEvent` live. Its **Teach (fixture)** button loads a hand-written Work Map from `src/erp/fixtures.ts`, so the guardrails can be tested before the real pipeline exists.

Edit `src/routes/index.tsx` for the home page and `src/routes/__root.tsx` for the shared document layout. Add routes under `src/routes`; TanStack Router generates `src/routeTree.gen.ts` automatically.

Railway reads `railway.json`. Production builds run `npm run deploy:prod`: Convex supplies the production URL to the frontend build and deploys the schema and functions to `good-marlin-283`. This keeps the backend and frontend on the same version. Nitro serves `.output/server/index.mjs` using Railway’s `PORT`.

`railpack.json` limits the runtime image to Node and Nitro’s self-contained `.output` bundle. Source files, build caches, and root `node_modules` stay in the build stages. The bundle includes the browser OCR worker and its WASM runtime; Florence model weights download separately to the user’s browser.

The production Railway service has a sealed `CONVEX_DEPLOY_KEY`, scoped to the production deployment. It also has the development `VITE_CONVEX_URL` for preview builds; `convex deploy --cmd` overrides that URL for the production build. Sealed keys are excluded from Railway PR environments. Preview builds run `npm run build` and share the development database (`combative-snail-974`); they never deploy backend changes to production. For preview backend schema changes, sync compatible functions to that development deployment first.

To deploy manually, provide `CONVEX_DEPLOY_KEY` through the deployment environment and run `npm run deploy:prod`, then `npm start`. Keep the key out of Git and browser-prefixed variables. Development and production data are separate; deployment does not copy development records.

The app is live at [sabine-ai-production.up.railway.app](https://sabine-ai-production.up.railway.app).
Railway automatically deploys pushes to `main` in [maxRN/sabine-ai](https://github.com/maxRN/sabine-ai). Manage the service in the [Railway dashboard](https://railway.com/project/ebd389b6-7753-4899-a19c-a4a8f9444f9e/service/f32ebfc7-df13-454c-8493-dd019170435a?environmentId=77184c62-0bf5-4208-b595-e1768dca5688).

Pull requests, including bot PRs, get a temporary Railway preview environment with its own URL. Railway posts the preview link on the PR and removes the environment when the PR is merged or closed.
