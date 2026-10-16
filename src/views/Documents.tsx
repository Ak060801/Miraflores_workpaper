import { useMemo, useState } from 'react';
import { useCtx, autoDisposition } from '../app/ctx';
import { AREAS, areaOfDoc, linesUsingDoc } from '../data/model';
import { openDoc } from '../store/session';
import { Ref, fmt, Pill, Tabs, date, useRun, ContribTag, Sev } from '../ui/kit';
import { evTrust } from '../ui/Inspector';
import { TRUST_SCORE_AUTHOR } from '../contrib/ayaan/trustScore';

export function DocumentsView() {
  const [tab, setTab] = useState('index');
  return (
    <div>
      <div className="pagehead"><div><h1>Documents</h1><div className="sub">Every document, where it landed on the return, and why not when it didn't. Click a document to see the page with its fields highlighted.</div></div></div>
      <Tabs tabs={[['index', 'Document index'], ['triage', 'Review triage (values)']]} on={tab} set={setTab} />
      {tab === 'index' ? <DocIndex /> : <Triage />}
    </div>
  );
}

function DocIndex() {
  const ctx = useCtx();
  const { m, vi, wp, findings, act, can, now } = ctx;
  const run = useRun();
  const [area, setArea] = useState('all');
  const [only, setOnly] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('informational');
  const [reason, setReason] = useState('');
  const rows = useMemo(() => m.p.documents.map((d) => {
    const landed = linesUsingDoc(m, vi, d.id);
    const manual = wp.dispositions.get(d.id);
    const auto = autoDisposition(m, wp, d.id);
    const disp = manual ? { status: manual.data.status, reason: manual.data.reason, by: manual.actor } : auto ? { ...auto, by: 'engine' } : null;
    const issues = findings.filter((f) => f.severity !== 'pass' && f.evidence.some((r) => r === d.id || r.startsWith(`doc:${d.id}`) || m.evs.get(r)?.document_id === d.id));
    return { d, landed: landed.length, disp, issues, received: d.received_at <= now };
  }), [m, vi, wp, findings, now]);
  const vis = rows.filter((r) => (area === 'all' || areaOfDoc(r.d) === area) && (!only || (!r.disp && r.received)));
  const unacc = rows.filter((r) => r.received && !r.disp).length;

  return (
    <div className="card">
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <select value={area} onChange={(e) => setArea(e.target.value)}><option value="all">All areas</option>{AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <label className="chk"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Unaccounted only ({unacc})</label>
        <span className="spacer" />
        <span className="small muted">{rows.filter((r) => r.disp).length} of {rows.filter((r) => r.received).length} received documents accounted for</span>
      </div>
      {sel.size > 0 && can('disposition') && (
        <div className="banner ok row">
          <b>{sel.size} selected</b>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>{['used', 'superseded', 'duplicate', 'informational', 'not_used', 'out_of_scope'].map((s) => <option key={s}>{s}</option>)}</select>
          <input type="text" placeholder="reason (applies to all)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: 1 }} />
          <button className="btn sm primary" disabled={!reason.trim()} onClick={() => { run(() => act.dispose([...sel], status, reason), `Disposition recorded for ${sel.size} documents`); setSel(new Set()); setReason(''); }}>Apply</button>
          <button className="btn sm ghost" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}
      <table className="t">
        <thead><tr><th></th><th>ID</th><th>Document</th><th>Belongs to</th><th>Received</th><th className="num">Pages</th><th>Extraction</th><th className="num">Lines</th><th>Accounted for</th><th>Issues</th></tr></thead>
        <tbody>
          {vis.map(({ d, landed, disp, issues, received }) => (
            <tr key={d.id} className={`click ${sel.has(d.id) ? 'sel' : ''}`} style={{ opacity: received ? 1 : 0.45 }} onClick={() => openDoc(d.id)}>
              <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(d.id)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(d.id) : n.delete(d.id); setSel(n); }} /></td>
              <td className="mono small">{d.id}</td>
              <td>{d.title}{d.marked_corrected && <> <Pill kind="warn">CORRECTED</Pill></>}</td>
              <td className="small">{d.belongs_to}</td>
              <td className="small">{received ? date(d.received_at) : <Pill kind="violet">{date(d.received_at)}</Pill>}</td>
              <td className="num">{d.page_count}</td>
              <td className="small">{d.extraction.status === 'extracted' ? <span className="muted">{d.extraction.values} values</span> : <Pill kind="warn" title={d.extraction.reason || ''}>{d.extraction.status}</Pill>}</td>
              <td className="num">{landed || <span className="muted">0</span>}</td>
              <td className="small">{disp ? <span title={disp.reason}><Pill kind="ok">{disp.status}</Pill></span> : received ? <Pill kind="warn">unaccounted</Pill> : ''}</td>
              <td>{issues.length > 0 && <Pill kind={issues.some((i) => i.severity === 'error') ? 'err' : 'warn'}>{issues.length}</Pill>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Triage() {
  const ctx = useCtx();
  const { m, vi, act, can } = ctx;
  const run = useRun();
  const [showAll, setShowAll] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const scored = useMemo(() => {
    const usedEv = new Set(vi.v.lines.flatMap((l) => l.sources));
    return m.p.extracted_values.filter((e) => showAll || usedEv.has(e.id)).map((e) => ({ e, t: evTrust(ctx, e.id) })).sort((a, b) => a.t.score - b.t.score);
  }, [m, vi, showAll, ctx.wp]);
  const bands = { verify: scored.filter((x) => x.t.band === 'verify').length, look: scored.filter((x) => x.t.band === 'look').length, trust: scored.filter((x) => x.t.band === 'trust').length };
  return (
    <div className="card contrib">
      <div className="row" style={{ marginBottom: 8 }}>
        <ContribTag slot="Slot 1: trust score" author={TRUST_SCORE_AUTHOR} />
        <span className="small muted">Review order for extracted values: least trustworthy first. Scoring lives in <span className="mono">src/contrib/ayaan/trustScore.ts</span>.</span>
      </div>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <Pill kind="err">verify {bands.verify}</Pill><Pill kind="warn">look {bands.look}</Pill><Pill kind="ok">trust {bands.trust}</Pill>
        <label className="chk small"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> include values not used on the return</label>
        <span className="spacer" />
        {sel.size > 0 && can('verify') && <button className="btn sm primary" onClick={() => { run(() => act.verify([...sel], 'agreed_to_source_document', 'Bulk triage review'), `Verified ${sel.size} values`); setSel(new Set()); }}>Verify {sel.size} selected</button>}
      </div>
      <table className="t">
        <thead><tr><th></th><th>Value</th><th>Document</th><th className="num">Extracted</th><th className="num">Conf.</th><th>Score</th><th>Why</th></tr></thead>
        <tbody>
          {scored.slice(0, 200).map(({ e, t }) => (
            <tr key={e.id} className="click" onClick={() => openDoc(e.document_id, e.page, e.id)}>
              <td onClick={(ev) => ev.stopPropagation()}><input type="checkbox" checked={sel.has(e.id)} onChange={(x) => { const n = new Set(sel); x.target.checked ? n.add(e.id) : n.delete(e.id); setSel(n); }} /></td>
              <td>{e.label} <span className="mono small muted">{e.id}</span></td>
              <td className="small">{e.document_id} p.{e.page}</td>
              <td className="num">{fmt(e.value)}</td><td className="num">{e.confidence}</td>
              <td><Pill kind={t.band === 'trust' ? 'ok' : t.band === 'look' ? 'warn' : 'err'}>{t.score.toFixed(2)}</Pill></td>
              <td className="small muted">{t.reasons.join('; ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
