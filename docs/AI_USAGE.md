# How AI was used

**Tool:** Claude (Anthropic), used as a pair engineer in an agentic coding environment that could read the packet, run Python and Node, build the app and drive a headless browser.

**What Claude did**
- Read the brief and the full packet: 74 documents, about 3,000 extracted values, three engine runs, client answers, agency records and the timeline.
- Wrote analysis scripts that compared extracted values to the printed documents, reconciled broker summaries to lots, and compared engine lines to sources. These surfaced most of the errors in `docs/ERRORS_FOUND.md`, which Claude then encoded as the check library in `src/checks/checks.ts`.
- Proposed the core design (immutable packet, append-only event log, pure projections) and wrote most of the codebase: the React/TypeScript app, the demo season seed and the first drafts of the docs.
- Tested the app end to end in a headless browser across roles (preparer, reviewer, partner, client, admin, staff without clearance) through filing, freeze and amendment.
- All commits are under my name, including code Claude wrote. This file is the record of who did what.

**What I did**
- Directed the scope and chose the delivery: a GitHub repository deployed on Railway. Created the repository, set up the Railway deployment and managed the git history.
- Wrote the three contribution slots in `src/contrib/ayaan/` myself, with Claude reviewing my code and pointing out bugs:
  - `trustScore.ts`: review triage. Orders extracted values by how much they need a human look, not by pipeline confidence alone.
  - `planning2026.ts`: the 2026 estimated tax plan, using the lesser of 110% of 2025 tax and 90% of projected 2026 tax.
  - `firmPolicy.ts`: three firm rules enforced at reviewer sign-off (judgment calls decided, blocking notes closed, contradicted client answers documented).
- Checked the app on the live deployment across roles. (only if true)
- Wrote docs/CORE_IDEA.md and docs/ERRORS_FOUND.md. I reviewed both and present them in the video.
- Recorded the walkthrough video. (only if true)

**How I checked the AI's work**
- `npm run check` reproduces every finding from the packet.
- Traced findings in the app to their source pages, including: (name the ones you actually checked, e.g. the RSU basis, the Swedish interest FX rate) (only if true)

**Where AI was not trusted**
- Tax conclusions that need judgment (the C6 basis, business-use percentages, the California estimate route) are recorded as judgments with authority, decided by a person.
