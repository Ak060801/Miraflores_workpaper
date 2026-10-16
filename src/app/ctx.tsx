import { createContext, useContext, useMemo } from 'react';
import type { Model, VersionIndex } from '../data/model';
import { versionAt, areaOfDoc, areaOfLine, AREAS } from '../data/model';
import { store, useEvents, effectiveEvents, type WPEvent } from '../store/events';
import { useSession, usersFrom, type User, can, type Permission } from '../store/session';
import { project, type WP, areaSnapshot, fingerprint, latestSignoff, type Category } from '../store/projections';
import { runChecks, type Finding, type ProposedAdj } from '../checks/checks';
import { POLICIES } from '../contrib/ayaan/firmPolicy';

export interface Ctx {
  m: Model;
  vi: VersionIndex;
  wp: WP;
  findings: Finding[];
  user: User;
  users: User[];
  now: string;          // the moment being shown (live clock or replay point)
  live: boolean;
  allEvents: WPEvent[];
  act: ReturnType<typeof makeActions>;
  can: (p: Permission) => boolean;
  gate: ReturnType<typeof filingGate>;
  name: (id: string) => string;
}

const C = createContext<Ctx | null>(null);
export const useCtx = () => useContext(C)!;

export function CtxProvider({ m, children }: { m: Model; children: React.ReactNode }) {
  const all = useEvents();
  const s = useSession();
  const users = useMemo(() => usersFrom(m.p.firm), [m]);
  const user = users.find((u) => u.id === s.userId) || users[0];
  const clock = store.clock();
  const now = s.replayAt || clock;
  const live = !s.replayAt;
  const vi = versionAt(m, now);
  const evs = useMemo(() => effectiveEvents(all, live ? undefined : now), [all, now, live]);
  const wp = useMemo(() => project(m, vi, evs), [m, vi, evs]);
  const findings = useMemo(() => runChecks(m, vi), [m, vi]);
  const name = (id: string) => users.find((u) => u.id === id)?.name || id;
  const value: Ctx = {
    m, vi, wp, findings, user, users, now, live, allEvents: all, name,
    act: makeActions(m, () => ({ user, wp, vi, live, findings })),
    can: (p) => live && can(user, p),
    gate: filingGate(m, wp, findings, name, now),
  };
  // Console/testing hook: the same permission-checked actions the UI uses.
  (window as any).__wp = { act: value.act, wp, user, findings };
  return <C.Provider value={value}>{children}</C.Provider>;
}

// ---------------------------------------------------------------------------
// Actions: the only way anything is written. Each checks permission and firm
// rules, then appends events.
// ---------------------------------------------------------------------------
export class RuleError extends Error {}

