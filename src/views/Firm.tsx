import { useState } from 'react';
import { useCtx, resolvedFinding } from '../app/ctx';
import { AREAS } from '../data/model';
import { store } from '../store/events';
import { buildSeed } from '../app/seed';
import { Pill, Tabs, fmt, date, dateTime, useRun, Avatar, Ref, ContribTag, toast } from '../ui/kit';
import { POLICIES } from '../contrib/abbas/firmPolicy';
import { ROLE_LABEL } from '../store/session';

export function FirmView() {
  const [tab, setTab] = useState('standards');
  return (
    <div>
      <div className="pagehead"><div><h1>Firm</h1><div className="sub">Standards, policies, people and access, time against budget, status, and the record itself.</div></div></div>
      <Tabs tabs={[['standards', 'Standards'], ['policies', 'Policies'], ['people', 'People & roles'], ['access', 'Access log'], ['time', 'Time vs budget'], ['status', 'Status'], ['data', 'Data']]} on={tab} set={setTab} />
      {tab === 'standards' && <Standards />}
      {tab === 'policies' && <Policies />}
      {tab === 'people' && <People />}
      {tab === 'access' && <Access />}
      {tab === 'time' && <Time />}
      {tab === 'status' && <Status />}
      {tab === 'data' && <Data />}
    </div>
  );
}

function Standards() {
  const { wp, can, act, name } = useCtx();
  const run = useRun();
  const st = wp.standards;
  const [rule, setRule] = useState('');
  const hist = wp.events.filter((e) => e.type === 'standard.set');
  return (
    <div className="grid2">
      <div className="card stack">
        <h2>Thresholds</h2>
        {!can('standards') && <div className="banner warn small">Only the firm administrator can change standards. Switch to Jo Kimura.</div>}
        <div className="row"><span style={{ width: 260 }}>Variance flag: change over (%)</span><input type="number" defaultValue={st.variance.flag_if_change_over_percent} disabled={!can('standards')} onBlur={(e) => +e.target.value !== st.variance.flag_if_change_over_percent && run(() => act.setStandard('variance.percent', +e.target.value), 'Standard updated')} /></div>
        <div className="row"><span style={{ width: 260 }}>…and over (amount)</span><input type="number" defaultValue={st.variance.and_over_amount} disabled={!can('standards')} onBlur={(e) => +e.target.value !== st.variance.and_over_amount && run(() => act.setStandard('variance.amount', +e.target.value), 'Standard updated')} /></div>
        <div className="row"><span style={{ width: 260 }}>Partner approval above tax effect of</span><input type="number" defaultValue={st.partner_threshold} disabled={!can('standards')} onBlur={(e) => +e.target.value !== st.partner_threshold && run(() => act.setStandard('partner_threshold', +e.target.value), 'Standard updated')} /></div>
        <h3 style={{ marginTop: 10 }}>Verification types</h3>
        <div className="row wrap">{st.verification_types.map((v) => <Pill key={v}>{v.replace(/_/g, ' ')}</Pill>)}</div>
        <h3 style={{ marginTop: 10 }}>Required steps</h3>
        <ol className="small">{st.required_steps.map((s) => <li key={s}>{s}</li>)}</ol>
      </div>
      <div className="card">
        <h2>Rules</h2>
        <ul className="small">{st.rules.map((r) => <li key={r} style={{ marginBottom: 4 }}>{r}</li>)}</ul>
        {can('standards') && <div className="row"><input type="text" placeholder="Add a firm rule" value={rule} onChange={(e) => setRule(e.target.value)} style={{ flex: 1 }} /><button className="btn sm" disabled={!rule.trim()} onClick={() => { run(() => act.setStandard('rules.add', rule.trim()), 'Rule added'); setRule(''); }}>Add</button></div>}
        <h3 style={{ marginTop: 12 }}>How each rule is enforced</h3>
        <ul className="small muted">
          <li>Own work: sign-off action refuses a reviewer/partner who prepared or adjusted in the area.</li>
          <li>Partner sign-off over threshold: adjustments carry "needs partner"; the filing gate blocks until approved.</li>
          <li>Authority: judgment action refuses an empty authority.</li>
          <li>Due diligence: filing gate requires a recorded 8867 judgment.</li>
          <li>Blocking notes: filing gate.</li>
          <li>Masking: every sensitive field is masked for staff without clearance; reveals are logged (Access log).</li>
          <li>Retention: records are append-only; destruction date = filing + 7 years (see Data).</li>
        </ul>
        {hist.length > 0 && <><h3>Changes</h3>{hist.map((e) => <div key={e.id} className="small">{dateTime(e.at)} {name(e.actor)}: {e.data.path} → {String(e.data.value)}</div>)}</>}
      </div>
    </div>
  );
}

