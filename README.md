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
npm start          # serve the built site with the Node server (what Railway runs)
```

The packet is loaded as delivered from `public/packet.json`. Everything the workpaper adds is an append-only event log saved in the browser (Firm › Data exports and imports it). Open two tabs as two roles to see live collaboration.

## Deploy on GitHub Pages (gives you the link to submit)

1. Create a new repository on GitHub (public, or private on a plan that allows Pages). Any name works.
2. Push this folder to it:
   ```bash
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
3. On GitHub: **Settings › Pages › Build and deployment › Source: GitHub Actions**.
4. The included workflow (`.github/workflows/deploy.yml`) builds and deploys on every push to `main`. Watch it under the **Actions** tab; when it finishes, the site is at `https://<your-username>.github.io/<repo-name>/`.

No server, secrets or environment variables are needed. The build uses a relative base path, so it works under any repository name.

## Deploy on Railway

Railway deploys from the same GitHub repository.

1. Push the repository to GitHub first (steps above).
2. On railway.com: **New Project › Deploy from GitHub repo**, and pick this repository. Approve Railway's GitHub access if asked.
3. Railway reads `railway.json`: it runs `npm run build`, then `npm start` (a dependency-free Node server, `server.mjs`, that serves `dist/` on Railway's `PORT`).
4. When the deployment is green, open the service's **Settings › Networking** and click **Generate Domain**. That URL is your Railway link.

Every push to `main` redeploys both GitHub Pages and Railway.

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
