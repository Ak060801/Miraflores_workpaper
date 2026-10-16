// Projections: everything the screens show is derived here from the packet and
// the (effective) event log. Pure functions, recomputed on every change.

import type { Model, VersionIndex, AreaId } from '../data/model';
import { areaOfLine, AREAS, areaOfDoc, upstream } from '../data/model';
import type { WPEvent } from './events';

export type Category =
  | 'wages' | 'interest' | 'schc_profit' | 'stcg' | 'ltcg' | 'ordinary_income' | 'adjustment' | 'salt' | 'itemized'
  | 'ca_source_income' | 'credit' | 'payment' | 'none';

export const CATEGORY_LABEL: Record<Category, string> = {
  wages: 'Wages', interest: 'Interest & dividends', schc_profit: 'Schedule C profit', stcg: 'Short-term gain', ltcg: 'Long-term gain',
  ordinary_income: 'Other ordinary income', adjustment: 'Adjustment to income', salt: 'State & local tax (capped)', itemized: 'Other itemized deduction',
  ca_source_income: 'California-source income only', credit: 'Credit (1:1)', payment: 'Payment (1:1)', none: 'No tax effect',
};

export interface Adjustment {
  id: string;
  at: string;
  actor: string;
  line: string;
  delta: number;            // change to the line, in the line's own units
  amount: number;           // change to the tax-effect category (sign: + raises income / deduction / payment)
  category: Category;       // federal category
  caCategory: Category;     // California category
  jurisdiction?: 'federal' | 'california' | 'both';
  reason: string;
  authority?: string;
  findingId?: string;
  effectOverride?: { federal: number; california: number; source: string };
  fed: number;              // tax effect (+ = more tax / less refund)
  ca: number;
  needsPartner: boolean;
  approvedBy?: string;
  amendment?: boolean;      // made after the return was frozen
}

export interface Note { id: string; at: string; actor: string; target: string; text: string; blocking: boolean; assignee?: string; status: 'open' | 'resolved'; replies: { at: string; actor: string; text: string }[]; resolvedBy?: string; area?: AreaId }
export interface Question { id: string; at: string; actor: string; to: string; text: string; about: string[]; answers: { id: string; at: string; actor: string; text: string; attachments?: any[] }[] }
export interface Verification { id: string; at: string; actor: string; target: string; method: string; note?: string }
export interface Signoff { id: string; at: string; actor: string; area: string; level: 'preparer' | 'reviewer' | 'partner'; fingerprint: string; snapshot: Record<string, any>; version: string; stale?: boolean; changes?: { key: string; was: any; now: any }[] }

export function rateFor(vi: VersionIndex, cat: Category, j: 'federal' | 'california'): number {
  if (cat === 'credit' || cat === 'payment' || cat === 'none') return 0;
  const r = vi.v.tax_effect_rates[cat];
  if (!r) return 0;
  return j === 'federal' ? r.federal_per_dollar : r.california_per_dollar;
}

export function taxEffect(vi: VersionIndex, a: { amount: number; category: Category; caCategory: Category; jurisdiction?: string; effectOverride?: any }) {
  if (a.effectOverride) return { fed: a.effectOverride.federal, ca: a.effectOverride.california };
  let fed = 0, ca = 0;
  if (a.jurisdiction !== 'california') {
    if (a.category === 'credit') fed = -a.amount;
    else if (a.category === 'payment') fed = -a.amount;
    else fed = a.amount * rateFor(vi, a.category, 'federal');
  }
  if (a.jurisdiction !== 'federal') {
    if (a.caCategory === 'credit' || a.caCategory === 'payment') ca = -a.amount;
    else ca = a.amount * rateFor(vi, a.caCategory, 'california');
  }
  return { fed: Math.round(fed), ca: Math.round(ca) };
}

// ---------------------------------------------------------------------------
export interface Standards {
  verification_types: string[];
  variance: { flag_if_change_over_percent: number; and_over_amount: number };
  partner_threshold: number;
  rules: string[];
  required_steps: string[];
  review_levels: string[];
}

