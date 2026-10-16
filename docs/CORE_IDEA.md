# Core idea and data model

## The idea: a workpaper is a ledger of claims, not a grid of cells

A spreadsheet workpaper stores numbers and hopes the tick marks next to them are still true. This workpaper stores **where every number came from and what people did to it**, and computes everything else from that.

Three layers, and only one of them is ever written to:

| Layer | What it holds | Who writes it |
|---|---|---|
| **1. The packet** | Documents and pages, every extracted value with its position and confidence, three engine runs with every line's rule, inputs and sources, client answers, agency records, prior years. | Nobody. Loaded as delivered and never modified. |
| **2. The event log** | Every human act: adjustment, verification, review note, question and answer, document disposition, judgment call, sign-off, approval, e-file, freeze, standards change, unmasked view. Each event records who, role, when, the reference it is about, and why. | People, through permission-checked actions. Append-only. Undo appends a reversal. |
| **3. Projections** | The current return, trace trees, sign-off status, the filing gate, findings, variances, completeness, the client's view, the notice response. | Pure functions of layers 1 and 2. Recomputed on every change. |

Everything the brief asks for falls out of this shape:

- **Trace any number** because every engine line already lists its inputs and sources. The trace tree walks inputs down to extracted values, and each extracted value opens its document page with the field highlighted. One resolver understands every reference format in the packet (`ev-`, `D`, `qa-`, `py:/`, `agency:/`, `asset:`, `ref:param.` and the workpaper's own ids), so no reference is a dead string.
- **Every document to everywhere it landed** is the same index run backwards. A document the engine did not use is "unaccounted" until a person records why.
- **Adjust without losing the original**: an adjustment is an event on top of the engine's line. The engine value is never overwritten. The change flows exactly through additive lines (to AGI and taxable income); non-linear lines are marked "recompute" and the tax effect is estimated with the engine's own per-dollar rates, as the README prescribes.
- **Sign-offs that reopen**: a sign-off stores a snapshot and fingerprint of every value and document disposition in its area. If anything in it changes (a new engine run, an adjustment, a disposition), the projection sees the difference and the sign-off shows "reopened" with the exact list of changes.
- **What changed since I last looked, compare versions, replay** are queries over a log that is already ordered in time. The season clock lets the scripted timeline unfold; replay shows the workpaper as it stood at any moment, read-only.
- **Freeze at filing, amend on top**: filing writes a frozen snapshot event. Later adjustments are flagged as amendment items and never touch the filed figures.
- **Answer a notice** by assembling, from the same log, the filed numbers, every source page, and who verified what and when.

## Checks that don't trust the engine

The engine is treated as one opinion. A check library recomputes figures from the source documents, agency records and client answers (W-2s counted once, broker summaries against lots, mileage pages against each other, estimates against the IRS transcript, wages sourced to the residency period, and so on). A failing check becomes a **finding** with evidence, authority and proposed adjustments. Accepting it writes adjustment events linked to the finding; dismissing it requires a recorded judgment. The filing gate will not open while an error-level finding is unresolved.

## Data model

```
Packet (read-only)                       Event (append-only)
  Document ─┬─ Page(printed_content)        id, at (season clock), wall (real time)
            └─ ExtractedValue                actor, role, type, target (any reference)
                 (field, value, position,    data { … }, batch (bulk actions), seed
                  confidence)
  ReturnVersion ─ Line(key, rule,          Types: adjustment.add / approve, verify,
                       inputs[], sources[])        note.open / reply / resolve, question.ask / answer,
  ClientAnswer, Message, CallNote                  evidence.attach, doc.disposition, judgment,
  PriorYear, AgencyRecord, Firm, Staff             finding.dismiss, signoff, step.complete, assign,
  EngineReference, WhatIf                          time.log, client.approve / sign8879, extension.file,
                                                   efile.transmit, filing.freeze, amend.open,
Reference = string, resolved by one function       standard.set, view.unmask, pii.correct,
  (ev-0016, D09, qa-25, py:/…, SchC.1, chk:…)      clock.advance, seen, undo
```

Projections (all in `src/store/projections.ts` and `src/app/ctx.tsx`): adjusted line values with provenance of each delta, notes with threads, verifications by target, sign-offs with staleness diff, filing gate, workpaper position (engine total plus tax effect of adjustments), standards in force, access log.

## Trade-offs

| Decision | Why | Cost |
|---|---|---|
| Event sourcing instead of mutable records | History, undo, compare, replay, stale sign-offs and audit come for free | Projections recompute on each change (fast at this size; would need snapshots at firm scale) |
| Rate-based tax effects for adjustments | The engine cannot be rerun; the README prescribes rates | Second-order effects (SE tax, SEP limit, QBI, phase-outs) are estimates and flagged "recompute" |
| Browser storage plus BroadcastChannel | Zero backend, deploys as static files, two tabs collaborate live | Not multi-device; a server event endpoint is a transport swap, not a redesign |
| Simulated pages behind a `DocumentSource` interface | Brief asks for replaceable document views | Highlight boxes use synthetic positions; the text highlight is the reliable locator |
| Bespoke checks for this household | Shows what "don't trust the engine" means concretely | In production these become a rule library keyed by document type |
