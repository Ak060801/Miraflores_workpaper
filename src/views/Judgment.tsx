import { useState } from 'react';
import { useCtx, resolvedFinding, autoDisposition } from '../app/ctx';
import { AREAS } from '../data/model';
import { latestSignoff } from '../store/projections';
import { go } from '../store/session';
import { Ref, Refs, Pill, Tabs, date, useRun, Avatar, Sev } from '../ui/kit';
import { SummaryTable, varianceRows } from './Return';

export function JudgmentView() {
  const [tab, setTab] = useState('variance');
  return (
    <div>
      <div className="pagehead"><div><h1>Judgment & completeness</h1><div className="sub">Swings from last year, judgment calls and elections with their authority, due diligence, penalty decisions, and proof that nothing was missed.</div></div></div>
      <Tabs tabs={[['variance', 'Swings vs 2024'], ['log', 'Judgment log'], ['dd', 'Due diligence (8867)'], ['complete', 'Completeness']]} on={tab} set={setTab} />
      {tab === 'variance' && <Variance />}
      {tab === 'log' && <Log />}
      {tab === 'dd' && <DueDiligence />}
      {tab === 'complete' && <Completeness />}
    </div>
  );
}

function Variance() {
  const ctx = useCtx();
  const rows = varianceRows(ctx);
  const flagged = rows.filter((r) => r.flag);
  return (
    <div>
      <div className="banner warn small">{flagged.length} of {rows.length} comparable lines swing past the firm threshold; {flagged.filter((r) => r.expl).length} explained.</div>
      <SummaryTable keys={rows.filter((r) => r.flag).map((r) => r.k)} />
    </div>
  );
}

const KINDS = ['judgment', 'election', 'due_diligence', 'penalty', 'variance'];
const SUGGESTED = [
  { kind: 'election', topic: 'Itemize vs standard deduction', decision: 'Itemize: Schedule A exceeds the 31,500 standard deduction by a wide margin (engine what-if: standard costs 12,306).', authority: 'IRC §63(e); engine what_if.standard_deduction', area: 'deductions_and_credits' },
  { kind: 'election', topic: 'Studio equipment cost recovery', decision: 'Keep 100% special depreciation federally. Consider electing §179 instead: same federal result, saves California 1,050 (engine what-if).', authority: 'IRC §168(k), §179; R&TC §17255; engine what_if.equipment_section179', area: 'business' },
  { kind: 'election', topic: 'Foreign tax credit without Form 1116', decision: 'Claim 396 directly: all passive, reported on payee statements, under 600 MFJ.', authority: 'IRC §904(j); Form 1116 instructions', area: 'investments_and_digital_assets' },
  { kind: 'penalty', topic: 'Estimated tax penalty method', decision: 'Regular method (164); annualized method gives the same result per engine what-if.', authority: 'IRC §6654(d)(2); engine what_if.penalty_annualized', area: 'tax_and_payments' },
];

