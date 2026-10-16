import { useCtx } from '../app/ctx';
import { go, openDoc } from '../store/session';
import { currentValue } from '../store/projections';
import { Ref, Refs, Pill, fmt, date, dateTime, useRun, Effect, Prompt, Avatar } from '../ui/kit';
import { describe } from './Home';

export function FilingView() {
  const ctx = useCtx();
  const { m, vi, wp, gate, act, can, name, now } = ctx;
  const run = useRun();
  const ext = wp.extension;
  const fz = wp.frozen;
  const amend = wp.adjustments.filter((a) => a.amendment);
  const rates = m.p.post_filing_rates;
  const paidAt = m.p.timeline.find((t) => t.event === 'federal_balance_paid')?.at;
  const balance = fz ? fz.data.position.federal.balance_due : wp.position.federal.balance_due;
  const days = paidAt ? Math.round((Date.parse(paidAt) - Date.parse('2026-04-15')) / 86400000) : 0;
  const interest = Math.round(balance * rates.irs_underpayment_interest_rate_annual * days / 365);
  const ftp = Math.round(balance * rates.irs_failure_to_pay_penalty_per_month * Math.ceil(days / 30));

  return (
    <div>
      <div className="pagehead"><div><h1>Filing</h1><div className="sub">Extension, the filing gate, e-file, the frozen return, amendments and what happens after.</div></div></div>
      <div className="grid2">
        <div className="card">
          <h2>Filing gate {gate.ready ? <Pill kind="ok">ready</Pill> : <Pill kind="warn">{gate.items.filter((i) => !i.ok).length} open</Pill>}</h2>
          <table className="t"><tbody>
            {gate.items.map((i) => <tr key={i.id} className="click" onClick={() => i.route && go(i.route)}><td style={{ width: 30 }}>{i.ok ? <Pill kind="ok">✓</Pill> : <Pill kind="err">✕</Pill>}</td><td>{i.label}{i.detail && <div className="small muted">{i.detail}</div>}</td></tr>)}
          </tbody></table>
          <div className="row" style={{ marginTop: 10 }}>
            {!fz && can('file') && <button className="btn primary" disabled={!gate.ready} onClick={() => run(() => act.transmit(), 'Transmitted', false)}>Transmit e-file (federal + California)</button>}
            {!fz && !gate.ready && <span className="small muted">The partner can transmit once every item is met.</span>}
          </div>
        </div>
        <div className="card">
          <h2>Extension</h2>
          {ext ? <div className="small"><Pill kind="ok">Filed {date(ext.at)}</Pill> Form 4868 with {fmt(ext.data.federal)} (estimate from {ext.data.basis}); FTB 3519 {fmt(ext.data.california)}. Extended due date 10/15/2026. <span className="muted">· {name(ext.actor)}</span></div>
            : can('extension') ? <button className="btn" onClick={() => run(() => act.fileExtension(), 'Extension filed')}>File extensions</button> : <span className="muted small">Not filed.</span>}
          <h2 style={{ marginTop: 16 }}>E-file</h2>
          {wp.efile.length === 0 && <div className="small muted">Nothing transmitted.</div>}
          {wp.efile.map((e) => (
            <div key={e.id} className="small" style={{ marginBottom: 8 }}>
              <div className="row"><Pill kind={e.data.status === 'accepted' ? 'ok' : e.data.status === 'rejected' ? 'err' : 'warn'}>{e.data.jurisdiction} {e.data.status}</Pill><span className="mono muted">{e.data.submission_id}</span><span className="muted">{dateTime(e.at)}</span></div>
              {e.data.errors?.map((er: any) => <div key={er.code} className="banner err small" style={{ marginTop: 4 }}><b>{er.code}</b> {er.message} {er.code.startsWith('R0000') && <a onClick={() => go('/checks/theo-ssn')} style={{ cursor: 'pointer' }}>→ fix</a>}</div>)}
            </div>
          ))}
        </div>
      </div>

      {fz && (
        <div className="card">
          <div className="row"><h2 style={{ margin: 0 }}>Frozen as filed</h2><Pill kind="dark">{date(fz.at)} · {fz.data.version} · {fz.data.fingerprint}</Pill><span className="spacer" /><button className="btn sm" onClick={() => window.print()}>Print client copy</button></div>
          <div className="small muted" style={{ margin: '6px 0 10px' }}>Nothing on the filed return can change. New adjustments are recorded as an amendment on top, shown separately below.</div>
          <div className="grid2">
            <table className="t"><tbody>
              <tr><td>Federal total tax as filed</td><td className="num">{fmt(fz.data.position.federal.total_tax)}</td></tr>
              <tr><td>Federal balance due as filed</td><td className="num">{fmt(fz.data.position.federal.balance_due)}</td></tr>
              <tr><td>California total tax as filed</td><td className="num">{fmt(fz.data.position.california.total_tax)}</td></tr>
              <tr><td>California refund as filed</td><td className="num">{fmt(-fz.data.position.california.balance_due)}</td></tr>
            </tbody></table>
            <div>
              <h3>After filing</h3>
              {balance > 0 ? <div className="small">Federal balance paid {paidAt ? date(paidAt) : '—'} ({days} days after 04/15). Estimated interest at {rates.irs_underpayment_interest_rate_annual * 100}%: <b>{fmt(interest)}</b>; failure-to-pay at 0.5%/month: <b>{fmt(ftp)}</b> (IRS assesses the exact amount, transcript code 196/276). California refund issued 08/21/2026.</div>
                : <div className="small">The return as filed shows a federal <b>overpayment of {fmt(-balance)}</b> (the 04/14 extension payment of 36,000 was estimated from v2, before the corrections). No balance to pay, so the scripted 07/20 "balance paid" debit and the 196/276 interest assessment should not occur: if the transcript shows them, contact the IRS. California refund issued 08/21/2026.</div>}
            </div>
          </div>
          <h3 style={{ marginTop: 14 }}>Amendment on top {amend.length ? `(${amend.length})` : ''}</h3>
          {amend.length === 0 ? <div className="small muted">No changes since filing. Any adjustment made now becomes a Form 1040-X / 540X item.</div> : (
            <table className="t"><tbody>{amend.map((a) => <tr key={a.id}><td><Ref r={a.line} short /></td><td className="small">{a.reason}</td><td className="num"><Effect v={a.fed} /></td><td className="num"><Effect v={a.ca} /></td></tr>)}
              <tr className="total"><td colSpan={2}>Net amendment</td><td className="num"><Effect v={amend.reduce((x, a) => x + a.fed, 0)} /></td><td className="num"><Effect v={amend.reduce((x, a) => x + a.ca, 0)} /></td></tr></tbody></table>
          )}
        </div>
      )}

      <div className="card printonly">
        <h1>Okafor-Lindqvist 2025: client copy</h1>
        <p>Federal total tax {fmt(wp.position.federal.total_tax)} · balance due {fmt(wp.position.federal.balance_due)}. California total tax {fmt(wp.position.california.total_tax)} · refund {fmt(-wp.position.california.balance_due)}.</p>
        <p>Prepared by Miraflores, 1100 Congress Ave, Suite 400, Austin TX. Paid preparer: Helen Strand, CPA.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Letter 566 response: a self-contained record of exactly what was examined.
// ---------------------------------------------------------------------------
export function NoticeView() {
  const ctx = useCtx();
  const { m, vi, wp, name, now } = ctx;
  const notice = m.p.tax_agency_records.notices.find((n: any) => n.type.startsWith('Letter 566'));
  const received = m.docs.get('D72')!.received_at <= now;
  const nec = m.p.documents.filter((d) => d.document_type === '1099-NEC').map((d) => ({ d, amt: (m.evsByDoc.get(d.id) || []).find((e) => e.field === 'box1')?.value as number, payer: (m.evsByDoc.get(d.id) || []).find((e) => e.field === 'payer')?.value }));
  const necTotal = nec.reduce((a, b) => a + b.amt, 0);
  const small = m.evs.get('ev-0111')!.value as number;
  const books = m.evs.get('ev-0103')!.value as number;
  const k = m.evs.get('ev-0127')!.value as number;
  const grossFiled = currentValue(wp, 'SchC.1');
  const vehicle = currentValue(wp, 'F8283.A1.vehicle');
  const stock = currentValue(wp, 'F8283.A1.stock');
  const hist = (keys: string[]) => wp.events.filter((e) => keys.includes(e.target || '') || keys.some((k) => (e.data?.targets || []).includes(k)) || (e.type === 'adjustment.add' && keys.includes(e.target!)));
  const Page = ({ id, page = 1 }: { id: string; page?: number }) => {
    const d = m.docs.get(id)!;
    return <div className="printed small" style={{ maxWidth: 'none' }}><b>{d.id} {d.title}</b> (received {date(d.received_at)}, page {page})<br />{d.pages.find((p) => p.page === page)?.printed_content}</div>;
  };

  return (
    <div>
      <div className="pagehead"><div><h1>Notices</h1><div className="sub">Answer a notice with a self-contained record: the items examined, the numbers as filed, every source page, and who verified what and when.</div></div><span className="spacer" /><button className="btn" onClick={() => window.print()}>Print / save as PDF</button></div>
      {!received && <div className="banner violet">Letter 566 arrives {date(m.docs.get('D72')!.received_at)} in the scripted season. This is a preview of the response the workpaper would assemble from today's record.</div>}
      <div className="card">
        <h2>{notice.type}: tax year {notice.tax_year}</h2>
        <div className="small">Dated {date(notice.dated)} · response due {date(notice.response_due)} · <Ref r="D72" /></div>
        <ol className="small">{notice.items_under_examination.map((i: string) => <li key={i}>{i}</li>)}</ol>
        <div className="small muted">Prior notices: {m.p.tax_agency_records.notices.filter((n: any) => n !== notice).map((n: any) => `${n.type} ${n.tax_year}: ${n.status}`).join('; ')}</div>
      </div>

      <div className="card">
        <h2>Item 1: Noncash charitable contributions (Schedule A line 12, Form 8283)</h2>
        <table className="t"><thead><tr><th>Gift</th><th className="num">As filed</th><th>Substantiation</th></tr></thead><tbody>
          <tr><td>200 sh Northlake Total Market Index Fund to Austin Community Foundation (donor-advised fund), 12/05/2025</td><td className="num">{fmt(stock)}</td><td className="small">Publicly traded; held since 04/2019 (long-term), FMV = high/low average 72.50. Contemporaneous acknowledgment, no goods or services (D65). Cost 9,300 agrees to the Northlake lot history.</td></tr>
          <tr><td>2012 Subaru Outback to Lone Star Kids Auto Donation, 08/20/2025</td><td className="num">{fmt(vehicle)}</td><td className="small">Form 1098-C (D66): sold 09/09/2025 at arm's length for 2,900; deduction limited to gross proceeds. {vehicle === 6000 ? <b style={{ color: 'var(--err)' }}>Filed at the client's 6,000 estimate: concede 3,100.</b> : 'Filed at 2,900 (workpaper adjustment from the client\'s 6,000 estimate).'}</td></tr>
        </tbody></table>
        <Page id="D65" /><Page id="D66" />
        <HistoryList evs={hist(['F8283.A1.vehicle', 'F8283.A1.stock', 'SchA.12'])} />
      </div>

      <div className="card">
        <h2>Item 2: Schedule C gross receipts</h2>
        <table className="t"><tbody>
          {nec.map(({ d, amt, payer }) => <tr key={d.id}><td>Form 1099-NEC: {payer} <Ref r={d.id} short /></td><td className="num">{fmt(amt)}</td></tr>)}
          <tr className="total"><td>Total Forms 1099-NEC</td><td className="num">{fmt(necTotal)}</td></tr>
          <tr><td>Clients who issued no 1099 (11 small clients, deposits detail) <Ref r="ev-0111" short /></td><td className="num">{fmt(small)}</td></tr>
          <tr className="total"><td>Books revenue (QuickBooks P&L, cash basis) <Ref r="ev-0103" short /></td><td className="num">{fmt(books)}</td></tr>
          <tr><td>Form 1099-K Paywell <Ref r="D21" short />: already inside Atlas Outdoor Gear's 41,200 (12,400 by card, 28,800 by ACH; deposits detail D15 p.3)</td><td className="num">({fmt(k)}) included above</td></tr>
          <tr className="total"><td>Gross receipts reported (Schedule C line 1)</td><td className="num">{fmt(grossFiled)}</td></tr>
        </tbody></table>
        {grossFiled !== books && <div className="banner err small">As filed, gross receipts include the 1099-K twice ({fmt((grossFiled as number) - books)} over). The response should show the overlap and request the adjustment in the taxpayer's favor.</div>}
        <Page id="D15" page={3} /><Page id="D21" /><Page id="D14" />
        <HistoryList evs={hist(['SchC.1'])} />
      </div>
    </div>
  );
}

function HistoryList({ evs }: { evs: any[] }) {
  const { name } = useCtx();
  if (!evs.length) return null;
  return (
    <div className="small" style={{ marginTop: 8 }}>
      <b>Workpaper record</b>
      {evs.map((e) => <div key={e.id}>{dateTime(e.at)}: {name(e.actor)} {describe(e)}</div>)}
    </div>
  );
}
