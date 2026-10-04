# Privacy and data handling

Helpy is a hackathon prototype. The current app uses a fixed demo identity and
public project access. It has no user authentication, project authorization,
retention policy, or access audit. Use synthetic data for demonstrations.

## Data flow

| Data | Processing | Stored / sent |
| --- | --- | --- |
| Screen images | Full-resolution captures approximately every two seconds; OCR and PII detection run in browser workers. | Original images and redacted images are saved to Convex File Storage. Vision inference receives the redacted image. |
| OCR text | Tesseract extracts text and word coordinates locally. Redact identifies spans; matching boxes receive synthetic replacements. | Original OCR text, redacted text, spans, painted boxes, and processing timings are saved in Convex. |
| Microphone | Browser MediaRecorder retains the recording in memory; Scribe streams audio for speech recognition during voice capture. | Audio uploads to Convex after capture stops. Voice features transmit audio to ElevenLabs. |
| Workflow context | Server routes reason over screen context, events, and expert answers. | Relevant content goes to Anthropic; events and Work Maps are stored in Convex. Voice agents receive context through ElevenLabs. |

With a local Convex deployment, database records and files stay on that backend.
With a cloud deployment, they upload to that deployment. Local storage does not
make AI/voice features offline: those features still call external services.

## Redaction limits

- OCR can miss small, low-contrast, or unrecognized text; PII detection is not a guarantee.
- Original screenshots and OCR text remain available by design. A processing failure can leave an original image saved.
- ProcureFlow's known invoice/PO numbers, supplier identifiers and names, cost centers, and company name are retained to avoid corrupting workflow reasoning.
- Speech/event text replaces detected email addresses, IBANs, card numbers, and phone numbers. Names in speech are not redacted. Raw microphone recordings still contain the original speech.
- Redacted replay is the normal teaching view, while the recording/task timeline can expose originals as well.

## Pause and saving

Pause stops new screenshots, pauses microphone recording, and mutes the Scribe
stream. Off-the-record workflow events are excluded from persisted/model context.
Previously captured items can continue processing or uploading. Resume by clicking
Continue: Helpy cannot listen for a resume instruction while paused.

Keep the recording tab open until processing and uploads finish. Closing or
refreshing early can lose unsaved audio or leave a task interrupted. Retry controls
reuse pending data while it remains in that tab.

## Access and deletion

Anyone with a Convex file URL can download that file. Public project queries are
not access controls. Deleting a finished, fully processed task removes its
screenshot/audio files and task records; project deletion also removes its tasks.
This does not promise deletion from external AI providers or their logs. Review
provider terms before using private content.

Before private deployment, add real authentication and project authorization,
protect downloads, define retention, and review each external provider's handling.

## Model downloads

The app downloads OCR runtime/language assets from external CDNs and Redact model
files from Hugging Face. Browser caches reuse model/language assets; clearing
site data can require downloading them again. Redact and its model use a
source-available license; see [third-party notices](../THIRD_PARTY_NOTICES.md).

For capture lifecycle, failure handling, and storage details, see
[the architecture reference](ARCHITECTURE.md#task-recording).
