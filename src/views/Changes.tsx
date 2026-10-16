import { useMemo, useState } from 'react';
import { useCtx } from '../app/ctx';
import { inspect, setSession } from '../store/session';
import { currentValue } from '../store/projections';
import { Ref, Refs, fmt, Pill, Tabs, Avatar, date, dateTime, Effect } from '../ui/kit';
import { describe } from './Home';

export function ChangesView() {
  const [tab, setTab] = useState('compare');
  return (
    <div>
      <div className="pagehead"><div><h1>Changes & versions</h1><div className="sub">Compare engine runs and the workpaper, read every action ever taken, and replay the season to any moment.</div></div></div>
      <Tabs tabs={[['compare', 'Compare versions'], ['activity', 'Activity log'], ['season', 'Season timeline']]} on={tab} set={setTab} />
      {tab === 'compare' && <Compare />}
      {tab === 'activity' && <Activity />}
      {tab === 'season' && <Season />}
    </div>
  );
}

function Compare() {
  const { m, wp, vi } = useCtx();
  const opts = [...m.versions.map((v) => v.v.version), 'workpaper'];
  const [a, setA] = useState('v1');
  const [b, setB] = useState('workpaper');
  const [hideLots, setHideLots] = useState(true);
  const valOf = (ver: string, k: string) => ver === 'workpaper' ? currentValue(wp, k) : m.versionById.get(ver)?.byKey.get(k)?.value;
  const keys = useMemo(() => {
    const s = new Set<string>();
    for (const ver of [a, b]) { const vv = ver === 'workpaper' ? vi : m.versionById.get(ver)!; vv.v.lines.forEach((l) => s.add(l.key)); }
    return [...s];
  }, [a, b, m, vi]);
  const rows = keys.map((k) => ({ k, x: valOf(a, k), y: valOf(b, k) })).filter((r) => JSON.stringify(r.x) !== JSON.stringify(r.y)).filter((r) => !hideLots || !(r.k.startsWith('F8949.') && !r.k.endsWith('total')));
  const sumOf = (ver: string) => ver === 'workpaper' ? { fed: wp.position.federal, ca: wp.position.california } : { fed: m.versionById.get(ver)!.v.summary.federal, ca: m.versionById.get(ver)!.v.summary.california };
  const SA = sumOf(a), SB = sumOf(b);
  const vb = m.versionById.get(b === 'workpaper' ? vi.v.version : b)!;
  const va = m.versionById.get(a === 'workpaper' ? vi.v.version : a)!;
  return (
    <div>
      <div className="card">
        <div className="row wrap">
          <select value={a} onChange={(e) => setA(e.target.value)}>{opts.map((o) => <option key={o}>{o}</option>)}</select>
          <span>→</span>
          <select value={b} onChange={(e) => setB(e.target.value)}>{opts.map((o) => <option key={o}>{o}</option>)}</select>
          <label className="chk small"><input type="checkbox" checked={hideLots} onChange={(e) => setHideLots(e.target.checked)} /> hide individual 8949 lots</label>
        </div>
        <div className="grid2" style={{ marginTop: 12 }}>
          <table className="t"><thead><tr><th>Federal</th><th className="num">{a}</th><th className="num">{b}</th><th className="num">Δ</th></tr></thead><tbody>
            {(['total_tax', 'payments', 'balance_due'] as const).map((k) => <tr key={k}><td>{k.replace('_', ' ')}</td><td className="num">{fmt((SA.fed as any)[k])}</td><td className="num">{fmt((SB.fed as any)[k])}</td><td className="num"><Effect v={(SB.fed as any)[k] - (SA.fed as any)[k]} /></td></tr>)}
          </tbody></table>
          <table className="t"><thead><tr><th>California</th><th className="num">{a}</th><th className="num">{b}</th><th className="num">Δ</th></tr></thead><tbody>
            {(['total_tax', 'payments', 'balance_due'] as const).map((k) => <tr key={k}><td>{k.replace('_', ' ')}</td><td className="num">{fmt((SA.ca as any)[k])}</td><td className="num">{fmt((SB.ca as any)[k])}</td><td className="num"><Effect v={(SB.ca as any)[k] - (SA.ca as any)[k]} /></td></tr>)}
          </tbody></table>
        </div>
        {b !== 'workpaper' && b !== a && <div className="small" style={{ marginTop: 10 }}><b>Why {b} ran:</b> {vb.v.trigger} <span className="muted">({dateTime(vb.v.computed_at)})</span></div>}
        {b !== 'workpaper' && a !== 'workpaper' && (
          <div className="small" style={{ marginTop: 6 }}>
            Documents added: <Refs list={vb.v.documents_used.filter((d) => !va.v.documents_used.includes(d))} short /> · superseded: <Refs list={vb.v.documents_superseded} short />
          </div>
        )}
      </div>
      <div className="card">
        <h2>{rows.length} changed lines</h2>
        <table className="t"><thead><tr><th>Line</th><th>Description</th><th className="num">{a}</th><th className="num">{b}</th><th className="num">Δ</th></tr></thead><tbody>
          {rows.slice(0, 300).map((r) => <tr key={r.k} className="click" onClick={() => inspect(r.k)}><td className="mono small">{r.k}</td><td>{(m.versionById.get(b === 'workpaper' ? vi.v.version : b)?.byKey.get(r.k) || m.versionById.get(a === 'workpaper' ? vi.v.version : a)?.byKey.get(r.k))?.label}</td><td className="num">{r.x === undefined ? <Pill>added</Pill> : fmt(r.x)}</td><td className="num">{r.y === undefined ? <Pill>removed</Pill> : fmt(r.y)}</td><td className="num">{typeof r.x === 'number' && typeof r.y === 'number' ? <Effect v={Math.round((r.y - r.x) * 100) / 100} /> : ''}</td></tr>)}
        </tbody></table>
      </div>
    </div>
  );
}