export function standardsFrom(m: Model, ev: WPEvent[]): Standards {
  const s = m.p.firm.starter_standards;
  const st: Standards = {
    verification_types: [...s.verification_types],
    variance: { flag_if_change_over_percent: s.variance_review.flag_if_change_over_percent, and_over_amount: s.variance_review.and_over_amount },
    partner_threshold: 1000,
    rules: [...s.rules],
    required_steps: [...s.required_steps],
    review_levels: [...s.review_levels],
  };
  for (const e of ev) if (e.type === 'standard.set') {
    const { path, value } = e.data;
    if (path === 'variance.percent') st.variance.flag_if_change_over_percent = value;
    if (path === 'variance.amount') st.variance.and_over_amount = value;
    if (path === 'partner_threshold') st.partner_threshold = value;
    if (path === 'rules.add') st.rules.push(value);
    if (path === 'rules.remove') st.rules = st.rules.filter((r) => r !== value);
    if (path === 'verification_types.add') st.verification_types.push(value);
    if (path === 'required_steps.add') st.required_steps.push(value);
  }
  return st;
}

// ---------------------------------------------------------------------------
export interface WP {
  vi: VersionIndex;
  events: WPEvent[];
  standards: Standards;
  adjustments: Adjustment[];
  adjByLine: Map<string, Adjustment[]>;
  adjusted: Map<string, { value: number; delta: number; approx: boolean; via: string[] }>;
  affectedNonlinear: Map<string, string[]>; // nonlinear lines an adjustment reaches (need engine recompute)
  notes: Note[];
  questions: Question[];
  verifications: Map<string, Verification[]>;
  evidence: Map<string, WPEvent[]>;
  dispositions: Map<string, WPEvent>;
  judgments: WPEvent[];
  dismissed: Map<string, WPEvent>;
  signoffs: Signoff[];
  steps: Map<string, WPEvent>;
  assignments: Map<string, WPEvent[]>;
  time: Map<string, number>;
  timeEvents: WPEvent[];
  clientApproval?: WPEvent;
  signed8879?: WPEvent;
  efile: WPEvent[];
  frozen?: WPEvent;
  amendment?: WPEvent;
  extension?: WPEvent;
  piiCorrections: Map<string, WPEvent>;
  unmaskLog: WPEvent[];
  lastSeen: Map<string, string>;
  position: {
    federal: { total_tax: number; payments: number; balance_due: number; effect: number };
    california: { total_tax: number; payments: number; balance_due: number; effect: number };
  };
}

