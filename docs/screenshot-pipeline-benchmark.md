# Screenshot pipeline benchmark

Measured on 4 October 2026 in headless Chrome 151 on the local Mac. OCR used Tesseract.js 7 with English and German, sparse-text segmentation, and Desert Ant Labs Redact SDK 3.5.0 with model v0.4.0 on WASM.

Each input was a synthetic 1920 × 1080 JPEG encoded at quality 0.85. The sparse invoice screen produced 34 OCR words; the dense screen added an invoice table and produced 234 words. Both contained a contact name, email, phone number, and German IBAN. The app's actual `processScreenshot` function processed each image, then both files uploaded in parallel to an isolated local Convex backend and `tasks.addScreenshot` saved their metadata.

Each layout ran six times. The first was excluded from the averages below, leaving five measured runs per layout. All values are milliseconds.

| Screen | OCR | PII | Mask and PNG | Upload both files | End to end |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sparse | 232 | 107 | 11 | 19 | 378 |
| Dense | 1041 | 417 | 22 | 20 | 1512 |

Sparse end-to-end runs ranged from 355 to 389 ms. Dense runs ranged from 1,505 to 1,520 ms. Initial model startup and downloads took 11.46 seconds in a fresh browser context and are excluded from per-screenshot times. The first sparse processing run, including model inference warmup, took 632 ms through saving.

End-to-end timing starts with the captured JPEG blob and includes OCR, redaction, masking, upload URL generation, both file uploads, and the screenshot database mutation. It excludes screen acquisition, initial JPEG encoding, microphone recording, and the separate voice-agent inference request. The upload column includes upload URL generation and both POST requests; the final database mutation accounts for the remaining end-to-end time. Cloud storage and network latency will differ. Florence was not benchmarked.

Verification used real browser workers, the real Desert Ant model, and real Convex file storage. It checked that every painted pixel was black and every decoded pixel outside the masks was unchanged. All twelve original/redacted pairs were downloadable after saving; deleting their task removed all 24 files. A separate recording UI run exercised New task, capture, processing, Done, the saved summary, links to both versions, saved redacted text, and task deletion. Screen-event inference received the redacted frame. Additional browser checks confirmed blank images and ordinary text stay unchanged, invalid images fail and the queue recovers, and failed processing records preserve the original image. A supplied Florence-style mixed text region was refined using real Tesseract OCR: only the email address was masked, while the label stayed visible. A mismatched region failed instead of painting an inaccurate mask. This checked Florence result handling, not Florence model inference. The existing 61 unit tests, TypeScript checks, and production build passed. No unit tests were added.
