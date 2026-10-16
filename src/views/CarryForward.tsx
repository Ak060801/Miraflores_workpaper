import { useCtx } from '../app/ctx';
import { currentValue } from '../store/projections';
import { Refs, Pill, fmt, date, ContribTag } from '../ui/kit';
import { plan2026 } from '../contrib/ayaan/planning2026';

export function CarryForwardView() {
  const { m, vi, wp } = useCtx();
  const out = vi.v.carryovers_out;
  const p = wp.position;
  const plan = plan2026({
    fed2025TotalTax: p.federal.total_tax, ca2025TotalTax: p.california.total_tax,
    fed2025Agi: currentValue(wp, 'F1040.11'), ca2025Agi: vi.v.summary.california.ca_agi,
    fedWithholding2025: currentValue(wp, 'F1040.25a'), caWithholding2025: currentValue(wp, 'F540NR.71'),
    minimumTaxCredit: out.federal.minimum_tax_credit_from_2025_amt, ref: m.p.planning_reference_2026,
  });
  const expected = m.p.documents.filter((d) => !['D06', 'D07', 'D10', 'D30', 'D40', 'D42', 'D51', 'D52', 'D53', 'D54', 'D55', 'D56', 'D69', 'D70', 'D71', 'D72', 'D73', 'D01', 'D02', 'D03', 'D04', 'D05', 'D47', 'D22', 'D24', 'D66', 'D12', 'D13'].includes(d.id) && d.tax_year === 2025);
  const open = [
    { what: 'Minimum tax credit from the 2025 ISO AMT: Form 8801', refs: ['F6251.11'], amount: out.federal.minimum_tax_credit_from_2025_amt },
    { what: 'SEP contribution not deductible for 2025: carries to 2026 (recompute after Schedule C corrections)', refs: ['Sch1.16', 'D26'], amount: out.federal.sep_contribution_not_deductible_for_2025 },
    { what: 'California: nonresident all year. Only the Sacramento rental and Ridgeline\'s California share are taxable there', refs: ['SchE.21A', 'ev-0971'] },
    { what: 'California basis differences on studio equipment and appliances', refs: Object.keys(out.california.depreciation_basis_differences).map((k) => `asset:${k}`) },
    { what: 'Woodworks stock basis is 0: any 2026 distribution beyond income is taxable gain. Ask for the 2026 K-1 early', refs: ['F7203.15', 'D39'] },
    { what: 'Ridgeline outside basis has never been computed: build it from the capital account (63,660) before a sale or loss', refs: ['ev-0970'] },
    { what: 'Annual FBAR and Form 8938 for Sparbanken; resolve the 2023 Form 3520 question', refs: ['D36', 'D07'] },
    { what: 'Studio: file Forms 1099-NEC by 01/31/2027; keep a clean mileage log (one page per period)', refs: ['D27', 'D23'] },
    { what: 'Coinhaven: keep purchase records for any transfer-in (C6 had none)', refs: ['ev-0919', 'msg-07'] },
    { what: 'Home office: Austin room 260 sq ft for the full year', refs: ['ev-0482'] },
  ];
  return (
    <div>
      <div className="pagehead"><div><h1>Carry forward & plan 2026</h1><div className="sub">What next year's preparer inherits, with its history, and the 2026 estimate plan. The 2026 file opens on {date(m.p.timeline.find((t) => t.event === 'next_year_engagement_started')?.at)}.</div></div></div>
      <div className="grid2">
        <div className="card">
          <h2>Carryovers and balances to 2026</h2>
          <table className="t"><tbody>
            {Object.entries(out.federal).map(([k, v]) => <tr key={k}><td>{k.replace(/_/g, ' ')}</td><td className="num">{fmt(v as any)}</td></tr>)}
          </tbody></table>
        </div>
        <div className="card contrib">
          <div className="row"><h2 style={{ margin: 0 }}>2026 estimated tax plan</h2><span className="spacer" /><ContribTag slot="Slot 2: 2026 plan" author={plan.author} /></div>
          <table className="t" style={{ marginTop: 8 }}><thead><tr><th>Jurisdiction</th><th>Due</th><th className="num">Amount</th></tr></thead><tbody>
            {plan.installments.map((i, k) => <tr key={k}><td>{i.jurisdiction}</td><td>{i.due}</td><td className="num">{fmt(i.amount)}</td></tr>)}
          </tbody></table>
          <ul className="small muted">{plan.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
          <div className="small"><b>Known 2026 changes:</b><ul className="small">{m.p.planning_reference_2026.known_2026_changes_for_this_household.map((x: string) => <li key={x}>{x}</li>)}</ul></div>
        </div>
      </div>
      <div className="card">
        <h2>Open items for the 2026 preparer</h2>
        <table className="t"><tbody>{open.map((o) => <tr key={o.what}><td>{o.what}</td><td className="num">{o.amount !== undefined ? fmt(o.amount) : ''}</td><td><Refs list={o.refs} short /></td></tr>)}</tbody></table>
      </div>
      <div className="card">
        <h2>Documents to expect in 2026</h2>
        <div className="small muted" style={{ marginBottom: 6 }}>Recurring issuers from 2025, minus one-time items (condo sale and loan, home purchase, first-year items, duplicates). Corvane will not issue a W-2.</div>
        <div className="row wrap" style={{ gap: 4 }}>{expected.filter((d) => d.id !== 'D08').map((d) => <Pill key={d.id}>{d.issuer}: {d.document_type}</Pill>)}</div>
      </div>
      <div className="card">
        <h2>Everything carries with its history</h2>
        <div className="small">The 2026 file starts from this year's event log, frozen return and evidence. Every carryover above links to the 2025 line, the engine run, and the people who verified it, so the next preparer can trace a 2026 number back through 2025 to the 2024 return.</div>
      </div>
    </div>
  );
}
