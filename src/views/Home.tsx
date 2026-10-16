import { useCtx, resolvedFinding, autoDisposition } from '../app/ctx';
import { AREAS } from '../data/model';
import { latestSignoff } from '../store/projections';
import { go, inspect, openDoc } from '../store/session';
import { Ref, Refs, fmt, Pill, Avatar, date, dateTime, Effect, Sev, useRun } from '../ui/kit';
import { ROLE_LABEL } from '../store/session';

export function Position() {
  const { vi, wp } = useCtx();
  const s = vi.v.summary;
  const p = wp.position;
  return (
    <div className="grid4">
      <div className="kpi"><div className="k">Federal {p.federal.balance_due < 0 ? 'refund' : 'balance due'}</div><div className="v">{fmt(Math.abs(p.federal.balance_due))}</div><div className="d muted">engine {vi.v.version}: {fmt(s.federal.balance_due)} due · <Effect v={p.federal.balance_due - s.federal.balance_due} /></div></div>
      <div className="kpi"><div className="k">Federal total tax</div><div className="v">{fmt(p.federal.total_tax)}</div><div className="d muted">engine {fmt(s.federal.total_tax)} · AGI {fmt(s.federal.agi)}</div></div>
      <div className="kpi"><div className="k">California {p.california.balance_due < 0 ? 'refund' : 'balance due'}</div><div className="v">{fmt(Math.abs(p.california.balance_due))}</div><div className="d muted">engine {fmt(Math.abs(s.california.balance_due))} {s.california.balance_due < 0 ? 'refund' : 'due'} · <Effect v={p.california.balance_due - s.california.balance_due} /></div></div>
      <div className="kpi"><div className="k">California total tax</div><div className="v">{fmt(p.california.total_tax)}</div><div className="d muted">engine {fmt(s.california.total_tax)} · CA AGI {fmt(s.california.ca_agi)}</div></div>
    </div>
  );
}