function makeActions(m: Model, get: () => { user: User; wp: WP; vi: VersionIndex; live: boolean; findings: Finding[] }) {
  const who = () => { const { user } = get(); return { id: user.id, role: user.role }; };
  const need = (p: Permission) => {
    const { user, live } = get();
    if (!live) throw new RuleError('Replay is read-only. Return to live to make changes.');
    if (!can(user, p)) throw new RuleError(`${user.name} (${user.role}) is not allowed to do this.`);
  };

  return {
    adjust(pr: ProposedAdj, reason: string, opts: { findingId?: string; authority?: string } = {}) {
      need('adjust');
      return store.append(who(), [{ type: 'adjustment.add', target: pr.line, data: { ...pr, reason: reason || pr.label, findingId: opts.findingId, authority: opts.authority } }]);
    },
    acceptFinding(f: Finding, note?: string) {
      need('adjust');
      if (!f.proposals?.length) throw new RuleError('Nothing to adjust.');
      return store.append(who(), f.proposals.map((pr) => ({ type: 'adjustment.add' as const, target: pr.line, data: { ...pr, reason: note ? `${pr.label}. ${note}` : pr.label, findingId: f.id, authority: f.authority } })), { batch: true });
    },
    fixPII(f: Finding) {
      need('pii.correct');
      if (!f.pii) return;
      return store.append(who(), [{ type: 'pii.correct', target: f.pii.target, data: { field: f.pii.field, from: f.pii.from, to: f.pii.to, evidence: f.evidence, findingId: f.id } }]);
    },
    dismissFinding(f: Finding, reason: string) {
      need('judgment');
      return store.append(who(), [{ type: 'finding.dismiss', target: f.id, data: { reason } }, { type: 'judgment', data: { kind: 'judgment', topic: f.title, decision: `No change: ${reason}`, authority: f.authority || '', refs: [f.id, ...f.evidence], area: f.area } }]);
    },
    approve(adjIds: string[]) {
      need('approve.adjustment');
      return store.append(who(), adjIds.map((id) => ({ type: 'adjustment.approve' as const, target: id, data: {} })));
    },
    verify(targets: string[], method: string, note?: string) {
      need('verify');
      return store.append(who(), [{ type: 'verify', target: targets[0], data: { targets, method, note } }], { batch: targets.length > 1 });
    },
    openNote(target: string, text: string, blocking: boolean, area?: string, assignee?: string) {
      need('note.open');
      return store.append(who(), [{ type: 'note.open', target, data: { text, blocking, area, assignee } }]);
    },
    reply(noteId: string, text: string) { need('note.reply'); return store.append(who(), [{ type: 'note.reply', target: noteId, data: { text } }]); },
    resolve(noteId: string, text?: string) {
      need('note.resolve');
      return store.append(who(), [{ type: 'note.resolve', target: noteId, data: { text } }]);
    },
    reopen(noteId: string, text?: string) { need('note.open'); return store.append(who(), [{ type: 'note.reopen', target: noteId, data: { text } }]); },
    ask(to: string, text: string, about: string[]) { need('question.ask'); return store.append(who(), [{ type: 'question.ask', data: { to, text, about } }]); },
    answer(qid: string, text: string, attachments?: any[]) { need('question.answer'); return store.append(who(), [{ type: 'question.answer', target: qid, data: { text, attachments } }]); },
    attach(target: string, item: { name: string; kind: string; text?: string; size?: number; dataUrl?: string; mime?: string }) {
      need('evidence');
      return store.append(who(), [{ type: 'evidence.attach', target, data: item }]);
    },
    dispose(docIds: string[], status: string, reason: string) {
      need('disposition');
      return store.append(who(), docIds.map((d) => ({ type: 'doc.disposition' as const, target: d, data: { status, reason } })), { batch: docIds.length > 1 });
    },
    judgment(j: { kind: string; topic: string; decision: string; authority: string; refs: string[]; area: string }) {
      need('judgment');
      if (!j.authority.trim()) throw new RuleError('Firm rule: every judgment call records the authority relied on.');
      return store.append(who(), [{ type: 'judgment', data: j }]);
    },
    signoff(area: string, level: 'preparer' | 'reviewer' | 'partner') {
      need(`signoff.${level}` as Permission);
      const { wp, user, findings } = get();
      // Firm rule: a person may not review or sign off on work they prepared.
      if (level !== 'preparer') {
        const prepared = wp.signoffs.some((s) => s.area === area && s.level === 'preparer' && s.actor === user.id && !s.stale)
          || wp.adjustments.some((a) => a.actor === user.id && (area === 'return' || areaOf(m, wp, a.line) === area));
        if (prepared) throw new RuleError('Firm rule: you may not review or sign off on work you prepared in this area.');
        const below = level === 'reviewer' ? 'preparer' : 'reviewer';
        if (area !== 'return') {
          const b = latestSignoff(wp, area, below);
          if (!b || b.stale) throw new RuleError(`Needs a current ${below} sign-off first.`);
        }
      }
      for (const p of POLICIES) if (p.blocks === level) {
        const v = p.test({ m, wp, findings, area });
        if (v.length) throw new RuleError(`Firm policy "${p.text}": ${v.length} open item(s), e.g. ${v[0].message}`);
      }
      const snapshot = areaSnapshot(m, wp, area);
      return store.append(who(), [{ type: 'signoff', target: area, data: { level, snapshot, fingerprint: fingerprint(snapshot), version: wp.vi.v.version } }]);
    },
    completeStep(step: string, note?: string) { need('verify'); return store.append(who(), [{ type: 'step.complete', data: { step, note } }]); },
    assign(area: string, role: string, staff: string, due?: string) { need('assign'); return store.append(who(), [{ type: 'assign', target: area, data: { role, staff, due } }]); },
    logTime(area: string, hours: number, note: string) { need('time'); return store.append(who(), [{ type: 'time.log', target: area, data: { hours, note } }]); },
    clientApprove() {
      need('client.approve');
      const { wp } = get();
      const snapshot = areaSnapshot(m, wp, 'return');
      return store.append(who(), [{ type: 'client.approve', data: { fingerprint: fingerprint(snapshot), position: wp.position } }]);
    },
    sign8879(pin: string) { need('client.approve'); return store.append(who(), [{ type: 'client.sign8879', data: { pin } }]); },
    fileExtension() {
      need('extension');
      const x = m.p.what_if.extension;
      return store.append(who(), [{ type: 'extension.file', data: { federal: x.federal.paid_with_form_4868, california: x.california.paid_with_ftb_3519, basis: x.based_on_version } }]);
    },
    transmit() {
      need('file');
      const { wp } = get();
      const theoFixed = wp.piiCorrections.has('household:theo|ssn');
      const recs = m.p.tax_agency_records.efile;
      const snapshot = areaSnapshot(m, wp, 'return');
      if (!theoFixed) {
        const rej = recs.find((r: any) => r.status === 'rejected');
        const hold = recs.find((r: any) => r.status === 'not_transmitted');
        return store.append(who(), [
          { type: 'efile.transmit', data: { jurisdiction: 'federal', status: 'rejected', submission_id: rej.submission_id, errors: rej.errors } },
          { type: 'efile.transmit', data: { jurisdiction: 'california', status: 'not_transmitted', submission_id: hold.submission_id, errors: hold.errors } },
        ]);
      }
      const acc = recs.filter((r: any) => r.status === 'accepted');
      return store.append(who(), [
        ...acc.map((r: any) => ({ type: 'efile.transmit' as const, data: { jurisdiction: r.jurisdiction, status: 'accepted', submission_id: r.submission_id } })),
        { type: 'filing.freeze', data: { snapshot, fingerprint: fingerprint(snapshot), position: wp.position, version: wp.vi.v.version } },
      ]);
    },
    openAmendment(reason: string) { need('adjust'); return store.append(who(), [{ type: 'amend.open', data: { reason } }]); },
    setStandard(path: string, value: any) { need('standards'); return store.append(who(), [{ type: 'standard.set', data: { path, value } }]); },
    unmask(ref: string, field: string) {
      need('unmask');
      return store.append(who(), [{ type: 'view.unmask', target: ref, data: { field } }]);
    },
    correctPII(target: string, field: string, from: string, to: string, evidence: string[]) {
      need('pii.correct');
      return store.append(who(), [{ type: 'pii.correct', target, data: { field, from, to, evidence } }]);
    },
    advanceClock(to: string, label: string) { need('clock'); return store.append(who(), [{ type: 'clock.advance', data: { to, label } }]); },
    seen() { const { live } = get(); if (live) store.append(who(), [{ type: 'seen', data: {} }]); },
    undo(targets: string[]) {
      const { live } = get();
      if (!live) throw new RuleError('Replay is read-only.');
      return store.append(who(), [{ type: 'undo', data: { targets } }]);
    },
  };
}

