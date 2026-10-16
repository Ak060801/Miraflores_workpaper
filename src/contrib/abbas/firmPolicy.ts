// ============================================================================
// ABBAS-SLOT 3: Firm policy extensions (beyond the starter standards)
// Owner: Abbas. Status: ONE EXAMPLE RULE (Claude). Replace / extend.
// Spec: src/contrib/abbas/README.md#slot-3
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
  author: 'example' | 'abbas';
  test: (c: PolicyContext) => { ref: string; message: string }[];
}

export const POLICIES: Policy[] = [
  {
    id: 'example-low-confidence',
    author: 'example',
    blocks: 'reviewer',
    text: 'Example (replace): any extracted value read below 0.60 confidence that reaches the return needs a recorded verification before reviewer sign-off.',
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
];
