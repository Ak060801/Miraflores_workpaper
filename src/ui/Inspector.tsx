import { useState } from 'react';
import { useCtx } from '../app/ctx';
import { resolveRef, refKind } from '../data/refs';
import { areaOfLine, AREAS, linesUsingEv } from '../data/model';
import { inspect, openDoc, go } from '../store/session';
import { CATEGORY_LABEL, taxEffect, type Category } from '../store/projections';
import { Ref, Refs, fmt, LineVal, Pill, Avatar, dateTime, useRun, Prompt, Effect, Sev, useReveal } from './kit';
import { trustScore } from '../contrib/ayaan/trustScore';

export function InspectorDrawer({ r }: { r: string }) {
  const { m, vi } = useCtx();
  const kind = refKind(r);
  const res = resolveRef(m, vi, r);
  return (
    <div className="drawer">
      <div className="dh">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="muted small mono">{kind === 'line' ? `${vi.byKey.get(r)?.form ?? ''} · ${vi.byKey.get(r)?.jurisdiction ?? ''}` : kind}</div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{res.label}</div>
        </div>
        <button className="btn sm" onClick={() => inspect(null)}>Close</button>
      </div>
      <div className="db">
        {kind === 'line' ? <LineTrace k={r} /> : kind === 'ev' ? <EvDetail id={r} /> : <GenericRef r={r} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function TraceNode({ k, depth, sign }: { k: string; depth: number; sign?: number }) {
  const { vi } = useCtx();
  const [open, setOpen] = useState(depth < 1);
  const l = vi.byKey.get(k);
  if (!l) return <div className="node"><span className="op">{sign === -1 ? '−' : sign === 1 ? '+' : ''}</span><Ref r={k} /></div>;
  const signs = vi.signs.get(k);
  const kids = l.inputs || [];
  return (
    <div>
      <div className="node" onClick={() => setOpen(!open)}>
        <span className="op">{sign === -1 ? '−' : sign === 1 ? '+' : ''}</span>
        <span className="muted" style={{ width: 10 }}>{kids.length ? (open ? '▾' : '▸') : ''}</span>
        <span className="mono small" style={{ minWidth: 110 }} onClick={(e) => { e.stopPropagation(); inspect(k); }}><a>{k}</a></span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label}</span>
        <LineVal k={k} cents={l.form === 'F8949' && !l.line.endsWith('total')} />
      </div>
      {open && (
        <div className="children">
          {kids.map((c, i) => <TraceNode key={c} k={c} depth={depth + 1} sign={signs ? signs[i] : undefined} />)}
          {(l.sources || []).length > 0 && <div style={{ padding: '3px 4px' }}><Refs list={l.sources} /></div>}
          {!kids.length && !(l.sources || []).length && <div className="muted small" style={{ padding: 4 }}>No inputs or sources recorded ({l.rule}).</div>}
        </div>
      )}
    </div>
  );
}

function LineTrace({ k }: { k: string }) {
  const ctx = useCtx();
  const { m, vi, wp, findings, can, act, name } = ctx;
  const run = useRun();
  const l = vi.byKey.get(k)!;
  if (!l) return <div className="empty">Line {k} is not on engine run {vi.v.version}.</div>;
  const py = m.p.prior_years.return_2024.lines[k];
  const rule = m.p.engine_reference.rules[l.rule];
  const adj = wp.adjusted.get(k);
  const direct = wp.adjByLine.get(k) || [];
  const via = adj ? wp.adjustments.filter((a) => adj.via.includes(a.id) && a.line !== k) : [];
  const ver = wp.verifications.get(k) || [];
  const notes = wp.notes.filter((n) => n.target === k);
  const ev = wp.evidence.get(k) || [];
  const fnd = findings.filter((f) => f.lines.includes(k));
  const down = vi.downstream.get(k) || [];
  const history = wp.events.filter((e) => e.target === k || (e.data?.targets || []).includes(k));
  const others = m.versions.map((v) => ({ v: v.v.version, val: v.byKey.get(k)?.value }));
  const area = areaOfLine(l);
  const nonlin = wp.affectedNonlinear.get(k);

  return (
    <div>
      <section>
        <div className="grid2">
          <div className="kpi"><div className="k">Engine {vi.v.version}</div><div className="v">{fmt(l.value, { cents: l.form === 'F8949' && !l.line.endsWith('total') })}</div></div>
          <div className="kpi"><div className="k">Workpaper</div><div className="v" style={{ color: adj?.delta ? 'var(--accent)' : undefined }}>{fmt(adj ? adj.value : l.value)}</div>{adj?.delta ? <div className="d">adjusted <Effect v={adj.delta} /></div> : nonlin ? <div className="d"><Pill kind="warn">upstream change; engine recompute needed</Pill></div> : <div className="d muted">no adjustments</div>}</div>
        </div>
        <div className="row wrap small" style={{ marginTop: 8 }}>
          <Pill>{AREAS.find((a) => a.id === area)?.name}</Pill>
          {py !== undefined && <span className="muted">2024: <span className="mono">{fmt(py)}</span></span>}
          {others.map((o) => <span key={o.v} className="muted">{o.v}: <span className="mono">{fmt(o.val)}</span></span>)}
        </div>
      </section>

      <section>
        <h3>How it was built</h3>
        <div className="small" style={{ marginBottom: 6 }}><span className="mono">{l.rule}</span>: {rule || 'rule not described'}</div>
        {l.note && <div className="banner warn small">{l.note}</div>}
        <div className="tree"><TraceNode k={k} depth={0} /></div>
      </section>

      {fnd.length > 0 && (
        <section>
          <h3>Checks on this line</h3>
          {fnd.map((f) => (
            <div key={f.id} className="card tight" style={{ cursor: 'pointer' }} onClick={() => go('/checks/' + f.id.slice(4))}>
              <div className="row"><Sev s={f.severity} /><b>{f.title}</b></div>
              <div className="small muted" style={{ marginTop: 4 }}>{f.summary.slice(0, 220)}{f.summary.length > 220 ? '…' : ''}</div>
            </div>
          ))}
        </section>
      )}

      <section>
        <h3>Adjustments</h3>
        {[...direct, ...via].length === 0 && <div className="muted small">None.</div>}
        {[...direct, ...via].map((a) => (
          <div key={a.id} className="card tight">
            <div className="row"><Avatar id={a.actor} /><b>{a.line}</b><span className="val"><Effect v={a.delta} /></span><span className="spacer" />{a.line !== k && <Pill>flows in</Pill>}{a.needsPartner && (a.approvedBy ? <Pill kind="ok">partner ✓</Pill> : <Pill kind="warn">needs partner</Pill>)}</div>
            <div className="small" style={{ marginTop: 4 }}>{a.reason}</div>
            <div className="small muted">{name(a.actor)} · {dateTime(a.at)} · tax effect fed <Effect v={a.fed} /> CA <Effect v={a.ca} /></div>
          </div>
        ))}
        {can('adjust') && typeof l.value === 'number' && <AdjustForm k={k} />}
      </section>

      <section>
        <h3>Verification</h3>
        {ver.length === 0 && <div className="muted small">Not verified.</div>}
        {ver.map((v) => <div key={v.id + v.target} className="row small"><Pill kind="ok">✓ {v.method.replace(/_/g, ' ')}</Pill><span>{name(v.actor)}</span><span className="muted">{dateTime(v.at)}</span>{v.note && <span className="muted">· {v.note}</span>}</div>)}
        {can('verify') && <VerifyForm targets={[k]} />}
      </section>

      <section>
        <h3>Review notes</h3>
        {notes.map((n) => <NoteCard key={n.id} id={n.id} />)}
        {notes.length === 0 && <div className="muted small">None.</div>}
        {can('note.open') && <NoteForm target={k} area={area} />}
      </section>

      <section>
        <h3>Evidence attached</h3>
        {ev.map((e) => <EvidenceItem key={e.id} e={e} />)}
        {ev.length === 0 && <div className="muted small">Only the sources above.</div>}
        {can('evidence') && <AttachForm target={k} />}
      </section>

      <section>
        <h3>Where it flows</h3>
        {down.length ? <Refs list={down} /> : <span className="muted small">Final line.</span>}
      </section>

      <section>
        <h3>History</h3>
        {history.length === 0 && <div className="muted small">No workpaper activity.</div>}
        <div className="feed">{history.map((e) => <div key={e.id} className="item small"><span className="when">{dateTime(e.at)}</span><Avatar id={e.actor} /><span>{e.type.replace('.', ' ')} {e.data?.method || e.data?.reason || e.data?.text || ''}</span></div>)}</div>
      </section>
    </div>
  );
}

const CATS: Category[] = ['wages', 'interest', 'schc_profit', 'stcg', 'ltcg', 'ordinary_income', 'adjustment', 'salt', 'itemized', 'ca_source_income', 'credit', 'payment', 'none'];

function AdjustForm({ k }: { k: string }) {
  const { act, vi } = useCtx();
  const run = useRun();
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState('');
  const [cat, setCat] = useState<Category>('ordinary_income');
  const [caCat, setCaCat] = useState<Category>('ordinary_income');
  const [reason, setReason] = useState('');
  const [authority, setAuthority] = useState('');
  const [sign, setSign] = useState(1);
  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}>Propose adjustment…</button>;
  const d = parseFloat(delta) || 0;
  const eff = taxEffect(vi, { amount: d * sign, category: cat, caCategory: caCat });
  return (
    <div className="card tight stack">
      <div className="row"><span className="small" style={{ width: 120 }}>Change to line</span><input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. -2150" /></div>
      <div className="row"><span className="small" style={{ width: 120 }}>Federal effect as</span><select value={cat} onChange={(e) => setCat(e.target.value as Category)}>{CATS.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></div>
      <div className="row"><span className="small" style={{ width: 120 }}>California as</span><select value={caCat} onChange={(e) => setCaCat(e.target.value as Category)}>{CATS.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></div>
      <div className="row"><span className="small" style={{ width: 120 }}>Line is</span><select value={sign} onChange={(e) => setSign(+e.target.value)}><option value={1}>income / deduction amount (same sign)</option><option value={-1}>an expense (reduces income)</option></select></div>
      <input type="text" placeholder="Why (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <input type="text" placeholder="Authority relied on (optional)" value={authority} onChange={(e) => setAuthority(e.target.value)} />
      <div className="small">Estimated effect: federal <Effect v={eff.fed} />, California <Effect v={eff.ca} /> (rates from {vi.v.version})</div>
      <div className="row">
        <button className="btn sm primary" disabled={!d || !reason.trim()} onClick={() => { if (run(() => act.adjust({ line: k, delta: d, amount: d * sign, category: cat, caCategory: caCat, label: reason }, reason, { authority }), 'Adjustment recorded')) setOpen(false); }}>Record adjustment</button>
        <button className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

export function VerifyForm({ targets, compact }: { targets: string[]; compact?: boolean }) {
  const { act, wp } = useCtx();
  const run = useRun();
  const [method, setMethod] = useState(wp.standards.verification_types[0]);
  const [note, setNote] = useState('');
  return (
    <div className="row wrap" style={{ marginTop: 6 }}>
      <select value={method} onChange={(e) => setMethod(e.target.value)}>{wp.standards.verification_types.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select>
      {!compact && <input type="text" placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />}
      <button className="btn sm primary" onClick={() => { run(() => act.verify(targets, method, note), `Verified ${targets.length} item${targets.length > 1 ? 's' : ''}`); setNote(''); }}>Verify{targets.length > 1 ? ` ${targets.length}` : ''}</button>
    </div>
  );
}

export function NoteForm({ target, area }: { target: string; area?: string }) {
  const { act } = useCtx();
  const run = useRun();
  const [blocking, setBlocking] = useState(true);
  return (
    <Prompt label="Open review note…" placeholder="What needs to happen before this can be signed?" onSubmit={(t) => run(() => act.openNote(target, t, blocking, area), 'Review note opened')}>
      <label className="chk small" style={{ marginTop: 6 }}><input type="checkbox" checked={blocking} onChange={(e) => setBlocking(e.target.checked)} /> Blocks filing</label>
    </Prompt>
  );
}

export function NoteCard({ id }: { id: string }) {
  const { wp, act, can, name } = useCtx();
  const run = useRun();
  const n = wp.notes.find((x) => x.id === id)!;
  return (
    <div className="card tight" style={{ borderLeft: `3px solid ${n.status === 'open' ? (n.blocking ? 'var(--err)' : 'var(--warn)') : 'var(--ok)'}` }}>
      <div className="row small"><Avatar id={n.actor} /><b>{name(n.actor)}</b><span className="muted">{dateTime(n.at)}</span><span className="spacer" />{n.blocking && n.status === 'open' && <Pill kind="err">blocks filing</Pill>}<Pill kind={n.status === 'open' ? 'warn' : 'ok'}>{n.status}</Pill></div>
      <div style={{ margin: '6px 0' }}>{n.text}</div>
      <div className="row small"><span className="muted">on</span><Ref r={n.target} /></div>
      {n.replies.map((r, i) => <div key={i} className="small" style={{ marginTop: 6, paddingLeft: 10, borderLeft: '2px solid var(--line)' }}><b>{name(r.actor)}</b> <span className="muted">{dateTime(r.at)}</span><div>{r.text}</div></div>)}
      <div className="row" style={{ marginTop: 6 }}>
        {can('note.reply') && <Prompt label="Reply" onSubmit={(t) => run(() => act.reply(n.id, t), 'Reply posted')} />}
        {n.status === 'open' && can('note.resolve') && <button className="btn sm" onClick={() => run(() => act.resolve(n.id), 'Note resolved')}>Resolve</button>}
        {n.status === 'resolved' && can('note.open') && <button className="btn sm" onClick={() => run(() => act.reopen(n.id), 'Note reopened')}>Reopen</button>}
      </div>
    </div>
  );
}

export function AttachForm({ target }: { target: string }) {
  const { act } = useCtx();
  const run = useRun();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [kind, setKind] = useState('note');
  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}>Attach file, message or note…</button>;
  return (
    <div className="card tight stack">
      <div className="row"><select value={kind} onChange={(e) => setKind(e.target.value)}><option value="note">Note</option><option value="message">Message / email text</option><option value="file">File</option></select></div>
      {kind === 'file' ? (
        <input type="file" onChange={(e) => {
          const f = e.target.files?.[0]; if (!f) return;
          const rd = new FileReader();
          rd.onload = () => { run(() => act.attach(target, { name: f.name, kind: 'file', size: f.size, mime: f.type, dataUrl: f.size < 1_500_000 ? String(rd.result) : undefined }), 'File attached as evidence'); setOpen(false); };
          rd.readAsDataURL(f);
        }} />
      ) : (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'message' ? 'Paste the message, with sender and date' : 'Note'} />
          <div className="row"><button className="btn sm primary" disabled={!text.trim()} onClick={() => { run(() => act.attach(target, { name: kind === 'message' ? 'Message' : 'Note', kind, text }), 'Evidence attached'); setOpen(false); setText(''); }}>Attach</button><button className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button></div>
        </>
      )}
    </div>
  );
}

export function EvidenceItem({ e }: { e: any }) {
  const { name } = useCtx();
  return (
    <div className="card tight small">
      <div className="row"><Pill kind="info">{e.data.kind}</Pill><b>{e.data.name}</b><span className="muted">{name(e.actor)} · {dateTime(e.at)}</span></div>
      {e.data.text && <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{e.data.text}</div>}
      {e.data.dataUrl && (e.data.mime?.startsWith('image/') ? <img src={e.data.dataUrl} style={{ maxWidth: '100%', marginTop: 6 }} /> : <a href={e.data.dataUrl} download={e.data.name}>Download ({Math.round((e.data.size || 0) / 1024)} KB)</a>)}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function evTrust(ctx: ReturnType<typeof useCtx>, id: string) {
  const { m, vi, wp, findings } = ctx;
  const e = m.evs.get(id)!;
  const page = m.docs.get(e.document_id)?.pages.find((p) => p.page === e.page)?.printed_content || '';
  const t = e.text_as_read || '';
  const norm = (s: string) => s.replace(/,/g, '');
  let printedFound = !t || page.includes(t) || page.includes(norm(t)) || (typeof e.value === 'number' && (page.includes(e.value.toLocaleString('en-US')) || page.includes(e.value.toLocaleString('en-US', { minimumFractionDigits: 2 }))));
  if (e.value_type === 'date' && typeof e.value === 'string') printedFound = printedFound || page.includes(e.value);
  if (t === 'X' || e.value_type === 'boolean') printedFound = true;
  if (e.value_type === 'percent' || (typeof e.value === 'number' && e.value < 1 && e.value > 0)) printedFound = printedFound || page.includes(`${Math.round(e.value * 100)}%`);
  const doc = m.docs.get(e.document_id)!;
  return trustScore({
    ev: e, printedFound, usedInLines: linesUsingEv(vi, id).map((l) => l.key), verifiedBy: (wp.verifications.get(id) || []).map((v) => v.method),
    corroboratingRefs: [], failingChecks: findings.filter((f) => f.severity !== 'pass' && f.evidence.includes(id)).map((f) => f.id),
    documentType: doc.document_type, isHandwritten: /jpg|photo|handwritten|scan/i.test(doc.file_name + doc.title),
  });
}

function EvDetail({ id }: { id: string }) {
  const ctx = useCtx();
  const { m, vi, wp, can } = ctx;
  const e = m.evs.get(id)!;
  const used = linesUsingEv(vi, id);
  const t = evTrust(ctx, id);
  const rv = useReveal(id, e.value_type);
  return (
    <div>
      {['ssn', 'account_number'].includes(e.value_type) && <section>{rv.button}</section>}
      <section className="kv">
        <div>Document</div><div><Ref r={e.document_id} /> page {e.page}</div>
        <div>Field</div><div className="mono">{e.field}</div>
        <div>Value</div><div className="mono">{rv.r(fmt(e.value))}</div>
        <div>Read as</div><div className="mono">{rv.r(e.text_as_read || '(nothing printed)')}</div>
        <div>Confidence</div><div>{e.confidence}</div>
        <div>Trust</div><div><Pill kind={t.band === 'trust' ? 'ok' : t.band === 'look' ? 'warn' : 'err'}>{t.band} {t.score.toFixed(2)}</Pill> <span className="small muted">{t.reasons.join('; ')}</span></div>
      </section>
      <section><button className="btn primary sm" onClick={() => openDoc(e.document_id, e.page, e.id)}>Show on document</button></section>
      <section><h3>Lands on</h3>{used.length ? <Refs list={used.map((l) => l.key)} /> : <span className="muted small">Not used on the return.</span>}</section>
      <section><h3>Verification</h3>{(wp.verifications.get(id) || []).map((v) => <div key={v.id} className="small"><Pill kind="ok">{v.method}</Pill> {ctx.name(v.actor)}</div>)}{can('verify') && <VerifyForm targets={[id]} />}</section>
    </div>
  );
}

function GenericRef({ r }: { r: string }) {
  const { m, vi } = useCtx();
  const res = resolveRef(m, vi, r);
  const rv = useReveal(r, 'record');
  const used = vi.v.lines.filter((l) => (l.sources || []).some((s) => s === r || s.startsWith(r + '/') || r.startsWith(s + '/')));
  return (
    <div>
      {res.detail && <section><div style={{ whiteSpace: 'pre-wrap' }}>{rv.r(res.detail)}</div></section>}
      {res.value !== undefined && typeof res.value === 'object' && <section><div className="row"><h3 style={{ margin: 0 }}>Record</h3><span className="spacer" />{rv.button}</div><pre className="mono small" style={{ whiteSpace: 'pre-wrap', background: 'var(--panel-2)', padding: 10, borderRadius: 6, maxHeight: 420, overflow: 'auto' }}>{JSON.stringify(rv.ro(res.value), null, 2)}</pre></section>}
      <section><h3>Used by</h3>{used.length ? <Refs list={used.map((l) => l.key)} /> : <span className="muted small">No return line cites this directly.</span>}</section>
    </div>
  );
}
