# Miraflores Workpaper: Okafor-Lindqvist 2025

A web-native tax workpaper for one complex household's 2025 return (Form 1040 MFJ + California 540NR). Built for the "Redesign the Tax Workpaper" case study.

- **Core idea and data model:** [`docs/CORE_IDEA.md`](docs/CORE_IDEA.md)
- **Errors found and how the design surfaced them:** [`docs/ERRORS_FOUND.md`](docs/ERRORS_FOUND.md)
- **Walkthrough script:** [`docs/VIDEO_SCRIPT.md`](docs/VIDEO_SCRIPT.md)
- **How AI was used / who built what:** [`docs/AI_USAGE.md`](docs/AI_USAGE.md), [`CONTRIBUTIONS.md`](CONTRIBUTIONS.md)

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run check      # run the independent checks from the command line
```

The packet is loaded as delivered from `public/packet.json`. Everything the workpaper adds is an append-only event log saved in the browser (Firm › Data exports and imports it). Open two tabs as two roles to see live collaboration.

## Deploy (gives you the link to submit)

**Vercel:** push this folder to a GitHub repo, then "Add New Project" on vercel.com, import the repo, accept the detected Vite settings (build `npm run build`, output `dist`). `vercel.json` is included.

**Netlify:** "Add new site" › import the repo, build command `npm run build`, publish directory `dist`.

No server or environment variables are needed.

## Try it

1. You start as **Priya Raman (preparer)** on 06/24/2026, the day after engine run v3. Two of her sign-offs have already reopened because v3 changed what they covered.
2. **Checks & findings**: independent recomputations from source documents. Accept a finding to create linked adjustments; undo from the toast.
3. Click any number anywhere to **trace** it; click a source to open the **document page** with the field highlighted.
4. Switch roles in the top bar: **Daniel** (reviewer), **Helen** (partner, files), **Jo** (firm admin: standards, access log), **Marcus** (preparer without sensitive-data clearance: PII masked), **Ngozi / Erik** (client portal).
5. **▸** in the top bar advances the season to the next scripted event; **Replay** scrubs back to any moment read-only.

## Structure

```
src/
  data/        packet types, indexes, reference resolver, document source (simulated pages)
  store/       event log (append-only, BroadcastChannel sync), session/roles, projections
  checks/      checks that don't trust the engine
  app/         context, permission-checked actions, filing gate, demo season seed
  ui/          trace drawer, document viewer, shared components
  views/       screens
  contrib/ayaan/  contribution slots owned by Ayaan (see CONTRIBUTIONS.md)
scripts/       command-line check runner
docs/          the written deliverables
```

Stack: React 18 + TypeScript + Vite, no other runtime dependencies.
