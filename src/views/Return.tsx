import { useState } from 'react';
import { useCtx, resolvedFinding, autoDisposition } from '../app/ctx';
import { AREAS, areaOfLine, areaOfDoc } from '../data/model';
import { latestSignoff, areaLines, currentValue } from '../store/projections';
import { go, inspect, openDoc } from '../store/session';
import { Ref, Refs, fmt, LineVal, Pill, Tabs, Avatar, date, dateTime, useRun, Sev, Prompt, Effect, Sensitive } from '../ui/kit';
import { NoteCard } from '../ui/Inspector';
import { Position } from './Home';

const SUMMARY_KEYS = [
  'F1040.1a', 'F1040.2b', 'F1040.3a', 'F1040.3b', 'F1040.4b', 'F1040.7', 'F1040.8', 'Sch1.3', 'Sch1.5', 'F1040.9', 'F1040.10', 'F1040.11', 'F1040.12', 'F1040.13', 'F1040.15',
  'F1040.16', 'F1040.17', 'F1040.19', 'F1040.23', 'F1040.24', 'F1040.25a', 'F1040.26', 'F1040.33', 'F1040.37',
];

export function varianceRows(ctx: ReturnType<typeof useCtx>, keys?: string[]) {
  const { m, vi, wp } = ctx;
  const py = m.p.prior_years.return_2024.lines;
  const ks = keys || Object.keys(py).filter((k) => vi.byKey.has(k));
  const st = wp.standards.variance;
  return ks.map((k) => {
    const now = currentValue(wp, k);
    const was = py[k];
    const diff = typeof now === 'number' && typeof was === 'number' ? now - was : null;
    const pct = diff !== null && was ? (diff / Math.abs(was)) * 100 : diff ? Infinity : 0;
    const flag = diff !== null && Math.abs(diff) > st.and_over_amount && Math.abs(pct) > st.flag_if_change_over_percent;
    const expl = wp.judgments.filter((j) => j.data.kind === 'variance' && j.data.line === k).slice(-1)[0];
    return { k, label: vi.byKey.get(k)?.label || m.p.prior_years.return_2024.line_labels[k], now, was, diff, pct, flag, expl };
  });
}

export function ReturnView() {
  const ctx = useCtx();
  const { vi } = ctx;
  const [tab, setTab] = useState('summary');
  return (
    <div>
      <div className="pagehead"><div><h1>2025 return</h1><div className="sub">Form 1040 (MFJ) and California 540NR (part-year resident). Engine run {vi.v.version}; workpaper adjustments shown as engine → workpaper. Click any number to trace it.</div></div></div>
      <Position />
      <div style={{ height: 16 }} />
      <Tabs tabs={[['summary', 'Summary vs 2024'], ['tax', 'Tax computation'], ['forms', 'All lines by form'], ['areas', 'Areas']]} on={tab} set={setTab} />
      {tab === 'summary' && <SummaryTable />}
      {tab === 'tax' && <TaxComputation />}
      {tab === 'forms' && <FormsExplorer />}
      {tab === 'areas' && <AreasGrid />}
    </div>
  );
}