function Policies() {
  const ctx = useCtx();
  const { m, wp, findings } = ctx;
  return (
    <div className="card contrib">
      <div className="row" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Firm policies beyond the starter standards</h2><span className="spacer" /><ContribTag slot="Slot 3: firm policy" author={POLICIES.every((p) => p.author === 'abbas') ? 'abbas' : 'baseline'} /></div>
      <div className="small muted" style={{ marginBottom: 8 }}>Each policy is code in <span className="mono">src/contrib/abbas/firmPolicy.ts</span>, tested continuously, and blocks a sign-off level until it passes.</div>
      <table className="t"><tbody>
        {POLICIES.map((p) => { const v = p.test({ m, wp, findings }); return (
          <tr key={p.id}><td><Pill kind={p.author === 'abbas' ? 'violet' : ''}>{p.author}</Pill></td><td>{p.text}<div className="small muted">blocks {p.blocks} sign-off</div>{v.slice(0, 5).map((x) => <div key={x.ref} className="small"><Ref r={x.ref} short /> {x.message}</div>)}</td><td>{v.length ? <Pill kind="err">{v.length} open</Pill> : <Pill kind="ok">passes</Pill>}</td></tr>
        ); })}
      </tbody></table>
    </div>
  );
}

function People() {
  const { users, m } = useCtx();
  return (
    <div className="card">
      <table className="t"><thead><tr><th>Person</th><th>Role</th><th>Clearance</th><th>Active from</th><th>Note</th></tr></thead><tbody>
        {users.map((u) => <tr key={u.id}><td><div className="row"><Avatar id={u.id} />{u.name}{u.credential ? `, ${u.credential}` : ''}</div></td><td>{ROLE_LABEL[u.role]}</td><td>{u.clearance ? <Pill kind="ok">cleared</Pill> : <Pill kind="warn">masked</Pill>}</td><td className="small">{(m.p.firm.staff.find((s: any) => s.id === u.id) || {}).active_from || '—'}</td><td className="small muted">{u.note || ''}</td></tr>)}
      </tbody></table>
      <div className="small muted" style={{ marginTop: 8 }}>Permissions are enforced in the action layer (src/app/ctx.tsx), not only hidden in the UI. Switch roles from the top bar to see each view. Sam Adeyemi (quality review) becomes active 2027-01-04.</div>
    </div>
  );
}

function Access() {
  const { wp, can, name, m } = useCtx();
  if (!can('accesslog')) return <div className="banner warn">Only the firm administrator and quality reviewer can read the access log.</div>;
  return (
    <div className="card">
      <h2>Sensitive data views ({wp.unmaskLog.length})</h2>
      <table className="t"><tbody>{wp.unmaskLog.slice().reverse().map((e) => <tr key={e.id}><td className="small">{dateTime(e.wall)}</td><td><div className="row"><Avatar id={e.actor} />{name(e.actor)}</div></td><td>{e.data.field}</td><td><Ref r={e.target!} short /></td></tr>)}</tbody></table>
      {wp.unmaskLog.length === 0 && <div className="empty">No unmasked views yet.</div>}
      <div className="small muted">Masked fields: SSNs, IP PINs, bank routing/account numbers, foreign account number. Retention: destroy after {m.p.firm.starter_standards.rules.find((r: string) => /retained/.test(r)) ? '7 years from filing' : '—'}.</div>
    </div>
  );
}

