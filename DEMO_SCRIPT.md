# Helpy demo script (about 7 minutes)

The exact sequence for the live or recorded product demo: Capture → Map → Teach, then Trust. Every control named here exists in the app. Two people: **Sabine** (the expert, shares her screen) and **Lena** (the new hire). One person can play both. The current app uses a fixed Sabine identity; Teach mode labels the ERP user as the new hire automatically.

## Before the demo

| What | How |
| --- | --- |
| App | Chrome, full screen, on the deployed app (Railway). Microphone and speakers on, headset recommended so Scribe does not hear Helpy. |
| Practice data | ProcureFlow shows the September 2026 invoices 4471 (Neckartal, €6,800, equipment), 4472 (Kramer, quarter-end), 4473 (Brno intercompany), 4474 (office). Practice cases 5102–5106 are reset automatically when Teach starts. |
| Models | Open the app once beforehand so the screen-reading and redaction models are cached (first load downloads them). |
| Identity | No login is required. The demo uses Sabine Brandt; Teach mode switches the ERP label to the new hire. |
| Fallback map | If a live recording fails, use the hand-written example process **Process Supplier Invoices** in *Recorded processes* for Map and Teach. |

## 1. Capture (about 3 minutes)

| # | Time | Screen | Sabine does | Helpy does | Apprentice Test |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00 | Desktop with ProcureFlow open, Helpy robot bottom right | Clicks the robot → **Record what I do**. The task starts as *New recording* and is named by Helpy after completion. If models become ready after the click, click **Start recording** when offered. | Asks the browser to share the screen. | |
| 2 | 0:15 | Browser sharing dialog | Chooses *Entire screen*, **Share**, allows the microphone. | Shows **REC 00:00** on the robot and, in its bubble only: “I’m watching and listening. Work as usual and tell me what you do. I only ask in real pauses, and I’ll name this task for you at the end. Click me when you’re done.” No spoken intro. | |
| 3 | 0:30 | Invoice 4471 open | Opens 4471 and, while explaining aloud, changes the cost center from 4711 to **0400 (capex)** and types the asset number. | Stays quiet while she types, talks, or is mid-step (clicked into a field in the last 4 s), and waits a breath after each sentence. Mouse movement never holds it back. If it already has a question, the robot shows **? Question · waiting, you’re typing** (or *you’re talking*, *you’re mid-step*). | Q1 when to ask |
| 4 | ~1:00 | Natural pause, hands off the keyboard | Pauses for 2–3 s. | Asks aloud about what changed on screen, e.g. “You moved that one to capex. What made you do that?” | Q1, Q2 what to ask |
| 5 | 1:10 | | Answers: “Equipment over five thousand is always capex.” | Records the answer and lowers the question sign. | |
| 6 | 1:30 | Invoice 4472 (Kramer) | Clicks **Hold**, types “Kramer double-bills at quarter-end”, saves. Pauses. | At the next pause (at least 30 s after the last question) asks about the hold. If the first question was not about a guardrail, the second one is (a limit, an exception, when to stop and ask). | Q2 guardrail |
| 7 | 2:00 | Invoice 4473 (Brno) | Clicks **Request 2nd approval**. | Questions only at pauses; never two within 30 s. | |
| 8 | 2:20 | | **Trust:** clicks the robot → **Pause** (or says “off the record”), and opens another invoice. Then clicks the robot → **Continue recording**. | The light shows **PAUSED** and Helpy says “Okay, off the record.” While paused no screenshots are taken, the microphone stream to Scribe is muted, and nothing done is stored or sent to a model. Coming back is a click, because Helpy cannot hear meanwhile. Replays only ever show redacted screenshots. | Q5 trust |
| 9 | 2:40 | | Clicks the robot → **I’m done**. | If fewer than three questions were asked, or none about a guardrail, it first says “Before you stop: N quick questions about what I saw” and asks them at pauses, about decisions it saw but nobody explained, while the recording still runs (they are marked as wrap-up questions; the goal is that the three come during the work, as in steps 4–7). A second **I’m done** (shown as **Skip and finish**) skips them. Then: “Thank you! I have a few questions about what I saw.” | Required: ≥ 3 live questions, ≥ 1 guardrail |

## 2. Map: debrief and Work Map (about 2 minutes)

| # | Time | Screen | Sabine does | Helpy does | Apprentice Test |
| --- | --- | --- | --- | --- | --- |
| 10 | 3:00 | Robot thinking | Waits. | Asks at least **three new questions** out loud, one at a time, each only when nobody talks or types; if no guardrail question came live, the first one is. None repeats a live question, e.g. “You held the Kramer invoice at the quarter-end. Is that for every supplier, and who releases it?” and an unseen case such as a supplier that is not in the vendor master. | Required: ≥ 3 new follow-ups |
| 11 | 4:00 | | Answers each. Clicking the robot offers **Skip this question** / **Stop for now**. | When done, says **why** it stopped asking, in its own words from the server’s decision (e.g. every decision has a reason and it knows when to stop and ask). | Q3 when it has understood |
| 12 | 4:15 | | Listens. | Explains the whole process back in under a minute and asks “Is that how it works?” | Q3 teach-back |
| 13 | 4:45 | | Corrects one detail, e.g. “No, Kramer is held at every quarter-end, not only in December.” Then confirms the second explanation: “Yes, that’s how it works.” | Rewrites the Work Map with the correction, explains it again, and stores the confirmation. The robot cheers: “Now your team can learn … from you.” | Required: confirmed teach-back |
| 14 | 5:00 | Helpy app window | Clicks the robot → **Open Helpy** → **Recorded processes** → the new process. | Shows **Ready to learn**, the steps with clickable times, **The rules** (each with Sabine’s words, how she said it, e.g. “Sabine, live question at 01:10”, and its screen moment), and **How Helpy knows it understood** (live questions, the new debrief questions with answered/skipped, the reason it stopped, the confirmation and the correction). | Q3 evidence |
| 15 | 5:20 | | Clicks a step’s time, e.g. **▶ 01:05**. Then opens a step for its guide and decision tree. | Replays Sabine’s screen at that moment with what changed (“Screen moment 01:05: Invoice 4471: cost center … → 0400”). A rule that only came up in the debrief says **Discussed in the debrief** instead of a made-up time. | Required: steps and guardrails link to screen moments |