export function HomeView() {
  const ctx = useCtx();
  const { m, vi, wp, findings, user, now, act, gate, name, allEvents } = ctx;
  const run = useRun();
  const mine = (area: string, role: string) => (wp.assignments.get(area) || []).filter((a) => a.data.role === role).slice(-1)[0]?.data.staff === user.id;
  const todo: { label: string; sub?: string; kind?: string; onClick: () => void }[] = [];

  if (user.role === 'preparer' || user.role === 'reviewer' || user.role === 'partner') {
    for (const f of findings) if (f.severity !== 'pass' && f.severity !== 'info' && !resolvedFinding(wp, f) && (user.role !== 'preparer' || mine(f.area, 'preparer'))) todo.push({ label: f.title, sub: AREAS.find((a) => a.id === f.area)?.name, kind: f.severity, onClick: () => go('/checks/' + f.id.slice(4)) });
  }
  for (const n of wp.notes) if (n.status === 'open') {
    if (user.role === 'preparer' && n.actor !== user.id) todo.push({ label: `Review note: ${n.text.slice(0, 80)}…`, sub: `from ${name(n.actor)}`, kind: n.blocking ? 'error' : 'warning', onClick: () => inspect(n.target) });
    if ((user.role === 'reviewer' || user.role === 'partner') && n.actor === user.id && n.replies.length) todo.push({ label: `Reply on your note: ${n.text.slice(0, 60)}…`, kind: 'info', onClick: () => inspect(n.target) });
  }
  for (const a of [...AREAS.map((x) => x.id), 'return']) {
    const p = latestSignoff(wp, a, 'preparer'), r = latestSignoff(wp, a, 'reviewer');
    const areaName = AREAS.find((x) => x.id === a)?.name || 'Whole return';
    if (user.role === 'preparer' && p?.stale) todo.push({ label: `Your sign-off on ${areaName} reopened: ${p.changes?.length} item(s) changed since you signed`, kind: 'warning', onClick: () => go('/review') });
    if (user.role === 'reviewer' && p && !p.stale && (!r || r.stale)) todo.push({ label: `${areaName} is ready for review`, sub: `preparer signed ${date(p.at)}`, kind: 'info', onClick: () => go(`/area/${a}`) });
    if (user.role === 'reviewer' && r?.stale) todo.push({ label: `Your review sign-off on ${areaName} reopened`, kind: 'warning', onClick: () => go('/review') });
  }
  if (user.role === 'partner') {
    const ua = wp.adjustments.filter((a) => a.needsPartner && !a.approvedBy);
    if (ua.length) todo.push({ label: `${ua.length} adjustment(s) over ${wp.standards.partner_threshold} need your approval`, kind: 'warning', onClick: () => go('/adjustments') });
    todo.push({ label: `Filing gate: ${gate.items.filter((i) => i.ok).length} of ${gate.items.length} conditions met`, kind: gate.ready ? 'pass' : 'info', onClick: () => go('/filing') });
  }
  if (user.role === 'preparer') {
    const unacc = m.p.documents.filter((d) => d.received_at <= now && !wp.dispositions.has(d.id) && !autoDisposition(m, wp, d.id));
    if (unacc.length) todo.push({ label: `${unacc.length} document(s) not accounted for`, sub: unacc.map((d) => d.id).join(', '), kind: 'warning', onClick: () => go('/documents') });
    for (const q of wp.questions) if (q.answers.length && !q.answers.some((a) => a.actor === user.id)) todo.push({ label: `Client answered: ${q.text.slice(0, 60)}…`, kind: 'info', onClick: () => go('/client') });
  }
  if (user.role === 'firm_administrator') {
    for (const a of AREAS) {
      const b = m.p.firm.budget_hours[a.id]; const t = wp.time.get(a.id) || 0;
      if (b && t > b) todo.push({ label: `${a.name} over budget: ${t.toFixed(1)} of ${b} h`, kind: 'warning', onClick: () => go('/firm') });
    }
    todo.push({ label: `${wp.unmaskLog.length} sensitive-data views logged`, kind: 'info', onClick: () => go('/firm') });
  }

  // Since you last looked
  const ownLast = [...allEvents].reverse().find((e) => e.actor === user.id && e.at <= now)?.at;
  const seen = wp.lastSeen.get(user.id) || ownLast || new Date(Date.parse(now) - 30 * 86400000).toISOString();
  const since = allEvents.filter((e) => e.at > seen && e.actor !== user.id && e.type !== 'seen' && e.type !== 'view.unmask' && e.at <= now);
  const newDocs = m.p.documents.filter((d) => d.received_at > seen && d.received_at <= now);
  const newVersions = m.versions.filter((v) => v.v.computed_at > seen && v.v.computed_at <= now);
  const newMsgs = m.p.client.messages.filter((x) => x.sent_at > seen && x.sent_at <= now);
  const deadlines = m.p.firm.deadlines.map((d: any) => ({ ...d, days: Math.round((Date.parse(d.date) - Date.parse(now)) / 86400000) }));

  return (
    <div>
      <div className="pagehead">
        <div><h1>Hello, {user.name.split(' ')[0]}</h1><div className="sub">{ROLE_LABEL[user.role]}{user.credential ? `, ${user.credential}` : ''} · engine run {vi.v.version} ({date(vi.v.computed_at)}) is current · season date {date(now)}</div></div>
      </div>
      {!user.clearance && user.role !== 'client' && <div className="banner warn">{user.note || 'No sensitive-data clearance.'} SSNs, account numbers and IP PINs are masked for you.</div>}
      <Position />
      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Needs you ({todo.length})</h2>
          {todo.length === 0 && <div className="empty">Nothing waiting on you.</div>}
          <table className="t"><tbody>
            {todo.slice(0, 30).map((t, i) => <tr key={i} className="click" onClick={t.onClick}><td style={{ width: 70 }}>{t.kind && <Sev s={t.kind} />}</td><td>{t.label}{t.sub && <div className="small muted">{t.sub}</div>}</td></tr>)}
          </tbody></table>
        </div>
        <div className="card">
          <div className="row"><h2>Since you last looked</h2><span className="spacer" /><span className="small muted">{dateTime(seen)}</span><button className="btn sm" onClick={() => run(() => act.seen(), 'Marked as seen', false)}>Mark seen</button></div>
          {newVersions.map((v) => <div key={v.v.version} className="banner warn small">Engine re-ran: {v.v.version} on {date(v.v.computed_at)}: {v.v.trigger} <a onClick={() => go('/changes')}>compare</a></div>)}
          {newDocs.length > 0 && <div className="small" style={{ marginBottom: 8 }}><b>{newDocs.length} document(s) received:</b> <Refs list={newDocs.slice(-12).map((d) => d.id)} />{newDocs.length > 12 && <span className="small muted"> +{newDocs.length - 12} earlier</span>}</div>}
          {newMsgs.map((x) => <div key={x.id} className="small" style={{ marginBottom: 6 }}><Pill kind="info">message</Pill> <b>{x.from}</b>: {x.text}</div>)}
          <div className="feed">
            {since.slice(-25).reverse().map((e) => <div key={e.id} className="item small"><span className="when">{dateTime(e.at)}</span><Avatar id={e.actor} /><span><b>{name(e.actor)}</b> {describe(e)} {e.target && <Ref r={e.target} short />}</span></div>)}
          </div>
          {since.length === 0 && newDocs.length === 0 && newVersions.length === 0 && <div className="empty">Nothing new.</div>}
        </div>
      </div>
      <div className="grid2">
        <div className="card">
          <h2>Deadlines</h2>
          <table className="t"><tbody>{deadlines.map((d: any) => <tr key={d.what}><td>{d.what}</td><td className="num">{date(d.date)}</td><td className="num">{d.days < 0 ? <span className="muted">{-d.days} days ago</span> : <Pill kind={d.days < 14 ? 'warn' : ''}>{d.days} days</Pill>}</td></tr>)}</tbody></table>
        </div>
        <div className="card">
          <h2>Engine diagnostics ({vi.v.diagnostics.length})</h2>
          <table className="t"><tbody>{vi.v.diagnostics.map((d) => <tr key={d.code}><td><Pill kind={d.severity === 'warning' ? 'warn' : 'info'}>{d.severity}</Pill></td><td className="small">{d.message}<div><Refs list={d.refs} short /></div></td></tr>)}</tbody></table>
          <div className="small muted" style={{ marginTop: 6 }}>Diagnostics are the engine's own warnings. The Checks screen runs the firm's independent checks, which found more.</div>
        </div>
      </div>
    </div>
  );
}