function Log() {
  const { wp, act, can, name } = useCtx();
  const run = useRun();
  const [j, setJ] = useState({ kind: 'judgment', topic: '', decision: '', authority: '', area: 'tax_and_payments', refs: '' });
  return (
    <div className="grid2" style={{ gridTemplateColumns: '1fr 380px' }}>
      <div className="card">
        <h2>Recorded ({wp.judgments.length})</h2>
        <table className="t"><tbody>
          {wp.judgments.slice().reverse().map((x) => (
            <tr key={x.id}><td style={{ width: 90 }}><Pill kind="violet">{x.data.kind.replace('_', ' ')}</Pill></td><td><b>{x.data.topic}</b><div className="small">{x.data.decision}</div><div className="small muted">Authority: {x.data.authority || '—'}</div>{x.data.refs?.length > 0 && <Refs list={x.data.refs.filter((r: string) => r)} short />}</td><td className="small"><div className="row"><Avatar id={x.actor} />{date(x.at)}</div></td></tr>
          ))}
        </tbody></table>
        {wp.judgments.length === 0 && <div className="empty">None yet.</div>}
      </div>
      <div>
        {can('judgment') && (
          <div className="card stack">
            <h2>Record a judgment</h2>
            <select value={j.kind} onChange={(e) => setJ({ ...j, kind: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
            <select value={j.area} onChange={(e) => setJ({ ...j, area: e.target.value })}>{AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <input type="text" placeholder="Topic" value={j.topic} onChange={(e) => setJ({ ...j, topic: e.target.value })} />
            <textarea placeholder="Decision and reasoning" value={j.decision} onChange={(e) => setJ({ ...j, decision: e.target.value })} />
            <input type="text" placeholder="Authority relied on (required by firm rule)" value={j.authority} onChange={(e) => setJ({ ...j, authority: e.target.value })} />
            <input type="text" placeholder="References (comma separated: lines, docs, qa-…)" value={j.refs} onChange={(e) => setJ({ ...j, refs: e.target.value })} />
            <button className="btn primary" disabled={!j.topic || !j.decision} onClick={() => { if (run(() => act.judgment({ ...j, refs: j.refs.split(',').map((s) => s.trim()).filter(Boolean) }), 'Judgment recorded')) setJ({ ...j, topic: '', decision: '', authority: '', refs: '' }); }}>Record</button>
          </div>
        )}
        <div className="card">
          <h3>Suggested from the packet</h3>
          {SUGGESTED.map((s) => {
            const done = wp.judgments.some((x) => x.data.topic === s.topic);
            return <div key={s.topic} className="small" style={{ marginBottom: 10 }}><Pill kind="violet">{s.kind}</Pill> <b>{s.topic}</b><div>{s.decision}</div>{done ? <Pill kind="ok">recorded</Pill> : can('judgment') && <button className="btn sm" onClick={() => run(() => act.judgment({ ...s, refs: [] }), 'Recorded')}>Record this</button>}</div>;
          })}
        </div>
      </div>
    </div>
  );
}

function DueDiligence() {
  const { m, wp, act, can, name } = useCtx();
  const run = useRun();
  const kids = m.p.household.people.filter((p: any) => p.role === 'dependent');
  const theoFixed = wp.piiCorrections.get('household:theo|ssn');
  const done = wp.judgments.filter((j) => j.data.kind === 'due_diligence');
  const qs = [
    ['relationship', 'Relationship test: son/daughter of the taxpayers'],
    ['age', 'Age test (CTC under 17 at year end; ODC: qualifying child 19–23 full-time student)'],
    ['residency', 'Residency: lived with the taxpayers more than half the year (school absence is temporary)'],
    ['support', 'Support: did not provide over half of own support'],
    ['ssn', 'Valid SSN issued before the due date, matching the Social Security card'],
    ['others', 'No one else can claim the child; Ada files her own return and checked "can be claimed"'],
  ];
  const [ans, setAns] = useState<Record<string, boolean>>({});
  return (
    <div className="card">
      <h2>Form 8867: child tax credit / credit for other dependents</h2>
      <div className="small muted" style={{ marginBottom: 10 }}>Engine flags 8867 as "Not completed" (DUE_DILIGENCE_REQUIRED). Firm rule: due diligence must be documented for CTC, ODC, AOTC, EIC and HOH.</div>
      <table className="t"><thead><tr><th>Test</th>{kids.map((k: any) => <th key={k.id}>{k.name.split(' ')[0]} ({k.dob})</th>)}</tr></thead><tbody>
        {qs.map(([id, q]) => <tr key={id}><td className="small">{q}</td>{kids.map((k: any) => <td key={k.id}>{id === 'ssn' && k.id === 'theo' && !theoFixed ? <Pill kind="err">mismatch: see check</Pill> : <label className="chk"><input type="checkbox" checked={!!ans[`${k.id}.${id}`]} onChange={(e) => setAns({ ...ans, [`${k.id}.${id}`]: e.target.checked })} /> met</label>}</td>)}</tr>)}
      </tbody></table>
      <div className="small" style={{ marginTop: 8 }}>Evidence: <Refs list={['household:ada', 'household:theo', 'D59', 'D60', 'D61', 'D62', 'D06', 'qa-04', ...(theoFixed ? ['D71'] : [])]} short /></div>
      {can('judgment') && <button className="btn primary" style={{ marginTop: 10 }} disabled={Object.values(ans).filter(Boolean).length < qs.length * kids.length - (theoFixed ? 0 : 1)} onClick={() => run(() => act.judgment({ kind: 'due_diligence', topic: 'Form 8867 CTC/ODC', decision: `All tests met for Theo (CTC) and Ada (ODC). Knowledge requirement: interviewed client (qa-04, qa-05), reviewed 1098-T and care statements. Theo's SSN corrected to the card.`, authority: 'IRC §6695(g); Treas. Reg. §1.6695-2', refs: ['F8867.status', 'household:theo', 'household:ada'], area: 'deductions_and_credits' }), 'Due diligence recorded')}>Record due diligence</button>}
      {done.map((d) => <div key={d.id} className="banner ok small" style={{ marginTop: 8 }}>Recorded by {name(d.actor)} on {date(d.at)}: {d.data.decision}</div>)}
    </div>
  );
}

const OUTSIDE = [
  { what: 'FinCEN 114 (FBAR) for the Sparbanken account', status: 'Required; outside engagement. Advise client in writing; due 10/15/2026.', refs: ['D01', 'F8938.1.max'] },
  { what: '2023 Form 3520 (foreign inheritance)', status: 'Possibly never filed (prior preparer open item). Partner to advise; outside engagement.', refs: ['D07', 'D36'] },
  { what: 'Forms 1099-NEC for two studio contractors', status: 'Late (due 02/02/2026); outside engagement. Advise Erik.', refs: ['D27', 'qa-23'] },
  { what: "Ada's own 2025 Form 1040", status: 'Filed by Ada with "can be claimed" checked. Consistent with ODC.', refs: ['household:ada'] },
  { what: 'Lindqvist Family Woodworks 1120-S and Oregon composite', status: 'Prepared by Willamette CPA Group. Oregon tax 1,580 paid on Erik\'s behalf; Schedule S credit claimed in California.', refs: ['D39'] },
  { what: 'Ridgeline 1065 and Arizona composite', status: 'Composite filed by the fund; no Arizona return needed by Erik.', refs: ['D38'] },
  { what: 'Form 8801 (2026)', status: 'Minimum tax credit from the 2025 ISO AMT carries to 2026.', refs: ['F6251.11'] },
];

function Completeness() {
  const ctx = useCtx();
  const { m, wp, findings, act, can, name, now } = ctx;
  const run = useRun();
  const auto: Record<string, boolean> = {
    'All documents accounted for': m.p.documents.filter((d) => d.received_at <= now).every((d) => wp.dispositions.has(d.id) || autoDisposition(m, wp, d.id)),
    'Prior-year variances explained': varianceRows(ctx).filter((r) => r.flag).every((r) => r.expl),
    'Carryovers agreed to prior year': findings.find((f) => f.id === 'chk:carryovers')?.severity === 'pass',
    'Estimated payments agreed to IRS and FTB records': ['chk:fed-estimates', 'chk:ca-estimates'].every((id) => { const f = findings.find((x) => x.id === id); return !f || f.severity === 'pass' || !!resolvedFinding(wp, f); }),
    'Due diligence completed': wp.judgments.some((j) => j.data.kind === 'due_diligence'),
    'Diagnostics resolved': findings.filter((f) => f.severity === 'error').every((f) => resolvedFinding(wp, f)),
    'Reviewer sign-off': AREAS.every((a) => { const s = latestSignoff(wp, a.id, 'reviewer'); return s && !s.stale; }),
    'Partner sign-off': (() => { const s = latestSignoff(wp, 'return', 'partner'); return !!s && !s.stale; })(),
    'Client approval and e-file authorization': !!wp.clientApproval && !!wp.signed8879,
  };
  return (
    <div>
      <div className="grid2">
        <div className="card">
          <h2>Required steps (firm standard)</h2>
          <table className="t"><tbody>
            {wp.standards.required_steps.map((s) => {
              const manual = wp.steps.get(s);
              const ok = auto[s] ?? !!manual;
              return <tr key={s}><td style={{ width: 30 }}>{ok ? <Pill kind="ok">✓</Pill> : <Pill kind="warn">·</Pill>}</td><td>{s}<div className="small muted">{s in auto ? 'derived from the workpaper' : manual ? `${name(manual.actor)} · ${date(manual.at)}${manual.data.note ? ' · ' + manual.data.note : ''}` : 'manual'}</div></td><td>{!(s in auto) && !manual && can('verify') && <button className="btn sm" onClick={() => run(() => act.completeStep(s), 'Step completed')}>Complete</button>}</td></tr>;
            })}
          </tbody></table>
        </div>
        <div className="card">
          <h2>Every area considered</h2>
          <table className="t"><tbody>
            {AREAS.map((a) => { const p = latestSignoff(wp, a.id, 'preparer'); return <tr key={a.id} className="click" onClick={() => go(`/area/${a.id}`)}><td>{a.name}</td><td>{p ? <Pill kind={p.stale ? 'warn' : 'ok'}>{p.stale ? 'reopened' : 'prepared'}</Pill> : <Pill>not yet</Pill>}</td></tr>; })}
          </tbody></table>
          <div className="small muted" style={{ marginTop: 8 }}>Also considered and not applicable on this return: alimony, unemployment, Social Security benefits, gambling, household employees, energy credits, EIC (income too high), HOH (MFJ).</div>
        </div>
      </div>
      <div className="card">
        <h2>Outside filings identified</h2>
        <table className="t"><tbody>{OUTSIDE.map((o) => <tr key={o.what}><td><b>{o.what}</b></td><td className="small">{o.status}</td><td><Refs list={o.refs} short /></td></tr>)}</tbody></table>
      </div>
      <div className="card">
        <h2>Prior preparer's open items</h2>
        <table className="t"><tbody>
          {m.p.prior_years.prior_preparer_workpaper.open_items_left_by_prior_preparer.map((o: string, i: number) => {
            const res = [
              'Resolved: 2023 K-1 received 06/05 (D40); basis rolled forward in v3 (2,300 beginning 2025).',
              'Resolved: 2024 Form 5498 (D42) confirms 7,000 contributed 02/12/2025 for 2024; 8606 basis 7,000.',
              'Resolved: 220 sq ft in Sacramento (D24). 2024 used 300 sq ft: overclaimed; mention to client.',
              'Open: no evidence a 2023 Form 3520 was filed. Escalated to partner (see Checks).',
            ][i];
            return <tr key={i}><td className="small">{o}</td><td className="small">{res}</td></tr>;
          })}
        </tbody></table>
      </div>
    </div>
  );
}
