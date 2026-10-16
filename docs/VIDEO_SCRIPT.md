# Walkthrough script (about 10 minutes)

A draft to adapt to your own voice. Times are targets. Before recording: open the app fresh (Firm › Data › Reload demo season), and open a second browser tab you will use as the reviewer.

## 0:00 The idea (1 min)

- "A workpaper proves the return is right: where every number came from, what was done to it, who checked it, what is still open. A spreadsheet stores numbers and hopes the tick marks are still true. This stores the claims instead."
- Show `docs/CORE_IDEA.md` briefly: the packet is never modified; every human act is an event; every screen is computed from the two.

## 1:00 My work, as the preparer (1 min)

- Top bar: season clock (06/24/2026, v3 just arrived), role switcher, replay.
- "Needs you": the open errors, review notes from Daniel, and two sign-offs that **reopened** because v3 changed numbers they covered.
- Position tiles: engine v3 vs workpaper.

## 2:00 Trace a number (1.5 min)

- Return › Summary vs 2024 › click **Adjusted gross income**. The drawer shows the tree: AGI = total income − adjustments; expand down to a W-2 box.
- Click a source chip → the document opens on the page with the field highlighted. "These pages are simulated from the packet's printed content behind a `DocumentSource` interface; a PDF renderer drops in with the same regions."
- Show "where it landed" for the document, and the version history (v1/v2/v3 values) in the drawer.

## 3:30 Checks that don't trust the engine (2 min)

- Checks & findings: 35 checks, 16 errors. Walk three:
  - **RSU basis**: zero basis on noncovered lots although the employer statement gives the basis; taxed twice. Show the evidence chips, the proposals, the tax effect.
  - **Mileage**: page 3 is page 2 scanned again; odometer proves it.
  - **California wages**: payroll kept CA as the work state; the July paystub gives the real split.
- Accept the RSU finding. Mention: "Effects use the engine's per-dollar rates, as the README says; non-linear lines are marked recompute rather than guessed."
- Select the rest and accept in bulk; show **Undo** on the toast.

## 5:30 Change, review and sign-off (1.5 min)

- Adjustments: engine vs workpaper, who/why/authority/effect, "needs partner" over 1,000.
- In the second tab switch to **Daniel (reviewer)**: the changes appear live. Resolve his mileage note. Try to sign an area: refused until the preparer signs (rule enforced in the action layer, not just hidden).
- Review › Sign-off matrix: a reopened sign-off lists exactly which values changed since it was signed.

## 7:00 Judgment, completeness, records (1 min)

- Judgment: swings vs 2024 with explanations; judgment log with authority required; Form 8867 due diligence.
- Records: Sales detail reconciles each broker to its lots and shows only exceptions out of 295 lots; Books to tax ties book income to Schedule C.

## 8:00 Client, filing, notice (1.5 min)

- Switch to **Ngozi (client)**: answer a question, approve, sign 8879. "If the return changes after this, the approval reopens."
- Switch to **Helen (partner)**: the filing gate; transmit. "If Theo's SSN had not been corrected, this reproduces the packet's e-file rejection."
- Frozen as filed; add an adjustment and show it becomes an amendment on top.
- Notices: the 2028 Letter 566 response assembled from the same record, with every source page.

## 9:30 Trade-offs and AI (0.5 min)

- Event sourcing (history, undo, replay, stale sign-offs for free) vs recompute cost.
- Browser storage + BroadcastChannel vs a server: a transport swap, not a redesign.
- Rate-based effects vs a real recompute.
- How AI was used: see `docs/AI_USAGE.md` and `CONTRIBUTIONS.md`; point to your own slots (trust score, 2026 plan, firm policies) and show one of them running.
