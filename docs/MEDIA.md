# Demo media

All images were captured from the running Helpy application with synthetic
ProcureFlow invoices and the built-in, hand-written example Work Map.
They are native PNG screenshots, not mockups or enlarged low-resolution images.

| File | Dimensions | Content |
| --- | --- | --- |
| `assets/helpy-hero.png` | 2560 × 1440 | Example Work Map overview. |
| `assets/helpy-recording.png` | 2560 × 1440 | Recording entry controls beside a demo invoice; capture has not started. |
| `assets/helpy-workmap.png` | 2560 × 1440 | Eight example steps and the rules section. |
| `assets/helpy-guide.png` | 2560 × 1440 | Cost-center guide and decision tree. |
| `assets/helpy-teach.png` | 2560 × 1440 | Invoice 5102 blocked before posting, with the cost center highlighted. |
| `assets/helpy-demo.gif` | 1600 × 900 | 14.54 seconds at 15 fps: Work Map → guide → Teach → blocked posting. |

The GIF comes from a continuous, lossless 2560 × 1440 browser screencast,
captured as timestamped PNG frames. No fabricated states or generated knowledge
were inserted. Source frames are omitted to keep the repository small. The GIF
is approximately 0.9 MB and loops indefinitely.

## Reproduce the views

1. Start local Convex and the app following the [README](../README.md#installation).
2. Use a clean Chrome/Edge profile at 2560 × 1440, excluding browser chrome.
   Automated PNG capture used `viewport: { width: 2560, height: 1440 }` and
   `deviceScaleFactor: 1`. Do not enlarge a smaller screenshot afterward.
3. Open ProcureFlow and invoice 4471. Click the robot to show **Record what I do**.
   This is the recording-entry preview, not a live recording.
4. Open Helpy → **Recorded processes** → **Process Supplier Invoices**. Maximize
   the Helpy window. Capture the overview, then open the cost-center step.
5. Click **Teach me this**, open 5102, and click **Post** with cost center 4711.
   Capture the guardrail and its explanation. Keep the blocked result visible.

The automation exercised the app's existing fallback to the example's checkable
rules by aborting `/api/guardrails/compile`. No fresh AI compilation was claimed.
A normal configured demo can let this request complete. Voice and live capture
were not part of this media run. The example has no recorded screen moments.

## Encode a recording

Capture at 2560 × 1440 and use installed FFmpeg. The committed GIF used a
Chromium PNG screencast with original frame timestamps in an FFmpeg concat
manifest (`frames.txt`), retaining real timing without lossy video compression:

```sh
ffmpeg -f concat -safe 0 -i frames.txt -vf "fps=15,scale=1600:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" -loop 0 docs/assets/helpy-demo.gif
```

A normal browser video can replace the concat input; prefer lossless capture
for readable text and trim to 10–20 seconds. Inspect every PNG and multiple GIF frames
before replacing assets: check legibility, loaded views, looping, and filesize.
Keep credentials and private browser/desktop content out of recordings. For live
screen/microphone capture, follow [the demo script](../DEMO_SCRIPT.md); do not
represent the fixture tour as a live capture.
