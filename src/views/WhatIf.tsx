import { Fragment, useState } from 'react';
import { useCtx, resolvedFinding } from '../app/ctx';
import { taxEffect, CATEGORY_LABEL, type Category } from '../store/projections';
import { Ref, fmt, Pill, Effect, useRun } from '../ui/kit';
import { inspect } from '../store/session';

export function WhatIfView() {
  const ctx = useCtx();
  const { m, vi, wp, findings, act, can } = ctx;
  const run = useRun();
  const [open, setOpen] = useState<string | null>(null);
  const props = findings.filter((f) => f.proposals && !resolvedFinding(wp, f));
  const [on, setOn] = useState<Set<string>>(new Set());
  const [alts, setAlts] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState<{ amount: number; category: Category; caCategory: Category; label: string }[]>([]);
  const [amt, setAmt] = useState(''); const [cat, setCat] = useState<Category>('ordinary_income'); const [lbl, setLbl] = useState('');

  let fed = 0, ca = 0;
  for (const f of props) if (on.has(f.id)) for (const p of f.proposals!) { const e = taxEffect(vi, p); if (p.category === 'payment') fed += e.fed; else fed += e.fed; ca += e.ca; }
  for (const a of m.p.what_if.alternatives) if (alts.has(a.id)) { fed += a.federal.total_tax_change; ca += a.california.total_tax_change; }
  for (const c of custom) { const e = taxEffect(vi, c); fed += e.fed; ca += e.ca; }
  const base = wp.position;

  return (
    <div>
      <div className="pagehead"><div><h1>What-if</h1><div className="sub">Try alternatives without touching the workpaper. Engine alternatives are exact engine results; everything else is estimated with the {vi.v.version} tax-effect rates.</div></div></div>
      <div className="grid4">
        <div className="kpi"><div className="k">Federal balance due now</div><div className="v">{fmt(base.federal.balance_due)}</div></div>
        <div className="kpi"><div className="k">With what-ifs</div><div className="v" style={{ color: 'var(--violet)' }}>{fmt(base.federal.balance_due + fed)}</div><div className="d"><Effect v={fed} /></div></div>
        <div className="kpi"><div className="k">California now</div><div className="v">{fmt(base.california.balance_due)}</div><div className="d muted">negative = refund</div></div>
        <div className="kpi"><div className="k">With what-ifs</div><div className="v" style={{ color: 'var(--violet)' }}>{fmt(base.california.balance_due + ca)}</div><div className="d"><Effect v={ca} /></div></div>
      </div>
      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Engine alternatives (base {m.p.what_if.alternatives[0]?.base_version})</h2>
          <table className="t"><thead><tr><th></th><th>Alternative</th><th className="num">Fed tax</th><th className="num">CA tax</th></tr></thead><tbody>
            {m.p.what_if.alternatives.map((a: any) => (
              <Fragment key={a.id}>
                <tr className="click" onClick={() => setOpen(open === a.id ? null : a.id)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={alts.has(a.id)} onChange={(e) => { const n = new Set(alts); e.target.checked ? n.add(a.id) : n.delete(a.id); setAlts(n); }} /></td>
                  <td>{a.description}<div className="small muted">{a.changed_lines.length} lines change{a.id === 'hvac_improvement' && wp.adjustments.some((x) => x.effectOverride?.source === 'what_if:hvac_improvement') ? ' · already adopted as an adjustment' : ''}</div></td>
                  <td className="num"><Effect v={a.federal.total_tax_change} /></td><td className="num"><Effect v={a.california.total_tax_change} /></td>
                </tr>
                {open === a.id && <tr><td></td><td colSpan={3}><table className="t"><tbody>{a.changed_lines.slice(0, 40).map((c: any) => <tr key={c.key} className="click" onClick={() => inspect(c.key)}><td className="mono small">{c.key}</td><td className="num">{fmt(c.old)}</td><td className="num">→ {fmt(c.new)}</td></tr>)}</tbody></table></td></tr>}
              </Fragment>
            ))}
          </tbody></table>
          <div className="small muted" style={{ marginTop: 6 }}>Note: section 179 changes nothing federally (bonus already expenses it) but saves California 1,050 because California caps 179 at 25,000 and allows no bonus. That is a real planning point for the client.</div>
        </div>
        <div className="card">
          <h2>Open findings as what-ifs</h2>
          <table className="t"><tbody>
            {props.map((f) => {
              const e = f.proposals!.reduce((x, p) => { const t = taxEffect(vi, p); return { fed: x.fed + t.fed, ca: x.ca + t.ca }; }, { fed: 0, ca: 0 });
              return <tr key={f.id}><td><input type="checkbox" checked={on.has(f.id)} onChange={(ev) => { const n = new Set(on); ev.target.checked ? n.add(f.id) : n.delete(f.id); setOn(n); }} /></td><td className="small">{f.title}</td><td className="num"><Effect v={e.fed} /></td><td className="num"><Effect v={e.ca} /></td></tr>;
            })}
            {props.length === 0 && <tr><td className="muted">All findings resolved.</td></tr>}
          </tbody></table>
          {on.size > 0 && can('adjust') && <button className="btn sm primary" style={{ marginTop: 8 }} onClick={() => { for (const f of props.filter((x) => on.has(x.id))) run(() => act.acceptFinding(f), 'Committed as adjustments'); setOn(new Set()); }}>Commit {on.size} to the workpaper</button>}
          <h3 style={{ marginTop: 14 }}>Ad-hoc</h3>
          <div className="row wrap"><input type="number" placeholder="amount" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ width: 100 }} /><select value={cat} onChange={(e) => setCat(e.target.value as Category)}>{(['wages', 'interest', 'schc_profit', 'stcg', 'ltcg', 'ordinary_income', 'adjustment', 'itemized', 'ca_source_income', 'credit'] as Category[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select><input type="text" placeholder="label" value={lbl} onChange={(e) => setLbl(e.target.value)} /><button className="btn sm" disabled={!parseFloat(amt)} onClick={() => { setCustom([...custom, { amount: parseFloat(amt), category: cat, caCategory: cat, label: lbl || 'ad-hoc' }]); setAmt(''); setLbl(''); }}>Add</button></div>
          {custom.map((c, i) => { const e = taxEffect(vi, c); return <div key={i} className="row small" style={{ marginTop: 4 }}><span>{c.label}: {fmt(c.amount)} as {CATEGORY_LABEL[c.category]}</span><span className="spacer" /><Effect v={e.fed} /><Effect v={e.ca} /><button className="btn sm ghost" onClick={() => setCustom(custom.filter((_, j) => j !== i))}>✕</button></div>; })}
        </div>
      </div>
    </div>
  );
}
