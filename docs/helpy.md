# Helpy (P4)

In the product, Helpy is an app installed on the computer: a small robot that always sits on the screen. The website only simulates that screen (Max's fake desktop with the ERP open). There is no other frontend: everything happens through the robot. Benchmark for every screen: Sabine (68) can use it alone.

## Mount it

```tsx
import { Helpy } from '#/app'

<Helpy boundsRef={screenRef} /> // boundsRef: the fake screen Helpy may move in; default is the whole window
```

`src/routes/index.tsx` mounts it on top of Max's mock desktop (bounds: the screen above the taskbar).

## What the robot does

- **Sign-in (mock):** on first start Helpy asks for the work email, then the password; every email and password work and it is only kept in this browser. The name comes from the email (sabine.brandt@hartmann.de is Sabine Brandt) and goes on every recording.
- Click the robot and a small window opens next to it with one main action, "Record what I do", and "Recorded processes": a large window to search by process, step or person and filter by category (only "ERP" while the ERP is the only mock system), with the list on the left and the open process on the right (steps, who recorded it and when, "Teach me this", Helpy's questions). Open questions about the latest recording show on top.
- **Recording is spoken, nothing to type:** "Record what I do" starts sharing the screen and the microphone right away. Helpy then asks out loud "What are you going to show me today?" and names the process from the answer (Scribe transcript, `src/app/recordName.ts`). Without an answer it stays "New recording" until the Work Map's task name replaces it. Lines Helpy says outside the agent go through `/api/tts` when ElevenLabs keys are set. While recording, clicking the robot shows "I'm done", "Pause" and, if Helpy has one, "Ask me now" in the bubble. A REC light with the time sits on the robot. "I'm done" (or the browser's "Stop sharing") leads straight to Helpy's questions.
- **A question while you talk:** the question policy now thinks ahead while the expert is busy. A ready question is held until the next pause; meanwhile the robot raises a hand and a quiet "Question" sign appears. After 40 s Helpy says so in its bubble (never out loud) with "Ask me now".
- **Questions (spoken only):** after "I'm done" Helpy runs P3's debrief steps without a window (`src/app/VoiceDebrief.tsx`): gaps from `/api/debrief/gaps`, then every question out loud through the interviewer agent (`ask()`), each only once nobody is talking or typing (meanwhile the robot raises its hand), then the Work Map, the teach-back read aloud (`teachBack()`) and the spoken confirmation or correction. Nothing to type; clicking the robot offers "Skip this question" and "Stop for now". Without the agent Helpy says it will ask later, and "Answer my questions" starts it again. P3's `DebriefPanel` stays in the repo but is not mounted.
- **Learning:** fresh practice cases; after every move Helpy points at the next step and says it, for judgment calls it asks what Sabine would do. Before a rule is broken it turns red, points at the field and offers Sabine's screen at that moment. At the end it shows what sits and what to practice.

## Contract

- The robot renders `src/shared/mascot.ts` (state, bubble, pointTarget, clipRequest, waiting), so the voice agent and P4 drive the same robot. P4 adds bubble buttons and answer fields, poses (wave, cheer, question) and the alert tone in `src/mascot`.
- `waiting`: P2's policy calls `deps.mascot.waiting(question | null)` when it holds a question back; `askWaitingQuestion()` in `src/agent/voice.ts` asks it now.
- Who recorded: `tasks.recordedBy` and `projects.createdBy` (optional strings) in Convex; `TaskRecorder.start(project, { stay: true, recordedBy })`. `projects.rename` names a recording from the spoken answer.
- Voice: `src/app/voice.ts` starts P2's agent through P1's `installVoiceBridge` (interviewer while recording, debrief for the questions, tutor while learning; replaces the temporary VoicePanel). Without ElevenLabs keys Helpy works silently with bubbles.
- Processes: `convex/processes.ts` lists projects with their recordings; a recording's Work Map is `workMaps` under the session id, which is the task id (the debrief saves it there).
- `TaskRecorder.start(project, { stay: true })` keeps the user on the page after finishing.
- Dev: `?debug` shows P1's event panel; `helpy.mascot` / `helpy.panel` / `helpy.question('…')` in the browser console. To see the sign-in again: "Sign out" at the bottom of the panel.
