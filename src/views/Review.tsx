import { useState } from 'react';
import { useCtx } from '../app/ctx';
import { AREAS } from '../data/model';
import { latestSignoff } from '../store/projections';
import { go } from '../store/session';
import { Pill, Tabs, date, useRun, Avatar, fmt } from '../ui/kit';
import { NoteCard } from '../ui/Inspector';

export function ReviewView() {
  const [tab, setTab] = useState('signoff');
  const { wp } = useCtx();
  return (
    <div>
      <div className="pagehead"><div><h1>Review & sign-off</h1><div className="sub">Sign-offs reopen on their own when anything they covered changes. Open blocking notes stop filing.</div></div></div>
      <Tabs tabs={[['signoff', 'Sign-off matrix'], ['notes', `Review notes (${wp.notes.filter((n) => n.status === 'open').length} open)`], ['assign', 'Assignments & deadlines']]} on={tab} set={setTab} />
      {tab === 'signoff' && <Matrix />}
      {tab === 'notes' && <Notes />}
      {tab === 'assign' && <Assign />}
    </div>
  );
}

function Cell({ area, level }: { area: string; level: 'preparer' | 'reviewer' | 'partner' }) {
  const { wp, can, act, name } = useCtx();
  const run = useRun();
  const s = latestSignoff(wp, area, level);
  const mayAct = can(`signoff.${level}` as any) && (level !== 'partner' || area === 'return') && (level === 'partner' || area !== 'return');
  return (
    <td>
      {s ? (
        <div className="small">
          <div className="row"><Avatar id={s.actor} /><Pill kind={s.stale ? 'warn' : 'ok'}>{s.stale ? 'reopened' : 'current'}</Pill></div>
          <div className="muted">{name(s.actor)} · {date(s.at)} · {s.version}</div>
          {s.stale && <details><summary>{s.changes!.length} change(s)</summary><table className="t"><tbody>{s.changes!.slice(0, 12).map((c) => <tr key={c.key}><td className="mono small">{c.key}</td><td className="num">{fmt(c.was)}</td><td className="num">→ {fmt(c.now)}</td></tr>)}</tbody></table></details>}
        </div>
      ) : <span className="muted small">—</span>}
      {mayAct && <button className="btn sm" style={{ marginTop: 4 }} onClick={() => run(() => act.signoff(area, level), `Signed as ${level}`)}>{s ? 'Re-sign' : 'Sign'}</button>}
    </td>
  );
}

function Matrix() {
  return (
    <div className="card">
      <table className="t">
        <thead><tr><th>Area</th><th>Preparer</th><th>Reviewer</th><th>Partner</th></tr></thead>
        <tbody>
          {AREAS.map((a) => <tr key={a.id}><td><a onClick={() => go(`/area/${a.id}`)} style={{ cursor: 'pointer' }}>{a.name}</a></td><Cell area={a.id} level="preparer" /><Cell area={a.id} level="reviewer" /><td className="muted small">signs whole return</td></tr>)}
          <tr className="total"><td>Whole return</td><td className="muted small">—</td><td className="muted small">—</td><Cell area="return" level="partner" /></tr>
        </tbody>
      </table>
      <div className="small muted" style={{ marginTop: 8 }}>Rules enforced: a reviewer needs a current preparer sign-off; nobody may review or sign off work they prepared in that area; firm policies (Firm › Policies) can block a level.</div>
    </div>
  );
}

function Notes() {
  const { wp } = useCtx();
  const [all, setAll] = useState(false);
  const list = wp.notes.filter((n) => all || n.status === 'open');
  return (
    <div>
      <label className="chk small" style={{ marginBottom: 10 }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> include resolved</label>
      {list.map((n) => <NoteCard key={n.id} id={n.id} />)}
      {list.length === 0 && <div className="empty">No open review notes.</div>}
    </div>
  );
}

function Assign() {
  const { m, wp, users, can, act, name, now } = useCtx();
  const run = useRun();
  const staff = users.filter((u) => u.role !== 'client');
  return (
    <div className="card">
      <table className="t">
        <thead><tr><th>Area</th><th>Preparer</th><th>Due</th><th>Reviewer</th><th>Due</th></tr></thead>
        <tbody>
          {AREAS.map((a) => {
            const as = wp.assignments.get(a.id) || [];
            const p = as.filter((x) => x.data.role === 'preparer').slice(-1)[0];
            const r = as.filter((x) => x.data.role === 'reviewer').slice(-1)[0];
            const late = (d?: string, done?: boolean) => d && d < now.slice(0, 10) && !done;
            const pDone = !!latestSignoff(wp, a.id, 'preparer') && !latestSignoff(wp, a.id, 'preparer')!.stale;
            const rDone = !!latestSignoff(wp, a.id, 'reviewer') && !latestSignoff(wp, a.id, 'reviewer')!.stale;
            return (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{can('assign') ? <select value={p?.data.staff || ''} onChange={(e) => run(() => act.assign(a.id, 'preparer', e.target.value, p?.data.due), `Assigned ${name(e.target.value)}`)}>{staff.filter((u) => u.role === 'preparer').map((u) => <option key={u.id} value={u.id}>{u.name}{u.clearance ? '' : ' (no PII clearance)'}</option>)}</select> : name(p?.data.staff)}</td>
                <td className="small">{p?.data.due} {late(p?.data.due, pDone) && <Pill kind="err">late</Pill>}</td>
                <td>{can('assign') ? <select value={r?.data.staff || ''} onChange={(e) => run(() => act.assign(a.id, 'reviewer', e.target.value, r?.data.due), `Assigned ${name(e.target.value)}`)}>{staff.filter((u) => ['reviewer', 'partner'].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select> : name(r?.data.staff)}</td>
                <td className="small">{r?.data.due} {late(r?.data.due, rDone) && <Pill kind="err">late</Pill>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="small muted" style={{ marginTop: 8 }}>Notifications: each person's "My work" lists what is assigned to them, what reopened, and what changed since they last looked. Marcus Bell joined 03/24 without sensitive-data clearance: assignable, but sees PII masked.</div>
    </div>
  );
}