function areaOf(m: Model, wp: WP, key: string): string {
  const l = wp.vi.byKey.get(key);
  return l ? areaOfLine(l) : '';
}

// ---------------------------------------------------------------------------
// The filing gate: what must be true before the partner can transmit.
// ---------------------------------------------------------------------------
export interface GateItem { id: string; label: string; ok: boolean; detail?: string; route?: string }

export function filingGate(m: Model, wp: WP, findings: Finding[], name: (id: string) => string, now: string) {
  const items: GateItem[] = [];
  const openBlocking = wp.notes.filter((n) => n.status === 'open' && n.blocking);
  items.push({ id: 'notes', label: 'No open blocking review notes', ok: openBlocking.length === 0, detail: openBlocking.length ? `${openBlocking.length} open` : undefined, route: '/review' });
  const openFindings = findings.filter((f) => (f.severity === 'error') && !resolvedFinding(wp, f));
  items.push({ id: 'findings', label: 'Every error-level check resolved (adjusted or dismissed with a judgment)', ok: openFindings.length === 0, detail: openFindings.length ? `${openFindings.length} open` : undefined, route: '/checks' });
  const unapproved = wp.adjustments.filter((a) => a.needsPartner && !a.approvedBy && !a.amendment);
  items.push({ id: 'partner-adj', label: `Adjustments over ${wp.standards.partner_threshold.toLocaleString()} approved by a partner`, ok: unapproved.length === 0, detail: unapproved.length ? `${unapproved.length} awaiting` : undefined, route: '/adjustments' });
  const areaMissing: string[] = [];
  for (const a of AREAS) {
    for (const lvl of ['preparer', 'reviewer'] as const) {
      const s = latestSignoff(wp, a.id, lvl);
      if (!s || s.stale) areaMissing.push(`${a.name}: ${lvl}${s?.stale ? ' (stale)' : ''}`);
    }
  }
  items.push({ id: 'areas', label: 'Every area signed off by preparer and reviewer, and still current', ok: areaMissing.length === 0, detail: areaMissing.length ? `${areaMissing.length} missing or stale` : undefined, route: '/review' });
  const ps = latestSignoff(wp, 'return', 'partner');
  items.push({ id: 'partner', label: 'Partner sign-off on the whole return, still current', ok: !!ps && !ps.stale, detail: ps?.stale ? 'stale: return changed after sign-off' : !ps ? 'missing' : `${name(ps.actor)}`, route: '/review' });
  const dd = wp.judgments.some((j) => j.data.kind === 'due_diligence');
  items.push({ id: 'dd', label: 'Due diligence (Form 8867) documented for CTC/ODC', ok: dd, route: '/judgment' });
  const undisposed = m.p.documents.filter((d) => d.received_at <= now).filter((d) => !wp.dispositions.has(d.id) && !autoDisposition(m, wp, d.id));
  items.push({ id: 'docs', label: 'Every document accounted for (used, superseded, duplicate, or why not used)', ok: undisposed.length === 0, detail: undisposed.length ? `${undisposed.length} unaccounted` : undefined, route: '/documents' });
  const fp = fingerprint(areaSnapshot(m, wp, 'return'));
  const appr = wp.clientApproval;
  items.push({ id: 'client', label: 'Client approved the return as it stands now', ok: !!appr && appr.data.fingerprint === fp, detail: appr && appr.data.fingerprint !== fp ? 'return changed after approval' : !appr ? 'not yet' : undefined, route: '/client' });
  items.push({ id: '8879', label: 'Forms 8879 / FTB 8879 signed', ok: !!wp.signed8879, route: '/client' });
  return { items, ready: items.every((i) => i.ok) };
}

export function resolvedFinding(wp: WP, f: Finding): 'adjusted' | 'dismissed' | 'fixed' | null {
  if (wp.adjustments.some((a) => a.findingId === f.id)) return 'adjusted';
  if (f.pii && wp.piiCorrections.has(`${f.pii.target}|${f.pii.field}`)) return 'fixed';
  if (wp.dismissed.has(f.id)) return 'dismissed';
  return null;
}

// A document is accounted for automatically when the engine used it or
// superseded it; otherwise a person records why it was not used.
export function autoDisposition(m: Model, wp: WP, docId: string): { status: string; reason: string } | null {
  const v = wp.vi.v;
  if (v.documents_superseded.includes(docId)) return { status: 'superseded', reason: `Superseded in ${v.version}` };
  if (v.documents_used.includes(docId)) return { status: 'used', reason: `Used by engine ${v.version}` };
  return null;
}

export { areaOfDoc };
