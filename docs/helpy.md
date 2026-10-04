# Helpy (P4)

In the product, Helpy is an app installed on the computer: a small robot that always sits on the screen. The website only simulates that screen (Max's fake desktop with the ERP open). Open Helpy through the robot or by clicking its desktop icon. Benchmark for every screen: Sabine (57) can use it alone.

## Mount it

```tsx
import { Helpy } from '#/app'

<Helpy boundsRef={screenRef} /> // boundsRef: the fake screen Helpy may move in; default is the whole window
```

`src/routes/index.tsx` mounts it on top of Max's mock desktop (bounds: the screen between the macOS-style menu bar and the dock).

## What the robot does

- **Sign-in (mock):** on first start Helpy asks for the work email, then the password; every email and password work and it is only kept in this browser. The name comes from the email (sabine.brandt@hartmann.de is Sabine Brandt) and goes on every recording.
- Click the robot and a small window opens next to it with one main action, "Record what I do", and "Open Helpy". Open questions about the latest recording show on top.
- **Helpy's app** (`src/app/helpy-app`): "Open Helpy" opens a window as large as the ERP's (same place, maximize and close). Helpy logo top left, pages on the left: **Company info** first (company, accounts payable, people and approvers, cost centers, what Helpy knows; mock data matching ProcureFlow), then **Recorded processes** (search by process, step or person, filter by category; only "ERP" while the ERP is the only mock system). A process opens as a **workflow** (all steps in order, judgment calls and rules marked, who recorded it, export, "Rename"); a step opens as a **guide**: what to do, why (the expert's words), a **decision tree** built from the step's rules (one yes/no question per rule, the first yes decides) and the expert's screen at that moment ("Enlarge" shows it as large as the screen). "Teach me this" closes the window and the robot teaches as before; if ProcureFlow is closed, Helpy first points at its desktop icon. The robot stays on screen the whole time.
- **Recording is spoken, nothing to type:** "Record what I do" starts sharing the screen and the microphone right away. Helpy then asks out loud "What are you going to show me today?" and names the process from the answer (Scribe transcript, `src/app/recordName.ts`). Without an answer it stays "New recording" until the Work Map's task name replaces it. Lines Helpy says outside the agent go through `/api/tts` when ElevenLabs keys are set. While recording, clicking the robot shows "I'm done", "Pause" and, if Helpy has one, "Ask me now" in the bubble. A REC light with the time sits on the robot. "I'm done" (or the browser's "Stop sharing") leads straight to Helpy's questions.
- **A question while you talk:** the question policy now thinks ahead while the expert is busy. A ready question is held until the next pause; meanwhile the robot raises a hand and a quiet "Question" sign appears. After 40 s Helpy says so in its bubble (never out loud) with "Ask me now".
- **Questions (spoken only):** after "I'm done" Helpy runs P3's debrief steps without a window (`src/app/VoiceDebrief.tsx`): gaps from `/api/debrief/gaps`, then every question out loud through the interviewer agent (`ask()`), each only once nobody is talking or typing (meanwhile the robot raises its hand), then the Work Map, the teach-back read aloud (`teachBack()`) and the spoken confirmation or correction. Nothing to type; clicking the robot offers "Skip this question" and "Stop for now". Without the agent Helpy says it will ask later, and "Answer my questions" starts it again. P3's `DebriefPanel` stays in the repo but is not mounted.
- **Learning:** fresh practice cases; after every move Helpy points at the next step and says it (a move is a change or leaving a field, not just clicking into it, and never while typing), for judgment calls it asks what Sabine would do. Before a rule is broken it turns red, points at the field and offers Sabine's screen at that moment. When the case is done Helpy flies back to its corner and shows what sits and what to practice. Helpy and its bubble keep off buttons and fields wherever they can.

- **Speech bubbles never time out.** Each bubble has a topic that says what ends it (`src/mascot/store.ts`, wired in `src/app/bubbleLifecycle.ts`); a new bubble always replaces the old one. Plain information ends when the user opens Helpy, works in ProcureFlow or speaks; bubbles with buttons end by their action (a second click on the robot puts recording controls away); the agent's questions end with the answer; Teach guidance ends with the next step or when the invoice is closed; "I have a question for you" ends when the question is asked. A bubble that explained something Helpy pointed at ends together with the pointing.
- **Where Helpy stands:** resting in the bottom-right corner of the viewport (fixed inset), never moved by scrolling. It leaves only to point at something it explains, or when the user drags it; a dragged robot stays until Helpy's next move (a new target, a new bubble, its panel) and then flies back. The resting spot is not remembered.

## Contract

- The robot renders `src/shared/mascot.ts` (state, bubble, pointTarget, clipRequest, waiting), so the voice agent and P4 drive the same robot. P4 adds bubble buttons and answer fields, poses (wave, cheer, question) and the alert tone in `src/mascot`.
- `waiting`: P2's policy calls `deps.mascot.waiting(question | null)` when it holds a question back; `askWaitingQuestion()` in `src/agent/voice.ts` asks it now.
- Who recorded: `tasks.recordedBy` and `projects.createdBy` (optional strings) in Convex; `TaskRecorder.start(project, { stay: true, recordedBy })`. `projects.rename` names a recording from the spoken answer.
- Voice: `src/app/voice.ts` starts P2's agent through P1's `installVoiceBridge` (interviewer while recording, debrief for the questions, tutor while learning; replaces the temporary VoicePanel). Without ElevenLabs keys Helpy works silently with bubbles.
- Processes: `convex/processes.ts` lists projects with their recordings; a recording's Work Map is `workMaps` under the session id, which is the task id (the debrief saves it there).
- `TaskRecorder.start(project, { stay: true })` keeps the user on the page after finishing.
- Dev: `?debug` shows P1's event panel; `helpy.mascot` / `helpy.panel` / `helpy.question('…')` in the browser console. To see the sign-in again: "Sign out" at the bottom of the panel.