export function project(m: Model, vi: VersionIndex, events: WPEvent[]): WP {
  const standards = standardsFrom(m, events);
  const approvals = new Map<string, WPEvent>();
  for (const e of events) if (e.type === 'adjustment.approve') approvals.set(e.target!, e);
  const frozen = events.find((e) => e.type === 'filing.freeze');

  const adjustments: Adjustment[] = [];
  for (const e of events) if (e.type === 'adjustment.add') {
    const d = e.data;
    const eff = taxEffect(vi, d);
    const needsPartner = Math.max(Math.abs(eff.fed), Math.abs(eff.ca)) > standards.partner_threshold;
    adjustments.push({
      id: e.id, at: e.at, actor: e.actor, line: e.target!, delta: d.delta, amount: d.amount, category: d.category, caCategory: d.caCategory,
      jurisdiction: d.jurisdiction, reason: d.reason, authority: d.authority, findingId: d.findingId, effectOverride: d.effectOverride,
      fed: eff.fed, ca: eff.ca, needsPartner, approvedBy: approvals.get(e.id)?.actor, amendment: frozen ? e.at > frozen.at : false,
    });
  }
  const adjByLine = new Map<string, Adjustment[]>();
  for (const a of adjustments) { if (!adjByLine.has(a.line)) adjByLine.set(a.line, []); adjByLine.get(a.line)!.push(a); }

  // Propagate line deltas through linear lines (R-SUM / R-CARRY with solved signs).
  // Stop at non-linear rules (tax tables, limits, phase-outs): those need the engine.
  const deltas = new Map<string, number>();
  const via = new Map<string, Set<string>>();
  const affectedNonlinear = new Map<string, string[]>();
  for (const a of adjustments) {
    if (a.amendment) continue; // amendments are shown on the amended column only
    if (!vi.byKey.has(a.line) || typeof vi.byKey.get(a.line)!.value !== 'number') continue;
    const stack: [string, number][] = [[a.line, a.delta]];
    while (stack.length) {
      const [k, d] = stack.pop()!;
      deltas.set(k, (deltas.get(k) || 0) + d);
      if (!via.has(k)) via.set(k, new Set());
      via.get(k)!.add(a.id);
      for (const dn of vi.downstream.get(k) || []) {
        const signs = vi.signs.get(dn);
        const dl = vi.byKey.get(dn)!;
        if (signs) {
          const idx = dl.inputs.indexOf(k);
          stack.push([dn, d * signs[idx]]);
        } else {
          if (!affectedNonlinear.has(dn)) affectedNonlinear.set(dn, []);
          affectedNonlinear.get(dn)!.push(a.id);
        }
      }
    }
  }
  const adjusted = new Map<string, { value: number; delta: number; approx: boolean; via: string[] }>();
  for (const [k, d] of deltas) {
    const l = vi.byKey.get(k)!;
    adjusted.set(k, { value: (l.value as number) + d, delta: d, approx: false, via: [...(via.get(k) || [])] });
  }

  // Notes, questions
  const notes: Note[] = [];
  const noteById = new Map<string, Note>();
  const questions: Question[] = [];
  const qById = new Map<string, Question>();
  const verifications = new Map<string, Verification[]>();
  const evidence = new Map<string, WPEvent[]>();
  const dispositions = new Map<string, WPEvent>();
  const judgments: WPEvent[] = [];
  const dismissed = new Map<string, WPEvent>();
  const signoffsRaw: WPEvent[] = [];
  const steps = new Map<string, WPEvent>();
  const assignments = new Map<string, WPEvent[]>();
  const time = new Map<string, number>();
  const timeEvents: WPEvent[] = [];
  const efile: WPEvent[] = [];
  const pii = new Map<string, WPEvent>();
  const unmaskLog: WPEvent[] = [];
  const lastSeen = new Map<string, string>();
  let clientApproval: WPEvent | undefined, signed8879: WPEvent | undefined, amendment: WPEvent | undefined, extension: WPEvent | undefined;

  for (const e of events) {
    switch (e.type) {
      case 'note.open': {
        const n: Note = { id: e.id, at: e.at, actor: e.actor, target: e.target!, text: e.data.text, blocking: !!e.data.blocking, assignee: e.data.assignee, status: 'open', replies: [], area: e.data.area };
        notes.push(n); noteById.set(n.id, n); break;
      }
      case 'note.reply': { const n = noteById.get(e.target!); n?.replies.push({ at: e.at, actor: e.actor, text: e.data.text }); break; }
      case 'note.resolve': { const n = noteById.get(e.target!); if (n) { n.status = 'resolved'; n.resolvedBy = e.actor; n.replies.push({ at: e.at, actor: e.actor, text: e.data?.text || 'Resolved.' }); } break; }
      case 'note.reopen': { const n = noteById.get(e.target!); if (n) { n.status = 'open'; n.replies.push({ at: e.at, actor: e.actor, text: e.data?.text || 'Reopened.' }); } break; }
      case 'question.ask': { const q: Question = { id: e.id, at: e.at, actor: e.actor, to: e.data.to, text: e.data.text, about: e.data.about || [], answers: [] }; questions.push(q); qById.set(q.id, q); break; }
      case 'question.answer': { qById.get(e.target!)?.answers.push({ id: e.id, at: e.at, actor: e.actor, text: e.data.text, attachments: e.data.attachments }); break; }
      case 'verify': {
        for (const t of (e.data.targets as string[]) || [e.target!]) {
          if (!verifications.has(t)) verifications.set(t, []);
          verifications.get(t)!.push({ id: e.id, at: e.at, actor: e.actor, target: t, method: e.data.method, note: e.data.note });
        }
        break;
      }
      case 'evidence.attach': { const t = e.target!; if (!evidence.has(t)) evidence.set(t, []); evidence.get(t)!.push(e); break; }
      case 'doc.disposition': dispositions.set(e.target!, e); break;
      case 'judgment': judgments.push(e); break;
      case 'finding.dismiss': dismissed.set(e.target!, e); break;
      case 'signoff': signoffsRaw.push(e); break;
      case 'step.complete': steps.set(e.data.step, e); break;
      case 'assign': { if (!assignments.has(e.target!)) assignments.set(e.target!, []); assignments.get(e.target!)!.push(e); break; }
      case 'time.log': time.set(e.target!, (time.get(e.target!) || 0) + e.data.hours); timeEvents.push(e); break;
      case 'client.approve': clientApproval = e; break;
      case 'client.sign8879': signed8879 = e; break;
      case 'efile.transmit': efile.push(e); break;
      case 'amend.open': amendment = e; break;
      case 'extension.file': extension = e; break;
      case 'pii.correct': pii.set(`${e.target}|${e.data.field}`, e); break;
      case 'view.unmask': unmaskLog.push(e); break;
      case 'seen': lastSeen.set(e.actor, e.at); break;
    }
  }

  const wpPartial = { vi, adjusted, dispositions, adjByLine } as any;
  const signoffs: Signoff[] = signoffsRaw.map((e) => {
    const cur = areaSnapshot(m, wpPartial, e.target!);
    const snap = e.data.snapshot as Record<string, any>;
    const changes: { key: string; was: any; now: any }[] = [];
    const keys = new Set([...Object.keys(snap), ...Object.keys(cur)]);
    for (const k of keys) if (JSON.stringify(snap[k]) !== JSON.stringify(cur[k])) changes.push({ key: k, was: snap[k], now: cur[k] });
    return { id: e.id, at: e.at, actor: e.actor, area: e.target!, level: e.data.level, fingerprint: e.data.fingerprint, snapshot: snap, version: e.data.version, stale: changes.length > 0, changes };
  });

  // Workpaper position = engine summary + tax effect of every active adjustment.
  const s = vi.v.summary;
  let fedEff = 0, caEff = 0, fedPay = 0, caPay = 0;
  for (const a of adjustments) {
    if (a.amendment) continue;
    if (a.category === 'payment' && a.jurisdiction !== 'california') fedPay += a.amount;
    else fedEff += a.fed;
    if (a.caCategory === 'payment' && a.jurisdiction !== 'federal') caPay += a.amount;
    else caEff += a.ca;
  }
  const position = {
    federal: { total_tax: s.federal.total_tax + fedEff, payments: s.federal.payments + fedPay, balance_due: s.federal.total_tax + fedEff - (s.federal.payments + fedPay), effect: fedEff - fedPay },
    california: { total_tax: s.california.total_tax + caEff, payments: s.california.payments + caPay, balance_due: s.california.total_tax + caEff - (s.california.payments + caPay), effect: caEff - caPay },
  };

  return {
    vi, events, standards, adjustments, adjByLine, adjusted, affectedNonlinear, notes, questions, verifications, evidence, dispositions, judgments, dismissed,
    signoffs, steps, assignments, time, timeEvents, clientApproval, signed8879, efile, frozen, amendment, extension, piiCorrections: pii, unmaskLog, lastSeen, position,
  };
}