export function SummaryTable({ keys = SUMMARY_KEYS }: { keys?: string[] }) {
  const ctx = useCtx();
  const { act, can } = ctx;
  const run = useRun();
  const rows = varianceRows(ctx, keys);
  return (
    <div className="card">
      <div className="small muted" style={{ marginBottom: 8 }}>Flag rule (firm standard): change over {ctx.wp.standards.variance.flag_if_change_over_percent}% and over {fmt(ctx.wp.standards.variance.and_over_amount)}. Every flag needs an explanation before sign-off.</div>
      <table className="t">
        <thead><tr><th>Line</th><th>Description</th><th className="num">2024 as filed</th><th className="num">2025 workpaper</th><th className="num">Change</th><th>Variance</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className="click" onClick={() => inspect(r.k)}>
              <td className="mono small">{r.k}</td><td>{r.label}</td>
              <td className="num">{fmt(r.was)}</td><td className="num"><LineVal k={r.k} /></td>
              <td className="num">{r.diff !== null ? <Effect v={r.diff} /> : ''}{r.diff !== null && isFinite(r.pct) && r.pct !== 0 ? <span className="small muted"> {r.pct > 0 ? '+' : ''}{r.pct.toFixed(0)}%</span> : ''}</td>
              <td onClick={(e) => e.stopPropagation()}>
                {r.flag ? (r.expl ? <span className="small"><Pill kind="ok">explained</Pill> {r.expl.data.decision}</span>
                  : can('judgment') ? <Prompt label="Explain…" multiline={false} placeholder="Why did this change?" onSubmit={(t) => run(() => act.judgment({ kind: 'variance', topic: `Variance ${r.k}`, decision: t, authority: 'Source documents and prior-year return', refs: [r.k], area: areaOfLine(ctx.vi.byKey.get(r.k)!), line: r.k } as any), 'Variance explained')} />
                    : <Pill kind="warn">unexplained</Pill>) : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaxComputation() {
  const { vi } = useCtx();
  const fed = ['F1040.11', 'F1040.12', 'F1040.13', 'F1040.14', 'F1040.15', 'F1040.16', 'F6251.4', 'F6251.5', 'F6251.6', 'F6251.9', 'F1040.17', 'F1040.18', 'F1040.19', 'F1040.20', 'F1040.22', 'Sch2.4', 'Sch2.11', 'Sch2.12', 'F1040.23', 'F1040.24', 'F1040.25a', 'F1040.26', 'Sch3.10', 'Sch3.11', 'F1040.33', 'F1040.37', 'F1040.38'];
  const ca = ['F540NR.13', 'SchCA540NR.22.D', 'SchCA540NR.26.D', 'F540NR.17', 'F540NR.18', 'F540NR.19', 'F540NR.31', 'SchCA540NR.22.E', 'F540NR.32', 'F540NR.34', 'F540NR.35', 'F540NR.36', 'F540NR.37', 'F540NR.39', 'F540NR.40', 'ScheduleS.credit', 'F540NR.61', 'F540NR.64', 'F540NR.71', 'F540NR.72', 'F540NR.73', 'F540NR.78', 'F540NR.97'];
  const T = ({ keys, title }: { keys: string[]; title: string }) => (
    <div className="card"><h2>{title}</h2><table className="t"><tbody>{keys.filter((k) => vi.byKey.has(k)).map((k) => <tr key={k} className="click" onClick={() => inspect(k)}><td className="mono small">{k}</td><td>{vi.byKey.get(k)!.label}</td><td className="num"><LineVal k={k} /></td></tr>)}</tbody></table></div>
  );
  return (
    <div>
      <div className="banner warn small">Tax lines are engine output. Adjustments flow exactly through additive lines (to AGI and taxable income); tax, AMT, NIIT, credits and California ratios are non-linear, so the workpaper shows their effect at summary level using the engine's per-dollar tax-effect rates and marks them "recompute" until the engine runs again.</div>
      <div className="grid2"><T keys={fed} title="Federal" /><T keys={ca} title="California 540NR" /></div>
    </div>
  );
}

function FormsExplorer() {
  const { vi, wp, findings } = useCtx();
  const forms = Array.from(new Set(vi.v.lines.map((l) => l.form)));
  const [form, setForm] = useState('F1040');
  const lines = vi.v.lines.filter((l) => l.form === form);
  const flagged = new Set(findings.filter((f) => f.severity !== 'pass').flatMap((f) => f.lines));
  return (
    <div className="card">
      <div className="row wrap" style={{ marginBottom: 10, gap: 4 }}>{forms.map((f) => <button key={f} className={`btn sm ${f === form ? 'primary' : ''}`} onClick={() => setForm(f)}>{f}</button>)}</div>
      {form === 'F8949' && <div className="banner warn small">Form 8949 has {lines.length} lots. Use Records › Sales detail to review them by exception.</div>}
      <table className="t">
        <thead><tr><th>Line</th><th>Description</th><th>Rule</th><th className="num">Value</th><th>Status</th></tr></thead>
        <tbody>
          {lines.slice(0, 400).map((l) => (
            <tr key={l.key} className="click" onClick={() => inspect(l.key)}>
              <td className="mono small">{l.line}</td><td>{l.label}</td><td className="mono small muted">{l.rule}</td>
              <td className="num"><LineVal k={l.key} cents={l.form === 'F8949' && !l.line.endsWith('total')} /></td>
              <td className="row" style={{ gap: 4 }}>
                {(wp.verifications.get(l.key) || []).length > 0 && <Pill kind="ok">✓</Pill>}
                {flagged.has(l.key) && <Pill kind="err">check</Pill>}
                {wp.notes.some((n) => n.target === l.key && n.status === 'open') && <Pill kind="warn">note</Pill>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SignoffChip({ area, level }: { area: string; level: string }) {
  const { wp, name } = useCtx();
  const s = latestSignoff(wp, area, level);
  if (!s) return <Pill>{level}: —</Pill>;
  return <Pill kind={s.stale ? 'warn' : 'ok'} title={s.stale ? `Reopened: ${s.changes?.length} change(s) since ${name(s.actor)} signed on ${date(s.at)}` : `${name(s.actor)} · ${date(s.at)} · ${s.version}`}>{level}: {s.stale ? 'reopened' : '✓'}</Pill>;
}

function AreasGrid() {
  const { m, wp, findings } = useCtx();
  return (
    <div className="grid3">
      {AREAS.map((a) => {
        const f = findings.filter((x) => x.area === a.id && x.severity !== 'pass' && x.severity !== 'info' && !resolvedFinding(wp, x));
        const notes = wp.notes.filter((n) => n.status === 'open' && (n.area === a.id));
        const b = m.p.firm.budget_hours[a.id]; const t = wp.time.get(a.id) || 0;
        return (
          <div key={a.id} className="card" style={{ cursor: 'pointer' }} onClick={() => go(`/area/${a.id}`)}>
            <div className="row"><b>{a.name}</b><span className="spacer" />{f.length > 0 && <Pill kind="err">{f.length} open</Pill>}</div>
            <div className="row wrap" style={{ marginTop: 8, gap: 4 }}><SignoffChip area={a.id} level="preparer" /><SignoffChip area={a.id} level="reviewer" />{notes.length > 0 && <Pill kind="warn">{notes.length} note(s)</Pill>}</div>
            {b ? <div style={{ marginTop: 10 }}><div className="small muted">{t.toFixed(1)} of {b} h budget</div><div className={`bar ${t > b ? 'over' : ''}`}><div style={{ width: `${Math.min(100, (t / b) * 100)}%` }} /></div></div> : <div className="small muted" style={{ marginTop: 10 }}>{t.toFixed(1)} h · no budget set</div>}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function AreaView({ id }: { id: string }) {
  const ctx = useCtx();
  const { m, vi, wp, findings, act, can, name, now } = ctx;
  const run = useRun();
  const a = AREAS.find((x) => x.id === id);
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  if (!a) return <div className="empty">Unknown area.</div>;
  const lines = areaLines(vi, id).filter((l) => !(l.form === 'F8949' && !l.line.endsWith('total')));
  const docs = m.p.documents.filter((d) => areaOfDoc(d) === id && d.received_at <= now);
  const fnd = findings.filter((f) => f.area === id);
  const notes = wp.notes.filter((n) => n.area === id || areaOfLine(vi.byKey.get(n.target) || ({ form: '', line: '', key: '', jurisdiction: '' } as any)) === id);
  const assign = wp.assignments.get(id) || [];
  const prep = assign.filter((x) => x.data.role === 'preparer').slice(-1)[0];
  const rev = assign.filter((x) => x.data.role === 'reviewer').slice(-1)[0];
  const b = m.p.firm.budget_hours[id]; const t = wp.time.get(id) || 0;
  const judg = wp.judgments.filter((j) => j.data.area === id);
  const sP = latestSignoff(wp, id, 'preparer'), sR = latestSignoff(wp, id, 'reviewer');
  const unverified = lines.filter((l) => typeof l.value === 'number' && l.sources.length && !(wp.verifications.get(l.key) || []).length);

  return (
    <div>
      <div className="pagehead">
        <div><h1>{a.name}</h1><div className="sub">Preparer {prep ? name(prep.data.staff) : '—'} (due {prep?.data.due || '—'}) · Reviewer {rev ? name(rev.data.staff) : '—'} (due {rev?.data.due || '—'})</div></div>
        <span className="spacer" />
        <SignoffChip area={id} level="preparer" /><SignoffChip area={id} level="reviewer" />
      </div>
      <div className="grid3">
        <div className="card">
          <h3>Sign-off</h3>
          {[sP, sR].filter(Boolean).map((s) => s && (
            <div key={s.id} className="small" style={{ marginBottom: 8 }}>
              <div className="row"><Avatar id={s.actor} /><b>{s.level}</b> {name(s.actor)} <span className="muted">{date(s.at)} on {s.version}</span>{s.stale ? <Pill kind="warn">reopened</Pill> : <Pill kind="ok">current</Pill>}</div>
              {s.stale && <details style={{ marginTop: 4 }}><summary>{s.changes!.length} change(s) since signed</summary><table className="t"><tbody>{s.changes!.slice(0, 30).map((c) => <tr key={c.key}><td className="mono small">{c.key}</td><td className="num">{fmt(c.was)}</td><td className="num">→ {fmt(c.now)}</td></tr>)}</tbody></table></details>}
            </div>
          ))}
          <div className="row wrap">
            {can('signoff.preparer') && <button className="btn sm primary" onClick={() => run(() => act.signoff(id, 'preparer'), 'Signed off as preparer')}>Sign as preparer</button>}
            {can('signoff.reviewer') && <button className="btn sm primary" onClick={() => run(() => act.signoff(id, 'reviewer'), 'Signed off as reviewer')}>Sign as reviewer</button>}
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>A sign-off covers every line value and document disposition in this area. If any of them changes, it reopens automatically.</div>
        </div>
        <div className="card">
          <h3>Time vs budget</h3>
          <div className="v mono" style={{ fontSize: 18 }}>{t.toFixed(1)} h <span className="muted small">/ {b ?? '—'} h</span></div>
          {b && <div className={`bar ${t > b ? 'over' : ''}`} style={{ marginTop: 6 }}><div style={{ width: `${Math.min(100, (t / b) * 100)}%` }} /></div>}
          {can('time') && <div className="row" style={{ marginTop: 8 }}><input type="number" step="0.1" placeholder="h" value={hours} onChange={(e) => setHours(e.target.value)} style={{ width: 60 }} /><input type="text" placeholder="what" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1 }} /><button className="btn sm" disabled={!parseFloat(hours)} onClick={() => { run(() => act.logTime(id, parseFloat(hours), note), 'Time logged'); setHours(''); setNote(''); }}>Log</button></div>}
        </div>
        <div className="card">
          <h3>Coverage</h3>
          <div className="small">{lines.length} lines · {docs.length} documents · {fnd.filter((f) => f.severity === 'pass').length}/{fnd.length} checks pass</div>
          <div className="small" style={{ marginTop: 4 }}>{unverified.length} sourced lines without a verification</div>
          {can('verify') && unverified.length > 0 && <button className="btn sm" style={{ marginTop: 6 }} onClick={() => run(() => act.verify(unverified.map((l) => l.key), 'agreed_to_source_document', 'Bulk: agreed to the cited source values'), `Verified ${unverified.length} lines`)}>Verify all {unverified.length} against their sources</button>}
        </div>
      </div>

      {id === 'intake_and_engagement' && <Household />}
      {fnd.length > 0 && <div className="card"><h2>Checks</h2><table className="t"><tbody>{fnd.map((f) => { const r = resolvedFinding(wp, f); return <tr key={f.id} className="click" onClick={() => go('/checks/' + f.id.slice(4))}><td style={{ width: 80 }}><Sev s={f.severity} /></td><td>{f.title}</td><td>{r ? <Pill kind="ok">{r}</Pill> : f.severity === 'pass' ? '' : <Pill kind="warn">open</Pill>}</td></tr>; })}</tbody></table></div>}
      {notes.length > 0 && <div className="card"><h2>Review notes</h2>{notes.map((n) => <NoteCard key={n.id} id={n.id} />)}</div>}

      <div className="card">
        <h2>Lines</h2>
        <table className="t"><thead><tr><th>Line</th><th>Description</th><th className="num">2024</th><th className="num">Value</th><th>Sources</th><th></th></tr></thead><tbody>
          {lines.map((l) => (
            <tr key={l.key} className="click" onClick={() => inspect(l.key)}>
              <td className="mono small">{l.key}</td><td>{l.label}</td><td className="num muted">{fmt(m.p.prior_years.return_2024.lines[l.key])}</td><td className="num"><LineVal k={l.key} /></td>
              <td onClick={(e) => e.stopPropagation()}>{l.sources.slice(0, 3).map((s) => <Ref key={s} r={s} short />)}{l.sources.length > 3 && <span className="small muted"> +{l.sources.length - 3}</span>}</td>
              <td>{(wp.verifications.get(l.key) || []).length > 0 && <Pill kind="ok">✓</Pill>}</td>
            </tr>
          ))}
        </tbody></table>
      </div>

      <div className="card">
        <h2>Documents in this area</h2>
        <table className="t"><tbody>{docs.map((d) => { const disp = wp.dispositions.get(d.id)?.data.status || autoDisposition(m, wp, d.id)?.status; return <tr key={d.id} className="click" onClick={() => openDoc(d.id)}><td className="mono small">{d.id}</td><td>{d.title}</td><td className="small muted">{date(d.received_at)}</td><td>{disp ? <Pill kind="ok">{disp}</Pill> : <Pill kind="warn">unaccounted</Pill>}</td></tr>; })}</tbody></table>
      </div>
      {judg.length > 0 && <div className="card"><h2>Judgment calls</h2>{judg.map((j) => <div key={j.id} className="small" style={{ marginBottom: 8 }}><Pill kind="violet">{j.data.kind}</Pill> <b>{j.data.topic}</b>: {j.data.decision} <span className="muted">({j.data.authority}; {name(j.actor)})</span></div>)}</div>}
    </div>
  );
}

function Household() {
  const { m, wp, name } = useCtx();
  const h = m.p.household;
  const ssn = (p: any) => wp.piiCorrections.get(`household:${p.id}|ssn`);
  return (
    <div className="card">
      <h2>Household</h2>
      <table className="t"><thead><tr><th>Person</th><th>SSN</th><th>DOB</th><th>Relationship</th><th>IP PIN</th><th>Notes</th></tr></thead><tbody>
        {h.people.map((p: any) => { const c = ssn(p); return (
          <tr key={p.id}><td>{p.name}</td>
            <td><Sensitive value={c ? c.data.to : p.ssn} refId={`household:${p.id}`} field="ssn" />{c && <div className="small"><Pill kind="ok">corrected</Pill> <span className="muted">organizer value kept in history · {name(c.actor)}</span></div>}</td>
            <td className="small">{p.dob}</td><td className="small">{p.role}{p.relationship ? `, ${p.relationship}` : ''}{p.full_time_student ? ', full-time student' : ''}</td>
            <td>{p.ip_pin ? <Sensitive value={p.ip_pin} refId={`household:${p.id}`} field="ip_pin" kind="pin" /> : '—'}</td>
            <td className="small muted">{p.note || p.own_income || ''}</td></tr>
        ); })}
      </tbody></table>
      <div className="grid2" style={{ marginTop: 10 }}>
        <div className="small"><b>Residency</b>{h.residency.map((r: any) => <div key={r.state}>{r.state} {r.status} {r.from} → {r.to}</div>)}<b>Addresses</b>{h.addresses.map((a: any) => <div key={a.address}>{a.address} ({a.type}) {a.from} → {a.to || 'now'}</div>)}</div>
        <div className="small"><b>Refund / payment account</b><div>{h.bank_account_for_refund_or_payment.bank}, {h.bank_account_for_refund_or_payment.type}</div><div>Routing <Sensitive value={h.bank_account_for_refund_or_payment.routing} refId="household:bank" field="routing" kind="account" /> · Account <Sensitive value={h.bank_account_for_refund_or_payment.account} refId="household:bank" field="account" kind="account" /></div><div>Prior-year AGI for e-signature: {fmt(h.prior_year_agi_for_esignature)}</div></div>
      </div>
    </div>
  );
}
