# Security

Helpy's current demo has public access and a fixed identity. Authentication,
project authorization, and protected downloads are not implemented. This is a
known deployment limitation, not a security guarantee. Do not store private
workflows in the public demo. See [privacy details](docs/PRIVACY.md).

## Reporting a vulnerability

Do not post credentials, private screenshots, audio, or exploit details in a
public issue. If GitHub offers **Security → Report a vulnerability** on this
repository, use that private channel. If it is unavailable, open an issue asking
the maintainer for a private reporting channel, without including sensitive
technical details. There is no published response-time commitment.

Include the affected revision, impact, and minimal reproduction using synthetic
data once a private channel is established. Reports against current `main` are
most useful; the project does not maintain separate supported release branches.

## Before deployment

Keep API keys in server-side environment variables, never `VITE_` variables.
Add authentication and authorization before handling private data, protect file
downloads, and define data retention. Redaction can miss PII and originals are
stored intentionally. Review the terms of Convex, Anthropic, ElevenLabs, and the
source-available Redact dependency for your deployment.
