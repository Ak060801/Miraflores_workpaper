# How AI was used

> Draft for Ayaan to edit. Keep only what is true, in your own words. The brief says "Use any tools you like, including AI; tell us how", so precision here is worth more than modesty or polish.

**Tool:** Claude (Anthropic), used as a pair engineer in an agentic coding environment that could read the packet, run Python and Node, build the app and drive a headless browser.

**What Claude did**
- Read the brief and the full packet: all 74 documents' printed content, the 3,012 extracted values, the three engine runs, client answers, agency records, the timeline.
- Wrote scripts comparing extracted values to printed content, reconciling broker summaries to lots, and comparing engine lines to source documents. Those scripts surfaced most of the errors in `docs/ERRORS_FOUND.md`; Claude then encoded them as the check library in `src/checks/checks.ts`.
- Proposed the core design (immutable packet, append-only event log, pure projections) and built the React/TypeScript app, the demo season seed, and the docs drafts.
- Tested the app end to end in a headless browser across roles (preparer, reviewer, partner, client, admin, staff without clearance) through to filing, freeze and amendment.

**What I did** *(fill in; examples)*
- Chose the delivery format (a source repo deployed on Vercel) and directed the scope.
- Reviewed every finding and decided the judgment calls: …
- Designed and built the three contribution slots: review triage scoring, the 2026 plan, firm policies (see `CONTRIBUTIONS.md`; `git log --author` shows exactly which commits are mine).
- Rewrote the core-idea page and recorded the walkthrough.

**How I checked the AI's work**
- `npm run check` reproduces every finding from the packet; I traced each one in the app to its source page.
- *(add what you verified by hand, e.g. the RSU basis, the CA wage sourcing, the 1099-K overlap)*

**Where AI was not trusted**
- Tax conclusions with judgment (C6 basis, business-use percentages, California estimate route) are recorded as judgments with authority, decided by a person.
