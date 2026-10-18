// ============================================================================
// AYAAN-SLOT 2: 2026 estimated tax plan (next-year planning)
// Owner: Ayaan. Status: BASELINE ONLY (written by Claude as a placeholder).
// Spec: src/contrib/ayaan/README.md#slot-2
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
export interface Plan { installments: Installment[]; assumptions: string[]; author: 'baseline' | 'ayaan' }

export function plan2026(i: PlanInput): Plan {

  // 1. Write down the facts from the packet
  const total2025Wages = 212400;
  const halvorsenWages = 107800;
  const halvorsenTaxWithheld = 9600;
  const condoGain = 105040;
  const sCorpExcess = 21215;

  const wageTaxRate = 0.31;
  const gainTaxRate = 0.238;
  const californiaTaxRate = 0.093;

  const sacramentoRental = -5107;
  const ridgelineCaliforniaShare = 1848;

  // 2. Work out Ngozi's 2026 wages
  const fullYearHalvorsenWages = halvorsenWages * 12 / 7;
  const wageChange = fullYearHalvorsenWages - total2025Wages;

  // 3. Project the 2026 federal tax
  let projectedFederalTax = i.fed2025TotalTax;

  projectedFederalTax =
    projectedFederalTax + wageChange * wageTaxRate;

  projectedFederalTax =
    projectedFederalTax - condoGain * gainTaxRate;

  projectedFederalTax =
    projectedFederalTax - sCorpExcess * gainTaxRate;

  projectedFederalTax =
    projectedFederalTax - i.minimumTaxCredit;

  if (projectedFederalTax < 0) {
    projectedFederalTax = 0;
  }

  // 4. Decide how much federal tax to prepay
  const optionA = i.fed2025TotalTax * 1.1;
  const optionB = projectedFederalTax * 0.9;

  let requiredFederalTax = optionA;

  if (optionB < optionA) {
    requiredFederalTax = optionB;
  }

  // 5. Subtract withholding and split into 4 payments
  const expectedWithholding = halvorsenTaxWithheld * 12 / 7;

  let amountToPay = requiredFederalTax - expectedWithholding;

  if (amountToPay < 0) {
    amountToPay = 0;
  }

  const paymentBeforeRounding = amountToPay / 4;
  const federalPayment = Math.ceil(paymentBeforeRounding / 10) * 10;

  // 6. Calculate California tax
  const californiaIncome =
    sacramentoRental + ridgelineCaliforniaShare;

  let californiaTax = californiaIncome * californiaTaxRate;

  if (californiaTax < 0) {
    californiaTax = 0;
  }
  // 7. Build the payment list
  const installments: Plan["installments"] = [];

  // Add the federal payments
  for (const date of i.ref.federal_estimate_due_dates) {
    installments.push({
      jurisdiction: "federal",
      due: date,
      amount: federalPayment
    });
  }

  // Add the California payments
  let californiaPaymentNumber = 0;

  for (const date of i.ref.california_estimate_due_dates) {
    let paymentAmount = 0;

    if (californiaTax >= 500) {
      const percentage =
        i.ref.california_installment_percentages[californiaPaymentNumber];

      paymentAmount = Math.round(californiaTax * percentage);
    }

    installments.push({
      jurisdiction: "california",
      due: date,
      amount: paymentAmount
    });

    californiaPaymentNumber = californiaPaymentNumber + 1;
  }

  // 8. Explain the assumptions
  const assumptions: string[] = [];
  assumptions.push(
    "Projected 2026 federal tax is " + Math.round(projectedFederalTax) + ", so we prepay " + Math.round(amountToPay) + " in four payments of " + federalPayment + "."
  );

  assumptions.push(
    "2026 wages are estimated by annualizing Halvorsen wages for 12 months."
  );

  assumptions.push(
    "2026 wages are estimated by annualizing Halvorsen wages for 12 months."
  );

  assumptions.push(
    "The wage change is calculated by comparing annualized Halvorsen wages with 2025 total wages."
  );

  assumptions.push(
    "The condo gain and S corporation excess are subtracted because they are assumed not to repeat in 2026."
  );

  assumptions.push(
    "The federal tax projection subtracts the minimum tax credit and cannot be below zero."
  );

  assumptions.push(
    "Federal payments use the smaller of 110% of 2025 tax and 90% of projected 2026 tax, after estimated withholding. California tax is based on the specified California-source income, with no estimates required when the tax is below $500."
  );

  return {
    author: "ayaan",
    installments: installments,
    assumptions: assumptions
  };
}



