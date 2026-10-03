# Helpy (P4)

In the product, Helpy is an app installed on the computer: a small robot that always sits on the screen. The website only simulates that screen (Max's fake desktop with the ERP open). There is no other frontend: everything happens through the robot. Benchmark for every screen: Sabine (68) can use it alone.

## Mount it

```tsx
import { Helpy } from '#/app'

<Helpy boundsRef={screenRef} /> // boundsRef: the fake screen Helpy may move in; default is the whole window
```

`src/routes/index.tsx` mounts it on top of Max's mock desktop (bounds: the screen above the taskbar).

## What the robot does

- Click the robot and a small window opens next to it: "Record what I do", search what the team knows, open a process, "Teach me this", answer Helpy's questions.
- **Recording:** name it, share the screen, work as usual. The interviewer agent asks at pauses. A red REC light sits on the robot; "Pause (off the record)" stops frames and listening. "I'm done" (or the browser's "Stop sharing") leads straight to Helpy's questions.
- **Questions:** P3's DebriefPanel (gaps, answers by voice or typed, Work Map, teach-back, confirmation). Helpy starts the debrief agent and opens it; it also offers "Answer my questions" for the latest recording.
- **Learning:** fresh practice cases; after every move Helpy points at the next step and says it, for judgment calls it asks what Sabine would do. Before a rule is broken it turns red, points at the field and offers Sabine's screen at that moment. At the end it shows what sits and what to practice.

## Contract

- The robot renders `src/shared/mascot.ts` (state, bubble, pointTarget, clipRequest), so the voice agent and P4 drive the same robot. P4 adds bubble buttons and the alert tone in `src/mascot`.
- Voice: `src/app/voice.ts` starts P2's agent through P1's `installVoiceBridge` (interviewer while recording, debrief for the questions, tutor while learning; replaces the temporary VoicePanel). Without ElevenLabs keys Helpy works silently with bubbles.
- Processes: `convex/processes.ts` lists projects with their recordings; a recording's Work Map is `workMaps` under the session id, which is the task id (the debrief saves it there).
- `TaskRecorder.start(project, { stay: true })` keeps the user on the page after finishing.
- Dev: `?debug` shows P1's event panel; `helpy.mascot` / `helpy.panel` in the browser console.
