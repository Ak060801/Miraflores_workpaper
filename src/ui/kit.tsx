import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { useCtx, RuleError } from '../app/ctx';
import { resolveRef, refKind } from '../data/refs';
import { inspect, openDoc, go } from '../store/session';
import { currentValue } from '../store/projections';

// ---------- formatting ----------
export function fmt(v: any, opts: { cents?: boolean; sign?: boolean } = {}): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') {
    const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: opts.cents ? 2 : 0, maximumFractionDigits: opts.cents ? 2 : (Number.isInteger(v) ? 0 : 4) });
    if (v < 0) return `(${s})`;
    return opts.sign && v > 0 ? `+${s}` : s;
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}
export const usd = (v: any, cents = false) => (typeof v === 'number' ? `$${fmt(v, { cents })}` : fmt(v));
export const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—');
export const dateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : '—');

export function Effect({ v, unit = '' }: { v: number; unit?: string }) {
  if (!v) return <span className="val muted">0</span>;
  return <span className={`val delta ${v > 0 ? 'up' : 'down'}`}>{v > 0 ? '+' : '−'}{Math.abs(v).toLocaleString()}{unit}</span>;
}

// ---------- toast ----------
let toastState: { msg: string; err?: boolean; undo?: () => void; t: number } | null = null;
const tl = new Set<() => void>();
let tv = 0;
export function toast(msg: string, opts: { err?: boolean; undo?: () => void } = {}) {
  toastState = { msg, ...opts, t: Date.now() }; tv++; tl.forEach((l) => l());
  const t = toastState.t;
  setTimeout(() => { if (toastState?.t === t) { toastState = null; tv++; tl.forEach((l) => l()); } }, opts.undo ? 7000 : 3500);
}
export function Toast() {
  useSyncExternalStore((l) => { tl.add(l); return () => tl.delete(l); }, () => tv);
  if (!toastState) return null;
  const s = toastState;
  return (
    <div className={`toast ${s.err ? 'err' : ''}`}>
      <span>{s.msg}</span>
      {s.undo && <button className="btn sm" onClick={() => { s.undo!(); toastState = null; tv++; tl.forEach((l) => l()); }}>Undo</button>}
    </div>
  );
}

// Run an action, show the outcome, offer undo.
export function useRun() {
  const { act } = useCtx();
  return (fn: () => any, ok?: string, withUndo = true) => {
    try {
      const evs = fn();
      if (ok) toast(ok, withUndo && Array.isArray(evs) && evs.length ? { undo: () => act.undo(evs.map((e: any) => e.id)) } : {});
      return evs;
    } catch (e: any) {
      toast(e instanceof RuleError ? e.message : `Error: ${e.message}`, { err: true });
      if (!(e instanceof RuleError)) console.error(e);
    }
  };
}

// ---------- reference chip ----------
export function Ref({ r, short, children }: { r: string; short?: boolean; children?: ReactNode }) {
  const { m, vi } = useCtx();
  const res = resolveRef(m, vi, r);
  const kind = refKind(r);
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (kind === 'ev' && res.docId) openDoc(res.docId, res.page, res.evId);
    else if ((kind === 'doc' || kind === 'page') && res.docId) openDoc(res.docId, res.page || 1);
    else if (kind === 'finding') go('/checks/' + r.slice(4));
    else inspect(r);
  };
  const tag = kind === 'line' ? r : kind === 'ev' ? r : kind === 'doc' ? r : kind === 'qa' || kind === 'msg' || kind === 'call' ? r : kind === 'finding' ? 'check' : kind;
  return (
    <span className="ref" title={`${res.label}${res.detail ? '\n' + res.detail : ''}`} onClick={onClick}>
      <span className="k">{tag}</span>
      {!short && <span className="lbl">{children ?? res.label}</span>}
    </span>
  );
}

export function Refs({ list, short }: { list: string[]; short?: boolean }) {
  return <span className="row wrap" style={{ gap: 4 }}>{list.map((r) => <Ref key={r} r={r} short={short} />)}</span>;
}

// ---------- a return line value, engine vs workpaper ----------
export function LineVal({ k, cents }: { k: string; cents?: boolean }) {
  const { wp, vi } = useCtx();
  const l = vi.byKey.get(k);
  const adj = wp.adjusted.get(k);
  if (!l) return <span className="val muted">—</span>;
  if (adj && adj.delta) return <span className="val" title="Engine value → workpaper value"><span className="was">{fmt(l.value, { cents })}</span><span className="now">{fmt(adj.value, { cents })}</span></span>;
  const nonlin = wp.affectedNonlinear.get(k);
  return <span className="val" title={nonlin ? 'An adjustment upstream changes this non-linear line: needs an engine recompute' : ''}>{fmt(l.value, { cents })}{nonlin ? <span className="pill warn" style={{ marginLeft: 6 }}>recompute</span> : null}</span>;
}

export function cur(wp: any, k: string) { return currentValue(wp, k); }

