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

Starting a task also requests microphone access and records your narration alongside the screenshots. Microphone access is required; declining it cancels startup and releases screen sharing. Click **Done** or stop screen sharing to stop both recordings. The browser uses a supported audio format through [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder). When capture stops, audio uploads to Convex File Storage in the background alongside screenshot processing, and its ID is saved on the task. The task summary has an audio player and a link to the recording. Deleting a task or its project also deletes the audio file.

**Pause (off the record)** pauses microphone recording as well as screenshot capture. Paused intervals are omitted from the audio file. The audio stays in browser memory until the task is saved, so keep the tab open and finish the task before closing or refreshing it. If uploading or finalizing fails, **Retry saving** reuses the recording. Losing the tab before saving can lose the audio. Microphone recording works independently of the ElevenLabs voice agent.

Text recognition uses Tesseract.js locally in a browser worker. It loads automatically when the app opens.

[Tesseract.js](https://github.com/naptha/tesseract.js) 7 recognizes English and German text. The worker script ships with the app. The WebAssembly engine downloads from jsDelivr and language data downloads from Tesseract's data CDN on first use. Tesseract caches language data in this browser's IndexedDB; clearing site data or browser eviction removes it. Tesseract does not require WebGPU.

Open a project and wait until text recognition and PII redaction are ready, then click **New task**. The recording controller checks both models before requesting screen sharing or creating a task. Startup failures show an error and retry controls in the recording panel or Helpy dialog. Use a desktop browser that supports screen capture and reports the selected display surface, such as Chrome or Edge. Choose **Entire Screen** in the sharing dialog. Screen sharing works on HTTPS and localhost, and the browser asks for permission for every task.

The app captures a full-resolution JPEG when recording starts and every 2 seconds afterward. A worker triggers capture while you work in other apps; browser suspension, screen locking, or putting the computer to sleep can delay or interrupt capture. Keep the app tab open. You can navigate within the app while recording: click **Example ERP** to work in ProcureFlow, then **Return to task** in the active-task bar to view the live screenshot timeline and finish recording. Only one task can record at a time. Closing or refreshing the tab ends screen sharing.

Every screenshot runs through a local pipeline before saving. Tesseract extracts text and pixel coordinates from the original JPEG. [Desert Ant Labs Redact](https://huggingface.co/desert-ant-labs/redact) then processes the full extracted text and returns character spans for detected PII. Word boxes intersecting those spans are filled with a background color sampled from their surrounding pixels, then receive synthetic values such as Alex Morgan or alex@example.com. Replacement text fits and stays clipped inside the original word boxes, with dark or light text for contrast. The saved redacted text uses the same synthetic values. Tesseract supplies word boxes directly. Low-confidence OCR text is retained. The app's business identifiers are never redacted: the model mistook invoice numbers for building numbers and cost centers for ZIP codes, so a synthetic `42` painted over invoice 4472 made the vision model read "invoice 42". ProcureFlow registers its invoice and PO numbers, supplier ids and names, cost centers and company name (`src/erp/facts.ts`); detected spans entirely inside one of them are kept. Contact names, emails and bank details are still redacted. Any invoice number a model returns (vision events and descriptions, live questions, Helpy's replies, debrief questions, teach-back) is checked against ProcureFlow's invoices (`src/shared/grounding.ts`): unknown numbers are dropped or replaced, never said or stored. Small text, low contrast, and recognition errors can cause PII to be missed. Background matching approximates gradients and patterned backgrounds with a solid color.

Each captured screenshot gets a pending database record and a local image preview immediately. Its original JPEG uploads to Convex File Storage alongside local processing. The record is updated first with the original file ID, then with the redacted file ID, OCR results, redacted text, detected spans, painted boxes, and processing timings. Redacted images use PNG so decoded pixels outside the masks remain unchanged. When no PII is detected, the original and redacted versions reuse the same stored JPEG. Screen-event inference receives the redacted image. The timeline displays the redacted image and links to both versions. Expand **Redacted text** to see saved text and the OCR, PII, mask, and upload timings. The original image and OCR text still contain personal data by design.

Redact loads alongside OCR before recording starts. Its pinned v0.4.0 model files download from Hugging Face into this origin's Cache Storage. Later loads reuse those files. LiteRT's pinned WebAssembly runtime downloads separately from jsDelivr. Startup errors offer a retry button. Redact's model and SDK use the Desert Ant Labs Source-Available License. Older Tesseract, Florence, and SmolVLM notes retain their manual **Redact PII** button; those manual changes only stay in page memory.

Click **Done**, or stop sharing through the browser, to finish the recording and open its task view without waiting for screenshot processing or uploads. The task shows **In processing** until screenshots and microphone audio finish in the background. Its timeline includes pending screenshots, with local previews available in the recording tab before uploading; other tabs show pending entries until the originals upload. Task duration ends when capture stops, excluding processing time. Two pipeline lanes and two Tesseract workers process screenshots concurrently. PII inference shares one model and remains serialized, overlapping with OCR on other screenshots. If 30 screenshots are processing or queued, recording stops while existing work continues. Keep the recording tab open until processing finishes. Failed processing or uploads show errors and a **Retry processing** action in that tab. An OCR or redaction failure saves the original screenshot with a `failed` annotation and stops capture. Successful new screenshots have a `completed` OCR annotation and saved redaction data. Legacy screenshots with missing or `pending` OCR annotations remain readable. Tesseract startup and OCR recognition have two-minute timeouts. A blank image can return no words and no redactions.

Tasks and screenshot metadata live in Convex's `tasks` and `screenshots` tables. Image bytes go directly from the browser to Convex File Storage using generated upload URLs. The app stores each file's `_storage` ID with its task and timestamps, then obtains its display URL in the summary query. A finished task continues accepting its pending uploads until processing completes. Click **Delete task** on a completed task's summary to permanently remove that task, its screenshot records, and its image files from Convex storage. A task must be finished and no longer processing before it can be deleted. Deleting a project also deletes its tasks and their stored screenshots. Capture and upload failures stop the recording and appear on the summary; if marking the recording finished fails, the recording page offers **Retry saving**. A task left unfinished by a closed tab can be finalized from its summary at the last saved screenshot, with the interrupted duration labeled explicitly.

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
- **ElevenLabs agents:** `node scripts/create-elevenlabs-agents.mjs` creates Helpy's interviewer and tutor (prompts from `src/agent/prompts/`, client tools matching `src/agent/tools.ts`, Claude Sonnet 5.5 as the LLM, `skip_turn`, patient turn-taking, no first message) in the account of `ELEVENLABS_API_KEY`. If `ELEVENLABS_AGENT_INTERVIEWER` / `ELEVENLABS_AGENT_TUTOR` are set, it updates those agents instead, so after editing a prompt just run it again. `--new` forces new agents.
- **Capture voice (ElevenLabs Scribe v2 Realtime + TTS, Claude for the words):** `src/integration/listener.ts` streams the mic to Scribe (German with English as second language, server-side VAD, 0.8 s silence). Partial transcripts mean "the expert is talking" until Scribe commits the turn (its endpoint); the pause detector only lets Helpy ask when nobody types or talks. Mouse movement, clicks, scrolling and screen changes never hold a question back. A question is only said if it is still a pause once its audio is ready; otherwise it waits for the next pause, and it is said exactly once. Live questions come from `/api/policy` and are spoken by TTS (no agent in Capture: its mic would hear the narration, it only speaks English and it rephrases). Turns that might be meant for Helpy (du/you/Helpy/question) go to `/api/helpy/turn`: Claude decides whether Helpy was addressed and answers with the recent session as context ("hast du das verstanden?" gets a summary); "sprich Deutsch" switches Helpy's language (`session.language`) for replies and live questions. Those turns stay out of the debrief and Work Map. The agents are used for the debrief and the tutor.

- **Screen context (every mode):** `src/shared/screen.ts` holds what is on screen right now, each part with its timestamp: ProcureFlow's own description of its visible view (exact values from the app state, `src/erp/screenSnapshot.ts`, nothing when the window is closed or minimized) and, while recording, the latest screenshot description from `/api/frame`. An older frame's description never replaces a newer one, and it is marked outdated as soon as a newer, different frame was captured. Vision requests run one at a time, latest wins: only the newest changed frame waits, so there is no backlog and no change is lost. The question policy and Helpy's replies get the current screen with every request; the ElevenLabs agents (debrief, tutor) get it when they start and as `[SCREEN mm:ss] … Now on screen: …` whenever it changes (checked every 1.5 s).

In dev, the event panel (bottom left) shows every `AppEvent` live. Its **Teach (fixture)** button loads a hand-written Work Map from `src/erp/fixtures.ts`, so the guardrails can be tested before the real pipeline exists.

Edit `src/routes/index.tsx` for the home page and `src/routes/__root.tsx` for the shared document layout. Add routes under `src/routes`; TanStack Router generates `src/routeTree.gen.ts` automatically.

Railway reads `railway.json`. Production builds run `npm run deploy:prod`: Convex supplies the production URL to the frontend build and deploys the schema and functions to `good-marlin-283`. This keeps the backend and frontend on the same version. Nitro serves `.output/server/index.mjs` using Railway’s `PORT`.

`railpack.json` limits the runtime image to Node and Nitro’s self-contained `.output` bundle. Source files, build caches, and root `node_modules` stay in the build stages. The bundle includes the browser OCR worker. Tesseract downloads its WASM engine and language data separately to the user’s browser.

The production Railway service has a sealed `CONVEX_DEPLOY_KEY`, scoped to the production deployment. It also has the development `VITE_CONVEX_URL` for preview builds; `convex deploy --cmd` overrides that URL for the production build. Sealed keys are excluded from Railway PR environments. Preview builds run `npm run build` and share the development database (`combative-snail-974`); they never deploy backend changes to production. For preview backend schema changes, sync compatible functions to that development deployment first.

To deploy manually, provide `CONVEX_DEPLOY_KEY` through the deployment environment and run `npm run deploy:prod`, then `npm start`. Keep the key out of Git and browser-prefixed variables. Development and production data are separate; deployment does not copy development records.

The app is live at [sabine-ai-production.up.railway.app](https://sabine-ai-production.up.railway.app).
Railway automatically deploys pushes to `main` in [maxRN/sabine-ai](https://github.com/maxRN/sabine-ai). Manage the service in the [Railway dashboard](https://railway.com/project/ebd389b6-7753-4899-a19c-a4a8f9444f9e/service/f32ebfc7-df13-454c-8493-dd019170435a?environmentId=77184c62-0bf5-4208-b595-e1768dca5688).

Pull requests, including bot PRs, get a temporary Railway preview environment with its own URL. Railway posts the preview link on the PR and removes the environment when the PR is merged or closed.

To verify the background recording lifecycle against the configured development backend, run `node scripts/verify-recording-processing.mjs`. It creates and removes one disposable project using synthetic screenshots. Add `--inspect` to pause at the pending and completed task views for browser inspection.