function Activity() {
  const { allEvents, users, name } = useCtx();
  const [who, setWho] = useState('all');
  const [type, setType] = useState('all');
  const types = Array.from(new Set(allEvents.map((e) => e.type.split('.')[0])));
  const list = allEvents.filter((e) => (who === 'all' || e.actor === who) && (type === 'all' || e.type.startsWith(type)) && e.type !== 'seen').slice().reverse();
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 8 }}>
        <select value={who} onChange={(e) => setWho(e.target.value)}><option value="all">Everyone</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="all">All actions</option>{types.map((t) => <option key={t}>{t}</option>)}</select>
        <span className="small muted">{list.length} events · append-only</span>
      </div>
      <div className="feed">
        {list.slice(0, 400).map((e) => (
          <div key={e.id} className="item small">
            <span className="when">{dateTime(e.at)}</span><Avatar id={e.actor} />
            <span style={{ flex: 1 }}><b>{name(e.actor)}</b> {describe(e)} {e.target && <Ref r={e.target} short />}{e.seed && <Pill>seed</Pill>}{e.type === 'undo' && <Pill kind="warn">undo</Pill>}</span>
            <button className="btn sm ghost" onClick={() => setSession({ replayAt: e.at })}>replay here</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Season() {
  const { m, allEvents } = useCtx();
  const items = [
    ...m.p.timeline.map((t) => ({ at: t.at, label: t.event.replace(/_/g, ' '), detail: t.detail, refs: t.refs, kind: 'packet' })),
    ...m.p.documents.map((d) => ({ at: d.received_at, label: `received ${d.id}`, detail: d.title, refs: [d.id], kind: 'document' })),
    ...m.p.client.messages.map((x) => ({ at: x.sent_at, label: `message from ${x.from}`, detail: x.text, refs: [x.id], kind: 'message' })),
  ].sort((a, b) => (a.at < b.at ? -1 : 1));
  return (
    <div className="card">
      <div className="small muted" style={{ marginBottom: 8 }}>The packet's scripted season. In live mode, use ▸ in the top bar to advance the clock to the next event; "replay" shows the workpaper as it stood at that moment.</div>
      <div className="feed">
        {items.map((it, i) => (
          <div key={i} className="item small">
            <span className="when">{dateTime(it.at)}</span>
            <Pill kind={it.kind === 'packet' ? 'dark' : it.kind === 'message' ? 'info' : ''}>{it.kind}</Pill>
            <span style={{ flex: 1 }}><b>{it.label}</b> {it.detail && <span className="muted">· {it.detail}</span>} <Refs list={it.refs.filter((r) => !r.startsWith('agency:'))} short /></span>
            <button className="btn sm ghost" onClick={() => setSession({ replayAt: it.at })}>replay here</button>
          </div>
        ))}
      </div>
    </div>
  );
}
