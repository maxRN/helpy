# Helpy (P4)

In the product, Helpy is an app installed on the computer: a small robot that always sits on the screen. The website only simulates that screen (Max's fake desktop with the ERP open). There is no other frontend: everything happens through the robot. Benchmark for every screen: Sabine (68) can use it alone.

## Mount it

```tsx
import { Helpy } from '#/app'

<Helpy boundsRef={screenRef} /> // boundsRef: the fake screen Helpy may move in; default is the whole window
```

`src/routes/index.tsx` shows the ERP with Helpy on top until the fake desktop wraps it.

## What the robot does

- Click the robot and a small window opens next to it: "Record what I do", search what the team knows, open a process, "Teach me this", answer Helpy's questions.
- **Recording:** name it, share the screen, work as usual. The interviewer agent asks at pauses. A red REC light sits on the robot; "Pause (off the record)" stops frames and listening. "I'm done" (or the browser's "Stop sharing") leads to the process, where Helpy writes the Work Map.
- **Questions:** one at a time, spoken by the debrief agent (typed when no agent runs), then "Did I get it right?" with Sabine's confirmation, saved with the Work Map.
- **Learning:** fresh practice cases; after every move Helpy points at the next step and says it, for judgment calls it asks what Sabine would do. Before a rule is broken it turns red, points at the field and offers Sabine's screen at that moment. At the end it shows what sits and what to practice.

## Contract

- The robot renders `src/shared/mascot.ts` (state, bubble, pointTarget, clipRequest), so the voice agent and P4 drive the same robot. P4 adds bubble buttons and the alert tone in `src/mascot`.
- Voice: `src/app/voice.ts` starts P2's agent through P1's `installVoiceBridge` (replaces the temporary VoicePanel). Without ElevenLabs keys Helpy works silently with bubbles.
- Processes: `convex/processes.ts` lists projects with their recordings; a recording's Work Map is `workMaps` under the session id, which is the task id. P3 saves the map there; until then the process offers "Use the example for now". Debrief questions come from `POST /api/debrief/gaps` (example questions until it exists).
- `TaskRecorder.start(project, { stay: true })` keeps the user on the page after finishing; no screenshot is uploaded while off the record.
- Dev: `?debug` shows P1's event panel; `helpy.mascot` / `helpy.panel` in the browser console.
