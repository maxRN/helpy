# P2 Voice Agents

Interviewer (Capture + Debrief) and Tutor (Teach), pause detector, question policy, tutor interventions.

## Files

```
src/agent/
  voice.ts          public API: start(mode), stop(), ask(q), say(text), teachBack(text), setOffRecord(on)
  pause.ts          isPause() pure function + 250 ms loop + decision log (getPauseLog)
  pause.test.ts     unit tests (vitest)
  policy.ts         question budget, forced guardrail question, calls /api/policy
  transcript.ts     utterance / answer_given events, off-record gating, answer capture
  tools.ts          client tools the agents can call
  deps.ts, types.ts adapters + shared types (agree AppEvent / Quote with P1 and P3)
  mockWorkMap.ts    mock Work Map for the tutor until P3 delivers
  prompts/          interviewer.md, tutor.md  (paste into the dashboard)
src/routes/api/     elevenlabs/signed-url.ts, tts.ts, policy.ts  (TanStack Start server routes)
```

Server routes use `createFileRoute('/api/...')({ server: { handlers: { GET/POST } } })`.
Run `npm run dev` once so the router regenerates `routeTree.gen.ts` and picks up the three new files.
`voice.ts` loads `@elevenlabs/client` with a dynamic `import()`, so SSR never touches browser-only code.
Call `start()` / `ask()` / `say()` only from client code (event handlers or `useEffect`), not from loaders.

## Install

```bash
npm i @elevenlabs/client      # (or @elevenlabs/react, which re-exports it)
npm i -D vitest
cp .env.example .env.local
```

## 1. Wire it up (once, at app start)

```ts
import { setDeps } from '~/agent/deps'; // or a relative path, depending on your tsconfig alias
setDeps({
  bus,                                              // P1: emit(e) / on(type | '*', fn)
  session,                                          // { t0: Date.now() at session start }
  activity: { lastInputAt },                        // P1, epoch ms
  capture: { lastFrameChangeAt },                   // P3, epoch ms
  mascot,                                           // P4: setState / bubble / pointTo
  getNextStep,                                      // P1
  showExpertClip,                                   // P4
  getWorkMapMarkdown,                               // P3 (optional until ~hour 10)
});
```

Then: `await start('capture')`, `await start('debrief')`, `await start('teach')`.
Debrief: `const a = await ask('...')`, then `await teachBack(text)`.

## 2. Create the two agents in the ElevenLabs dashboard

| Setting | Interviewer | Tutor |
|---|---|---|
| System prompt | `prompts/interviewer.md` | `prompts/tutor.md` (keeps `{{work_map}}`) |
| First message | empty (must not greet) | empty |
| LLM | fastest available | fastest available |
| Turn eagerness | patient | patient |
| System tool | `skip_turn` on | `skip_turn` on |
| Languages | German + English | English (+ German) |
| Voice | calm, curious (Expressive Mode if available), max 30 min choosing | same or a second voice |
| Authentication | enabled (we use signed URLs) | enabled |

Client events to enable on both: user transcript, agent response, and `vad_score` (used for "the expert is talking").

### Client tools (names and params must match `tools.ts` exactly)

| Agent | Tool | Params | Blocking |
|---|---|---|---|
| Interviewer | `set_off_record` | `on` (boolean) | no |
| Interviewer | `confirm_teachback` | `confirmed` (boolean), `correction` (string, optional) | no |
| Tutor | `get_next_step` | none | **yes** (agent must wait for the result) |
| Tutor | `point_to` | `targetId` (string) | no |
| Tutor | `show_expert_clip` | `stepId` (string) | no |

Put the agent ids in `.env.local`.

## 3. Verify in the first 20 minutes (names were checked against the docs, behavior was not run)

- `onMessage` payload: field names (`source`/`role`/`message`) and whether tentative transcripts arrive. Adjust `RawMessage` in `transcript.ts` only.
- `onModeChange`, `onVadScore`, `sendUserActivity`, `dynamicVariables`, `connectionType: 'websocket'` exist in your installed version.
- Our own `[ASK]`/`[SAY]` messages echo back as user messages: they are filtered by the `CONTROL` regex in `transcript.ts`. Confirm nothing leaks into utterances.
- Use headphones: if the agent's voice leaks into the mic, the expert's silence timer breaks.

## Assumptions to confirm with teammates

- **P1 event meta**: `guardrail_violation {guardrailId, rule, quote, stepId, invoiceId}`, `sequence_deviation {stepName, stepId}`, `invoice_opened {invoiceId, fields}`. Change the keys in `wireTutor()` if they differ.
- **Screen events** are `type: 'dom'` or `'vision'` with a human-readable `text` (e.g. "Invoice 4471: cost center 4711 -> 0400"). Change `SCREEN_EVENT_TYPES` in `types.ts` if not.
- **Quote** = `{ text, t, speaker, eventId? }` with `t` in ms since `session.t0`. Agree this with P3's debrief window.
- All `activity` / `capture` timestamps are `Date.now()` epoch ms; `session.t0` too.
- `ask()` rejects with `answer timeout` after 120 s of no answer; P3 should handle it.

## Event contract (what you emit)

`utterance` (speaker expert|trainee|agent), `question_asked` (meta eventId, kind), `answer_given` (meta questionId, eventId), `off_record_start|end`, `teachback_given`, `teachback_result` (meta confirmed), `tutor_intervention`.

## Test

```bash
npx vitest run src/agent/pause.test.ts
```

Done-when checks (5-minute capture run): at least 3 questions, all at pauses, at least 1 guardrail, none while typing. Open `getPauseLog()` afterwards to show why each pause was or was not used (judge question 1).
