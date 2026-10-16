# Errors found, and how the design surfaced them

Every item below is reproducible: `npm run check` runs the same check library the app runs and prints the findings with their estimated tax effect against engine run v3. In the app, each one is a finding on **Checks & findings** with its evidence chips, proposed adjustments and authority.

Tax effects are estimates using v3's per-dollar tax-effect rates (the README's method), except the HVAC item, which uses the engine's own what-if result. Positive = more tax / smaller refund.

## Summary

| | Engine v3 | Workpaper after corrections (estimate) |
|---|---|---|
| Federal total tax | 81,962 | 72,881 |
| Federal balance | 4,220 due | **3,861 overpaid** |
| California total tax | 18,874 | 12,296 |
| California refund | 8,256 | 11,334 |

The federal result flips from a balance due to an overpayment, mostly because of the RSU basis error. That matters for the scripted season: the 04/14 extension payment (36,000) was estimated from v2, so the "balance paid 07/20" event and the IRS interest assessment would not occur on a corrected return.

## Errors in the return (the engine was confidently wrong)

| # | Error | Evidence | How it was surfaced | Federal | CA |
|---|---|---|---|---|---|
| 1 | **RSU shares taxed twice.** Northlake lots N1, N3, N4 are noncovered with blank basis. The engine matched the employer's supplemental statement for the ESPP lot but not the RSU lots (lot ids RSU-2502/2505/2308 vs N1/N3/N4), so it used zero basis. Vest value was already wages (W-2 box 14 RSU 38,200). Correct basis 19,100 / 19,100 / 9,420. | D11 p2 (ev-0066, 0068, 0070), D28 p3, ev-0027 | Check matches every zero-basis or noncovered lot to supplemental statements by acquisition date. Sales detail flags "zero basis" as an exception. | −15,536 | −2,444 |
| 2 | **California-source wages include Texas-period pay.** Halvorsen reported all 111,300 in box 16 because payroll kept CA as the work state through 09/30 by mistake. Work moved to Austin 07/15; CA residency ended 07/14. The 07/18 paystub shows CA wages through 07/15 of 22,469. CA-source wages should be 107,100 + 22,469, not 218,400. | D09 note, D73 (ev-1081), qa-45, household residency | Check sources each employer's wages to the residency period instead of trusting box 16. State split screen shows the line with a check flag. | 0 | −5,685 |
| 3 | **Form 1099-K counted twice.** Engine rule adds 1099-K amounts it cannot match to a deposit. The 12,400 is Atlas Outdoor Gear paying by card; the deposits detail says it was deposited gross and is inside Atlas's 41,200 (and inside the Atlas 1099-NEC). Books 151,300 = 1099-NECs 142,000 + no-1099 clients 9,300. | D15 p3 (ev-0109, 0110, 0111), D21, D14 | Gross receipts reconciled three ways (books, third-party forms, deposits). Books-to-tax screen shows the reconciliation and ties. This is also item 2 of the 2028 Letter 566. | −4,402 | −384 |
| 4 | **Mileage log page scanned twice.** Page 3 repeats page 2 trip for trip (the page itself says "second scan, same coffee stain"). Engine summed every page total: 11,800 miles. Unique pages: 8,100 miles. Odometer 17,740 total, so "other miles" is 9,640, not 5,940. | D23 p2 vs p3, ev-0315, ev-0404, odometer ev-0478/0479, msg-03 | Check compares trips page by page before adding totals and ties business + other miles to the odometer. The reviewer's seeded note ("11,800 vs 7,400 last year") is the variance flag that points here. | +919 | +80 |
| 5 | **Self-employed health insurance not allowed.** Erik was eligible for subsidized family coverage through both of Ngozi's employers all year (qa-25). The 2024 preparer reached the same conclusion. | qa-25, D25, ev-0484, 2024 note Sch1.17 | Check tests SEHI eligibility against any employer plan available through a spouse. | +4,464 | +605 |
| 6 | **HVAC replacement treated as a repair.** Invoice describes removing the furnace and condenser and installing a new heat-pump system with air handler, line set and permit: replacement of a building system. Capitalize over 27.5 years. | D47, D46 (ev-1000), qa-37, call-01 | Check tests rental expenses against the improvement rules; adopts the engine's own what-if (hvac_improvement) for the effect. Depreciation screen then shows a new asset SAC-HVAC. | +3,633 | +896 |
| 7 | **Home property tax includes the seller's share.** Escrow paid the full 2025 levy 13,420; the buyers were credited 6,912 at closing for 01/01 to 07/07. Deductible: 6,508. Federal SALT drops under the 40,000 cap, so 5,622 of itemized deductions is lost. | D54 (ev-1027), D57, D58 | Check apportions real estate tax by days of ownership. | +1,462 | +332 |
| 8 | **Payoff interest double counted.** The Lonestar 1098 already "includes … interest paid at payoff", and the payoff statement says so. Engine added 2,150 again. | D55 (ev-1029), D56 (ev-1032) | Check reads whether the 1098 already includes a lender statement's interest before adding it. | +559 | +103 |
| 9 | **Donated car at Blue Book value.** Claimed 6,000 (client's KBB estimate). Form 1098-C box 4a is checked: sold at arm's length for 2,900. Deduction is limited to gross proceeds. This is item 1 of the 2028 Letter 566. | D66 (ev-1054), qa-39, call-01 | Check applies the 1098-C sale limit. The Notices screen assembles the response from the same record. | +806 | +149 |
| 10 | **Northlake sweep interest counted twice.** The consolidated 1099 (D28) reports sweep interest 1,840 for account 7731; D29 is the Northlake Bank 1099-INT for the same sweep and account. Engine made a Schedule B line for each. | D28 p1 (ev-0492), D29 (ev-0538) | Check matches interest payers across composite and stand-alone forms by account number. | −640 | −127 |
| 11 | **Swedish interest at the wrong year's rate.** SEK 18,450 converted at the 2024 average (10.56), the rate the prior preparer used last year. 2025 average 9.86 gives 1,871. | D36 (ev-0960), ref:fx.SEK.* | Check recomputes foreign-currency income at the tax year's rate. | +43 | +9 |
| 12 | **Meridian sale on an unread page.** The 1099-B summary (71,965) is 250 more than the lots (71,715). The difference is lot M18 on page 32, which the pipeline did not read (extraction "partial"). | D31 p32 | Check reconciles each broker summary to its lots, and on a difference reads every skipped page. The engine's own diagnostic saw the mismatch but not the cause. | −21 | 0 |
| 13 | **Federal Q4 estimate was 3,000, not 4,000.** Only three EFTPS confirmations were uploaded, so the engine used the client's "4,000 I think" (qa-41). The IRS transcript shows 3,000 on 01/15/2026. | D69 / agency transcript, D67, qa-41 | Check agrees estimates to the IRS transcript. Payments screen shows all four sources side by side. | +1,000 balance | 0 |
| 14 | **California Q3 estimate applied to 2024.** The 09/15/2025 Web Pay payment (3,500) was designated tax year 2024; FTB holds it as a 2024 credit. Engine counted every payment by date. Claim 10,500 and request a transfer, or have it moved before filing. Still deductible federally as tax paid in 2025. | D68 (ev-1076), FTB account | Check agrees state estimates to the FTB account by tax year. | 0 | +3,500 balance |
| 15 | **Theo's SSN typed wrong in the organizer.** Organizer 666-74-3309; 2024 return and the Social Security card (D71) 666-74-3390. Federal e-file rejects with R0000-504-02 and the CTC needs a valid SSN. | household, D06, D71 | Check compares identifiers against prior returns and ID documents. If not corrected, the app's e-file transmission reproduces the packet's rejection. | (rejection) | (held) |
| 16 | **Child care provider tax ID misread.** Little Sprouts read as 74-3829516 at 0.97 confidence; the statement prints 74-3829156. Form 2441 would carry a wrong TIN. Line 1a also names "Bright Oak Preschool" instead of "Bright Oak Kids Club". | D62 (ev-1045), D61, 2024 return | "Read vs printed": every extracted identifier must appear verbatim on its page. The document viewer marks the field red and the trust score drops. | 0 | 0 |

## Judgment calls the workpaper raises (not automatically errors)

| Item | Recommendation | Federal | CA |
|---|---|---|---|
| **Coinhaven lot C6** has no basis (transfer-in). Erik says it was bought 03/15/2021 for about 3,050 (msg-07); only a bank statement line survives. If accepted: long-term, gain 2,275 instead of short-term 5,325. | Ask for the bank statement and transfer record before relying on it; record the judgment either way. | −1,312 | −195 |
| **Personal costs in the books**: Spotify Family (216, personal per the call), a 4-line family phone plan deducted in full, home internet in full. | Erik's line at 70%, internet at 50%, remove Spotify. | +944 | +83 |
| **St. Brigid receipt** reads "$?,500" (read 1,500 at 0.41). Client and bank statement say 1,500. | Get a clean written acknowledgment (required at 250+), attach the bank statement line. The example firm policy blocks reviewer sign-off until this value is verified. | 0 | 0 |
| **SEP limit** moves with Schedule C. Corrections lower net profit, so the 18,000 contribution's deductible part and the 2,786 excess carryforward change. | Flagged for the next engine run instead of guessing a non-linear number. | ~ | ~ |
| **California AMT on the ISO exercise** is not computed by the engine (granted in CA in 2022, exercised in TX in 2025). | Allocate the 40,000 spread by California workdays and compute Schedule P by hand. | | ~ |

## Things the client said that the records contradict (engine was right)

- **IRA basis**: qa-31 says "no prior basis"; the 2024 Form 5498 and Form 8606 show 7,000. The engine correctly used 14,000 of basis. Documented so a reviewer doesn't "fix" it.
- **Sales**: qa-14 says no investments were sold and qa-15 says crypto was only "moved around"; the documents show 282 brokerage sales and 12 crypto disposals.

## Outside the return, identified for completeness

- **2023 Form 3520** for the Swedish inheritance: the prior preparer's open item has no resolution. Escalate to the partner.
- **FBAR** for 2025 (max ≈ 149,567 USD): due 10/15/2026, outside the engagement letter.
- **Forms 1099-NEC** for two studio contractors (late): outside the engagement; advise Erik.
- **Prior year**: the 2024 return used 300 sq ft for the home office; the measured room is 220.

## Checks that passed (and why that matters)

W-2s counted once (D10 is a phone photo of D09), excess social security, ESPP basis, Brightpath's 260 lots against its summary, carryovers against the 2024 return pages, S corporation basis rolled forward with the late 2023 K-1, depreciation recomputed asset by asset, home office square footage. A passing check is evidence too: it is listed on each area and counts toward sign-off.
