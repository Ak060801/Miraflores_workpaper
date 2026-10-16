# Abbas's contribution slots

Three self-contained parts of the workpaper are reserved for Abbas. Each one already has a working **baseline** (written by Claude so the app runs end to end) and a fixed interface, so replacing the baseline cannot break the rest of the app.

Each slot shows a purple **✎ Abbas** tag in the UI. The tag says "(baseline)" until you flip the author constant in the file to `'abbas'`.

When you finish a slot:
1. Replace the code between the `BASELINE (Claude)` markers.
2. Set the author constant (`TRUST_SCORE_AUTHOR`, `author: 'abbas'`) so the UI tag updates.
3. Commit under your own name (see `CONTRIBUTIONS.md`), and tick the slot in that file.

---

## Slot 1: Review triage ("trust score") {#slot-1}

**File:** `trustScore.ts` · **Used by:** Documents › Review triage, the document viewer, the trace drawer.

**Why it matters for the brief:** the packet warns that it "contains mistakes with high confidence scores". A reviewer cannot look at 3,012 values; the order in which they look is the product. This is the slot closest to LLM-evaluation work: you are calibrating an extractor's confidence against independent evidence.

**Input you get (`TrustInput`):** the extracted value; whether its text appears verbatim on the printed page; the return lines that use it; verifications people recorded; corroborating sources; ids of failing checks that cite it; document type; whether the document is a photo, scan or handwritten.

**What a good version does:**
- Treats "not on the printed page" as near-disqualifying (the Little Sprouts TIN was read at 0.97 and is wrong).
- Raises the score when an independent source agrees (D10 phone photo agrees with D09) and lowers it when a check fails.
- Weights by materiality: a value that reaches the return and moves tax matters more than one that doesn't.
- Treats handwritten and photo sources as riskier (the St. Brigid receipt at 0.41; the mileage log).
- Explains itself: every point gained or lost appears in `reasons`.

**Acceptance check:** on the Review triage tab, the top of the "verify" band should include ev-1045 (TIN), ev-1049 (St. Brigid), the duplicated mileage page totals and the C6 basis; the W-2 boxes agreed to a second image should sit in "trust".

---

## Slot 2: 2026 estimated tax plan {#slot-2}

**File:** `planning2026.ts` · **Used by:** Carry forward & 2026.

**Why it matters:** "plan next year" is in the brief, and this household's facts make the naive answer wrong.

**Input:** the finalized 2025 position (after workpaper adjustments), 2025 AGI and withholding, the minimum tax credit carryforward, and `packet.planning_reference_2026` (due dates, safe harbors, known 2026 changes).

**What a good version decides:**
- Federal: 110% of 2025 tax vs 90% of a projected 2026 tax. Consider what does not repeat in 2026: the condo gain, the Corvane RSU income, the S corporation excess distribution. Ngozi's full-year withholding at Halvorsen may cover much of the federal target.
- California: the household is nonresident all year in 2026. Only the Sacramento rental and Ridgeline's California share are taxable there, so 110% of 2025 California tax would massively overpay. Use the 90%-of-current-year route and the 30/40/30 schedule.
- The minimum tax credit (Form 8801) reduces 2026 regular tax.
- Erik's SEP limit depends on 2026 profit; the 2,786 excess carries in.
- Output a schedule plus plain-English assumptions the client can read.

**Acceptance check:** the California installments should be a small fraction of the baseline's; every assumption should cite a fact from the packet.

---

## Slot 3: Firm policy extensions {#slot-3}

**File:** `firmPolicy.ts` · **Used by:** Firm › Policies, and every sign-off (a failing policy blocks its level).

**Why it matters:** the brief lets the firm administrator "change, extend or replace" the starter standards. This is where the firm's own quality bar lives, written as code that is tested on every change.

**Contract:** each policy has `text` (the rule as a partner would write it), `blocks` (which sign-off level it stops), and `test(context)` returning violations with a reference and a message. The context includes the area being signed.

**Ideas worth writing (pick 3 to 5):**
- Any extracted value below a confidence floor that reaches the return needs a verification (the example; tune it or replace it).
- Every finding marked "needs judgment" must have a recorded judgment with authority before reviewer sign-off.
- Any variance flagged against 2024 must be explained before preparer sign-off.
- Client answers contradicted by documents (qa-14, qa-31) must be documented before reviewer sign-off.
- No partner sign-off while any area has time logged above 125% of budget without a note.
- A preparer without sensitive-data clearance may not sign off an area containing SSNs or account numbers.

**Acceptance check:** Firm › Policies lists your rules with "abbas" tags; at least one of them blocks a sign-off in the seeded season until the underlying issue is fixed.
