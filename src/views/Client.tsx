import { useState } from 'react';
import { useCtx, filingGate } from '../app/ctx';
import { areaSnapshot, fingerprint } from '../store/projections';
import { Pill, fmt, date, dateTime, useRun, Avatar, Prompt } from '../ui/kit';
import { EvidenceItem } from '../ui/Inspector';

export function ClientView() {
  const ctx = useCtx();
  const { m, vi, wp, user, act, can, name, now } = ctx;
  const run = useRun();
  const isClient = user.role === 'client';
  const [pin, setPin] = useState('');
  const qs = wp.questions.filter((q) => !isClient || q.to === user.id);
  const msgs = m.p.client.messages.filter((x) => x.sent_at <= now);
  const fp = fingerprint(areaSnapshot(m, wp, 'return'));
  const appr = wp.clientApproval;
  const approvedCurrent = appr && appr.data.fingerprint === fp;
  const p = wp.position;
  const s = vi.v.summary;
  const uploads = wp.evidence.get('client-uploads') || [];
  const plain = wp.adjustments.filter((a) => !a.amendment);

  return (
    <div style={{ maxWidth: 980 }}>
      <div className="pagehead"><div><h1>{isClient ? `Hi ${user.name.split(' ')[0]}` : 'Client portal'}</h1><div className="sub">{isClient ? 'Your 2025 federal and California returns, prepared by Miraflores.' : 'What Ngozi and Erik see. Questions sent here come back as evidence on the lines they are about.'}</div></div></div>

      <div className="card">
        <h2>Questions for you ({qs.filter((q) => !q.answers.length).length} open)</h2>
        {qs.length === 0 && <div className="empty">No questions.</div>}
        {qs.map((q) => (
          <div key={q.id} className="card tight" style={{ borderLeft: `3px solid ${q.answers.length ? 'var(--ok)' : 'var(--warn)'}` }}>
            <div className="row small"><Avatar id={q.actor} /><b>{name(q.actor)}</b><span className="muted">to {name(q.to)} · {dateTime(q.at)}</span><span className="spacer" />{q.answers.length ? <Pill kind="ok">answered</Pill> : <Pill kind="warn">waiting</Pill>}</div>
            <div style={{ margin: '6px 0' }}>{q.text}</div>
            {q.answers.map((a) => <div key={a.id} className="small" style={{ paddingLeft: 10, borderLeft: '2px solid var(--line)', marginTop: 6 }}><b>{name(a.actor)}</b> <span className="muted">{dateTime(a.at)}</span><div>{a.text}</div>{a.attachments?.map((f: any, i: number) => <div key={i}><a href={f.dataUrl} download={f.name}>{f.name}</a></div>)}</div>)}
            {can('question.answer') && (!isClient || q.to === user.id) && <AnswerBox qid={q.id} />}
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Your return</h2>
        <div className="grid2">
          <div><h3>Federal</h3><table className="t"><tbody>
            <tr><td>Adjusted gross income</td><td className="num">{fmt(s.federal.agi + (wp.adjusted.get('F1040.11')?.delta || 0))}</td></tr>
            <tr><td>Total tax</td><td className="num">{fmt(p.federal.total_tax)}</td></tr>
            <tr><td>Withholding, estimates and extension payment</td><td className="num">{fmt(p.federal.payments)}</td></tr>
            <tr className="total"><td>{p.federal.balance_due >= 0 ? 'Amount you owe' : 'Refund'}</td><td className="num">{fmt(Math.abs(p.federal.balance_due))}</td></tr>
          </tbody></table></div>
          <div><h3>California (part-year resident)</h3><table className="t"><tbody>
            <tr><td>California AGI</td><td className="num">{fmt(s.california.ca_agi)}</td></tr>
            <tr><td>Total tax</td><td className="num">{fmt(p.california.total_tax)}</td></tr>
            <tr><td>Withholding and estimates</td><td className="num">{fmt(p.california.payments)}</td></tr>
            <tr className="total"><td>{p.california.balance_due >= 0 ? 'Amount you owe' : 'Refund'}</td><td className="num">{fmt(Math.abs(p.california.balance_due))}</td></tr>
          </tbody></table></div>
        </div>
        {plain.length > 0 && <details style={{ marginTop: 10 }}><summary>What we changed from the first computation ({plain.length})</summary><ul className="small">{plain.map((a) => <li key={a.id}>{a.reason}</li>)}</ul></details>}
        <div className="banner warn small" style={{ marginTop: 10 }}>The federal balance is due with interest from April 15, 2026: the extension gave more time to file, not to pay.</div>
        <div className="row" style={{ marginTop: 10 }}>
          {approvedCurrent ? <Pill kind="ok">Approved by {name(appr!.actor)} on {date(appr!.at)}</Pill> : appr ? <Pill kind="warn">The return changed after your approval on {date(appr.at)}: please review again</Pill> : null}
          {can('client.approve') && !approvedCurrent && <button className="btn primary" onClick={() => run(() => act.clientApprove(), 'Thank you: approval recorded')}>I have reviewed and approve this return</button>}
        </div>
        {approvedCurrent && (
          <div className="card tight" style={{ marginTop: 10 }}>
            <h3>E-file signature (Forms 8879 and FTB 8879)</h3>
            {wp.signed8879 ? <Pill kind="ok">Signed {date(wp.signed8879.at)} by {name(wp.signed8879.actor)}</Pill> : can('client.approve') ? (
              <div className="row"><input type="text" placeholder="5-digit PIN" maxLength={5} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} style={{ width: 110 }} /><button className="btn primary" disabled={pin.length !== 5} onClick={() => run(() => act.sign8879(pin), 'E-file authorization signed')}>Sign</button><span className="small muted">Your signature authorizes Miraflores to file electronically.</span></div>
            ) : <span className="small muted">Waiting for the client.</span>}
          </div>
        )}
        {wp.frozen && <div className="banner ok small" style={{ marginTop: 10 }}>Filed and accepted. Your copy is on the Filing page (Print client copy).</div>}
      </div>

      <div className="card">
        <h2>Upload a document or send a note</h2>
        {can('evidence') && <ClientUpload />}
        {uploads.map((e) => <EvidenceItem key={e.id} e={e} />)}
      </div>

      <div className="card">
        <h2>Messages</h2>
        {msgs.map((x) => <div key={x.id} className="small" style={{ marginBottom: 8 }}><b>{x.from}</b> <span className="muted">{dateTime(x.sent_at)}</span><div>{x.text}</div></div>)}
      </div>
    </div>
  );
}

function AnswerBox({ qid }: { qid: string }) {
  const { act } = useCtx();
  const run = useRun();
  const [text, setText] = useState('');
  const [file, setFile] = useState<any>(null);
  return (
    <div style={{ marginTop: 6 }}>
      <textarea placeholder="Your answer" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row" style={{ marginTop: 4 }}>
        <input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => setFile({ name: f.name, size: f.size, mime: f.type, dataUrl: f.size < 1_500_000 ? String(rd.result) : undefined }); rd.readAsDataURL(f); }} />
        <button className="btn sm primary" disabled={!text.trim()} onClick={() => { run(() => act.answer(qid, text, file ? [file] : undefined), 'Answer sent'); setText(''); setFile(null); }}>Send answer</button>
      </div>
    </div>
  );
}

function ClientUpload() {
  const { act } = useCtx();
  const run = useRun();
  const [text, setText] = useState('');
  return (
    <div className="stack">
      <input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => run(() => act.attach('client-uploads', { name: f.name, kind: 'file', size: f.size, mime: f.type, dataUrl: f.size < 1_500_000 ? String(rd.result) : undefined }), 'Uploaded'); rd.readAsDataURL(f); }} />
      <div className="row"><input type="text" placeholder="or write a note to your preparer" value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1 }} /><button className="btn sm" disabled={!text.trim()} onClick={() => { run(() => act.attach('client-uploads', { name: 'Client note', kind: 'message', text }), 'Sent'); setText(''); }}>Send</button></div>
    </div>
  );
}