export function describe(e: any): string {
  switch (e.type) {
    case 'adjustment.add': return `adjusted ${e.target} by ${fmt(e.data.delta)}: ${e.data.reason}`;
    case 'adjustment.approve': return 'approved an adjustment';
    case 'verify': return `verified ${(e.data.targets || []).length} item(s) (${e.data.method.replace(/_/g, ' ')})`;
    case 'note.open': return `opened a ${e.data.blocking ? 'blocking ' : ''}review note: “${e.data.text.slice(0, 80)}”`;
    case 'note.reply': return `replied: “${e.data.text.slice(0, 80)}”`;
    case 'note.resolve': return 'resolved a review note';
    case 'note.reopen': return 'reopened a review note';
    case 'question.ask': return `asked ${e.data.to}: “${e.data.text.slice(0, 70)}…”`;
    case 'question.answer': return `answered: “${e.data.text.slice(0, 70)}”`;
    case 'evidence.attach': return `attached ${e.data.kind} “${e.data.name}”`;
    case 'doc.disposition': return `marked ${e.target} ${e.data.status}: ${e.data.reason}`;
    case 'judgment': return `recorded ${e.data.kind.replace('_', ' ')}: ${e.data.topic}`;
    case 'finding.dismiss': return `dismissed a finding: ${e.data.reason}`;
    case 'signoff': return `signed off ${e.target} as ${e.data.level}`;
    case 'step.complete': return `completed step “${e.data.step}”`;
    case 'assign': return `assigned ${e.data.role} ${e.data.staff} to ${e.target}`;
    case 'time.log': return `logged ${e.data.hours} h on ${e.target}`;
    case 'client.approve': return 'approved the return';
    case 'client.sign8879': return 'signed Form 8879';
    case 'extension.file': return `filed extensions (Form 4868 with ${fmt(e.data.federal)})`;
    case 'efile.transmit': return `e-file ${e.data.jurisdiction}: ${e.data.status}`;
    case 'filing.freeze': return 'froze the return as filed';
    case 'amend.open': return `opened an amendment: ${e.data.reason}`;
    case 'standard.set': return `changed firm standard ${e.data.path} → ${e.data.value}`;
    case 'pii.correct': return `corrected ${e.data.field} for ${e.target}`;
    case 'clock.advance': return `advanced the season to ${e.data.to.slice(0, 10)} (${e.data.label})`;
    case 'view.unmask': return `viewed unmasked ${e.data.field}`;
    default: return e.type;
  }
}
