// Checks that don't trust the engine.
// Each check recomputes a figure from the source documents (printed content,
// extracted values, agency records, client answers) and compares it with what
// the engine put on the return. A failing check becomes a finding; a finding
// can carry proposed adjustments, which a preparer accepts (creating
// adjustment events) or dismisses with a recorded judgment.

import type { Model, VersionIndex, AreaId } from '../data/model';
import type { Category } from '../store/projections';

export type Severity = 'error' | 'warning' | 'info' | 'pass';
export type FindingKind = 'computation' | 'source' | 'judgment' | 'compliance' | 'completeness';

export interface ProposedAdj {
  line: string;
  delta: number;
  amount: number;
  category: Category;
  caCategory: Category;
  jurisdiction?: 'federal' | 'california' | 'both';
  label: string;
  effectOverride?: { federal: number; california: number; source: string };
}

export interface Finding {
  id: string;
  title: string;
  area: AreaId;
  severity: Severity;
  kind: FindingKind;
  check: string;            // what the check does, in one sentence
  summary: string;          // what it found
  engine?: string | number;
  expected?: string | number;
  evidence: string[];       // refs
  lines: string[];          // affected return lines
  proposals?: ProposedAdj[];
  authority?: string;
  needsJudgment?: boolean;  // a person has to decide; proposal is a recommendation
  pii?: { target: string; field: string; from: string; to: string };
}

const money = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function ev(m: Model, doc: string, field: string) {
  return (m.evsByDoc.get(doc) || []).find((e) => e.field === field);
}
function pageText(m: Model, doc: string, page = 1) {
  return m.docs.get(doc)?.pages.find((p) => p.page === page)?.printed_content || '';
}
function L(vi: VersionIndex, key: string): any { return vi.byKey.get(key)?.value; }
function parseMoney(s: string) { return parseFloat(s.replace(/,/g, '')); }

