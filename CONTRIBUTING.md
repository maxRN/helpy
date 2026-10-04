# Contributing to Helpy

Start with the [README installation instructions](README.md#installation).
Use Node.js 22.12+ and a local Convex deployment with synthetic data. AI/voice
credentials are only needed for those integrations; never attach `.env` files,
provider keys, original private screenshots, or microphone recordings to a report.

## Keep changes focused

- Explain the problem, the expected behavior, and how to reproduce it.
- For UI changes, include a screenshot made with synthetic data.
- Capture/OCR/redaction lives in `src/capture/`; voice and question policy in
  `src/agent/` and `src/integration/`; Work Map/Teach UI in `src/workmap/` and
  `src/teach-ui/`; demo invoices and guardrails in `src/erp/`.
- Read [AGENTS.md](AGENTS.md) before using a coding agent. It prohibits OpenAI
  models from adding unit tests; existing checks can still be run.
- Preserve technical details in `docs/` and update setup documentation when needed.

## Validate a change

```sh
npm run typecheck
npm test
npm run build
```

For capture changes, also check pause/resume, finish, and pending uploads in a
Chrome/Edge session. For guardrails, check both a blocked mistake and a valid
invoice. Summarize what you checked and disclose any provider/browser limitation
in the pull request. No new dependencies are needed for documentation changes.

Use [SECURITY.md](SECURITY.md) for sensitive reports. Contributions to Helpy's
own code are covered by the repository's [MIT license](LICENSE); third-party
licenses remain separate.
