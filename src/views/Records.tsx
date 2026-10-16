import { useMemo, useState } from 'react';
import { useCtx } from '../app/ctx';
import { go, inspect, openDoc } from '../store/session';
import { currentValue } from '../store/projections';
import { Ref, Refs, fmt, LineVal, Pill, Effect, useRun, date } from '../ui/kit';
import { SummaryTable, varianceRows } from './Return';

const TABS: [string, string][] = [
  ['summary', 'Return vs last year'], ['sales', 'Sales detail'], ['books', 'Books to tax'], ['depreciation', 'Depreciation'], ['rentals', 'Rentals & passive'],
  ['k1', 'K-1s & basis'], ['state', 'State split'], ['deductions', 'Deductions & credits'], ['payments', 'Payments'], ['retirement', 'Retirement & foreign'],
  ['carryovers', 'Carryovers'], ['prior', 'Prior preparer vs us'],
];

export function RecordsView({ tab = 'summary' }: { tab?: string }) {
  const t = TABS.find((x) => x[0] === tab) ? tab : 'summary';
  return (
    <div>
      <div className="pagehead"><div><h1>{TABS.find((x) => x[0] === t)?.[1]}</h1><div className="sub">Records a CPA expects, built from the same lines and sources as everything else. Every number opens its trace.</div></div></div>
      <div className="tabs">{TABS.map(([id, l]) => <button key={id} className={t === id ? 'on' : ''} onClick={() => go(`/records/${id}`)}>{l}</button>)}</div>
      {t === 'summary' && <AllVariance />}
      {t === 'sales' && <Sales />}
      {t === 'books' && <Books />}
      {t === 'depreciation' && <Depreciation />}
      {t === 'rentals' && <Rentals />}
      {t === 'k1' && <K1s />}
      {t === 'state' && <StateSplit />}
      {t === 'deductions' && <Deductions />}
      {t === 'payments' && <Payments />}
      {t === 'retirement' && <Retirement />}
      {t === 'carryovers' && <Carryovers />}
      {t === 'prior' && <Prior />}
    </div>
  );
}

function AllVariance() {
  const ctx = useCtx();
  const rows = varianceRows(ctx);
  return <SummaryTable keys={rows.map((r) => r.k)} />;
}

// Simple keyed table of return lines.
function Lines({ keys, title, note }: { keys: string[]; title?: string; note?: string }) {
  const { vi, m } = useCtx();
  const py = m.p.prior_years.return_2024.lines;
  return (
    <div className="card">
      {title && <h2>{title}</h2>}
      {note && <div className="small muted" style={{ marginBottom: 6 }}>{note}</div>}
      <table className="t"><thead><tr><th>Line</th><th>Description</th><th className="num">2024</th><th className="num">2025</th><th>Sources</th></tr></thead><tbody>
        {keys.filter((k) => vi.byKey.has(k)).map((k) => { const l = vi.byKey.get(k)!; return (
          <tr key={k} className="click" onClick={() => inspect(k)}><td className="mono small">{k}</td><td>{l.label}{l.note && <div className="small muted">{l.note}</div>}</td><td className="num muted">{fmt(py[k])}</td><td className="num"><LineVal k={k} /></td><td onClick={(e) => e.stopPropagation()}>{l.sources.slice(0, 4).map((s) => <Ref key={s} r={s} short />)}</td></tr>
        ); })}
      </tbody></table>
    </div>
  );
}

// ---------------------------------------------------------------------------
interface Lot { key: string; broker: string; box: string; id: string; name: string; acq: string; sold: string; proceeds: number; basis: number; adjCode?: string; adj: number; gain: number; flags: string[] }
const BROKER: Record<string, string> = { N: 'Northlake', M: 'Meridian', X: 'Brightpath', C: 'Coinhaven', S: 'S corporation' };

function useLots(): Lot[] {
  const { vi } = useCtx();
  return useMemo(() => vi.v.lines.filter((l) => l.form === 'F8949' && !l.line.endsWith('total')).map((l) => {
    const [box, id] = l.line.split('.');
    const mm = l.label.match(/^(.*?) \(acquired (\S+), sold (\S+); proceeds ([\d,.]+), basis ([\d,.]+)(?:, adjustment (\w) (-?[\d,.]+))?\)/);
    const n = (s?: string) => (s ? parseFloat(s.replace(/,/g, '')) : 0);
    const lot: Lot = { key: l.key, broker: BROKER[id[0]] || id, box, id, name: mm?.[1] || l.label, acq: mm?.[2] || '', sold: mm?.[3] || '', proceeds: n(mm?.[4]), basis: n(mm?.[5]), adjCode: mm?.[6], adj: n(mm?.[7]), gain: l.value as number, flags: [] };
    if (lot.adjCode === 'W') lot.flags.push('wash sale');
    if (lot.basis === 0) lot.flags.push('zero basis');
    if ('BEHK'.includes(box)) lot.flags.push('basis not reported');
    const held = (Date.parse(lot.sold) - Date.parse(lot.acq)) / 86400000;
    if (held > 335 && held < 395) lot.flags.push('near 1 year');
    if (Math.abs(lot.gain) > 10000) lot.flags.push('large');
    return lot;
  }), [vi]);
}

