import { useState } from 'react';
import { useCtx, resolvedFinding } from '../app/ctx';
import { AREAS } from '../data/model';
import { go, inspect } from '../store/session';
import { taxEffect, CATEGORY_LABEL } from '../store/projections';
import { Ref, Refs, fmt, Pill, Sev, useRun, Effect, Prompt, toast, useReveal } from '../ui/kit';
import type { Finding } from '../checks/checks';

export function ChecksView({ focus }: { focus?: string }) {
  const ctx = useCtx();
  const { findings, wp, act, can, vi } = ctx;
  const run = useRun();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('open');
  const status = (f: Finding) => resolvedFinding(wp, f);
  const groups: [string, Finding[]][] = [
    ['Open errors', findings.filter((f) => f.severity === 'error' && !status(f))],
    ['Open warnings & judgment calls', findings.filter((f) => f.severity === 'warning' && !status(f))],
    ['Information & outside filings', findings.filter((f) => f.severity === 'info' && !status(f))],
    ['Resolved', findings.filter((f) => status(f))],
    ['Passed', findings.filter((f) => f.severity === 'pass')],
  ];
  const cur = focus ? findings.find((f) => f.id === 'chk:' + focus) : undefined;
  const totalFed = findings.filter((f) => !status(f) && f.proposals).flatMap((f) => f.proposals!).reduce((a, p) => a + taxEffect(vi, p).fed, 0);
  const totalCa = findings.filter((f) => !status(f) && f.proposals).flatMap((f) => f.proposals!).reduce((a, p) => a + taxEffect(vi, p).ca, 0);

  const acceptMany = () => {
    const list = findings.filter((f) => sel.has(f.id) && f.proposals?.length && !status(f));
    try {
      const all = list.flatMap((f) => act.acceptFinding(f) || []);
      toast(`Accepted ${list.length} findings (${all.length} adjustments)`, { undo: () => act.undo(all.map((e) => e.id)) });
      setSel(new Set());
    } catch (e: any) { toast(e.message, { err: true }); }
  };

  return (
    <div>
      <div className="pagehead">
        <div><h1>Checks & findings</h1><div className="sub">{findings.length} independent checks recompute the return from source documents instead of trusting the engine. Open proposals change federal tax by <Effect v={totalFed} /> and California by <Effect v={totalCa} /> (estimated with {vi.v.version} rates).</div></div>
      </div>
      <div className="grid2" style={{ gridTemplateColumns: cur ? '380px 1fr' : '1fr' }}>
        <div>
          {sel.size > 0 && can('adjust') && <div className="banner ok row"><b>{sel.size} selected</b><span className="spacer" /><button className="btn sm primary" onClick={acceptMany}>Accept proposals</button><button className="btn sm ghost" onClick={() => setSel(new Set())}>Clear</button></div>}
          {groups.map(([g, list]) => list.length > 0 && (
            <div key={g} className="card tight">
              <h3>{g} ({list.length})</h3>
              <table className="t"><tbody>
                {list.map((f) => (
                  <tr key={f.id} className={`click ${cur?.id === f.id ? 'sel' : ''}`} onClick={() => go('/checks/' + f.id.slice(4))}>
                    <td style={{ width: 20 }} onClick={(e) => e.stopPropagation()}>{f.proposals && !status(f) && <input type="checkbox" checked={sel.has(f.id)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(f.id) : n.delete(f.id); setSel(n); }} />}</td>
                    <td style={{ width: 70 }}><Sev s={f.severity} /></td>
                    <td>{f.title}<div className="small muted">{AREAS.find((a) => a.id === f.area)?.name} · {f.kind}{f.needsJudgment ? ' · needs judgment' : ''}</div></td>
                    <td>{status(f) && <Pill kind="ok">{status(f)}</Pill>}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          ))}
        </div>
        {cur && <FindingDetail f={cur} />}
      </div>
    </div>
  );
}

function FindingDetail({ f }: { f: Finding }) {
  const ctx = useCtx();
  const { vi, wp, act, can, name } = ctx;
  const run = useRun();
  const st = resolvedFinding(wp, f);
  const adjs = wp.adjustments.filter((a) => a.findingId === f.id);
  const dismissed = wp.dismissed.get(f.id);
  const rv = useReveal(f.pii?.target || f.id, 'finding');
  const hasPII = /\b\d{3}-\d{2}-\d{4}\b/.test(f.summary + String(f.engine) + String(f.expected));
  return (
    <div className="card" style={{ position: 'sticky', top: 0, alignSelf: 'start' }}>
      <div className="row"><Sev s={f.severity} /><Pill>{f.kind}</Pill>{f.needsJudgment && <Pill kind="violet">needs judgment</Pill>}<span className="spacer" />{st && <Pill kind="ok">{st}</Pill>}<button className="btn sm ghost" onClick={() => go('/checks')}>✕</button></div>
      <h2 style={{ marginTop: 8 }}>{f.title}</h2>
      <div className="small muted" style={{ marginBottom: 10 }}><b>Check:</b> {f.check}</div>
      <p>{rv.r(f.summary)}</p>{hasPII && <div style={{ marginBottom: 8 }}>{rv.button}</div>}
      {(f.engine !== undefined || f.expected !== undefined) && (
        <div className="grid2" style={{ margin: '10px 0' }}>
          <div className="kpi"><div className="k">Engine</div><div className="v" style={{ fontSize: 16 }}>{rv.r(fmt(f.engine))}</div></div>
          <div className="kpi"><div className="k">Recomputed</div><div className="v" style={{ fontSize: 16, color: f.severity === 'pass' ? undefined : 'var(--accent)' }}>{rv.r(fmt(f.expected))}</div></div>
        </div>
      )}
      <h3>Evidence</h3>
      <div style={{ marginBottom: 10 }}><Refs list={f.evidence} /></div>
      {f.lines.length > 0 && <><h3>Return lines</h3><div style={{ marginBottom: 10 }}><Refs list={f.lines} /></div></>}
      {f.authority && <div className="small" style={{ marginBottom: 10 }}><b>Authority:</b> {f.authority}</div>}

      {f.proposals && (
        <>
          <h3>Proposed adjustments</h3>
          <table className="t" style={{ marginBottom: 10 }}>
            <thead><tr><th>Line</th><th>Change</th><th className="num">Line Δ</th><th>Federal as / CA as</th><th className="num">Fed</th><th className="num">CA</th></tr></thead>
            <tbody>{f.proposals.map((p, i) => { const e = taxEffect(vi, p); return <tr key={i}><td><Ref r={p.line} short /></td><td className="small">{p.label}{p.effectOverride && <div className="muted">effect from {p.effectOverride.source}</div>}</td><td className="num">{fmt(p.delta)}</td><td className="small muted">{CATEGORY_LABEL[p.category]} / {CATEGORY_LABEL[p.caCategory]}</td><td className="num"><Effect v={e.fed} /></td><td className="num"><Effect v={e.ca} /></td></tr>; })}</tbody>
          </table>
        </>
      )}

      {adjs.length > 0 && <div className="banner ok small">Adjusted by {name(adjs[0].actor)}: {adjs.map((a) => a.reason).join('; ')}{adjs.some((a) => a.needsPartner && !a.approvedBy) ? ': awaiting partner approval' : ''}</div>}
      {dismissed && <div className="banner warn small">Dismissed by {name(dismissed.actor)}: {dismissed.data.reason}</div>}

      {!st && f.severity !== 'pass' && (
        <div className="row wrap" style={{ marginTop: 10 }}>
          {f.proposals && can('adjust') && <button className="btn primary" onClick={() => run(() => act.acceptFinding(f), 'Adjustments recorded')}>Accept {f.proposals.length > 1 ? `${f.proposals.length} adjustments` : 'adjustment'}</button>}
          {f.pii && can('pii.correct') && <button className="btn primary" onClick={() => run(() => act.fixPII(f), 'Identifier corrected (original kept in history)')}>Correct to {f.pii.to.replace(/^\d{3}-\d{2}/, '•••-••')}</button>}
          {can('judgment') && <Prompt label={f.proposals ? 'Dismiss (no change)…' : 'Record decision…'} placeholder="Reason and what you relied on" onSubmit={(t) => run(() => act.dismissFinding(f, t), 'Decision recorded')} cta="Record" />}
          {can('note.open') && <Prompt label="Review note…" onSubmit={(t) => run(() => act.openNote(f.lines[0] || f.evidence[0], `${f.title}: ${t}`, true, f.area), 'Review note opened')} />}
          {can('question.ask') && <Prompt label="Ask client…" placeholder="Question to the client" onSubmit={(t) => run(() => act.ask(f.area === 'business' || f.area === 'pass_throughs_and_basis' || /crypto|Coinhaven/i.test(f.title) ? 'cu-02' : 'cu-01', t, [...f.lines, ...f.evidence.slice(0, 2)]), 'Question sent to client')} />}
        </div>
      )}
    </div>
  );
}