export function currentValue(wp: Pick<WP, 'vi' | 'adjusted'>, key: string): any {
  const a = wp.adjusted.get(key);
  if (a) return a.value;
  return wp.vi.byKey.get(key)?.value;
}

// What a sign-off covers: every line value in the area (after adjustments) and
// the disposition of every document in the area. If any of it changes, the
// sign-off is stale and the area reopens.
export function areaSnapshot(m: Model, wp: Pick<WP, 'vi' | 'adjusted' | 'dispositions'>, area: string): Record<string, any> {
  const snap: Record<string, any> = {};
  if (area === 'return') {
    for (const l of wp.vi.v.lines) if (!l.key.startsWith('F8949.') || l.key.endsWith('total')) snap[l.key] = currentValue(wp, l.key);
    return snap;
  }
  for (const l of wp.vi.v.lines) if (areaOfLine(l) === area) snap[l.key] = currentValue(wp, l.key);
  for (const d of m.p.documents) if (areaOfDoc(d) === area) {
    const disp = wp.dispositions.get(d.id);
    if (disp) snap[`doc:${d.id}`] = disp.data.status;
  }
  return snap;
}

export function fingerprint(obj: any): string {
  const s = JSON.stringify(obj);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function latestSignoff(wp: WP, area: string, level: string): Signoff | undefined {
  const list = wp.signoffs.filter((s) => s.area === area && s.level === level);
  return list[list.length - 1];
}

export function areaLines(vi: VersionIndex, area: string) {
  return vi.v.lines.filter((l) => areaOfLine(l) === area);
}

export { AREAS, upstream };