function Time() {
  const { m, wp, name } = useCtx();
  const byPerson = new Map<string, number>();
  for (const e of wp.timeEvents) byPerson.set(e.actor, (byPerson.get(e.actor) || 0) + e.data.hours);
  const total = [...wp.time.values()].reduce((a, b) => a + b, 0);
  const budget = Object.values(m.p.firm.budget_hours as Record<string, number>).reduce((a, b) => a + b, 0);
  return (
    <div className="grid2">
      <div className="card">
        <h2>By area</h2>
        <table className="t"><tbody>
          {[...AREAS.map((a) => a.id), 'partner_review'].map((id) => { const b = m.p.firm.budget_hours[id]; const t = wp.time.get(id) || 0; return <tr key={id}><td>{AREAS.find((a) => a.id === id)?.name || id.replace(/_/g, ' ')}</td><td className="num">{t.toFixed(1)}</td><td className="num muted">{b ?? '—'}</td><td style={{ width: 120 }}>{b ? <div className={`bar ${t > b ? 'over' : ''}`}><div style={{ width: `${Math.min(100, (t / b) * 100)}%` }} /></div> : null}</td></tr>; })}
          <tr className="total"><td>Total</td><td className="num">{total.toFixed(1)}</td><td className="num">{budget}</td><td></td></tr>
        </tbody></table>
        <div className="small muted">Fixed fee {fmt(4800)} (D01): {budget} budgeted hours.</div>
      </div>
      <div className="card">
        <h2>By person</h2>
        <table className="t"><tbody>{[...byPerson].map(([p, h]) => <tr key={p}><td><div className="row"><Avatar id={p} />{name(p)}</div></td><td className="num">{h.toFixed(1)}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}

function Status() {
  const { m, wp, findings, gate, now } = useCtx();
  const open = findings.filter((f) => f.severity === 'error' && !resolvedFinding(wp, f)).length;
  const stage = wp.frozen ? 'Filed' : wp.signed8879 ? 'Ready to file' : wp.clientApproval ? 'Client approved' : 'In review';
  return (
    <div className="card">
      <h2>Firm status board</h2>
      <table className="t"><thead><tr><th>Client</th><th>Return</th><th>Stage</th><th>Due</th><th className="num">Open errors</th><th className="num">Open notes</th><th>Gate</th><th className="num">Hours</th></tr></thead><tbody>
        <tr><td>{m.p.packet.client_id} Okafor-Lindqvist</td><td>2025 1040 + 540NR</td><td><Pill kind="info">{stage}</Pill></td><td>2026-10-15</td><td className="num">{open}</td><td className="num">{wp.notes.filter((n) => n.status === 'open').length}</td><td>{gate.items.filter((i) => i.ok).length}/{gate.items.length}</td><td className="num">{[...wp.time.values()].reduce((a, b) => a + b, 0).toFixed(1)}</td></tr>
      </tbody></table>
      <div className="small muted" style={{ marginTop: 6 }}>One client in this prototype; the board and the top-bar search work across clients unchanged because every record carries the client id.</div>
    </div>
  );
}

function Data() {
  const { m } = useCtx();
  const download = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `workpaper-events-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  return (
    <div className="card stack">
      <h2>The record</h2>
      <div className="small">{store.events.length} events in the append-only log, stored in this browser and synced live to other open tabs. The packet itself is never modified.</div>
      <div className="row wrap">
        <button className="btn" onClick={download}>Export event log (JSON)</button>
        <label className="btn">Import event log<input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; f.text().then((t) => { const j = JSON.parse(t); store.load(j.events, true); toast(`Imported ${j.events.length} events`); }); }} /></label>
        <button className="btn danger" onClick={() => { if (confirm('Clear all workpaper events and start from the packet alone?')) { localStorage.setItem('miraflores.noseed', '1'); store.reset(); toast('Cleared: packet only'); } }}>Reset to packet only</button>
        <button className="btn" onClick={() => { localStorage.removeItem('miraflores.noseed'); store.load(buildSeed(m), true); toast('Demo season loaded'); }}>Reload demo season</button>
      </div>
    </div>
  );
}