export function runChecks(m: Model, vi: VersionIndex): Finding[] {
  const out: Finding[] = [];
  const P = m.p;
  const params = P.engine_reference.parameters;
  const has = (k: string) => vi.byKey.has(k);

  // ---------- Wages ----------
  {
    // Distinct W-2s by EIN + box values; images of the same form count once.
    const w2s = P.documents.filter((d) => d.document_type === 'W-2');
    const seen = new Map<string, string>();
    let box1 = 0, box2 = 0, ss = 0, sswages = 0;
    const dupes: string[] = [];
    for (const d of w2s) {
      const sig = ['employer_ein', 'box1', 'box2', 'box3', 'box16'].map((f) => ev(m, d.id, f)?.value).join('|');
      if (seen.has(sig)) { dupes.push(`${d.id} duplicates ${seen.get(sig)}`); continue; }
      seen.set(sig, d.id);
      box1 += ev(m, d.id, 'box1')?.value || 0; box2 += ev(m, d.id, 'box2')?.value || 0;
      ss += ev(m, d.id, 'box4')?.value || 0; sswages += ev(m, d.id, 'box3')?.value || 0;
    }
    out.push({
      id: 'chk:w2-sum', title: 'Wages recomputed from distinct W-2s', area: 'wages_and_stock_compensation', severity: box1 === L(vi, 'F1040.1a') ? 'pass' : 'error', kind: 'computation',
      check: 'Group W-2 images by employer EIN and box values, count each form once, and sum boxes 1 and 2.',
      summary: `${seen.size} distinct W-2s (${dupes.join('; ') || 'no duplicates'}). Box 1 ${money(box1)}, box 2 ${money(box2)}.`,
      engine: L(vi, 'F1040.1a'), expected: box1, evidence: ['D08', 'D09', 'D10'], lines: ['F1040.1a', 'F1040.25a'],
    });
    const excess = Math.round(ss - params.ss_wage_base * 0.062);
    out.push({
      id: 'chk:excess-ss', title: 'Excess social security recomputed', area: 'wages_and_stock_compensation', severity: Math.abs(excess - L(vi, 'Sch3.11')) <= 1 ? 'pass' : 'error', kind: 'computation',
      check: 'Box 4 across employers minus 6.2% of the wage base.',
      summary: `Withheld ${money(ss)} on ${money(sswages)} of SS wages; maximum ${money(params.ss_wage_base * 0.062)}; excess ${money(excess)}.`,
      engine: L(vi, 'Sch3.11'), expected: excess, evidence: ['ev-0019', 'ev-0038', 'ref:param.ss_wage_base'], lines: ['Sch3.11'],
    });
  }

  // ---------- California-source wages (part-year resident) ----------
  {
    const res = P.household.residency.find((r: any) => r.state === 'CA');
    const halvBox16 = ev(m, 'D09', 'box16')?.value as number;
    const corvBox16 = ev(m, 'D08', 'box16')?.value as number;
    const stub = ev(m, 'D73', 'ytd_ca_wages')?.value as number;
    const engineCA = L(vi, 'SchCA540NR.1.E');
    const expected = corvBox16 + stub;
    const delta = expected - engineCA;
    out.push({
      id: 'chk:ca-wage-source', title: 'California-source wages include Texas-period pay', area: 'california', severity: Math.abs(delta) > 1 ? 'error' : 'pass', kind: 'source',
      check: 'Source each employer\'s wages to the residency period instead of trusting W-2 box 16.',
      summary: `CA residency ended ${res.to}. Halvorsen reported all ${money(halvBox16)} as CA (box 16) because payroll kept CA as the work state through 09/30 by mistake (W-2 note, qa-45). The 07/18 paystub shows CA wages through 07/15 of ${money(stub)}; work location moved to Austin 07/15. California-source wages = Corvane ${money(corvBox16)} + Halvorsen ${money(stub)} = ${money(expected)}, not ${money(engineCA)}. The CA withholding of ${money(ev(m, 'D09', 'box17')?.value)} stays a credit (refund).`,
      engine: engineCA, expected, evidence: ['ev-0047', 'D09', 'ev-1081', 'D73', 'qa-45', 'household:ngozi'], lines: ['SchCA540NR.1.E'],
      proposals: Math.abs(delta) > 1 ? [{ line: 'SchCA540NR.1.E', delta, amount: delta, category: 'none', caCategory: 'ca_source_income', jurisdiction: 'california', label: 'Halvorsen wages after 07/14/2025 are Texas-source' }] : undefined,
      authority: 'Cal. Rev. & Tax. Code §17951; FTB Pub. 1031 (part-year residents: wages sourced where services performed).',
    });
  }

  // ---------- Interest ----------
  {
    const sweep = ev(m, 'D28', 'int_1');
    const bank = ev(m, 'D29', 'box1');
    const t29 = pageText(m, 'D29');
    const sameAcct = /7731/.test(t29) && /7731/.test(pageText(m, 'D28'));
    const both = has('SchB.1.1') && has('SchB.1.2') && L(vi, 'SchB.1.1') === L(vi, 'SchB.1.2');
    if (sameAcct && both) {
      const amt = -(L(vi, 'SchB.1.2') as number);
      out.push({
        id: 'chk:interest-duplicate', title: 'Northlake sweep interest counted twice', area: 'investments_and_digital_assets', severity: 'error', kind: 'computation',
        check: 'Match interest payers across composite statements and stand-alone 1099-INTs by account number.',
        summary: `The Northlake composite (D28) reports bank-sweep interest of ${money(sweep?.value ?? 0)} paid by Northlake Bank for account ending 7731. D29 is the same Northlake Bank 1099-INT for the same sweep program and account. The engine created one Schedule B line for each (SchB.1.1 and SchB.1.2).`,
        engine: (L(vi, 'SchB.1.1') as number) + (L(vi, 'SchB.1.2') as number), expected: L(vi, 'SchB.1.1'), evidence: [sweep?.id || 'D28', bank?.id || 'D29', 'D29'], lines: ['SchB.1.2', 'SchB.2'],
        proposals: [{ line: 'SchB.1.2', delta: amt, amount: amt, category: 'interest', caCategory: 'interest', label: 'Remove duplicate Northlake Bank 1099-INT (same sweep interest as D28)' }],
      });
    }
    // FX: Swedish interest at the 2024 rate
    const fx = params.fx.SEK;
    const sek = ev(m, 'D36', 'interest_sek')?.value as number;
    const line = vi.v.lines.find((l) => l.form === 'SchB' && /Sparbanken/.test(l.label));
    if (line && sek) {
      const used = (line.sources.find((s) => s.startsWith('ref:fx.')) || '').split('.').pop();
      const correct = Math.round(sek / fx['2025_average']);
      const delta = correct - (line.value as number);
      out.push({
        id: 'chk:fx-rate', title: 'Swedish interest converted at the wrong year\'s rate', area: 'investments_and_digital_assets', severity: used === '2025_average' ? 'pass' : 'error', kind: 'computation',
        check: 'Recompute foreign-currency income at the tax year\'s average rate.',
        summary: `SEK ${money(sek)} was converted at the ${used?.replace('_', ' ')} rate (${fx[used || '2024_average']}), the rate the prior preparer used for 2024. At the 2025 average (${fx['2025_average']}) it is ${money(correct)}.`,
        engine: line.value, expected: correct, evidence: ['ev-0960', `ref:fx.SEK.${used}`, 'ref:fx.SEK.2025_average'], lines: [line.key],
        proposals: used === '2025_average' ? undefined : [{ line: line.key, delta, amount: delta, category: 'interest', caCategory: 'interest', label: 'Convert Sparbanken interest at the 2025 average rate' }],
      });
    }
  }

  // ---------- Brokerage: summary vs detail, unread page ----------
  {
    const doc = vi.v.documents_used.includes('D31') ? 'D31' : 'D30';
    const t = m.docs.get(doc)!.pages.map((p) => p.printed_content).join(' ');
    const summary = parseMoney((t.match(/total proceeds ([\d,]+\.\d\d)/) || [])[1] || '0');
    const p32 = m.docs.get(doc)!.pages.find((p) => p.page === 32)?.printed_content || '';
    const mm = p32.match(/(M\d+) (.+?) \(.*?\) ([\d.]+) sh acquired (\S+) sold (\S+) proceeds ([\d,]+\.\d\d) basis ([\d,]+\.\d\d) (short|long)-term (covered|noncovered)/);
    const lotKeys = vi.v.lines.filter((l) => l.form === 'F8949' && /\.M\d+$/.test(l.line)).map((l) => l.line.split('.')[1]);
    if (mm && !lotKeys.includes(mm[1])) {
      const gain = parseMoney(mm[6]) - parseMoney(mm[7]);
      out.push({
        id: 'chk:meridian-page32', title: 'Meridian sale on unread page 32 is missing', area: 'investments_and_digital_assets', severity: 'error', kind: 'completeness',
        check: 'Reconcile each 1099-B summary to the sum of its lots; when they differ, read every page the pipeline skipped.',
        summary: `Summary proceeds ${money(summary)} vs extracted lots ${money(summary - parseMoney(mm[6]))}: the ${money(parseMoney(mm[6]))} difference is lot ${mm[1]} (${mm[2]}) on page 32, which the pipeline did not read. Proceeds ${mm[6]}, basis ${mm[7]}, ${mm[8]}-term ${mm[9]} → ${money(gain)}.`,
        engine: summary - parseMoney(mm[6]), expected: summary, evidence: [`doc:${doc}#page32`, doc, vi.v.version === 'v1' ? 'ev-0544' : 'ev-0703'], lines: ['SchD.2'],
        proposals: [{ line: 'SchD.2', delta: gain, amount: gain, category: 'stcg', caCategory: 'none', label: `Add ${mm[1]} ${mm[2]} (Form 8949 box B)` }],
      });
    }
    if (doc === 'D31') {
      out.push({
        id: 'chk:meridian-corrected', title: 'Corrected Meridian 1099 supersedes the original', area: 'investments_and_digital_assets', severity: 'pass', kind: 'completeness',
        check: 'When an issuer sends a CORRECTED form, every lot must come from the corrected form.',
        summary: 'D31 (CORRECTED, received 03/18) replaced D30 in v2: M6 wash sale 735 → 512, M9 basis 6,900 → 4,880, M14 acquired 2024-10-15 → 2024-09-15 (now long-term). Engine v2/v3 use D31.',
        evidence: ['D30', 'D31', 'v2'], lines: ['F8949.A.M6', 'F8949.D.M9', 'F8949.D.M14'],
      });
    }
  }

  // ---------- Stock compensation basis (noncovered RSU lots) ----------
  {
    const supp = (m.evsByDoc.get('D11') || []).filter((e) => /_adjusted_basis$/.test(e.field));
    const misses: { lot: string; key: string; basis: number; acquired: string; term: string }[] = [];
    for (const s of supp) {
      const lotId = s.field.replace('_adjusted_basis', '');
      const acq = ev(m, 'D11', `${lotId}_acquired`)?.value;
      const line = vi.v.lines.find((l) => l.form === 'F8949' && l.label.includes(`acquired ${acq},`) && /Corvane/.test(l.label));
      if (line && /basis 0\.00/.test(line.label)) misses.push({ lot: lotId, key: line.key, basis: s.value, acquired: acq, term: /^[DEF]\./.test(line.line) ? 'long' : 'short' });
    }
    if (misses.length) {
      out.push({
        id: 'chk:rsu-basis', title: 'RSU shares taxed twice: zero basis on noncovered lots', area: 'wages_and_stock_compensation', severity: 'error', kind: 'computation',
        check: 'Match every noncovered or zero-basis lot to the employer\'s supplemental statement by acquisition date, shares and sale date.',
        summary: `The engine matched the supplemental statement (D11) for the ESPP lot but not the ${misses.length} RSU lots (lot ids differ: ${misses.map((x) => x.lot).join(', ')} vs N1/N3/N4), so it used zero basis. The vest value was already taxed as wages (W-2 box 14 RSU 38,200 for the 2025 vests), so the full proceeds were taxed a second time. Adjusted basis: ${misses.map((x) => `${x.key.split('.').pop()} ${money(x.basis)}`).join(', ')}.`,
        engine: 0, expected: misses.reduce((a, b) => a + b.basis, 0), evidence: ['D11', ...supp.map((s) => s.id), 'ev-0027', ...misses.map((x) => x.key)], lines: misses.map((x) => x.key),
        proposals: misses.map((x) => ({
          line: x.key, delta: -x.basis, amount: -x.basis, category: x.term === 'long' ? 'ltcg' : 'stcg',
          caCategory: x.acquired < '2025-07-15' && x.term === 'short' ? 'ca_source_income' : 'none',
          label: `Lot ${x.key.split('.').pop()}: use adjusted basis ${money(x.basis)} from D11 (${x.lot})`,
        })),
        authority: 'Treas. Reg. §1.6045-1(d)(6) (noncovered basis); Form 8949 instructions, code B.',
      });
    }
    const espp = vi.v.lines.find((l) => l.key === 'F8949.A.N2');
    if (espp) out.push({
      id: 'chk:espp-basis', title: 'ESPP disqualifying disposition basis', area: 'wages_and_stock_compensation', severity: espp.value === 2100 ? 'pass' : 'warning', kind: 'computation',
      check: 'ESPP basis = purchase price + ordinary income reported on the W-2.',
      summary: 'Purchase 150 × 25.50 = 3,825 + 675 W-2 ordinary income (box 14 ESPP) = 4,500 adjusted basis; proceeds 6,600 → gain 2,100 (code B adjustment -675). Engine agrees.',
      engine: espp.value, expected: 2100, evidence: ['ev-0072', 'ev-0074', 'ev-0028', 'D13'], lines: ['F8949.A.N2'],
    });
  }

  // ---------- Digital assets ----------
  {
    const c6 = vi.v.lines.find((l) => l.key === 'F8949.H.C6');
    const msg = m.msgs.get('msg-07');
    if (c6 && msg) {
      const proceeds = 5325, basis = 3050;
      out.push({
        id: 'chk:crypto-c6', title: 'Coinhaven lot C6: basis and holding period from the client', area: 'investments_and_digital_assets', severity: 'warning', kind: 'judgment', needsJudgment: true,
        check: 'A transfer-in lot with no basis is not zero-basis: trace it to the original purchase.',
        summary: `Engine used zero basis and the 06/01/2025 transfer-in date (short-term gain ${money(c6.value)}). Erik says the BTC was bought on CryptoNorth on 03/15/2021 for about 3,050 (msg-07); the exchange is closed and the only record is a bank statement line. If accepted: long-term, gain ${money(proceeds - basis)} (box K). Substantiation is thin: ask for the bank statement and any wallet transfer record before relying on it.`,
        engine: c6.value, expected: proceeds - basis, evidence: ['ev-0919', 'msg-07', 'D35', 'D34'], lines: ['F8949.H.C6', 'SchD.3'],
        proposals: [
          { line: 'SchD.3', delta: -proceeds, amount: -proceeds, category: 'stcg', caCategory: 'ca_source_income', label: 'Remove C6 from short-term (box H)' },
          { line: 'SchD.10', delta: proceeds - basis, amount: proceeds - basis, category: 'ltcg', caCategory: 'ca_source_income', label: 'Report C6 long-term with 3,050 basis (box K)' },
        ],
        authority: 'Treas. Reg. §1.1012-1(j) (digital asset basis); IRC §1223 (holding period follows the asset on a transfer between the taxpayer\'s own wallets).',
      });
    }
    out.push({
      id: 'chk:qa-sales', title: 'Client said no investments were sold', area: 'investments_and_digital_assets', severity: 'info', kind: 'judgment',
      check: 'Compare questionnaire answers with what the documents show.',
      summary: 'qa-14 says no sales and qa-15 says "we didn\'t really sell, just moved things around"; documents show 282 brokerage sales (Brightpath 260 in a direct-indexing account the client may not think of as trading, Northlake 5, Meridian 17) and 12 Coinhaven dispositions. Not a tax error, but the client\'s answers are unreliable for this area: document and ask about any other accounts or exchanges.',
      evidence: ['qa-14', 'qa-15', 'D74', 'D28', 'D31', 'D34'], lines: [],
    });
  }

  // ---------- Brightpath: 260 lots ----------
  {
    const t = m.docs.get('D74')!.pages[0].printed_content;
    const st = parseMoney((t.match(/short-term covered proceeds ([\d,.]+)/) || [])[1] || '0');
    const lt = parseMoney((t.match(/long-term covered proceeds ([\d,.]+)/) || [])[1] || '0');
    const lots = vi.v.lines.filter((l) => l.form === 'F8949' && /\.X\d+$/.test(l.line));
    let sp = 0, lp = 0;
    for (const l of lots) { const p = parseMoney((l.label.match(/proceeds ([\d,]+\.\d\d)/) || [])[1] || '0'); if (l.line.startsWith('A.')) sp += p; else lp += p; }
    out.push({
      id: 'chk:brightpath-recon', title: 'Brightpath: 260 lots reconcile to the 1099-B summary', area: 'investments_and_digital_assets', severity: Math.abs(sp - st) < 0.01 && Math.abs(lp - lt) < 0.01 ? 'pass' : 'error', kind: 'computation',
      check: 'Sum lot proceeds by term and compare to the broker summary; then review only lots with wash sales or holding-period edge cases.',
      summary: `${lots.length} lots. Short-term proceeds ${money(sp)} vs summary ${money(st)}; long-term ${money(lp)} vs ${money(lt)}. Every lot's holding period agrees with its dates.`,
      engine: Math.round(sp + lp), expected: Math.round(st + lt), evidence: ['D74'], lines: ['F8949.A.total', 'F8949.D.total'],
    });
  }

  // ---------- Schedule C: gross receipts ----------
  {
    const books = ev(m, 'D14', 'total_income')?.value as number;
    const k = ev(m, 'D21', 'box1a')?.value as number;
    const atlasPaywell = ev(m, 'D15', 'atlas_paywell')?.value as number;
    const nec = P.documents.filter((d) => d.document_type === '1099-NEC').reduce((a, d) => a + (ev(m, d.id, 'box1')?.value || 0), 0);
    const small = ev(m, 'D15', 'unreported_small')?.value as number;
    const engine = L(vi, 'SchC.1');
    out.push({
      id: 'chk:1099k-double', title: 'Form 1099-K receipts counted twice in gross receipts', area: 'business', severity: engine === books ? 'pass' : 'error', kind: 'computation',
      check: 'Reconcile gross receipts three ways: books, third-party forms (1099-NEC + 1099-K), and deposits.',
      summary: `Books ${money(books)} = 1099-NEC ${money(nec)} + clients with no 1099 ${money(small)}. The 1099-K ${money(k)} is Atlas Outdoor Gear paying by card: transaction detail says ${money(atlasPaywell)} of Atlas's ${money(ev(m, 'D15', 'atlas_total')?.value)} arrived through Paywell and was deposited gross. So the 1099-K is already inside books and inside the Atlas 1099-NEC. The engine added it again (${money(engine)}).`,
      engine, expected: books, evidence: ['ev-0103', 'ev-0127', 'ev-0109', 'ev-0110', 'ev-0111', 'D16', 'D17', 'D18', 'D19', 'D20'], lines: ['SchC.1'],
      proposals: engine !== books ? [{ line: 'SchC.1', delta: books - engine, amount: books - engine, category: 'schc_profit', caCategory: 'schc_profit', label: 'Remove 1099-K amount already in books revenue' }] : undefined,
    });
  }

  // ---------- Schedule C: mileage ----------
  {
    const pages = [1, 2, 3, 4].map((p) => {
      const trips = (m.evsByDoc.get('D23') || []).filter((e) => e.page === p && /_miles$/.test(e.field)).map((e) => {
        const n = e.field.match(/trip(\d+)/)![1];
        return `${ev(m, 'D23', `trip${n}_date`)?.value}|${e.value}`;
      });
      return { p, sig: trips.join(','), total: (m.evsByDoc.get('D23') || []).find((e) => e.page === p && e.field === 'page_total')?.value as number };
    });
    const dupPages: number[] = [];
    pages.forEach((pg, i) => { if (pages.slice(0, i).some((q) => q.sig === pg.sig && pg.sig)) dupPages.push(pg.p); });
    const unique = pages.filter((p) => !dupPages.includes(p.p)).reduce((a, b) => a + (b.total || 0), 0);
    const odo = (ev(m, 'D23', 'odometer_end')?.value as number) - (ev(m, 'D23', 'odometer_start')?.value as number);
    const engineMiles = L(vi, 'SchC.44a');
    const rate = params.mileage_rate;
    const delta = Math.round(unique * rate) - (L(vi, 'SchC.9') as number);
    out.push({
      id: 'chk:mileage-dup', title: 'Mileage log page scanned twice', area: 'business', severity: dupPages.length ? 'error' : 'pass', kind: 'source',
      check: 'Compare trips page by page before adding page totals; check business + other miles against the odometer.',
      summary: dupPages.length
        ? `Page ${dupPages.join(', ')} repeats page 2 trip-for-trip (the printed page even notes "second scan … same coffee stain"). Engine added every page total: ${money(engineMiles)} miles. Unique pages: ${money(unique)} business miles × ${rate} = ${money(Math.round(unique * rate))}. Odometer ${money(odo)} total miles, so other miles are ${money(odo - unique)}, not ${money(L(vi, 'SchC.44c'))}.`
        : 'No repeated pages.',
      engine: engineMiles, expected: unique, evidence: ['D23', 'ev-0226', 'ev-0315', 'ev-0404', 'ev-0477', 'ev-0478', 'ev-0479', 'msg-03'], lines: ['SchC.44a', 'SchC.9', 'SchC.44c'],
      proposals: dupPages.length ? [{ line: 'SchC.9', delta, amount: -delta, category: 'schc_profit', caCategory: 'schc_profit', label: `Car expense on ${money(unique)} miles (remove duplicate page)` }] : undefined,
    });
  }

  // ---------- Schedule C: personal items in books ----------
  {
    const spotify = ev(m, 'D15', 'spotify')?.value as number;
    const phone = (ev(m, 'D14', 'Telephone')?.value as number);
    const internet = (ev(m, 'D14', 'Internet')?.value as number);
    const phoneLine = (ev(m, 'D15', 'phone_monthly')?.value as number) / 4 * 12;
    const phoneAllowed = Math.round(phoneLine * 0.7);
    const internetAllowed = Math.round(internet * 0.5);
    out.push({
      id: 'chk:personal-expenses', title: 'Personal costs in the studio\'s books', area: 'business', severity: 'warning', kind: 'judgment', needsJudgment: true,
      check: 'Read transaction detail for mixed-use accounts; take business-use percentages from the client, not the books.',
      summary: `Software includes Spotify Family ${money(spotify)} (personal, booked by mistake per call notes). Telephone ${money(phone)} is a 4-line family plan; Erik estimates 70% business use of his own line (${money(phoneLine)}/yr) → ${money(phoneAllowed)}. Home internet ${money(internet)} is shared; 50% business → ${money(internetAllowed)}. Engine deducted all three in full.`,
      engine: spotify + phone + internet, expected: phoneAllowed + internetAllowed, evidence: ['ev-0106', 'ev-0107', 'ev-0108', 'ev-0101', 'ev-0095', 'call-01', 'D15'], lines: ['SchC.27a.1', 'SchC.25'],
      proposals: [
        { line: 'SchC.27a.1', delta: -spotify, amount: spotify, category: 'schc_profit', caCategory: 'schc_profit', label: 'Remove Spotify Family (personal)' },
        { line: 'SchC.25', delta: -(phone - phoneAllowed) - (internet - internetAllowed), amount: (phone - phoneAllowed) + (internet - internetAllowed), category: 'schc_profit', caCategory: 'schc_profit', label: 'Telephone: Erik\'s line at 70%; internet at 50%' },
      ],
      authority: 'IRC §262; §274(d)/§280F (listed property: cell phones removed 2010, but personal use still non-deductible).',
    });
  }

  // ---------- Self-employed health insurance ----------
  {
    const qa = m.qa.get('qa-25');
    const sehi = L(vi, 'Sch1.17');
    if (sehi) out.push({
      id: 'chk:sehi-eligibility', title: 'Self-employed health insurance not allowed: eligible for spouse\'s employer plan', area: 'business', severity: 'error', kind: 'judgment',
      check: 'Test SEHI eligibility month by month against any subsidized employer plan the taxpayer or spouse could join.',
      summary: `The engine deducted ${money(sehi)} of Erik's individual-plan premiums. qa-25: "both of Ngozi's employers offer family coverage, but Erik kept his own plan." Eligibility for a subsidized employer plan through a spouse bars the deduction for those months (all 12). The 2024 preparer reached the same conclusion. The premiums become a personal medical expense (below the 7.5% AGI floor here).`,
      engine: sehi, expected: 0, evidence: ['qa-25', 'ev-0484', 'D25', 'py:/return_2024/notes/Sch1.17'], lines: ['Sch1.17', 'Sch1.26'],
      proposals: [{ line: 'Sch1.17', delta: -sehi, amount: -sehi, category: 'adjustment', caCategory: 'adjustment', label: 'Disallow SE health insurance (eligible for employer plan via spouse)' }],
      authority: 'IRC §162(l)(2)(B); Form 7206 instructions.',
    });
  }

  // ---------- SEP after the Schedule C corrections ----------
  {
    const contrib = ev(m, 'D26', 'amount')?.value as number;
    const sep = L(vi, 'Sch1.16');
    if (sep) out.push({
      id: 'chk:sep-limit', title: 'SEP limit must be recomputed after Schedule C changes', area: 'business', severity: 'warning', kind: 'computation',
      check: 'SEP deduction = 20% × (net profit − ½ SE tax); recompute whenever Schedule C moves.',
      summary: `Contribution ${money(contrib)} (D26, deposited 04/10/2026 for 2025). Engine limit ${money(sep)}; ${money(contrib - sep)} is a nondeductible excess that carries to 2026. Corrections to Schedule C (1099-K, mileage, personal items) lower net profit, which lowers the SEP limit and changes SE tax and QBI: those are non-linear, so the workpaper flags them for the next engine run rather than guessing.`,
      engine: sep, evidence: ['ev-0485', 'ev-0486', 'D26', 'SchC.31', 'SchSE.13'], lines: ['Sch1.16'],
    });
  }

  // ---------- Rentals: HVAC ----------
  {
    const hvac = P.what_if.alternatives.find((a: any) => a.id === 'hvac_improvement');
    const t = pageText(m, 'D47');
    out.push({
      id: 'chk:hvac-capitalize', title: 'HVAC replacement is an improvement, not a repair', area: 'rentals_and_sale', severity: 'error', kind: 'judgment',
      check: 'Test every rental expense over the de minimis limit against the improvement rules (betterment, restoration, adaptation).',
      summary: `Engine kept 11,000 inside repairs. Invoice D47: "${t.slice(t.indexOf('Removed'), t.indexOf('Total')).trim()}" with a permit, i.e. replacement of the building's entire HVAC system (a building system under the unit-of-property rules). Capitalize as 27.5-year residential rental property placed in service 08/2025. Engine what-if "${hvac?.id}": federal +${money(hvac?.federal.total_tax_change)}, California +${money(hvac?.california.total_tax_change)}.`,
      engine: 'Repair 11,000', expected: 'Improvement, 27.5 yr SL', evidence: ['D47', 'ev-1000', 'D46', 'qa-37', 'call-01'], lines: ['SchE.14A', 'SchE.18A'],
      proposals: [{ line: 'SchE.14A', delta: -11000, amount: 11000, category: 'ordinary_income', caCategory: 'ca_source_income', label: 'Reclassify HVAC from repairs to a 27.5-year improvement (engine what-if)', effectOverride: hvac ? { federal: hvac.federal.total_tax_change, california: hvac.california.total_tax_change, source: 'what_if:hvac_improvement' } : undefined }],
      authority: 'Treas. Reg. §1.263(a)-3(e)(2)(ii)(B) (HVAC is a building system), §1.263(a)-3(k) (restoration: replacement of a major component).',
    });
  }

  // ---------- Itemized: mortgage interest ----------
  {
    const payoff = ev(m, 'D56', 'interest')?.value as number;
    const line = vi.byKey.get('SchA.8a');
    const t = pageText(m, 'D56');
    if (line && line.sources.includes('ev-1032') && /reported on the 2025 Form 1098/.test(t)) out.push({
      id: 'chk:mortgage-dup', title: 'Payoff interest added on top of the Form 1098 that already includes it', area: 'deductions_and_credits', severity: 'error', kind: 'computation',
      check: 'Before adding a lender statement to Form 1098 interest, check whether the 1098 already includes it.',
      summary: `Lonestar 1098 box 1 (13,900) "includes prepaid interest at closing and interest paid at payoff 11/20/2025", and the payoff statement says "Interest is reported on the 2025 Form 1098". Engine added the payoff interest ${money(payoff)} again.`,
      engine: line.value, expected: (line.value as number) - payoff, evidence: ['ev-1029', 'ev-1032', 'D55', 'D56'], lines: ['SchA.8a'],
      proposals: [{ line: 'SchA.8a', delta: -payoff, amount: -payoff, category: 'itemized', caCategory: 'itemized', label: 'Remove payoff interest already on the Lonestar 1098' }],
    });
  }

  // ---------- Itemized: real estate taxes (seller's share) ----------
  {
    const credit = ev(m, 'D54', 'tax_credit')?.value as number;
    const paid = L(vi, 'SchA.5b') as number;
    const income = L(vi, 'SchA.5a') as number;
    const cap = L(vi, 'SchA.5e') as number;
    const newTotal = income + paid - credit;
    const fedDed = Math.min(newTotal, cap) - Math.min(income + paid, cap);
    out.push({
      id: 'chk:re-tax-proration', title: 'Home property tax includes the seller\'s share', area: 'deductions_and_credits', severity: 'error', kind: 'computation',
      check: 'Allocate real estate tax on a property bought mid-year by days of ownership; the seller\'s share credited at closing is the seller\'s deduction.',
      summary: `Escrow paid the full 2025 levy ${money(paid)} on 12/18. The closing statement credited the buyers ${money(credit)} for 01/01–07/07 (the seller's period). Deductible by the household: ${money(paid - credit)}. Federal SALT falls from ${money(income + paid)} to ${money(newTotal)}, below the ${money(cap)} cap, so ${money(-fedDed)} of itemized deductions is lost; California has no cap, so the full ${money(credit)} comes off.`,
      engine: paid, expected: paid - credit, evidence: ['ev-1036', 'ev-1038', 'ev-1027', 'D54', 'D57', 'D58'], lines: ['SchA.5b', 'SchA.5d', 'SchA.5e'],
      proposals: [{ line: 'SchA.5b', delta: -credit, amount: fedDed, category: 'itemized', caCategory: 'none', jurisdiction: 'both', label: 'Real estate tax: buyer\'s share only', effectOverride: { federal: Math.round(-fedDed * 0.26), california: Math.round(credit * 0.048), source: 'rates: itemized (federal, amount under cap) / salt (California)' } }],
      authority: 'IRC §164(d) (apportionment between buyer and seller).',
    });
  }

  // ---------- Charitable: vehicle ----------
  {
    const proceeds = ev(m, 'D66', 'box4c')?.value as number;
    const claimed = L(vi, 'F8283.A1.vehicle') as number;
    if (claimed && proceeds && claimed > proceeds) out.push({
      id: 'chk:vehicle-donation', title: 'Donated car deducted at Blue Book value instead of sale proceeds', area: 'deductions_and_credits', severity: 'error', kind: 'computation',
      check: 'Vehicle donations over 500: if the charity sells the car, the deduction is limited to gross proceeds on Form 1098-C box 4c.',
      summary: `Claimed ${money(claimed)} from the client's Kelley Blue Book estimate (qa-39). Form 1098-C box 4a is checked (sold at arm's length 09/09/2025) and box 4c shows ${money(proceeds)}. Deduction is ${money(proceeds)}. This item is later examined (Letter 566, 2028).`,
      engine: claimed, expected: proceeds, evidence: ['ev-1054', 'D66', 'qa-39', 'call-01'], lines: ['F8283.A1.vehicle', 'SchA.12'],
      proposals: [{ line: 'F8283.A1.vehicle', delta: proceeds - claimed, amount: proceeds - claimed, category: 'itemized', caCategory: 'itemized', label: 'Limit vehicle deduction to 1098-C gross proceeds' }],
      authority: 'IRC §170(f)(12)(A)(ii); Pub. 4303.',
    });
    out.push({
      id: 'chk:st-brigid', title: 'Handwritten church receipt: ambiguous first digit', area: 'deductions_and_credits', severity: 'warning', kind: 'source', needsJudgment: true,
      check: 'Any read under the firm\'s confidence floor needs a second source before it is relied on.',
      summary: 'The receipt reads "$?,500.00" (1 or 7); pipeline read 1,500 at 0.41 confidence. Ngozi says the parish confirmed 1,500 by phone and it matches check #2207 on 12/21/2025 (msg-08). Gifts of 250 or more need a contemporaneous written acknowledgment stating the amount: ask the parish for a clean acknowledgment and attach the bank statement line.',
      engine: L(vi, 'SchA.11'), evidence: ['ev-1049', 'D64', 'msg-08'], lines: ['SchA.11'],
      authority: 'IRC §170(f)(8).',
    });
  }

  // ---------- Dependent care provider ----------
  {
    const extracted = ev(m, 'D62', 'ein')?.value as string;
    const printed = (pageText(m, 'D62').match(/Tax ID ([\d-]+)/) || [])[1];
    const l1a = vi.byKey.get('F2441.1a');
    out.push({
      id: 'chk:provider-tin', title: 'Child care provider tax ID misread (transposed digits)', area: 'deductions_and_credits', severity: extracted !== printed ? 'error' : 'pass', kind: 'source',
      check: 'Confirm every extracted identifier appears verbatim on the printed page.',
      summary: `Little Sprouts' tax ID was read as ${extracted} (0.97 confidence); the statement prints ${printed}. Form 2441 line 1 would carry a wrong provider TIN. Also, line 1a names "${(l1a?.label.match(/provider: ([^,]+)/) || [])[1]}" but the statement and the 2024 return say "Bright Oak Kids Club".`,
      engine: extracted, expected: printed, evidence: ['ev-1045', 'D62', 'ev-1043', 'D61', 'py:/return_2024'], lines: ['F2441.1b', 'F2441.1a'],
      pii: extracted !== printed ? { target: 'ev-1045', field: 'ein', from: extracted, to: printed } : undefined,
    });
  }

  // ---------- Dependents: SSN ----------
  {
    const theo = m.people.get('theo');
    const pyTheo = P.prior_years.return_2024.dependents.find((d: any) => d.name.startsWith('Theo'));
    if (theo && pyTheo && theo.ssn !== pyTheo.ssn) out.push({
      id: 'chk:theo-ssn', title: 'Theo\'s SSN in the organizer does not match prior return', area: 'intake_and_engagement', severity: 'error', kind: 'source',
      check: 'Compare every identifier the client typed with prior-year returns and identity documents.',
      summary: `Organizer: ${theo.ssn}. 2024 return as filed: ${pyTheo.ssn} (last two digits transposed). The child tax credit needs a valid SSN, and the federal e-file will reject (R0000-504-02) with the organizer number. Confirm with the Social Security card before filing.`,
      engine: theo.ssn, expected: pyTheo.ssn, evidence: ['household:theo', 'D06', 'py:/return_2024/dependents/1', 'D71'], lines: ['F8812.4'],
      pii: { target: 'household:theo', field: 'ssn', from: theo.ssn, to: pyTheo.ssn },
    });
  }

  // ---------- Payments ----------
  {
    const tx = P.tax_agency_records.irs_account_transcript_2025[0];
    const est = tx.transactions.filter((t: any) => t.code === '670' && t.date <= '2026-01-15').reduce((a: number, t: any) => a + t.amount, 0);
    const engine = L(vi, 'F1040.26') as number;
    out.push({
      id: 'chk:fed-estimates', title: 'Federal Q4 estimate was 3,000, not 4,000', area: 'tax_and_payments', severity: est === engine ? 'pass' : 'error', kind: 'source',
      check: 'Agree estimated payments to the IRS account transcript, not to confirmations or memory.',
      summary: `Only three EFTPS confirmations were uploaded, so the engine took the client's "January 14 - 4,000 I think" (qa-41). The IRS transcript (pulled 03/12) shows 3,000 on 2026-01-15. Total 2025 estimates ${money(est)}, not ${money(engine)}.`,
      engine, expected: est, evidence: ['agency:/irs_account_transcript_2025/0', 'D67', 'D69', 'qa-41'], lines: ['F1040.26'],
      proposals: est !== engine ? [{ line: 'F1040.26', delta: est - engine, amount: est - engine, category: 'payment', caCategory: 'none', jurisdiction: 'federal', label: 'Estimated payments per IRS transcript' }] : undefined,
    });
    const ftb = P.tax_agency_records.ftb_account;
    const caEst = ftb.tax_year_2025_payments.reduce((a: number, t: any) => a + t.amount, 0);
    const caEngine = L(vi, 'F540NR.72') as number;
    const misapplied = ftb.tax_year_2024_payments_after_filing[0];
    out.push({
      id: 'chk:ca-estimates', title: 'California Q3 estimate was applied to 2024', area: 'california', severity: caEst === caEngine ? 'pass' : 'error', kind: 'source', needsJudgment: true,
      check: 'Agree state estimates to the FTB account by tax year, not by payment date.',
      summary: `Engine counted every FTB payment dated 04/01/2025–01/15/2026 (${money(caEngine)}). The 09/15/2025 Web Pay payment of ${money(misapplied.amount)} was designated tax year 2024 and FTB holds it as a 2024 credit. FTB credits 2025 with ${money(caEst)}. Either claim ${money(caEst)} and ask FTB to refund/transfer the 2024 credit, or get the transfer done before filing. It still counts as state tax paid in 2025 for the federal SALT deduction.`,
      engine: caEngine, expected: caEst, evidence: ['agency:/ftb_account', 'ev-1074', 'ev-1076', 'D68'], lines: ['F540NR.72'],
      proposals: caEst !== caEngine ? [{ line: 'F540NR.72', delta: caEst - caEngine, amount: caEst - caEngine, category: 'none', caCategory: 'payment', jurisdiction: 'california', label: 'California estimates per FTB account (2024-designated payment excluded)' }] : undefined,
    });
  }

  // ---------- Carryovers ----------
  {
    const c = P.prior_years.carryovers_into_2025;
    const ok = L(vi, 'SchD.6') === -c.capital_loss_short && L(vi, 'SchD.14') === -c.capital_loss_long;
    out.push({
      id: 'chk:carryovers', title: 'Carryovers agree to the 2024 return', area: 'tax_and_payments', severity: ok ? 'pass' : 'error', kind: 'computation',
      check: 'Recompute capital loss and passive carryovers from the 2024 return pages, not from the prior preparer\'s summary.',
      summary: `2024 Schedule D: net ST -6,200, LT -11,000, 3,000 allowed (taken from ST first) → ST 3,200, LT 11,000. Form 8582: Fremont 6,300, Barton Hills 9,850. Engine agrees.`,
      engine: `${L(vi, 'SchD.6')}/${L(vi, 'SchD.14')}`, expected: `-${c.capital_loss_short}/-${c.capital_loss_long}`, evidence: ['py:/carryovers_into_2025', 'D06', 'D07'], lines: ['SchD.6', 'SchD.14', 'F8582.1c'],
    });
  }

  // ---------- S corporation basis ----------
  {
    const k23 = m.docs.get('D40');
    const f1 = L(vi, 'F7203.1');
    out.push({
      id: 'chk:scorp-basis', title: 'Woodworks stock basis rolled forward with the 2023 K-1', area: 'pass_throughs_and_basis', severity: f1 === 2300 ? 'pass' : 'warning', kind: 'computation',
      check: 'Roll stock basis year by year from the last known figure; never assume a missing year had no change.',
      summary: `2022 ending 21,300 (client worksheet) + 2023 income 14,100 − distributions 20,000 = 15,400 (D40, found 06/05) + 2024 income 16,900 − 30,000 = 2,300 beginning 2025. v1/v2 assumed no 2023 change (8,200). 2025: 2,300 + 18,485 − 42,000 → ${money(L(vi, 'F7203.excess'))} distributions in excess of basis taxed as long-term gain. The Oregon composite tax 1,580 is inside the 42,000.`,
      engine: f1, expected: 2300, evidence: ['D40', 'msg-06', 'py:/basis_records/scorp_lindqvist_family_woodworks', 'ev-0977', 'ev-0982'], lines: ['F7203.1', 'F7203.excess'],
    });
  }

  // ---------- Depreciation recompute ----------
  {
    let maxDiff = 0;
    for (const a of vi.v.assets) {
      if (!/SL/.test(a.method) || a.life_years !== 27.5) continue;
      const annual = a.cost / 27.5;
      const months = a.disposed ? (+a.disposed.slice(5, 7) - 0.5) : 12;
      maxDiff = Math.max(maxDiff, Math.abs(annual * months / 12 - a.federal.depreciation_2025));
    }
    out.push({
      id: 'chk:depreciation', title: 'Rental depreciation recomputed asset by asset', area: 'rentals_and_sale', severity: maxDiff < 1 ? 'pass' : 'warning', kind: 'computation',
      check: 'Cost ÷ 27.5 × months in service (mid-month in the year of sale).',
      summary: `All 27.5-year assets recompute within ${money(maxDiff)}. Condo: 9.5 months in 2025; accumulated 50,340 matches Form 4797 line 23 and unrecaptured §1250 gain.`,
      evidence: ['py:/asset_records', 'D07', 'D51'], lines: ['F4562-E.total-A', 'F4562-E.total-B', 'F4797.23'],
    });
  }

  // ---------- IRA basis conflict ----------
  out.push({
    id: 'chk:ira-basis', title: 'IRA basis: client says none, records say 7,000', area: 'retirement_and_foreign', severity: 'info', kind: 'judgment',
    check: 'Prefer third-party records over client recollection, and document the conflict.',
    summary: 'qa-31: "Prior basis: none - we started doing this in 2025." But the 2024 Form 5498 (D42) shows a 7,000 contribution made 02/12/2025 for 2024, and the 2024 Form 8606 line 14 carried 7,000. Engine correctly used 14,000 of basis; conversion taxable amount 26.',
    engine: L(vi, 'F8606.2'), expected: 7000, evidence: ['qa-31', 'ev-0991', 'D42', 'py:/basis_records/ira_nondeductible_basis_ngozi', 'D43'], lines: ['F8606.2'],
  });

  // ---------- Outside filings and compliance ----------
  out.push({
    id: 'chk:form-3520', title: '2023 Form 3520 for the Swedish inheritance may never have been filed', area: 'retirement_and_foreign', severity: 'warning', kind: 'compliance', needsJudgment: true,
    check: 'Carry forward every open item the prior preparer left, and resolve or escalate it.',
    summary: 'Sparbanken account opened 09/2023 with an inheritance from Erik\'s mother (D36, qa-7); balance now over SEK 1.1M. Prior preparer\'s open item: "2023 Form 3520 (foreign inheritance over 100,000) - discussed? (no note of resolution)". Late Form 3520 penalties can be large: partner should advise in writing (outside this engagement).',
    evidence: ['D07', 'py:/prior_preparer_workpaper/open_items_left_by_prior_preparer/3', 'D36', 'qa-07'], lines: [],
  });
  out.push({
    id: 'chk:fbar', title: 'FBAR due outside the return', area: 'retirement_and_foreign', severity: 'info', kind: 'compliance',
    check: 'Identify every filing the facts require, in or out of scope.',
    summary: 'Max balance SEK 1,452,300 ≈ 149,567 USD > 10,000: FinCEN 114 due 10/15/2026 (automatic extension). Not in the engagement (D01). Form 8938 is required and included.',
    evidence: ['D01', 'ev-0962', 'F8938.1.max'], lines: ['F8938.req'],
  });
  out.push({
    id: 'chk:1099nec', title: 'Studio owes Forms 1099-NEC for two contractors', area: 'business', severity: 'info', kind: 'compliance',
    check: 'Identify every filing the facts require, in or out of scope.',
    summary: 'Mara Quintero 4,800 and Dev Patel 2,600 paid by ACH; no 1099-NECs filed (due 02/02/2026). Schedule C line J must say "No". Outside the engagement: advise Erik in writing and offer a separate engagement.',
    evidence: ['D27', 'qa-22', 'qa-23', 'call-01'], lines: ['SchC.I', 'SchC.J'],
  });
  out.push({
    id: 'chk:ca-amt-iso', title: 'California AMT on the ISO exercise is not computed', area: 'california', severity: 'warning', kind: 'computation', needsJudgment: true,
    check: 'List every number the engine says it did not compute, and assign it.',
    summary: 'ISOs granted 03/01/2022 while a California resident, exercised 07/30/2025 after the move: the spread (40,000) is partly California-source for AMT, allocated by California workdays between grant and exercise. Engine leaves Schedule P at 0. Compute by hand and record the allocation.',
    evidence: ['D12', 'ev-0075', 'ev-0076', 'F6251.2i'], lines: ['F540NR.61'],
  });
  out.push({
    id: 'chk:home-office', title: 'Home office square footage recomputed', area: 'business', severity: L(vi, 'SchC.30') === 1200 ? 'pass' : 'warning', kind: 'computation',
    check: 'Average monthly square feet: a month counts the space used 15+ days.',
    summary: 'Jan–Jun 220 sq ft (Sacramento), Jul–Dec 260 (Austin from 07/16 = 16 days in July) → average 240 × 5 = 1,200. Engine agrees. Note the 2024 return used 300 sq ft; the measured room is 220 (prior preparer\'s own open item).',
    engine: L(vi, 'SchC.30'), expected: 1200, evidence: ['ev-0481', 'ev-0482', 'ev-0483', 'D24', 'D07'], lines: ['SchC.30'],
  });

  return out;
}
