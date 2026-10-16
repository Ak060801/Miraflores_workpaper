import type { Packet, Line, ReturnVersion, ExtractedValue, Document } from './types';

// ---------------------------------------------------------------------------
// Areas: how the workpaper groups the return for assignment, review and budget.
// Keys match firm.budget_hours where a budget exists.
// ---------------------------------------------------------------------------
export const AREAS = [
  { id: 'intake_and_engagement', name: 'Intake & engagement' },
  { id: 'wages_and_stock_compensation', name: 'Wages & stock compensation' },
  { id: 'investments_and_digital_assets', name: 'Investments & digital assets' },
  { id: 'business', name: 'Business (Schedule C)' },
  { id: 'rentals_and_sale', name: 'Rentals & condo sale' },
  { id: 'pass_throughs_and_basis', name: 'K-1s & basis' },
  { id: 'retirement_and_foreign', name: 'Retirement, HSA & foreign' },
  { id: 'deductions_and_credits', name: 'Deductions & credits' },
  { id: 'tax_and_payments', name: 'Tax computation & payments' },
  { id: 'california', name: 'California (540NR)' },
] as const;
export type AreaId = (typeof AREAS)[number]['id'];

const F1040_AREA: Record<string, AreaId> = {
  '1a': 'wages_and_stock_compensation', '1z': 'wages_and_stock_compensation',
  '2b': 'investments_and_digital_assets', '3a': 'investments_and_digital_assets', '3b': 'investments_and_digital_assets', '7': 'investments_and_digital_assets',
  '4a': 'retirement_and_foreign', '4b': 'retirement_and_foreign',
  '8': 'tax_and_payments', '9': 'tax_and_payments', '10': 'tax_and_payments', '11': 'tax_and_payments',
  '12': 'deductions_and_credits', '13': 'business', '14': 'deductions_and_credits', '19': 'deductions_and_credits',
};

export function areaOfLine(l: { key: string; form: string; line: string; jurisdiction: string }): AreaId {
  const f = l.form, ln = l.line;
  if (l.jurisdiction === 'california' || f.startsWith('FTB') || f === 'ScheduleS') return 'california';
  if (f === 'F1040') return F1040_AREA[ln] ?? 'tax_and_payments';
  if (f === 'SchB') return ln.startsWith('7') || ln === '8' ? 'retirement_and_foreign' : 'investments_and_digital_assets';
  if (f === 'F8949') return ln.startsWith('F.') ? 'pass_throughs_and_basis' : 'investments_and_digital_assets';
  if (f === 'SchD') return ln === '11' || ln === '19' ? 'rentals_and_sale' : ln === '12' ? 'pass_throughs_and_basis' : 'investments_and_digital_assets';
  if (f === 'SchC' || f === 'SchSE' || f === 'F4562-C' || f === 'F8995') return 'business';
  if (f === 'Sch1') return ['3', '15', '16', '17'].includes(ln) ? 'business' : ln === '13' ? 'retirement_and_foreign' : ln === '5' ? 'rentals_and_sale' : 'tax_and_payments';
  if (f === 'SchE') return ln.startsWith('28') || ln === '32' ? 'pass_throughs_and_basis' : 'rentals_and_sale';
  if (f === 'F4562-E' || f === 'F4797' || f === 'F8582') return 'rentals_and_sale';
  if (f === 'F7203') return 'pass_throughs_and_basis';
  if (f === 'F8606' || f === 'F8889' || f === 'F8938') return 'retirement_and_foreign';
  if (f === 'SchA' || f === 'F8283' || f === 'F8812' || f === 'F8863' || f === 'F2441' || f === 'F8867') return 'deductions_and_credits';
  if (f === 'F8959') return 'wages_and_stock_compensation';
  if (f === 'F8960') return 'investments_and_digital_assets';
  if (f === 'Sch3') return ln === '1' ? 'investments_and_digital_assets' : ln === '11' ? 'wages_and_stock_compensation' : 'tax_and_payments';
  return 'tax_and_payments';
}

// Documents also belong to an area, so "every document accounted for" can be
// assigned and reviewed with the rest of the area.
export function areaOfDoc(d: Document): AreaId {
  const t = d.document_type;
  if (['engagement_letter', 'consent_7216', 'irs_ip_pin_notice', 'identity_document', 'prior_year_return', 'prior_workpaper', 'irs_transcript', 'irs_notice'].includes(t)) return 'intake_and_engagement';
  if (['W-2', 'stock_plan_supplement', '3921', '3922', 'paystub'].includes(t)) return 'wages_and_stock_compensation';
  if (['1099-composite', '1099-INT', '1099-DA', 'transaction_export'].includes(t)) return 'investments_and_digital_assets';
  if (['books_profit_loss', 'books_transaction_detail', '1099-NEC', '1099-K', 'invoice', 'mileage_log', 'client_note', 'insurance_statement', 'books_report'].includes(t))
    return d.id === 'D47' ? 'rentals_and_sale' : 'business';
  if (['rental_owner_statement', 'property_tax_bill', 'rental_ledger', 'closing_statement_seller', '1099-S'].includes(t)) return 'rentals_and_sale';
  if (['K-1-1065', 'K-1-state-supplement', 'K-1-1120S'].includes(t)) return 'pass_throughs_and_basis';
  if (['retirement_contribution', '1099-R', '5498', '1099-SA', '5498-SA', 'foreign_bank_statement'].includes(t)) return t === 'retirement_contribution' ? 'business' : 'retirement_and_foreign';
  if (['payment_confirmation'].includes(t)) return 'tax_and_payments';
  if (t === '1098') return d.id === 'D48' || d.id === 'D53' ? 'rentals_and_sale' : 'deductions_and_credits';
  return 'deductions_and_credits';
}

