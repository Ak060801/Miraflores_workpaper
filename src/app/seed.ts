// Demo season: workpaper activity between engagement and 2026-06-24, so the
// prototype opens mid-season with history to look at (stale sign-offs, open
// review notes, verifications, time). Every seeded event is flagged seed:true.
// "Reset" in Firm settings clears everything back to the packet alone.

import type { Model } from '../data/model';
import { versionAt, AREAS } from '../data/model';
import { project, areaSnapshot, fingerprint } from '../store/projections';
import type { WPEvent } from '../store/events';

export function buildSeed(m: Model): WPEvent[] {
  const out: WPEvent[] = [];
  let n = 0;
  const add = (at: string, actor: string, role: string, type: WPEvent['type'], target: string | undefined, data: any, batch?: string) => {
    out.push({ id: `wp-seed-${String(++n).padStart(3, '0')}`, at, wall: at, actor, role, type, target, data, batch, seed: true });
  };
  const signoff = (at: string, actor: string, role: string, area: string, level: string) => {
    const vi = versionAt(m, at);
    const wp = project(m, vi, out.filter((e) => e.at <= at));
    const snapshot = areaSnapshot(m, wp, area);
    add(at, actor, role, 'signoff', area, { level, snapshot, fingerprint: fingerprint(snapshot), version: vi.v.version });
  };

  // Assignments (firm administrator, at engagement start)
  for (const a of AREAS) {
    add('2026-03-05T16:00:00.000Z', 'st-05', 'firm_administrator', 'assign', a.id, { role: 'preparer', staff: 'st-01', due: '2026-03-27' });
    add('2026-03-05T16:00:01.000Z', 'st-05', 'firm_administrator', 'assign', a.id, { role: 'reviewer', staff: 'st-02', due: '2026-04-08' });
  }
  add('2026-03-05T16:00:02.000Z', 'st-05', 'firm_administrator', 'assign', 'return', { role: 'partner', staff: 'st-03', due: '2026-10-08' });

  // Intake
  add('2026-03-09T15:30:00.000Z', 'st-01', 'preparer', 'time.log', 'intake_and_engagement', { hours: 1.2, note: 'Organizer, IDs, engagement, prior-year return and prior workpaper' });
  add('2026-03-09T15:40:00.000Z', 'st-01', 'preparer', 'step.complete', undefined, { step: 'Engagement letter and consents signed', note: 'D01, D02 signed 01/12/2026' });
  add('2026-03-09T15:41:00.000Z', 'st-01', 'preparer', 'step.complete', undefined, { step: 'Identity verified', note: 'Texas licenses D04, D05; IP PIN notice D03' });
  add('2026-03-09T15:42:00.000Z', 'st-01', 'preparer', 'step.complete', undefined, { step: 'Prior-year return reviewed', note: 'D06 and prior preparer export D07; open items carried to Judgment' });
  add('2026-03-09T15:50:00.000Z', 'st-01', 'preparer', 'doc.disposition', 'D07', { status: 'informational', reason: 'Prior preparer narrative export; content reproduced as prior-year data. Four open items carried forward.' });
  add('2026-03-09T15:51:00.000Z', 'st-01', 'preparer', 'doc.disposition', 'D70', { status: 'informational', reason: '2023 CP2000 resolved with no change; no 2025 effect. Kept for history.' });

  // Wages: verify the W-2 boxes on the return
  const w2evs = ['ev-0016', 'ev-0017', 'ev-0019', 'ev-0020', 'ev-0030', 'ev-0031', 'ev-0035', 'ev-0036', 'ev-0038', 'ev-0039', 'ev-0041', 'ev-0047', 'ev-0048'];
  add('2026-03-10T17:00:00.000Z', 'st-01', 'preparer', 'verify', w2evs[0], { targets: w2evs, method: 'agreed_to_source_document', note: 'W-2 boxes agreed to D08 and D09; D10 is a phone photo of D09' }, 'b-seed-w2');
  add('2026-03-10T17:05:00.000Z', 'st-01', 'preparer', 'verify', 'F1040.1a', { targets: ['F1040.1a', 'F1040.25a', 'Sch3.11'], method: 'recalculated', note: 'Box 1 / box 2 sums and excess SS recomputed' });
  add('2026-03-10T17:30:00.000Z', 'st-01', 'preparer', 'time.log', 'wages_and_stock_compensation', { hours: 2.5, note: 'W-2s, stock plan statement, ISO/ESPP forms' });
  add('2026-03-12T16:30:00.000Z', 'st-01', 'preparer', 'time.log', 'tax_and_payments', { hours: 0.5, note: 'Pulled IRS transcript' });

  signoff('2026-03-20T18:00:00.000Z', 'st-01', 'preparer', 'wages_and_stock_compensation', 'preparer');

  // Investments
  add('2026-03-24T15:00:00.000Z', 'st-01', 'preparer', 'time.log', 'investments_and_digital_assets', { hours: 3.5, note: 'Brightpath 260 lots, Meridian corrected 1099, Coinhaven' });
  signoff('2026-03-25T19:00:00.000Z', 'st-01', 'preparer', 'investments_and_digital_assets', 'preparer');

  // Business
  add('2026-03-26T17:45:00.000Z', 'st-01', 'preparer', 'time.log', 'business', { hours: 2.0, note: 'Client call with Erik (call-01); books review' });
  add('2026-03-26T17:50:00.000Z', 'st-01', 'preparer', 'evidence.attach', 'SchC.25', { name: 'Call notes 03/26', kind: 'note', text: 'Erik: business share of his mobile line ~70%; home internet ~50%; Spotify Family is personal (booked by mistake). See call-01.' });
  signoff('2026-03-27T21:00:00.000Z', 'st-01', 'preparer', 'business', 'preparer');

  // Review notes from the reviewer
  add('2026-03-30T15:10:00.000Z', 'st-02', 'reviewer', 'note.open', 'SchC.44a', { text: 'Business miles 11,800 vs 7,400 in 2024 (+59%), with the move mid-year. Tie the page totals to the log before I sign; the odometer only shows 17,740 total miles.', blocking: true, area: 'business' });
  add('2026-03-30T15:20:00.000Z', 'st-02', 'reviewer', 'note.open', 'F7203.1', { text: 'Stock basis assumes no change in 2023 because the K-1 is missing. The gain on excess distributions depends on it. Get the 2023 Woodworks K-1 before filing.', blocking: true, area: 'pass_throughs_and_basis' });
  signoff('2026-04-02T16:00:00.000Z', 'st-02', 'reviewer', 'wages_and_stock_compensation', 'reviewer');
  add('2026-04-02T16:30:00.000Z', 'st-02', 'reviewer', 'time.log', 'wages_and_stock_compensation', { hours: 0.8, note: 'Review' });

  // Extension (packet: extension-2026-04-14)
  const x = m.p.what_if.extension;
  add('2026-04-14T15:00:00.000Z', 'st-02', 'reviewer', 'extension.file', undefined, { federal: x.federal.paid_with_form_4868, california: x.california.paid_with_ftb_3519, basis: x.based_on_version });
  add('2026-04-14T15:05:00.000Z', 'st-02', 'reviewer', 'judgment', undefined, { kind: 'penalty', topic: 'Extension payment', decision: `Paid ${x.federal.paid_with_form_4868.toLocaleString()} with Form 4868 (v2 balance ${x.federal.estimated_balance.toLocaleString()} rounded up to the next 500). No FTB 3519 payment: California shows an overpayment. Any later increase accrues interest and failure-to-pay from 04/15.`, authority: 'IRC §6081, §6651(a)(2); Treas. Reg. §301.6081-4; FTB 3519 instructions', refs: ['timeline:extension-2026-04-14', 'v2'], area: 'tax_and_payments' });

  // Rentals and K-1 time
  add('2026-04-06T18:00:00.000Z', 'st-01', 'preparer', 'time.log', 'rentals_and_sale', { hours: 2.2, note: 'Owner statement, condo sale, depreciation roll' });
  add('2026-06-23T15:00:00.000Z', 'st-01', 'preparer', 'time.log', 'pass_throughs_and_basis', { hours: 1.4, note: 'Ridgeline K-1 and state supplement; 2023 Woodworks K-1' });

  // Questions to the client (answers arrive later in the season)
  add('2026-06-24T14:00:00.000Z', 'st-01', 'preparer', 'question.ask', undefined, { to: 'cu-02', text: 'Coinhaven lot C6 (0.05 BTC sold 06/18/2025) shows no cost basis. Where and when did you buy it, and for how much? Any record helps (exchange statement, bank statement).', about: ['F8949.H.C6', 'ev-0919'] });
  add('2026-06-24T14:05:00.000Z', 'st-01', 'preparer', 'question.ask', undefined, { to: 'cu-01', text: 'The St. Brigid receipt is handwritten and the first digit is unclear (1,500 or 7,500?). Can you confirm the amount and send the bank statement or check image?', about: ['ev-1049', 'SchA.11'] });

  return out.sort((a, b) => (a.at < b.at ? -1 : 1));
}