// ---------- sensitive data ----------
export function Sensitive({ value, refId, field, kind = 'ssn' }: { value: string; refId: string; field: string; kind?: 'ssn' | 'account' | 'pin' }) {
  const { user, act, can } = useCtx();
  const [shown, setShown] = useState(false);
  const run = useRun();
  if (!value) return <span>—</span>;
  const masked = kind === 'ssn' ? `•••-••-${value.slice(-4)}` : kind === 'pin' ? '••••••' : `••••${value.replace(/\s/g, '').slice(-4)}`;
  if (shown) return <span className="mono">{value}</span>;
  return (
    <span className="row" style={{ display: 'inline-flex', gap: 6 }}>
      <span className="mono">{masked}</span>
      {user.clearance ? (
        <button className="btn sm ghost" title="Reveal (logged)" onClick={() => { if (run(() => act.unmask(refId, field), undefined, false)) setShown(true); }} disabled={!can('unmask')}>show</button>
      ) : <span className="pill" title="No sensitive-data clearance">masked</span>}
    </span>
  );
}

// ---------- small bits ----------
export function Pill({ kind, children, title }: { kind?: string; children: ReactNode; title?: string }) {
  return <span className={`pill ${kind || ''}`} title={title}>{children}</span>;
}
export function Avatar({ id }: { id: string }) {
  const { name } = useCtx();
  const n = name(id);
  const ini = n.split(/\s+/).map((s) => s[0]).slice(0, 2).join('');
  const colors = ['#1f5f4a', '#5b3fa0', '#2a5a8a', '#9a5b00', '#a8322d', '#4b4a45', '#2c7a4b', '#7a4b2c'];
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return <span className="avatar" title={n} style={{ background: colors[h % colors.length] }}>{ini}</span>;
}
export function Tabs({ tabs, on, set }: { tabs: [string, string][]; on: string; set: (t: string) => void }) {
  return <div className="tabs">{tabs.map(([id, label]) => <button key={id} className={on === id ? 'on' : ''} onClick={() => set(id)}>{label}</button>)}</div>;
}
export function Sev({ s }: { s: string }) {
  const map: Record<string, [string, string]> = { error: ['err', 'Error'], warning: ['warn', 'Warning'], info: ['info', 'Info'], pass: ['ok', 'Pass'] };
  const [k, l] = map[s] || ['', s];
  return <Pill kind={k}>{l}</Pill>;
}
export function ContribTag({ slot, author }: { slot: string; author: string }) {
  return <span className="contrib-tag" title={`Contribution slot ${slot}: ${author === 'abbas' ? 'built by Abbas' : 'baseline by Claude, owned by Abbas'}`}>✎ Abbas · {slot}{author !== 'abbas' ? ' (baseline)' : ''}</span>;
}

export function Prompt({ label, onSubmit, placeholder, children, multiline = true, cta = 'Save' }: { label: string; onSubmit: (text: string) => void; placeholder?: string; children?: ReactNode; multiline?: boolean; cta?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}>{label}</button>;
  return (
    <div className="card tight" style={{ marginTop: 6 }}>
      {multiline ? <textarea autoFocus value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} /> : <input type="text" autoFocus style={{ width: '100%' }} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />}
      {children}
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn sm primary" disabled={!text.trim()} onClick={() => { onSubmit(text.trim()); setText(''); setOpen(false); }}>{cta}</button>
        <button className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

// ---------- redaction: sensitive data is masked everywhere by default ----------
export function redactText(s: string): string {
  if (!s) return s;
  return String(s)
    .replace(/\b\d{3}-\d{2}-(\d{4})\b/g, '•••-••-$1')
    .replace(/\bSE\d{2}(?: ?\d{4}){5}\b/g, 'SE•• •••• •••• •••• •••• ••••')
    .replace(/(Protection PIN[^.]*? is )(\d{5,6})/gi, '$1••••••')
    .replace(/(PIN )(\d{5})\b/g, '$1•••••');
}
const SENSITIVE_KEYS = new Set(['ssn', 'ip_pin', 'account', 'routing', 'account_number']);
export function redactObj(o: any): any {
  if (Array.isArray(o)) return o.map(redactObj);
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, SENSITIVE_KEYS.has(k) && typeof v === 'string' ? '••••' + v.slice(-4) : redactObj(v)]));
  return typeof o === 'string' ? redactText(o) : o;
}
export function useReveal(refId: string, field: string) {
  const { user, act, can } = useCtx();
  const [on, setOn] = useState(false);
  const run = useRun();
  const button = user.clearance && !on ? <button className="btn sm ghost" title="Reveal sensitive data. The view is logged." onClick={() => { if (run(() => act.unmask(refId, field), undefined, false)) setOn(true); }} disabled={!can('unmask')}>Reveal sensitive (logged)</button> : !user.clearance ? <Pill title="No sensitive-data clearance">PII masked</Pill> : <Pill kind="warn">revealed · logged</Pill>;
  return { on, r: (s: string) => (on ? s : redactText(s)), ro: (o: any) => (on ? o : redactObj(o)), button };
}
