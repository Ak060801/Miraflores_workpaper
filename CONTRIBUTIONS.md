# Who built what

This file keeps a clear line between the work done with Claude (Anthropic's AI) and Ayaan's own contributions. Keep it current: the case study asks how AI was used, and this file is the answer.

## How to tell from git

All commits in this repository are under my name. The first five commits were written by Claude (AI pair engineer) and committed by me:

1. Workpaper prototype: event-sourced workpaper, independent checks, docs
2. Contribution slots belong to Ayaan (rename from Abbas)
3. Deploy via GitHub Pages: relative base path and Actions workflow
4. AI usage draft: GitHub Pages
5. Add Railway deployment: dependency-free Node server and railway.json

Every commit after these is my own work.

Code I own is also marked in-file with `AYAAN-SLOT` headers, and in the UI with a purple **✎ Ayaan** tag.
## Ledger

| Area | Built by | Ayaan's part | Status |
|---|---|---|---|
| Packet analysis and the 16 errors + judgment calls (`docs/ERRORS_FOUND.md`, `src/checks/checks.ts`) | Claude | Review each finding, confirm the tax treatment and authority, decide the judgment calls (C6, personal costs, CA estimate route) | ☐ |
| Data model: packet / event log / projections (`src/data`, `src/store`) | Claude | | n/a |
| Trace drawer, document viewer, simulated `DocumentSource` | Claude | | n/a |
| Screens: return, checks, adjustments, documents, review, judgment, changes, what-if, records, client portal, filing, notices, carry forward, firm | Claude | | n/a |
| Firm rules enforcement (own-work rule, partner threshold, authority, masking + access log, filing gate) | Claude | | n/a |
| Demo season seed (`src/app/seed.ts`) | Claude | | n/a |
| **Slot 1: Review triage / trust score** (`src/contrib/ayaan/trustScore.ts`) | Baseline by Claude | **Design and implement the scoring model** (spec in `src/contrib/ayaan/README.md`) | ☐ |
| **Slot 2: 2026 estimated tax plan** (`src/contrib/ayaan/planning2026.ts`) | Baseline by Claude | **Decide the safe-harbor strategy and write the plan logic** | ☐ |
| **Slot 3: Firm policy extensions** (`src/contrib/ayaan/firmPolicy.ts`) | One example by Claude | **Write the firm's own policies as tested rules** | ☐ |
| One-page core idea (`docs/CORE_IDEA.md`) | Draft by Claude | **Rewrite in your own words; you present it** | ☐ |
| Video walkthrough (`docs/VIDEO_SCRIPT.md`) | Script draft by Claude | **Record it yourself; adapt the script to your voice** | ☐ |
| AI usage statement (`docs/AI_USAGE.md`) | Draft by Claude | **Make it accurate to what you actually did** | ☐ |
| Deployment (GitHub Pages workflow + Railway config and server) | Workflow, `railway.json`, `server.mjs` and instructions by Claude | **Create the repo, push, enable Pages, connect Railway, submit the link** | ☐ |

Add a row for anything else you change.