## 3. Teach: a case Sabine never showed (about 2 minutes)

| # | Time | Screen | Lena does | Helpy does | Apprentice Test |
| --- | --- | --- | --- | --- | --- |
| 16 | 5:40 | Process page | Opens the process and clicks **Teach me this**. The ERP switches its user label to the new hire automatically. | Closes its window, resets the practice cases, compiles Sabine’s rules, and points: “Let’s do a case Sabine never showed you. Open invoice 5102…” (opens ProcureFlow first if it is closed). | Q4 new case |
| 17 | 6:00 | Invoice 5102: Albtal Lasersysteme, laser cutter, **€7,200**, pre-coded **4711 (opex)** | Opens 5102 and clicks **Post** with the opex code. | Stops it **before it is saved** (status stays *Open*), turns red, points at the cost center: “Sabine would stop here. Why do you think?” The voice tutor asks the same and listens. | Required: wrong decision caught before save |
| 18 | 6:15 | | Gives a guess, then clicks **Tell me why** (or **Show me Sabine’s screen**). | “Sabine said: ‘Equipment over five thousand is always capex.’ Here that means: book it as capex (cost center 0400).” **Show me Sabine’s screen** replays her moment. Changing a cost center back to opex later is caught right away, too. | Required: explained with her reasoning |
| 19 | 6:35 | | Sets the cost center to **0400**, enters an asset number, clicks **Post**. | “That’s it. Sabine would do the same.”, then the next step; once posted: “Invoice 5102 is done. Click me to see how you did.” | |
| 20 | 6:50 | Helpy panel report | Clicks the robot. | Shows what Lena did on her own, what needed a hint, the **Mistake caught** and **Practice next**. | Q4 learned |

Optional honest check: 5105 (bench grinder, €1,900, equipment) may stay opex; Helpy does not stop it.

## The five Apprentice Test answers, as shown

| Question | Where the demo shows it | In the code |
| --- | --- | --- |
| 1. When to ask | Steps 3–4: quiet while typing, talking or mid-step, the question sign says why it waits, the question comes at the pause. | `src/agent/pause.ts` (typing, Scribe turn, Helpy speaking, off the record), `src/agent/policy.ts`, tests in `src/agent/pause.test.ts`, `src/agent/policy.test.ts` |
| 2. What to ask | Steps 4–9: questions about changes on screen, a guardrail by the third, never a repeat, owed questions about unexplained decisions. | `src/agent/coverage.ts`, `src/routes/api/policy.ts`, `src/agent/policy.test.ts`, `src/agent/coverage.test.ts` |
| 3. When it has understood | Steps 10–14: three new questions, the spoken reason it stops, a teach-back confirmed after a correction, all on the process page. | `src/server/debrief.ts` (`findGaps`), `src/app/debriefFlow.ts`, `src/app/debriefFlow.test.ts` |
| 4. Whether the new hire learned | Steps 16–20: an unseen €7,200 case, the wrong opex decision caught before posting, the report. | `src/erp/store.ts`, `src/teach-ui/TeachLayer.tsx`, `src/teach-ui/teachCase.test.ts` |
| 5. Trust | Step 8 (Pause / “off the record”: no screenshots, microphone muted, nothing stored), replays of redacted screenshots only, emails/IBANs/card and phone numbers replaced in what people say. Names in speech are not redacted. | `src/shared/privacy.ts`, `src/capture/pii.ts`, `src/shared/privacy.test.ts`, `src/debrief/sessionLog.test.ts`, `src/shared/bus.test.ts` |

## If something is slow or fails

| Problem | What to do |
| --- | --- |
| A live question takes long | Normal: Helpy waits for a real pause and keeps at least 30 s between questions. Stop typing and talking for 3 s. Clicking the robot shows **Ask me now** when a question is waiting. |
| Helpy cannot hear (Scribe) | Clicking the robot during the recording says “I can’t hear you right now …”. Without hearing there are no spoken questions and no wrap-up; finish, then use **Answer my questions** on the process page later, or switch to the example process. |
| The debrief voice does not start | Helpy says it cannot talk right now. On the process page, **Answer my questions** starts it again. |
| The recording is too short | Helpy says it saw too little work on screen. Record again with at least three invoice changes. |
| Teach compile is slow or fails | Helpy says it could not turn Sabine’s rules into checks and offers **Try again** (it does not teach without being able to stop a mistake). The example process always has checkable rules. |
| Anything else | Use **Process Supplier Invoices** (hand-written example) for Map and Teach; it has the same rules and the same 5102 catch. |
