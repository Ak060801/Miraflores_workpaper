import { useState } from 'react';
import { useCtx } from '../app/ctx';
import { inspect, go } from '../store/session';
import { CATEGORY_LABEL } from '../store/projections';
import { Ref, fmt, Pill, Avatar, date, useRun, Effect, toast } from '../ui/kit';

export function AdjustmentsView() {
  const ctx = useCtx();
  const { vi, wp, act, can, name, user } = ctx;
  const run = useRun();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const adjs = wp.adjustments;
  const s = vi.v.summary;
  const p = wp.position;
  const selected = adjs.filter((a) => sel.has(a.id));
  const fedSum = adjs.filter((a) => !a.amendment).reduce((x, a) => x + a.fed, 0);
  const caSum = adjs.filter((a) => !a.amendment).reduce((x, a) => x + a.ca, 0);

  return (
    <div>
      <div className="pagehead"><div><h1>Adjustments</h1><div className="sub">Every change to the engine's return, with who, why, authority and tax effect. The engine's original is never overwritten; undo appends a reversal.</div></div></div>
      <div className="grid2">
        <div className="card">
          <h2>Federal</h2>
          <table className="t"><tbody>
            <tr><td>Total tax, engine {vi.v.version}</td><td className="num">{fmt(s.federal.total_tax)}</td></tr>
            <tr><td>Tax effect of adjustments</td><td className="num"><Effect v={p.federal.total_tax - s.federal.total_tax} /></td></tr>
            <tr className="total"><td>Total tax, workpaper</td><td className="num">{fmt(p.federal.total_tax)}</td></tr>
            <tr><td>Payments (engine {fmt(s.federal.payments)})</td><td className="num">{fmt(p.federal.payments)}</td></tr>
            <tr><td>Estimated tax penalty (engine)</td><td className="num">{fmt(s.federal.penalty)}</td></tr>
            <tr className="total"><td>Balance due, workpaper</td><td className="num">{fmt(p.federal.balance_due)}</td></tr>
          </tbody></table>
        </div>
        <div className="card">
          <h2>California</h2>
          <table className="t"><tbody>
            <tr><td>Total tax, engine {vi.v.version}</td><td className="num">{fmt(s.california.total_tax)}</td></tr>
            <tr><td>Tax effect of adjustments</td><td className="num"><Effect v={p.california.total_tax - s.california.total_tax} /></td></tr>
            <tr className="total"><td>Total tax, workpaper</td><td className="num">{fmt(p.california.total_tax)}</td></tr>
            <tr><td>Payments (engine {fmt(s.california.payments)})</td><td className="num">{fmt(p.california.payments)}</td></tr>
            <tr className="total"><td>{p.california.balance_due < 0 ? 'Refund' : 'Balance due'}, workpaper</td><td className="num">{fmt(Math.abs(p.california.balance_due))}</td></tr>
          </tbody></table>
        </div>
      </div>
      <div className="banner warn small">Effects are estimates: line change × the engine's per-dollar rate for its category (README rule), or the engine's own what-if result where one exists (HVAC). Secondary effects (SE tax, SEP limit, QBI, phase-outs) need an engine run; affected lines show "recompute".</div>

      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Ledger ({adjs.length})</h2>
          <span className="spacer" />
          {sel.size > 0 && can('approve.adjustment') && <button className="btn sm primary" onClick={() => { run(() => act.approve(selected.filter((a) => a.needsPartner && !a.approvedBy).map((a) => a.id)), `Approved ${selected.length}`); setSel(new Set()); }}>Approve selected</button>}
          {sel.size > 0 && can('adjust') && <button className="btn sm danger" onClick={() => { const ev = act.undo([...sel]); toast(`Reversed ${sel.size} adjustment(s)`, { undo: () => act.undo(ev.map((e) => e.id)) }); setSel(new Set()); }}>Reverse selected</button>}
          {can('approve.adjustment') && adjs.some((a) => a.needsPartner && !a.approvedBy) && <button className="btn sm" onClick={() => run(() => act.approve(adjs.filter((a) => a.needsPartner && !a.approvedBy).map((a) => a.id)), 'Approved all pending')}>Approve all pending</button>}
        </div>
        {adjs.length === 0 && <div className="empty">No adjustments yet. Accept findings on the Checks screen, or adjust any line from its trace.</div>}
        {adjs.length > 0 && (
          <table className="t">
            <thead><tr><th><input type="checkbox" checked={sel.size === adjs.length} onChange={(e) => setSel(e.target.checked ? new Set(adjs.map((a) => a.id)) : new Set())} /></th><th>When / who</th><th>Line</th><th className="num">Engine</th><th className="num">Δ</th><th>Why</th><th>Effect as</th><th className="num">Fed</th><th className="num">CA</th><th>Partner</th></tr></thead>
            <tbody>
              {adjs.map((a) => (
                <tr key={a.id} className={sel.has(a.id) ? 'sel' : ''}>
                  <td><input type="checkbox" checked={sel.has(a.id)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(a.id) : n.delete(a.id); setSel(n); }} /></td>
                  <td className="small"><div className="row"><Avatar id={a.actor} />{date(a.at)}</div></td>
                  <td><Ref r={a.line} short /></td>
                  <td className="num">{fmt(vi.byKey.get(a.line)?.value)}</td>
                  <td className="num"><Effect v={a.delta} /></td>
                  <td className="small">{a.reason}{a.findingId && <div><Ref r={a.findingId}>finding</Ref></div>}{a.authority && <div className="muted">{a.authority}</div>}{a.amendment && <Pill kind="violet">amendment</Pill>}</td>
                  <td className="small muted">{CATEGORY_LABEL[a.category]}{a.caCategory !== a.category ? ` / ${CATEGORY_LABEL[a.caCategory]}` : ''}{a.effectOverride ? ' (engine what-if)' : ''}</td>
                  <td className="num"><Effect v={a.fed} /></td>
                  <td className="num"><Effect v={a.ca} /></td>
                  <td>{a.needsPartner ? (a.approvedBy ? <Pill kind="ok">✓ {name(a.approvedBy).split(' ')[0]}</Pill> : <Pill kind="warn">needed</Pill>) : <span className="muted small">not needed</span>}</td>
                </tr>
              ))}
              <tr className="total"><td colSpan={7}>Total</td><td className="num"><Effect v={fedSum} /></td><td className="num"><Effect v={caSum} /></td><td></td></tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
