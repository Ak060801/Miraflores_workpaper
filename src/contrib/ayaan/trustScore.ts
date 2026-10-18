// ============================================================================
// AYAAN-SLOT 1: Review triage ("trust score") for extracted values
// Owner: Ayaan. Status: BASELINE ONLY (written by Claude as a placeholder).
// Spec: src/contrib/ayaan/README.md#slot-1
// ============================================================================
//
// The pipeline gives every extracted value a confidence. The packet warns that
// it "contains mistakes with high confidence scores", so confidence alone is a
// poor guide to what a reviewer should look at first. This function decides
// the review order for the Documents screen and the "Triage" queue.
//
// Contract (do not change the signature; the UI depends on it):
//   input  -> TrustInput (everything the workpaper knows about one value)
//   output -> { score 0..1 (1 = trust fully), band, reasons[] }
//
// The baseline below just passes through the pipeline confidence and docks it
// when the value is not found on the printed page. Replace it with your model.

import type { ExtractedValue } from '../../data/types';

export interface TrustInput {
  ev: ExtractedValue;
  printedFound: boolean;        // the extracted text appears verbatim on the printed page
  usedInLines: string[];        // return lines that use this value
  verifiedBy: string[];         // verification methods recorded by people
  corroboratingRefs: string[];  // other sources that state the same number (e.g. a duplicate W-2 image)
  failingChecks: string[];      // ids of checks (src/checks) that flag this value
  documentType: string;
  isHandwritten: boolean;       // phone photo / handwritten / scanned
}

export interface TrustResult {
  score: number;
  band: 'trust' | 'look' | 'verify';
  reasons: string[];
}


export function trustScore(i: TrustInput): TrustResult {
  let score = i.ev.confidence;
  let reasons: string[] = [];

  reasons.push("pipeline confidence " + score.toFixed(2));

  // If a person verified it, return immediately
  if (i.verifiedBy.length > 0) {
    reasons.push("verified by " + i.verifiedBy.join(", "));

    return {
      score: 0.99,
      band: "trust",
      reasons: reasons
    };
  }

  // Check if the value was found on the printed page
  if (i.printedFound === false) {
    score = Math.min(score, 0.30);
    reasons.push("not found on the printed page");
  }

  // Check if any checks failed
  if (i.failingChecks.length > 0) {
    score = Math.min(score, 0.50);
    reasons.push("failing checks: " + i.failingChecks.join(", "));
  }

  // Reduce the score if the value is handwritten
  if (i.isHandwritten === true) {
    score = score * 0.85;
    reasons.push("value is handwritten");
  }

  // Increase the score for each supporting reference
  for (let ref of i.corroboratingRefs) {
    score = score + 0.05;

    if (score > 1) {
      score = 1;
    }

    reasons.push("supporting reference: " + ref);
  }

  // Check if the value is not used on the return
  if (
    i.usedInLines.length === 0 &&
    i.printedFound === true &&
    i.failingChecks.length === 0
  ) {
    if (score < 0.90) {
      score = 0.90;
    }

    reasons.push("not used on the return");
  }

  // Decide which band the score belongs to
  let band: "trust" | "look" | "verify";

  if (score >= 0.90) {
    band = "trust";
  } else if (score >= 0.70) {
    band = "look";
  } else {
    band = "verify";
  }

  return {
    score: score,
    band: band,
    reasons: reasons
  };
}


export const TRUST_SCORE_AUTHOR: 'baseline' | 'ayaan' = 'ayaan';
