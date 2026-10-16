// ============================================================================
// ABBAS-SLOT 2: 2026 estimated tax plan (next-year planning)
// Owner: Abbas. Status: BASELINE ONLY (written by Claude as a placeholder).
// Spec: src/contrib/abbas/README.md#slot-2
// ============================================================================
//
// Input: the finalized 2025 position (workpaper totals after adjustments) and
// packet.planning_reference_2026. Output: a payment schedule the client can
// act on, plus the reasoning shown on the Carry forward screen.
//
// The baseline applies the federal 110% prior-year safe harbor and the
// California 110% safe harbor with the 30/40/0/30 split. It ignores the facts
// that make this household interesting (no California residency in 2026,
// minimum tax credit, SEP limit tied to 2026 profit, withholding at the new
// employer). Your version should decide between safe harbors with those facts.

export interface PlanInput {
  fed2025TotalTax: number;
  ca2025TotalTax: number;
  fed2025Agi: number;
  ca2025Agi: number;
  fedWithholding2025: number;
  caWithholding2025: number;
  minimumTaxCredit: number;
  ref: any; // packet.planning_reference_2026
}

export interface Installment { jurisdiction: 'federal' | 'california'; due: string; amount: number }
export interface Plan { installments: Installment[]; assumptions: string[]; author: 'baseline' | 'abbas' }

export function plan2026(i: PlanInput): Plan {
  // ---- BASELINE (Claude) - replace with Abbas's plan ---------------------
  const fedTarget = Math.round(i.fed2025TotalTax * 1.1);
  const fedNet = Math.max(0, fedTarget - i.fedWithholding2025);
  const fedEach = Math.ceil(fedNet / 4 / 10) * 10;
  const caTarget = Math.round(i.ca2025TotalTax * 1.1);
  const caNet = Math.max(0, caTarget - 0);
  const pct: number[] = i.ref.california_installment_percentages;
  return {
    author: 'baseline',
    installments: [
      ...i.ref.federal_estimate_due_dates.map((d: string) => ({ jurisdiction: 'federal' as const, due: d, amount: fedEach })),
      ...i.ref.california_estimate_due_dates.map((d: string, k: number) => ({ jurisdiction: 'california' as const, due: d, amount: Math.round(caNet * pct[k]) })),
    ],
    assumptions: [
      'Federal: 110% of 2025 total tax (AGI over 150,000), less 2025-level withholding, in four equal payments.',
      'California: 110% of 2025 tax, 30/40/30 split. Ignores that 2026 California tax covers only California-source income.',
      'Baseline only: does not use the minimum tax credit, the SEP limit or a lower 90%-of-current-year target.',
    ],
  };
  // ------------------------------------------------------------------------
}