function Sales() {
  const { m, vi, wp, act, can, findings } = useCtx();
  const run = useRun();
  const lots = useLots();
  const [broker, setBroker] = useState('all');
  const [exc, setExc] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const flagged = new Set(findings.filter((f) => f.severity !== 'pass').flatMap((f) => f.lines));
  const vis = lots.filter((l) => (broker === 'all' || l.broker === broker) && (!exc || l.flags.length || flagged.has(l.key)) && (!q || l.name.toLowerCase().includes(q.toLowerCase()) || l.id.toLowerCase() === q.toLowerCase()));
  const per = 100;
  const sum = (arr: Lot[], f: (l: Lot) => number) => arr.reduce((a, l) => a + f(l), 0);
  const byBroker = Object.values(BROKER).map((b) => ({ b, list: lots.filter((l) => l.broker === b) })).filter((x) => x.list.length);
  const boxes = ['A', 'B', 'D', 'E', 'F', 'H', 'K'].filter((b) => vi.byKey.has(`F8949.${b}.total`));
  const summaries: Record<string, { label: string; value: number; ref: string }[]> = {
    Brightpath: [{ label: '1099-B summary proceeds (ST + LT)', value: 139615.96 + 195112.56, ref: 'D74' }],
    Meridian: [{ label: '1099-B summary proceeds', value: m.evs.get('ev-0703')!.value, ref: 'ev-0703' }],
    Northlake: [{ label: '1099-B summary proceeds (p.2)', value: 6600 + 37720 + 8400 + 15300, ref: 'D28' }],
    Coinhaven: [{ label: '1099-DA total gross proceeds', value: 34833, ref: 'D34' }],
  };
  return (
    <div>
      <div className="grid2">
        <div className="card">
          <h2>Broker statements reconcile to their lots</h2>
          <table className="t"><thead><tr><th>Broker</th><th className="num">Lots</th><th className="num">Lot proceeds</th><th className="num">Statement</th><th className="num">Diff</th></tr></thead><tbody>
            {byBroker.filter((x) => x.b !== 'S corporation').map(({ b, list }) => {
              const s = summaries[b]?.[0]; const p = sum(list, (l) => l.proceeds); const d = s ? Math.round((s.value - p) * 100) / 100 : 0;
              return <tr key={b}><td>{b} {s && <Ref r={s.ref} short />}</td><td className="num">{list.length}</td><td className="num">{fmt(p, { cents: true })}</td><td className="num">{s ? fmt(s.value, { cents: true }) : '—'}</td><td className="num">{d ? <Pill kind="err">{fmt(d, { cents: true })}</Pill> : <Pill kind="ok">0</Pill>}</td></tr>;
            })}
          </tbody></table>
          <div className="small muted" style={{ marginTop: 6 }}>Meridian's 250.00 difference is lot M18 on page 32, which the pipeline did not read (see Checks).</div>
        </div>
        <div className="card">
          <h2>Form 8949 boxes</h2>
          <table className="t"><tbody>{boxes.map((b) => <tr key={b} className="click" onClick={() => inspect(`F8949.${b}.total`)}><td className="mono">{b}</td><td className="small">{vi.byKey.get(`F8949.${b}.total`)!.label.replace(/^Box \w totals /, '')}</td><td className="num"><LineVal k={`F8949.${b}.total`} /></td></tr>)}</tbody></table>
        </div>
      </div>
      <div className="card">
        <div className="row wrap" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>{vis.length} of {lots.length} lots</h2>
          <select value={broker} onChange={(e) => { setBroker(e.target.value); setPage(0); }}><option value="all">All brokers</option>{byBroker.map((x) => <option key={x.b}>{x.b}</option>)}</select>
          <label className="chk small"><input type="checkbox" checked={exc} onChange={(e) => { setExc(e.target.checked); setPage(0); }} /> exceptions only (wash sales, zero/unreported basis, near one year, large, flagged)</label>
          <input type="text" placeholder="security or lot id" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          <span className="spacer" />
          {can('verify') && <button className="btn sm" onClick={() => run(() => act.verify(vis.map((l) => l.key), 'agreed_to_source_document', `Bulk: ${vis.length} lots agreed to broker statement`), `Verified ${vis.length} lots`)}>Verify these {vis.length}</button>}
        </div>
        <table className="t">
          <thead><tr><th>Lot</th><th>Security</th><th>Box</th><th>Acquired</th><th>Sold</th><th className="num">Proceeds</th><th className="num">Basis</th><th className="num">Adj.</th><th className="num">Gain</th><th>Flags</th><th></th></tr></thead>
          <tbody>
            {vis.slice(page * per, page * per + per).map((l) => (
              <tr key={l.key} className="click" onClick={() => inspect(l.key)}>
                <td className="mono small">{l.id}</td><td>{l.name}</td><td className="mono">{l.box}</td><td className="small">{l.acq}</td><td className="small">{l.sold}</td>
                <td className="num">{fmt(l.proceeds, { cents: true })}</td><td className="num">{fmt(l.basis, { cents: true })}</td><td className="num">{l.adj ? `${l.adjCode} ${fmt(l.adj, { cents: true })}` : ''}</td>
                <td className="num"><LineVal k={l.key} cents /></td>
                <td>{l.flags.map((f) => <Pill key={f} kind={f === 'zero basis' ? 'err' : 'warn'}>{f}</Pill>)}{flagged.has(l.key) && <Pill kind="err">check</Pill>}</td>
                <td>{(wp.verifications.get(l.key) || []).length > 0 && <Pill kind="ok">✓</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {vis.length > per && <div className="row" style={{ marginTop: 8 }}><button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button><span className="small">page {page + 1} of {Math.ceil(vis.length / per)}</span><button className="btn sm" disabled={(page + 1) * per >= vis.length} onClick={() => setPage(page + 1)}>›</button></div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Books() {
  const { m, wp } = useCtx();
  const ev = (f: string) => (m.evsByDoc.get('D14') || []).find((e) => e.field === f)!;
  const rows: { book: string; ev?: string; amt: number; tax: string[]; diff?: number; why: string }[] = [
    { book: 'Sales (client projects + print/licensing)', ev: 'ev-0103', amt: ev('total_income').value, tax: ['SchC.1'], why: 'Engine added the 1099-K (12,400) as unmatched; it is inside Atlas receipts (see Checks).' },
    { book: 'Advertising', ev: 'ev-0088', amt: ev('Advertising').value, tax: ['SchC.8'], why: '' },
    { book: 'Car and truck - fuel', ev: 'ev-0090', amt: ev('Car and truck - fuel').value, tax: ['SchC.9'], why: 'Replaced by standard mileage (miles × 0.70); fuel is not deductible under that method.' },
    { book: 'Contract labor', ev: 'ev-0091', amt: ev('Contract labor').value, tax: ['SchC.11'], why: 'Two contractors; Forms 1099-NEC not filed.' },
    { book: 'Depreciation (book, SL 5 yr)', ev: 'ev-0092', amt: ev('Depreciation').value, tax: ['SchC.13'], why: 'Tax: 100% special depreciation on 38,000 placed in service 03/21/2025.' },
    { book: 'Insurance - business liability', ev: 'ev-0093', amt: ev('Insurance - business liability').value, tax: ['SchC.15'], why: '' },
    { book: 'Insurance - health (Erik)', ev: 'ev-0094', amt: ev('Insurance - health (Erik)').value, tax: ['Sch1.17'], why: 'Not a Schedule C expense; engine moved it to SE health insurance, which is not allowed (eligible for employer plan).' },
    { book: 'Internet + telephone', ev: 'ev-0095', amt: ev('Internet').value + ev('Telephone').value, tax: ['SchC.25'], why: 'Family plan and home internet: business share only.' },
    { book: 'Legal and professional', ev: 'ev-0096', amt: ev('Legal and professional').value, tax: ['SchC.17'], why: '' },
    { book: 'Meals', ev: 'ev-0097', amt: ev('Meals').value, tax: ['SchC.24b'], why: '50% limit.' },
    { book: 'Office expenses', ev: 'ev-0098', amt: ev('Office expenses').value, tax: ['SchC.18'], why: '' },
    { book: 'Software and subscriptions', ev: 'ev-0099', amt: ev('Software and subscriptions').value, tax: ['SchC.27a.1'], why: 'Includes Spotify Family (personal).' },
    { book: 'Supplies', ev: 'ev-0100', amt: ev('Supplies').value, tax: ['SchC.22'], why: '' },
    { book: 'Travel', ev: 'ev-0102', amt: ev('Travel').value, tax: ['SchC.24a'], why: '' },
    { book: 'Bank and merchant fees', ev: 'ev-0089', amt: ev('Bank and merchant fees').value, tax: ['SchC.27a.2'], why: '' },
    { book: '(not in books) Home office, simplified', amt: 0, tax: ['SchC.30'], why: 'Average 240 sq ft × 5.' },
  ];
  const v = (k: string) => currentValue(wp, k) as number;
  const bookNet = ev('net_income').value;
  const recon = [
    ['Net income per books', bookNet, 'ev-0105'],
    ['+ 1099-K added by engine', v('SchC.1') - ev('total_income').value, 'SchC.1'],
    ['+ fuel (book) − standard mileage', ev('Car and truck - fuel').value - v('SchC.9'), 'SchC.9'],
    ['+ book depreciation − tax depreciation', ev('Depreciation').value - v('SchC.13'), 'SchC.13'],
    ['+ health insurance (to Schedule 1)', ev('Insurance - health (Erik)').value, 'Sch1.17'],
    ['+ 50% of meals', ev('Meals').value - v('SchC.24b'), 'SchC.24b'],
    ['+ personal items removed (phone, internet, Spotify)', (ev('Internet').value + ev('Telephone').value - v('SchC.25')) + (ev('Software and subscriptions').value - v('SchC.27a.1')), 'SchC.25'],
    ['− home office', -v('SchC.30'), 'SchC.30'],
  ] as [string, number, string][];
  const total = recon.reduce((a, r) => a + r[1], 0);
  return (
    <div>
      <div className="grid2">
        <div className="card">
          <h2>Book net income to Schedule C net profit</h2>
          <table className="t"><tbody>
            {recon.map(([l, a, r]) => <tr key={l} className="click" onClick={() => r.startsWith('ev') ? openDoc('D14', 1, r) : inspect(r)}><td>{l}</td><td className="num">{fmt(a)}</td></tr>)}
            <tr className="total"><td>= Schedule C line 31 (recomputed)</td><td className="num">{fmt(total)}</td></tr>
            <tr><td>Schedule C line 31 (workpaper)</td><td className="num"><LineVal k="SchC.31" /></td></tr>
          </tbody></table>
          {Math.abs(total - v('SchC.31')) > 1 ? <div className="banner warn small">Does not tie by {fmt(total - v('SchC.31'))}.</div> : <div className="banner ok small" style={{ marginTop: 8 }}>Ties.</div>}
        </div>
        <div className="card">
          <h2>Gross receipts, three ways</h2>
          <table className="t"><tbody>
            <tr><td>Forms 1099-NEC (5)</td><td className="num">{fmt(142000)}</td></tr>
            <tr><td>Deposits from clients with no 1099</td><td className="num">{fmt(m.evs.get('ev-0111')!.value)}</td></tr>
            <tr className="total"><td>Third-party + other</td><td className="num">{fmt(151300)}</td></tr>
            <tr><td>Books revenue</td><td className="num">{fmt(ev('total_income').value)}</td></tr>
            <tr><td>Form 1099-K (inside Atlas's 41,200)</td><td className="num">{fmt(12400)}</td></tr>
            <tr><td>Schedule C line 1</td><td className="num"><LineVal k="SchC.1" /></td></tr>
          </tbody></table>
        </div>
      </div>
      <div className="card">
        <h2>Books (P&L) mapped to the return</h2>
        <table className="t"><thead><tr><th>Book account</th><th className="num">Books</th><th>Return line</th><th className="num">Return</th><th>Why different</th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.book}><td>{r.book} {r.ev && <Ref r={r.ev} short />}</td><td className="num">{fmt(r.amt)}</td><td>{r.tax.map((t) => <Ref key={t} r={t} short />)}</td><td className="num">{r.tax.map((t) => <LineVal key={t} k={t} />)}</td><td className="small muted">{r.why}</td></tr>)}
        </tbody></table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Depreciation() {
  const { vi, wp } = useCtx();
  const hvac = wp.adjustments.find((a) => a.effectOverride?.source === 'what_if:hvac_improvement');
  const assets = [...vi.v.assets];
  if (hvac) assets.push({ asset_id: 'SAC-HVAC', description: '1450 Fremont Way - HVAC heat pump system (workpaper)', activity: 'Rental: 1450 Fremont Way, Sacramento', cost: 11000, placed_in_service: '2025-08-12', method: 'SL / mid-month', life_years: 27.5, federal: { prior_accumulated: 0, depreciation_2025: 150, accumulated_end: 150 }, california: { prior_accumulated: 0, depreciation_2025: 150, accumulated_end: 150 }, amt: { depreciation_2025: 150, difference_from_regular: 0 }, disposed: null, sources: ['D47'], workpaper: true });
  const tot = (j: 'federal' | 'california', k: string) => assets.reduce((a, x) => a + (x[j]?.[k] || 0), 0);
  return (
    <div className="card">
      <table className="t">
        <thead><tr><th>Asset</th><th>Placed in service</th><th>Method / life</th><th className="num">Cost</th><th className="num">Fed prior</th><th className="num">Fed 2025</th><th className="num">Fed end</th><th className="num">CA 2025</th><th className="num">CA end</th><th className="num">AMT diff</th><th>Disposal</th></tr></thead>
        <tbody>
          {assets.map((a) => (
            <tr key={a.asset_id} className="click" onClick={() => inspect(`asset:${a.asset_id}`)}>
              <td><span className="mono small">{a.asset_id}</span> {a.description}{a.workpaper && <> <Pill kind="violet">from adjustment</Pill></>}<div className="small muted">{a.activity}{a.land_value_not_depreciated ? ` · land ${fmt(a.land_value_not_depreciated)} not depreciated` : ''}</div></td>
              <td className="small">{a.placed_in_service}</td>
              <td className="small">{a.method}, {a.life_years} yr{/bonus|special/i.test(a.method) ? <> <Pill>bonus</Pill></> : ''}</td>
              <td className="num">{fmt(a.cost)}</td>
              <td className="num">{fmt(a.federal.prior_accumulated, { cents: true })}</td><td className="num">{fmt(a.federal.depreciation_2025, { cents: true })}</td><td className="num">{fmt(a.federal.accumulated_end, { cents: true })}</td>
              <td className="num">{fmt(a.california.depreciation_2025, { cents: true })}</td><td className="num">{fmt(a.california.accumulated_end, { cents: true })}</td>
              <td className="num">{fmt(a.amt?.difference_from_regular)}</td>
              <td className="small">{a.disposition ? <>sold {a.disposition.date}<div className="muted">unrecaptured §1250 {fmt(a.disposition.unrecaptured_1250_depreciation, { cents: true })}; §1250 ordinary {fmt(a.disposition.section_1250_ordinary_recapture)}</div></> : '—'}</td>
            </tr>
          ))}
          <tr className="total"><td colSpan={5}>Total</td><td className="num">{fmt(tot('federal', 'depreciation_2025'), { cents: true })}</td><td></td><td className="num">{fmt(tot('california', 'depreciation_2025'), { cents: true })}</td><td colSpan={3}></td></tr>
        </tbody>
      </table>
      <div className="small muted" style={{ marginTop: 8 }}>California differences carried forward: <Refs list={Object.keys(vi.v.carryovers_out.california.depreciation_basis_differences).map((k) => `asset:${k}`)} short /> · Form 4797 for the condo: <Refs list={['F4797.21', 'F4797.22', 'F4797.23', 'F4797.25', 'SchD.19']} short /></div>
    </div>
  );
}

function Rentals() {
  const { vi } = useCtx();
  const A = ['SchE.1A', 'SchE.2A', 'SchE.3A', 'SchE.9A', 'SchE.11A', 'SchE.12A', 'SchE.14A', 'SchE.16A', 'SchE.18A', 'SchE.20A', 'SchE.21A', 'SchE.22A'];
  const B = A.map((k) => k.replace(/A$/, 'B')).concat(['SchE.19B']);
  return (
    <div>
      <div className="grid2"><Lines keys={A} title="1450 Fremont Way, Sacramento (all year)" /><Lines keys={B} title="1200 Barton Hills Dr 4C, Austin (rented to 09/30, sold 10/15)" /></div>
      <Lines keys={['F8582.1a', 'F8582.1b', 'F8582.1c', 'F8582.3a', 'F8582.4', 'SchE.26', 'SchE.32', 'SchE.41']} title="Passive activity losses (Form 8582)" note="Net passive income is positive after the condo's fully taxable disposition, so current and suspended losses of both rentals are allowed in full (prior-year unallowed 6,300 + 9,850)." />
      <Lines keys={['F4797.20', 'F4797.21', 'F4797.22', 'F4797.23', 'F4797.24', 'F4797.25', 'F4797.26g', 'F4797.7', 'SchD.11', 'SchD.19']} title="Condo sale (Form 4797)" />
    </div>
  );
}

function K1s() {
  const { m, vi } = useCtx();
  const sb = m.p.prior_years.basis_records;
  return (
    <div>
      <div className="grid2">
        <div className="card">
          <h2>Lindqvist Family Woodworks, Inc. (1120-S, 20%) <Ref r="D39" short /></h2>
          <table className="t"><tbody>
            {[['Box 1 ordinary income', 'ev-0975', ['SchE.28A', 'F7203.3a', 'F8995.2.2']], ['Box 4 interest', 'ev-0976', ['SchB.1.7', 'F7203.3c']], ['Box 16D distributions', 'ev-0977', ['F7203.6', 'F7203.excess']], ['Box 17V QBI / W-2 wages / UBIA', 'ev-0979', ['F8995.2.2', 'F8995.15.2']], ['Oregon composite tax 1,580', 'ev-0982', ['ScheduleS.credit']]].map(([l, e, ks]) => (
              <tr key={l as string}><td>{l} <Ref r={e as string} short /></td><td className="num">{fmt(m.evs.get(e as string)!.value)}</td><td><Refs list={ks as string[]} short /></td></tr>
            ))}
          </tbody></table>
        </div>
        <div className="card">
          <h2>Ridgeline Real Estate Fund III LP (1065, LP) <Ref r="D37" short /></h2>
          <table className="t"><tbody>
            {[['Box 2 net rental real estate', 'ev-0964', ['SchE.28B', 'F8582.3a']], ['Box 5 interest', 'ev-0965', ['SchB.1.8']], ['Box 9a net LTCG', 'ev-0966', ['SchD.12']], ['Box 19A distributions', 'ev-0967', []], ['Box 21 foreign taxes', 'ev-0968', ['Sch3.1']], ['State: California share 22%', 'ev-0971', ['SchCA540NR.17.E']]].map(([l, e, ks]) => (
              <tr key={l as string}><td>{l} <Ref r={e as string} short /></td><td className="num">{fmt(m.evs.get(e as string)!.value)}</td><td><Refs list={ks as string[]} short /></td></tr>
            ))}
          </tbody></table>
          <div className="small muted">Received 06/22/2026 (late; expected June per client). Not a trade or business: no QBI.</div>
        </div>
      </div>
      <div className="card">
        <h2>Basis by year</h2>
        <table className="t"><thead><tr><th>Item</th><th>2022</th><th>2023</th><th>2024</th><th>2025</th><th>Source</th></tr></thead><tbody>
          <tr><td>Woodworks stock basis (end of year)</td><td className="num">{fmt(sb.scorp_lindqvist_family_woodworks[0].ending_stock_basis)}</td><td className="num">15,400<div className="small muted">+14,100 − 20,000 (D40)</div></td><td className="num">2,300<div className="small muted">+16,900 − 30,000</div></td><td className="num"><LineVal k="F7203.15" /><div className="small muted">2,300 + 18,485 − 42,000 → excess <LineVal k="F7203.excess" /></div></td><td><Refs list={['D07', 'D40', 'D39', 'F7203.1']} short /></td></tr>
          <tr><td>Ridgeline capital account</td><td>—</td><td>—</td><td className="num">{fmt(sb.partnership_ridgeline[0].ending_capital_account)}</td><td className="num">{fmt(m.evs.get('ev-0970')!.value)}</td><td className="small"><Pill kind="warn">outside basis never computed</Pill></td></tr>
          <tr><td>Ngozi IRA nondeductible basis</td><td>—</td><td>—</td><td className="num">7,000</td><td className="num"><LineVal k="F8606.14" /><div className="small muted">14,000 used by conversions</div></td><td><Refs list={['D42', 'D43', 'F8606.2']} short /></td></tr>
          <tr><td>Home, 7709 Barton Ridge Dr</td><td>—</td><td>—</td><td>—</td><td className="num">685,000<div className="small muted">purchased 07/08/2025</div></td><td><Ref r="D54" short /></td></tr>
        </tbody></table>
      </div>
    </div>
  );
}

function StateSplit() {
  const { vi, m, findings } = useCtx();
  const items = ['1', '2', '3', '4', '7', '12', '17', '26'].map((n) => ({ n, A: `SchCA540NR.${n}.A`, D: `SchCA540NR.${n}.D`, E: `SchCA540NR.${n}.E` })).filter((x) => vi.byKey.has(x.D) || vi.byKey.has(x.E));
  const rule = (k: string) => m.p.engine_reference.rules[vi.byKey.get(k)?.rule || ''] || '';
  const res = m.p.household.residency;
  return (
    <div>
      <div className="card">
        <div className="row wrap">{res.map((r: any) => <Pill key={r.state} kind={r.state === 'CA' ? 'info' : ''}>{r.state} {r.status} {r.from} → {r.to}</Pill>)}<span className="small muted">California resident {m.p.engine_reference.parameters.ca_resident_days} of 365 days</span></div>
      </div>
      <div className="card">
        <h2>Income split (Schedule CA 540NR)</h2>
        <table className="t"><thead><tr><th>Item</th><th className="num">Federal</th><th className="num">Total, CA law</th><th className="num">California-source</th><th>How sourced</th></tr></thead><tbody>
          {items.map((x) => (
            <tr key={x.n}><td>{vi.byKey.get(x.E)?.label.replace(/ - California amount$/, '') || x.n}{findings.some((f) => f.severity === 'error' && f.lines.includes(x.E)) && <> <Pill kind="err">check</Pill></>}</td>
              <td className="num" onClick={() => inspect(x.A)}><LineVal k={x.A} /></td><td className="num" onClick={() => inspect(x.D)}><LineVal k={x.D} /></td><td className="num" onClick={() => inspect(x.E)}><LineVal k={x.E} /></td>
              <td className="small muted">{rule(x.E)}</td></tr>
          ))}
          <tr className="total"><td>Total income</td><td></td><td className="num"><LineVal k="SchCA540NR.22.D" /></td><td className="num"><LineVal k="SchCA540NR.22.E" /></td><td></td></tr>
        </tbody></table>
      </div>
      <Lines keys={['F540NR.17', 'F540NR.32', 'F540NR.34', 'F540NR.35', 'F540NR.36', 'F540NR.37', 'F540NR.39', 'ScheduleS.credit', 'F540NR.61', 'F540NR.64']} title="California tax" note="California taxes all income at the rate for total income, applied to California-source income (540NR line 36 × line 35)." />
    </div>
  );
}

function Deductions() {
  const { vi, wp } = useCtx();
  const v = (k: string) => currentValue(wp, k) as number;
  const agi = v('F1040.11');
  const limits = [
    { item: 'State and local taxes', claimed: v('SchA.5d'), limit: v('SchA.5e'), note: `Cap 40,000 (AGI ${fmt(agi)} under 500,000 phase-down start).`, k: 'SchA.5e' },
    { item: 'Home mortgage interest', claimed: v('SchA.8e'), limit: v('SchA.8e'), note: 'Acquisition debt 548,000 then refinanced at 540,000: under the 750,000 limit.', k: 'SchA.8e' },
    { item: 'Charitable: cash (60% of AGI)', claimed: v('SchA.11'), limit: Math.round(agi * 0.6), note: '', k: 'SchA.11' },
    { item: 'Charitable: appreciated stock to DAF (30% of AGI)', claimed: v('F8283.A1.stock'), limit: Math.round(agi * 0.3), note: 'Long-term, publicly traded: FMV.', k: 'F8283.A1.stock' },
    { item: 'Charitable: vehicle', claimed: v('F8283.A1.vehicle'), limit: 2900, note: 'Limited to 1098-C gross proceeds.', k: 'F8283.A1.vehicle' },
    { item: 'Child tax credit / ODC', claimed: v('F8812.8'), limit: v('F8812.12'), note: 'Phase-out 50 per 1,000 over 400,000 MAGI.', k: 'F8812.12' },
    { item: 'American opportunity credit', claimed: v('F8863.30'), limit: v('F8863.7'), note: 'Fully phased out above 180,000 MAGI.', k: 'F8863.7' },
    { item: 'Dependent care credit', claimed: v('F2441.2'), limit: v('F2441.31'), note: '3,000 limit for one child, less 5,000 excluded employer benefits.', k: 'F2441.31' },
    { item: 'QBI deduction', claimed: v('F8995.27'), limit: v('F8995.36'), note: 'Within the phase-in range above 394,600.', k: 'F8995.39' },
    { item: 'HSA (family HDHP)', claimed: v('F8889.9'), limit: v('F8889.3'), note: 'All employer contributions; no deduction.', k: 'F8889.13' },
    { item: 'Foreign tax credit (no Form 1116)', claimed: v('Sch3.1'), limit: 600, note: 'De minimis passive.', k: 'Sch3.1' },
  ];
  return (
    <div className="card">
      <table className="t"><thead><tr><th>Item</th><th className="num">Before limit</th><th className="num">Allowed / limit</th><th>Note</th></tr></thead><tbody>
        {limits.map((l) => <tr key={l.item} className="click" onClick={() => inspect(l.k)}><td>{l.item}</td><td className="num">{fmt(l.claimed)}</td><td className="num">{fmt(l.limit)}</td><td className="small muted">{l.note}</td></tr>)}
      </tbody></table>
      <div className="small muted" style={{ marginTop: 6 }}>Itemized total <LineVal k="SchA.17" /> vs standard 31,500. California itemized <LineVal k="SchCA540NR.A.itemized" />.</div>
    </div>
  );
}

function Payments() {
  const { m, vi } = useCtx();
  const tx = m.p.tax_agency_records.irs_account_transcript_2025[0].transactions;
  const ftb = m.p.tax_agency_records.ftb_account;
  const d67 = (m.evsByDoc.get('D67') || []).filter((e) => e.field.endsWith('_amount'));
  return (
    <div className="grid2">
      <div className="card">
        <h2>Federal estimates: four sources</h2>
        <table className="t"><thead><tr><th>Due</th><th className="num">EFTPS (D67)</th><th className="num">Client (qa-41)</th><th className="num">IRS transcript</th></tr></thead><tbody>
          {['2025-04-15', '2025-06-16', '2025-09-15', '2026-01-15'].map((d, i) => <tr key={d}><td>{d}</td><td className="num">{d67[i] ? fmt(d67[i].value) : <Pill kind="warn">none</Pill>}</td><td className="num">{i === 3 ? '4,000 (01/14)' : ''}</td><td className="num">{fmt(tx.find((t: any) => t.date === d || (i === 3 && t.date === '2026-01-15'))?.amount)}</td></tr>)}
          <tr className="total"><td>Total</td><td className="num">9,000</td><td></td><td className="num">12,000</td></tr>
        </tbody></table>
        <div className="small" style={{ marginTop: 6 }}>Engine <LineVal k="F1040.26" /> used the client's 4,000. Withholding <LineVal k="F1040.25a" />, extension <LineVal k="Sch3.10" />, excess SS <LineVal k="Sch3.11" />.</div>
      </div>
      <div className="card">
        <h2>California: payments by tax year</h2>
        <table className="t"><thead><tr><th>Date</th><th className="num">Amount</th><th>Designated (D68)</th><th>FTB account</th></tr></thead><tbody>
          {[1, 2, 3, 4, 5, 6].map((i) => { const date = (m.evsByDoc.get('D68') || []).find((e) => e.field === `pay${i}_date`)!.value; const amt = (m.evsByDoc.get('D68') || []).find((e) => e.field === `pay${i}_amount`)!.value; const yr = (m.evsByDoc.get('D68') || []).find((e) => e.field === `pay${i}_year`)!.value;
            const inFtb25 = ftb.tax_year_2025_payments.some((p: any) => p.date === date); const in24 = ftb.tax_year_2024_payments_after_filing.some((p: any) => p.date === date);
            return <tr key={i}><td>{date}</td><td className="num">{fmt(amt)}</td><td>{yr}</td><td>{inFtb25 ? <Pill kind="ok">2025</Pill> : in24 ? <Pill kind="err">held as 2024 credit</Pill> : <span className="small muted">2024</span>}</td></tr>; })}
        </tbody></table>
        <div className="small" style={{ marginTop: 6 }}>Engine <LineVal k="F540NR.72" /> counted every payment dated 04/01/2025–01/15/2026. Withholding <LineVal k="F540NR.71" /> (Halvorsen kept withholding CA tax after the move).</div>
      </div>
    </div>
  );
}

function Retirement() {
  return (
    <div>
      <div className="grid2">
        <Lines keys={['F8606.1', 'F8606.2', 'F8606.3', 'F8606.6', 'F8606.8', 'F8606.11', 'F8606.14', 'F8606.18', 'F1040.4a', 'F1040.4b']} title="Backdoor Roth (Form 8606)" note="Two conversions 02/20 and 04/02 of 7,000 contributions (2024 contribution made 02/2025 + 2025 contribution). Year-end traditional balance 0, so no pro-rata leakage." />
        <Lines keys={['Sch1.16', 'F8889.3', 'F8889.9', 'F8889.13', 'F8889.14a', 'F8889.16']} title="SEP-IRA and HSA" note="SEP contribution 18,000 deposited 04/10/2026; deduction limited; excess carries to 2026." />
      </div>
      <Lines keys={['SchB.7a', 'SchB.7b', 'SchB.1.6', 'F8938.1.max', 'F8938.1.ye', 'F8938.req', 'Sch3.1']} title="Foreign: Sparbanken Norrland (Sweden)" note="Interest at the 2025 average rate; Form 8938 values at the year-end Treasury rate. FBAR and the 2023 Form 3520 are outside the return (see Judgment › Completeness)." />
    </div>
  );
}

function Carryovers() {
  const { m, vi, wp } = useCtx();
  const cin = m.p.prior_years.carryovers_into_2025;
  const out = vi.v.carryovers_out;
  return (
    <div className="grid2">
      <div className="card">
        <h2>Into 2025 (from 2024)</h2>
        <table className="t"><tbody>
          {Object.entries(cin).filter(([k, v]) => typeof v === 'number').map(([k, v]) => <tr key={k} className="click" onClick={() => inspect(`py:/carryovers_into_2025/${k}`)}><td>{k.replace(/_/g, ' ')}</td><td className="num">{fmt(v)}</td></tr>)}
        </tbody></table>
        <div className="small muted">Used on <Refs list={['SchD.6', 'SchD.14', 'F8582.1c', 'F8606.2']} short /></div>
      </div>
      <div className="card">
        <h2>Out to 2026</h2>
        <table className="t"><tbody>
          {Object.entries(out.federal).map(([k, v]) => <tr key={k}><td>{k.replace(/_/g, ' ')}</td><td className="num">{fmt(v as any)}</td></tr>)}
          {Object.entries(out.california.depreciation_basis_differences).map(([k, v]) => <tr key={k}><td>California basis difference {k}</td><td className="num">{fmt(v as any, { cents: true })}</td></tr>)}
          {wp.adjustments.some((a) => a.effectOverride?.source === 'what_if:hvac_improvement') && <tr><td>New asset SAC-HVAC (11,000, 27.5 yr) <Pill kind="violet">adjustment</Pill></td><td className="num">10,850 remaining</td></tr>}
        </tbody></table>
        <div className="small muted">Engine {vi.v.version}. Workpaper adjustments to Schedule C change the SEP excess and the minimum tax credit: confirm on the next engine run.</div>
      </div>
    </div>
  );
}

function Prior() {
  const { m } = useCtx();
  const notes = m.p.prior_years.prior_preparer_workpaper.notes as string[];
  const ours = [
    'Same: 2023 K-1 now obtained (D40). Rolled 21,300 → 15,400 → 2,300. Their "assumed sufficient" for 2024 was right; 2025 distributions exceed basis by 21,215.',
    'Confirmed: 2024 Form 5498 (D42) shows 7,000 contributed 02/12/2025 for 2024. Client\'s questionnaire (qa-31) was wrong; their 7,000 basis stands.',
    'Changed scope: FBAR is outside our engagement too; we advise in writing. Form 8938 maximum value 2025: 149,567 (year-end rate).',
    'Continued: California 200DB on the appliances; 483.84 in 2025, 241.92 left.',
    'Changed: measured room is 220 sq ft (D24). They used 300 in 2024; average 240 in 2025 across both homes.',
  ];
  const diffs = [
    ['Self-employed health insurance', 'None (Erik on Ngozi\'s plan)', 'Engine claimed 14,400; we disallow (eligible for employer plan)'],
    ['Swedish interest FX', '2024 average (10.56) for 2024: correct', 'Engine reused 10.56 for 2025; we use 2025 average 9.86'],
    ['Home office', '300 sq ft, simplified', '240 average sq ft, simplified'],
    ['Mileage', '7,400 miles × 0.67', 'Log shows 8,100 unique miles (engine 11,800 with a duplicated page) × 0.70'],
    ['Passive losses', 'Suspended except to passive income', 'Released in full on the condo disposition'],
    ['Residency', 'California full year', 'California resident to 07/14; Texas after (540NR)'],
  ];
  return (
    <div>
      <div className="card">
        <h2>Their notes, and what we did</h2>
        <table className="t"><thead><tr><th>Delta River Tax Services (Glen Hardesty, EA)</th><th>Miraflores 2025</th></tr></thead><tbody>{notes.map((n, i) => <tr key={i}><td className="small">{n}</td><td className="small">{ours[i]}</td></tr>)}</tbody></table>
      </div>
      <div className="card">
        <h2>Treatment differences</h2>
        <table className="t"><thead><tr><th>Item</th><th>2024 (prior preparer)</th><th>2025 (us)</th></tr></thead><tbody>{diffs.map((d) => <tr key={d[0]}><td>{d[0]}</td><td className="small">{d[1]}</td><td className="small">{d[2]}</td></tr>)}</tbody></table>
        <div className="small muted" style={{ marginTop: 6 }}>Source: <Refs list={['D06', 'D07', 'py:/prior_preparer_workpaper']} short /></div>
      </div>
    </div>
  );
}
