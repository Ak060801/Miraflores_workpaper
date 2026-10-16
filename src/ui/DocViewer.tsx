import { useEffect, useMemo, useState } from 'react';
import { useCtx, autoDisposition } from '../app/ctx';
import { SimulatedSource } from '../data/docsource';
import { linesUsingDoc, linesUsingEv, areaOfDoc, AREAS } from '../data/model';
import { setSession, inspect, useSession } from '../store/session';
import { Ref, Refs, fmt, Pill, date, useRun, Sev, useReveal, redactText } from './kit';
import { evTrust, VerifyForm, NoteForm, NoteCard, AttachForm, EvidenceItem } from './Inspector';

const DISPOSITIONS = ['used', 'superseded', 'duplicate', 'informational', 'not_used', 'out_of_scope'];

export function DocViewer() {
  const ctx = useCtx();
  const { m, vi, wp, findings, can, act, now } = ctx;
  const s = useSession();
  const f = s.docFocus!;
  const d = m.docs.get(f.docId)!;
  const src = useMemo(() => new SimulatedSource(m), [m]);
  const rend = src.page(f.docId, f.page);
  const run = useRun();
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('not_used');
  const focusEv = f.evId ? m.evs.get(f.evId) : undefined;
  const landed = linesUsingDoc(m, vi, d.id);
  const auto = autoDisposition(m, wp, d.id);
  const manual = wp.dispositions.get(d.id);
  const docFindings = findings.filter((x) => x.evidence.some((r) => r === d.id || r.startsWith(`doc:${d.id}`) || (m.evs.get(r)?.document_id === d.id)));
  const pageEvs = (m.evsByDoc.get(d.id) || []).filter((e) => e.page === f.page);
  const notes = wp.notes.filter((n) => n.target === d.id);
  const evid = wp.evidence.get(d.id) || [];
  const notYet = d.received_at > now;
  const rv = useReveal(f.docId, 'document');

  // Highlight focused field text (and every extracted text lightly) inside the printed content.
  const printed = useMemo(() => {
    const text = rend.printedText;
    const marks: { s: number; e: number; focus: boolean }[] = [];
    for (const r of rend.regions) {
      const t = r.text; if (!t || t === 'X' || t.length < 2) continue;
      const i = text.indexOf(t);
      if (i >= 0) marks.push({ s: i, e: i + t.length, focus: r.evId === f.evId });
    }
    marks.sort((a, b) => a.s - b.s);
    const out: any[] = []; let pos = 0;
    for (const mk of marks) {
      if (mk.s < pos) continue;
      out.push(rv.r(text.slice(pos, mk.s)));
      out.push(<mark key={mk.s} style={mk.focus ? { background: '#ffbf3c', outline: '2px solid #e0a100' } : { background: '#fff3c4' }}>{rv.r(text.slice(mk.s, mk.e))}</mark>);
      pos = mk.e;
    }
    out.push(rv.r(text.slice(pos)));
    return out;
  }, [rend, f.evId, rv.on]);

  const close = () => setSession({ docFocus: null });
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  const setPage = (p: number) => setSession({ docFocus: { docId: d.id, page: p } });

  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <span className="mono muted">{d.id}</span>
          <b>{d.title}</b>
          {d.marked_corrected && <Pill kind="warn">CORRECTED</Pill>}
          <Pill>{d.extraction.status}</Pill>
          {notYet && <Pill kind="violet">not yet received at this point in the season</Pill>}
          {rv.button}
          <span className="spacer" />
          <span className="small muted">page</span>
          <select value={f.page} onChange={(e) => setPage(+e.target.value)}>{Array.from({ length: d.page_count }, (_, i) => <option key={i} value={i + 1}>{i + 1} / {d.page_count}</option>)}</select>
          <button className="btn sm" onClick={close}>Close</button>
        </div>
        <div className="mb">
          <div className="docpane">
            <div className={`paper ${rend.regions.length <= 25 ? 'few' : ''}`}>
              <div className="ph"><span>{d.issuer}</span><span>{d.file_name} · page {f.page} of {d.page_count}</span></div>
              <div className="ptitle">{d.title}</div>
              <div className="pbody" style={{ fontSize: rend.printedText.length > 2200 ? 8.5 : rend.printedText.length > 1200 ? 10 : 11.5 }}>{printed}</div>
              {rend.regions.map((r) => {
                const e = m.evs.get(r.evId)!;
                const t = evTrust(ctx, r.evId);
                const bad = t.reasons.some((x) => /not found/.test(x));
                return (
                  <div key={r.evId} className={`field ${r.evId === f.evId ? 'focus' : ''} ${bad ? 'bad' : ''} ${e.confidence < 0.9 ? 'low' : ''}`}
                    style={{ left: `${r.box.x0 * 100}%`, top: `${r.box.y0 * 100}%`, width: `${(r.box.x1 - r.box.x0) * 100}%`, height: `${Math.max((r.box.y1 - r.box.y0) * 100, 2.2)}%` }}
                    title={`${r.label}: ${r.text}  (confidence ${e.confidence})`}
                    onClick={() => setSession({ docFocus: { docId: d.id, page: f.page, evId: r.evId } })}>
                    <span className="ftag">{r.label}</span>
                  </div>
                );
              })}
              <div className="simbadge">Simulated rendition from printed content · boxes = extraction regions · swap in PdfSource for real pages</div>
            </div>
            <div className="small" style={{ maxWidth: 680, margin: '0 auto', color: '#555' }}>Highlighted text = what the pipeline read. A red box means the extracted value does not appear on the printed page.</div>
          </div>
          <div className="docside">
            {focusEv && (
              <section className="card tight" style={{ borderColor: '#e0a100' }}>
                <h3>Traced field</h3>
                <div className="kv">
                  <div>Field</div><div>{focusEv.label} <span className="mono muted">({focusEv.field})</span></div>
                  <div>Extracted</div><div className="mono">{rv.r(fmt(focusEv.value))}</div>
                  <div>Read as</div><div className="mono">{rv.r(focusEv.text_as_read || '(blank)')}</div>
                  <div>Confidence</div><div>{focusEv.confidence}</div>
                  <div>Trust</div><div>{(() => { const t = evTrust(ctx, focusEv.id); return <><Pill kind={t.band === 'trust' ? 'ok' : t.band === 'look' ? 'warn' : 'err'}>{t.band}</Pill> <span className="small muted">{t.reasons.join('; ')}</span></>; })()}</div>
                  <div>Lands on</div><div>{linesUsingEv(vi, focusEv.id).length ? <Refs list={linesUsingEv(vi, focusEv.id).map((l) => l.key)} /> : <span className="muted">not used</span>}</div>
                </div>
                {can('verify') && <VerifyForm targets={[focusEv.id]} compact />}
              </section>
            )}
            <section>
              <h3>Document</h3>
              <div className="kv small">
                <div>Issuer</div><div>{d.issuer}</div>
                <div>Belongs to</div><div>{d.belongs_to}</div>
                <div>Received</div><div>{date(d.received_at)} · {d.uploaded_by}</div>
                <div>Area</div><div>{AREAS.find((a) => a.id === areaOfDoc(d))?.name}</div>
                <div>Extraction</div><div>{d.extraction.status}, {d.extraction.values} values{d.extraction.reason ? `: ${d.extraction.reason}` : ''}</div>
              </div>
            </section>
            <section>
              <h3>Where it landed</h3>
              {landed.length ? <div className="stack">{landed.slice(0, 40).map(({ line, via }) => <div key={line.key} className="row small"><Ref r={line.key} /><span className="muted">via {via.length} value{via.length > 1 ? 's' : ''}</span></div>)}{landed.length > 40 && <div className="small muted">…and {landed.length - 40} more lines</div>}</div>
                : <div className="small muted">No return line cites this document.</div>}
            </section>
            <section>
              <h3>Accounted for</h3>
              {manual ? <div className="small"><Pill kind="ok">{manual.data.status}</Pill> {manual.data.reason} <span className="muted">· {ctx.name(manual.actor)}</span></div>
                : auto ? <div className="small"><Pill kind="ok">{auto.status}</Pill> {auto.reason}</div>
                  : <div className="small"><Pill kind="warn">unaccounted</Pill> Not used by the engine. Record why.</div>}
              {can('disposition') && (
                <div className="stack" style={{ marginTop: 6 }}>
                  <div className="row"><select value={status} onChange={(e) => setStatus(e.target.value)}>{DISPOSITIONS.map((x) => <option key={x}>{x}</option>)}</select><input type="text" placeholder="reason" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: 1 }} /></div>
                  <button className="btn sm" disabled={!reason.trim()} onClick={() => { run(() => act.dispose([d.id], status, reason), 'Disposition recorded'); setReason(''); }}>Record disposition</button>
                </div>
              )}
            </section>
            {docFindings.length > 0 && <section><h3>Checks citing this document</h3>{docFindings.map((x) => <div key={x.id} className="row small" style={{ marginBottom: 4 }}><Sev s={x.severity} /><Ref r={x.id}>{x.title}</Ref></div>)}</section>}
            <section>
              <h3>Fields on this page ({pageEvs.length})</h3>
              {can('verify') && pageEvs.length > 1 && <VerifyForm targets={pageEvs.map((e) => e.id)} compact />}
              <table className="t" style={{ marginTop: 6 }}><tbody>
                {pageEvs.slice(0, 80).map((e) => {
                  const t = evTrust(ctx, e.id);
                  return <tr key={e.id} className={`click ${e.id === f.evId ? 'sel' : ''}`} onClick={() => setSession({ docFocus: { docId: d.id, page: f.page, evId: e.id } })}>
                    <td className="small">{e.label}</td><td className="num">{rv.r(fmt(e.value))}</td>
                    <td><Pill kind={t.band === 'trust' ? 'ok' : t.band === 'look' ? 'warn' : 'err'}>{t.score.toFixed(2)}</Pill></td>
                    <td>{(wp.verifications.get(e.id) || []).length ? <Pill kind="ok">✓</Pill> : null}</td>
                  </tr>;
                })}
              </tbody></table>
              {pageEvs.length > 80 && <div className="small muted">Showing 80 of {pageEvs.length}. Use Sales detail for large statements.</div>}
            </section>
            <section><h3>Notes & evidence</h3>{notes.map((n) => <NoteCard key={n.id} id={n.id} />)}{evid.map((e) => <EvidenceItem key={e.id} e={e} />)}{can('note.open') && <NoteForm target={d.id} area={areaOfDoc(d)} />}{can('evidence') && <AttachForm target={d.id} />}</section>
          </div>
        </div>
      </div>
    </div>
  );
}