// ---------------------------------------------------------------------------
// Model: the packet plus indexes. Built once, read-only.
// ---------------------------------------------------------------------------
export interface VersionIndex {
  v: ReturnVersion;
  byKey: Map<string, Line>;
  downstream: Map<string, string[]>;
  signs: Map<string, number[]>; // per R-SUM line, sign of each input (+1/-1), when solvable
}

export interface Model {
  p: Packet;
  docs: Map<string, Document>;
  evs: Map<string, ExtractedValue>;
  evsByDoc: Map<string, ExtractedValue[]>;
  versions: VersionIndex[];
  versionById: Map<string, VersionIndex>;
  staff: Map<string, any>;
  qa: Map<string, any>;
  msgs: Map<string, any>;
  calls: Map<string, any>;
  people: Map<string, any>;
}

function solveSigns(line: Line, byKey: Map<string, Line>): number[] | null {
  const vals = line.inputs.map((k) => byKey.get(k)?.value);
  if (vals.some((v) => typeof v !== 'number')) return null;
  const target = typeof line.value === 'number' ? line.value : NaN;
  if (Number.isNaN(target)) return null;
  const n = vals.length;
  const sumAll = vals.reduce((a, b) => a + b, 0);
  if (Math.abs(sumAll - target) < 1.01) return vals.map(() => 1);
  if (n > 14) return null;
  // first input positive, others free: find the sign vector that reproduces the value
  for (let mask = 0; mask < 1 << (n - 1); mask++) {
    let s = vals[0];
    const signs = [1];
    for (let i = 1; i < n; i++) {
      const sg = mask & (1 << (i - 1)) ? -1 : 1;
      signs.push(sg);
      s += sg * vals[i];
    }
    if (Math.abs(s - target) < 1.01) return signs;
  }
  return null;
}

function indexVersion(v: ReturnVersion): VersionIndex {
  const byKey = new Map(v.lines.map((l) => [l.key, l] as const));
  const downstream = new Map<string, string[]>();
  for (const l of v.lines) for (const i of l.inputs || []) {
    if (!downstream.has(i)) downstream.set(i, []);
    downstream.get(i)!.push(l.key);
  }
  const signs = new Map<string, number[]>();
  for (const l of v.lines) {
    if ((l.rule === 'R-SUM' || l.rule === 'R-CARRY') && l.inputs?.length) {
      const s = l.rule === 'R-CARRY' && l.inputs.length === 1 ? [1] : solveSigns(l, byKey);
      if (s) signs.set(l.key, s);
    }
  }
  return { v, byKey, downstream, signs };
}

export async function loadModel(url = '/packet.json'): Promise<Model> {
  const res = await fetch(url);
  const p: Packet = await res.json();
  return __indexPacket(p);
}

export function __indexPacket(p: Packet): Model {
  const docs = new Map(p.documents.map((d) => [d.id, d] as const));
  const evs = new Map(p.extracted_values.map((e) => [e.id, e] as const));
  const evsByDoc = new Map<string, ExtractedValue[]>();
  for (const e of p.extracted_values) {
    if (!evsByDoc.has(e.document_id)) evsByDoc.set(e.document_id, []);
    evsByDoc.get(e.document_id)!.push(e);
  }
  const versions = p.return_versions.map(indexVersion);
  return {
    p, docs, evs, evsByDoc, versions,
    versionById: new Map(versions.map((v) => [v.v.version, v] as const)),
    staff: new Map(p.firm.staff.map((s: any) => [s.id, s] as const)),
    qa: new Map(p.client.questionnaire.map((q) => [q.id, q] as const)),
    msgs: new Map(p.client.messages.map((q) => [q.id, q] as const)),
    calls: new Map(p.client.call_notes.map((q) => [q.id, q] as const)),
    people: new Map(p.household.people.map((q: any) => [q.id, q] as const)),
  };
}

// Version current at a moment in time (the replay clock).
export function versionAt(m: Model, at: string): VersionIndex {
  let cur = m.versions[0];
  for (const v of m.versions) if (v.v.computed_at <= at) cur = v;
  return cur;
}

// ---------------------------------------------------------------------------
// Reverse index: which lines use a given extracted value / document.
// ---------------------------------------------------------------------------
export function linesUsingEv(vi: VersionIndex, evId: string): Line[] {
  return vi.v.lines.filter((l) => l.sources?.includes(evId));
}

export function linesUsingDoc(m: Model, vi: VersionIndex, docId: string): { line: Line; via: string[] }[] {
  const evIds = new Set((m.evsByDoc.get(docId) || []).map((e) => e.id));
  const out: { line: Line; via: string[] }[] = [];
  for (const l of vi.v.lines) {
    const via = (l.sources || []).filter((s) => evIds.has(s) || s === docId || s.startsWith(`doc:${docId}#`));
    if (via.length) out.push({ line: l, via });
  }
  return out;
}

// Upstream closure of a line (inputs, recursively) - used for trace trees and
// for sign-off fingerprints.
export function upstream(vi: VersionIndex, key: string, seen = new Set<string>()): Set<string> {
  if (seen.has(key)) return seen;
  seen.add(key);
  const l = vi.byKey.get(key);
  for (const i of l?.inputs || []) upstream(vi, i, seen);
  return seen;
}

export function downstreamClosure(vi: VersionIndex, key: string, seen = new Set<string>()): Set<string> {
  for (const d of vi.downstream.get(key) || []) {
    if (!seen.has(d)) { seen.add(d); downstreamClosure(vi, d, seen); }
  }
  return seen;
}

// JSON pointer (RFC 6901) for py:/ and agency:/ references
export function jsonPointer(obj: any, ptr: string): any {
  if (!ptr || ptr === '/') return obj;
  const parts = ptr.replace(/^\//, '').split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}
