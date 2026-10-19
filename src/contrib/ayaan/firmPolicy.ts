// ============================================================================
// AYAAN-SLOT 3: Firm policy extensions (beyond the starter standards)
// Owner: Ayaan. Status: ONE EXAMPLE RULE (Claude). Replace / extend.
// Spec: src/contrib/ayaan/README.md#slot-3
// ============================================================================
//
// Each policy is a rule the workpaper enforces automatically. `test` returns
// the list of violations (empty = compliant). Violations show on the Firm
// screen and block the matching sign-off level.

import type { WP } from '../../store/projections';
import type { Model } from '../../data/model';
import { areaOfLine } from '../../data/model';
import type { Finding } from '../../checks/checks';

export interface PolicyContext { m: Model; wp: WP; findings: Finding[]; area?: string }  // area = the area being signed (undefined = whole return)
export interface Policy {
  id: string;
  text: string;                       // the rule as a partner would write it
  blocks: 'preparer' | 'reviewer' | 'partner' | 'filing';
  author: 'example' | 'ayaan';
  test: (c: PolicyContext) => { ref: string; message: string }[];
}

export const POLICIES: Policy[] = [
  {
    id: 'example-low-confidence',
    author: 'example',
    blocks: 'reviewer',
    text: 'Any extracted value read below 0.60 confidence that reaches the return needs a recorded verification before reviewer sign-off.',
    test: ({ m, wp, area }) => {
      const out: { ref: string; message: string }[] = [];
      for (const e of m.p.extracted_values) {
        if (e.confidence >= 0.6) continue;
        const used = wp.vi.v.lines.some((l) => l.sources?.includes(e.id) && (!area || area === 'return' || areaOfLine(l) === area));
        if (used && !(wp.verifications.get(e.id) || []).length) out.push({ ref: e.id, message: `${e.label} (${e.confidence}) used on the return without verification` });
      }
      return out;
    },
  },

  {
    id: 'judgment-recorded',
    author: 'ayaan',
    blocks: 'reviewer',
    text: 'Every finding that needs judgment must be decided (adjusted, or dismissed with a reason) before reviewer sign-off.',
    test: ({ wp, findings, area }) => {
      const out: { ref: string; message: string }[] = [];

      for (const f of findings) {
        if (f.needsJudgment !== true) {
          continue;
        }

        if (area && area !== 'return' && area !== f.area) {
          continue;
        }

        const hasAdjustment = wp.adjustments.some(
          a => a.findingId === f.id
        );

        const isDismissed = wp.dismissed.has(f.id);

        if (!hasAdjustment && !isDismissed) {
          out.push({
            ref: f.id,
            message: f.title + ': no recorded decision'
          });
        }
      }

      return out;
    },
  },

  {
    id: 'blocking-notes-closed',
    author: 'ayaan',
    blocks: 'reviewer',
    text: 'A reviewer may not sign off an area while a blocking review note on that area is still open.',
    test: ({ wp, area }) => {
      const out: { ref: string; message: string }[] = [];

      for (const n of wp.notes) {
        if (n.status !== 'open' || n.blocking !== true) {
          continue;
        }

        if (area && area !== 'return' && area !== n.area) {
          continue;
        }

        out.push({
          ref: n.target,
          message: 'Open blocking note: ' + n.text
        });
      }

      return out;
    },
  },

  {
    id: 'client-contradictions-documented',
    author: 'ayaan',
    blocks: 'reviewer',
    text: 'When documents contradict a client answer (qa-14 no sales, qa-31 no IRA basis), a recorded judgment must cite the answer.',
    test: ({ wp, area }) => {
      const out: { ref: string; message: string }[] = [];

      const questions = [
        {
          qa: 'qa-14',
          area: 'investments_and_digital_assets'
        },
        {
          qa: 'qa-31',
          area: 'retirement_and_foreign'
        }
      ];

      for (const item of questions) {
        if (
          area &&
          area !== 'return' &&
          area !== item.area
        ) {
          continue;
        }

        let documented = false;

        for (const j of wp.judgments) {
          if (
            j.data.refs.includes(item.qa) ||
            j.data.decision || ''.includes(item.qa)
          ) {
            documented = true;
            break;
          }
        }

        if (!documented) {
          out.push({
            ref: item.qa,
            message:
              'Client answer ' +
              item.qa +
              ' is contradicted by documents: record a judgment'
          });
        }
      }

      return out;
    },
  },

];
