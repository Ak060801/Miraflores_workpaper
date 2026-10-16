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
  // ---- BASELINE (Claude) - replace with Ayaan's model --------------------
  let score = i.ev.confidence;
  const reasons: string[] = [`pipeline confidence ${i.ev.confidence.toFixed(2)}`];
  if (!i.printedFound) { score *= 0.5; reasons.push('extracted text not found on printed page'); }
  if (i.verifiedBy.length) { score = Math.max(score, 0.99); reasons.push(`verified: ${i.verifiedBy.join(', ')}`); }
  const band = score >= 0.95 ? 'trust' : score >= 0.8 ? 'look' : 'verify';
  return { score, band, reasons };
  // ------------------------------------------------------------------------
}

export const TRUST_SCORE_AUTHOR: 'baseline' | 'ayaan' = 'baseline';
