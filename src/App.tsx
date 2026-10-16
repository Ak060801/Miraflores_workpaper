import { useEffect, useMemo, useState } from 'react';
import { useCtx } from './app/ctx';
import { useSession, setSession, go, inspect, openDoc, ROLE_LABEL } from './store/session';
import { store } from './store/events';
import { InspectorDrawer } from './ui/Inspector';
import { DocViewer } from './ui/DocViewer';
import { Toast, dateTime, Pill, useRun, toast } from './ui/kit';
import { resolvedFinding } from './app/ctx';
import { HomeView } from './views/Home';
import { ReturnView, AreaView } from './views/Return';
import { DocumentsView } from './views/Documents';
import { ChecksView } from './views/Checks';
import { AdjustmentsView } from './views/Adjustments';
import { ChangesView } from './views/Changes';
import { WhatIfView } from './views/WhatIf';
import { JudgmentView } from './views/Judgment';
import { ReviewView } from './views/Review';
import { ClientView } from './views/Client';
import { FilingView, NoticeView } from './views/Filing';
import { RecordsView } from './views/Records';
import { CarryForwardView } from './views/CarryForward';
import { FirmView } from './views/Firm';
import { AREAS } from './data/model';

export default function App() {
  const ctx = useCtx();
  const s = useSession();
  const { user, wp, findings } = ctx;
  const route = s.route || '/home';
  useEffect(() => { document.querySelector('.main')?.scrollTo(0, 0); }, [route]);
  const [seg, arg] = route.replace(/^\//, '').split('/');

  // The client sees only the client portal.
  const isClient = user.role === 'client';
  const view = isClient ? <ClientView /> : (() => {
    switch (seg) {
      case 'home': return <HomeView />;
      case 'return': return <ReturnView />;
      case 'area': return <AreaView id={arg} />;
      case 'documents': return <DocumentsView />;
      case 'checks': return <ChecksView focus={arg} />;
      case 'adjustments': return <AdjustmentsView />;
      case 'changes': return <ChangesView />;
      case 'whatif': return <WhatIfView />;
      case 'judgment': return <JudgmentView />;
      case 'review': return <ReviewView />;
      case 'client': return <ClientView />;
      case 'filing': return <FilingView />;
      case 'notice': return <NoticeView />;
      case 'records': return <RecordsView tab={arg} />;
      case 'carryforward': return <CarryForwardView />;
      case 'firm': return <FirmView />;
      default: return <HomeView />;
    }
  })();

  const openErrors = findings.filter((f) => f.severity === 'error' && !resolvedFinding(wp, f)).length;
  const openNotes = wp.notes.filter((n) => n.status === 'open').length;
  const stale = wp.signoffs.filter((x) => x.stale && wp.signoffs.filter((y) => y.area === x.area && y.level === x.level).slice(-1)[0] === x).length;
  const unapproved = wp.adjustments.filter((a) => a.needsPartner && !a.approvedBy).length;

  const nav: [string, string, string, number?, boolean?][] = isClient ? [] : [
    ['Work', '/home', 'My work'],
    ['Work', '/return', 'Return'],
    ['Work', '/checks', 'Checks & findings', openErrors],
    ['Work', '/adjustments', 'Adjustments', unapproved],
    ['Work', '/documents', 'Documents'],
    ['Work', '/review', 'Review & sign-off', openNotes + stale],
    ['Work', '/judgment', 'Judgment & completeness'],
    ['Work', '/changes', 'Changes & versions'],
    ['Work', '/whatif', 'What-if'],
    ['Records', '/records/summary', 'Return vs last year'],
    ['Records', '/records/sales', 'Sales detail'],
    ['Records', '/records/books', 'Books to tax'],
    ['Records', '/records/depreciation', 'Depreciation'],
    ['Records', '/records/rentals', 'Rentals & passive'],
    ['Records', '/records/k1', 'K-1s & basis'],
    ['Records', '/records/state', 'State split'],
    ['Records', '/records/deductions', 'Deductions & credits'],
    ['Records', '/records/payments', 'Payments'],
    ['Records', '/records/retirement', 'Retirement & foreign'],
    ['Records', '/records/carryovers', 'Carryovers'],
    ['Records', '/records/prior', 'Prior preparer vs us'],
    ['Client & filing', '/client', 'Client portal'],
    ['Client & filing', '/filing', 'Filing'],
    ['Client & filing', '/notice', 'Notices'],
    ['Client & filing', '/carryforward', 'Carry forward & 2026'],
    ['Firm', '/firm', 'Firm & standards'],
  ];
  let lastGrp = '';

  return (
    <div className="shell">
      <TopBar />
      <nav className="side">
        {isClient ? (
          <>
            <div className="grp">Client portal</div>
            <a className="on">Your 2025 return</a>
            <div className="small muted" style={{ padding: 8 }}>Signed in as {user.name}. You can answer questions, upload documents, review your return and sign the e-file authorization.</div>
          </>
        ) : nav.map(([grp, r, label, count]) => {
          const head = grp !== lastGrp ? <div className="grp">{grp}</div> : null;
          lastGrp = grp;
          return (
            <div key={r}>{head}<a className={route.startsWith(r) || (r === '/records/summary' && route === '/records') ? 'on' : ''} href={'#' + r} onClick={(e) => { e.preventDefault(); go(r); }}>{label}{count ? <span className="count">{count}</span> : null}</a></div>
          );
        })}
        {!isClient && (
          <>
            <div className="grp">Areas</div>
            {AREAS.map((a) => <a key={a.id} className={route === `/area/${a.id}` ? 'on' : ''} href={`#/area/${a.id}`} onClick={(e) => { e.preventDefault(); go(`/area/${a.id}`); }}>{a.name}</a>)}
          </>
        )}
      </nav>
      <main className={`main ${s.inspect ? 'with-drawer' : ''}`}>
        {!ctx.live && <div className="banner violet noprint">Replaying the season as of <b className="mono">{dateTime(ctx.now)}</b>. Read-only: the screen shows what the workpaper knew then. <button className="btn sm" onClick={() => setSession({ replayAt: null })}>Back to live</button></div>}
        {view}
      </main>
      {s.inspect && <InspectorDrawer r={s.inspect} />}
      {s.docFocus && <DocViewer />}
      <Toast />
    </div>
  );
}

function TopBar() {
  const ctx = useCtx();
  const { m, users, user, now, live, act, can } = ctx;
  const s = useSession();
  const run = useRun();
  const [q, setQ] = useState('');
  const clock = store.clock();
  const marks = useMemo(() => {
    const t = [
      ...m.p.timeline.map((x) => ({ at: x.at, label: x.event.replace(/_/g, ' ') })),
      ...m.p.documents.map((d) => ({ at: d.received_at, label: `received ${d.id}` })),
    ].sort((a, b) => (a.at < b.at ? -1 : 1));
    return t;
  }, [m]);
  const next = marks.find((x) => x.at > clock);
  const start = Date.parse('2026-01-12T00:00:00Z'), end = Date.parse('2028-02-01T00:00:00Z');

  return (
    <header className="top">
      <div className="brand">Miraflores <small>Okafor-Lindqvist · 2025</small></div>
      <div style={{ position: 'relative' }}>
        <input className="search" placeholder="Search lines, documents, values, people, notes…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} />
        {q.length > 1 && <SearchResults q={q} close={() => setQ('')} />}
      </div>
      <span className="spacer" />
      {live ? (
        <>
          <span className="clock" title="Season clock: the workpaper's 'today'. Events and documents after it have not happened yet.">Today {clock.slice(0, 10)}</span>
          {next && can('clock') && <button className="btn sm" title={`Advance the season to ${next.at.slice(0, 10)}: ${next.label}`} onClick={() => run(() => act.advanceClock(next.at, next.label), `Clock advanced: ${next.label}`, false)}>▸ {next.at.slice(5, 10)} {next.label.slice(0, 22)}</button>}
          <button className="btn sm" onClick={() => setSession({ replayAt: clock })} title="Replay the season: scrub back to any moment, read-only">Replay</button>
        </>
      ) : (
        <>
          <span className="clock replay">Replay {now.slice(0, 10)}</span>
          <input type="range" min={start} max={Math.max(end, Date.parse(clock))} step={86400000} value={Date.parse(now)} onChange={(e) => setSession({ replayAt: new Date(+e.target.value).toISOString() })} style={{ width: 180 }} />
          <button className="btn sm" onClick={() => setSession({ replayAt: null })}>Live</button>
        </>
      )}
      <select value={user.id} onChange={(e) => { setSession({ userId: e.target.value, route: users.find((u) => u.id === e.target.value)?.role === 'client' ? '/client' : s.route }); }} title="Role switcher">
        {users.map((u) => <option key={u.id} value={u.id}>{u.name}: {ROLE_LABEL[u.role] || u.role}{u.clearance ? '' : ' (no PII clearance)'}</option>)}
      </select>
    </header>
  );
}

function SearchResults({ q, close }: { q: string; close: () => void }) {
  const { m, vi, wp } = useCtx();
  const ql = q.toLowerCase();
  const num = parseFloat(q.replace(/[,$]/g, ''));
  const res: { kind: string; label: string; sub?: string; go: () => void }[] = [];
  for (const l of vi.v.lines) if (l.key.toLowerCase().includes(ql) || l.label.toLowerCase().includes(ql) || (!isNaN(num) && l.value === num)) res.push({ kind: 'line', label: `${l.key} ${l.label}`, sub: String(l.value), go: () => inspect(l.key) });
  for (const d of m.p.documents) if (d.title.toLowerCase().includes(ql) || d.id.toLowerCase() === ql || d.issuer.toLowerCase().includes(ql)) res.push({ kind: 'document', label: `${d.id} ${d.title}`, go: () => openDoc(d.id) });
  for (const e of m.p.extracted_values) if ((!isNaN(num) && e.value === num) || (q.length > 3 && e.label.toLowerCase().includes(ql) && e.document_id !== 'D74')) res.push({ kind: 'value', label: `${e.id} ${e.label}`, sub: `${e.document_id} · ${e.value}`, go: () => openDoc(e.document_id, e.page, e.id) });
  for (const x of m.p.client.questionnaire) if ((x.question + x.answer).toLowerCase().includes(ql)) res.push({ kind: 'client answer', label: x.question, sub: x.answer, go: () => inspect(x.id) });
  for (const x of m.p.client.messages) if (x.text.toLowerCase().includes(ql)) res.push({ kind: 'message', label: x.text.slice(0, 90), sub: x.from, go: () => inspect(x.id) });
  for (const n of wp.notes) if (n.text.toLowerCase().includes(ql)) res.push({ kind: 'review note', label: n.text.slice(0, 90), go: () => inspect(n.target) });
  for (const p of m.p.household.people) if (p.name.toLowerCase().includes(ql)) res.push({ kind: 'person', label: p.name, sub: p.role, go: () => inspect(`household:${p.id}`) });
  return (
    <div className="searchres" style={{ left: 0, top: 36 }}>
      {res.length === 0 && <div className="sr muted">No matches</div>}
      {res.slice(0, 40).map((r, i) => (
        <div key={i} className="sr" onClick={() => { r.go(); close(); }}>
          <div className="row"><Pill>{r.kind}</Pill><span>{r.label}</span></div>
          {r.sub && <div className="small muted mono" style={{ marginTop: 2 }}>{r.sub}</div>}
        </div>
      ))}
    </div>
  );
}
