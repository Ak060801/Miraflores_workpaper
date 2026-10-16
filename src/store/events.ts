// The workpaper's only mutable state: an append-only event log.
// Every human action (adjustment, verification, note, sign-off, approval,
// filing, standards change, unmasked view) is one event with who / when / why.
// All screens are projections of (packet + events). Undo appends an 'undo'
// event; nothing is ever deleted, so history, version compare and
// "what changed since I last looked" come for free.
//
// Persistence: localStorage. Live collaboration: BroadcastChannel between tabs
// (open two tabs as two roles). Swapping this transport for a server endpoint
// (POST /events, SSE for others' events) does not change any projection.

import { useSyncExternalStore } from 'react';

export type EventType =
  | 'adjustment.add' | 'adjustment.approve'
  | 'verify'
  | 'note.open' | 'note.reply' | 'note.resolve' | 'note.reopen'
  | 'question.ask' | 'question.answer'
  | 'evidence.attach'
  | 'doc.disposition'
  | 'judgment'
  | 'finding.dismiss'
  | 'signoff'
  | 'step.complete'
  | 'assign'
  | 'time.log'
  | 'client.approve' | 'client.sign8879'
  | 'extension.file'
  | 'efile.transmit'
  | 'filing.freeze'
  | 'amend.open'
  | 'standard.set'
  | 'view.unmask'
  | 'pii.correct'
  | 'clock.advance'
  | 'seen'
  | 'undo';

export interface WPEvent {
  id: string;
  at: string;          // workpaper clock time (simulated season clock)
  wall: string;        // real wall-clock time the event was recorded
  actor: string;       // staff id or client user id
  role: string;
  type: EventType;
  target?: string;     // a reference (line key, ev id, doc id, area id, event id ...)
  data: any;
  batch?: string;      // events created together (bulk action) share a batch id
  seed?: boolean;      // part of the demo season seed
}

const KEY = 'miraflores.workpaper.events.v1';
const DEFAULT_CLOCK = '2026-06-24T15:00:00.000Z';

type Listener = () => void;

class EventStore {
  events: WPEvent[] = [];
  private listeners = new Set<Listener>();
  private chan: BroadcastChannel | null = null;
  version = 0;

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.events = JSON.parse(raw);
    } catch { this.events = []; }
    try {
      this.chan = new BroadcastChannel('miraflores.workpaper');
      this.chan.onmessage = (msg) => {
        if (msg.data?.type === 'append') this.merge(msg.data.events, false);
        if (msg.data?.type === 'reset') { this.events = msg.data.events; this.bump(false); }
      };
    } catch { this.chan = null; }
    window.addEventListener('storage', (e) => {
      if (e.key === KEY && e.newValue) { try { this.events = JSON.parse(e.newValue); this.bump(false); } catch { /* ignore */ } }
    });
  }

  subscribe = (l: Listener) => { this.listeners.add(l); return () => this.listeners.delete(l); };
  getVersion = () => this.version;

  private persist() { try { localStorage.setItem(KEY, JSON.stringify(this.events)); } catch { /* quota */ } }
  private bump(save = true) { this.version++; if (save) this.persist(); this.listeners.forEach((l) => l()); }

  private merge(incoming: WPEvent[], broadcast: boolean) {
    const ids = new Set(this.events.map((e) => e.id));
    const fresh = incoming.filter((e) => !ids.has(e.id));
    if (!fresh.length) return;
    this.events = [...this.events, ...fresh].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
    this.bump(true);
    if (broadcast) this.chan?.postMessage({ type: 'append', events: fresh });
  }

  clock(): string {
    let c = DEFAULT_CLOCK;
    for (const e of this.events) if (e.type === 'clock.advance' && e.data.to > c) c = e.data.to;
    return c;
  }

  // Time stamp for a new event: the season clock, nudged forward so order is stable.
  private nextAt(): string {
    const clock = Date.parse(this.clock());
    const last = this.events.length ? Date.parse(this.events[this.events.length - 1].at) : 0;
    return new Date(Math.max(clock, last + 1000)).toISOString();
  }

  append(actor: { id: string; role: string }, items: Omit<WPEvent, 'id' | 'at' | 'wall' | 'actor' | 'role'>[], opts: { batch?: boolean } = {}): WPEvent[] {
    const batch = opts.batch || items.length > 1 ? `b-${Math.random().toString(36).slice(2, 9)}` : undefined;
    const out: WPEvent[] = [];
    let at = this.nextAt();
    for (const it of items) {
      out.push({ id: `wp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, at, wall: new Date().toISOString(), actor: actor.id, role: actor.role, batch, ...it });
      at = new Date(Date.parse(at) + 1000).toISOString();
    }
    this.merge(out, true);
    return out;
  }

  // Raw insertion with explicit timestamps (seed / import).
  load(events: WPEvent[], replace = false) {
    if (replace) { this.events = []; }
    this.merge(events, false);
    this.chan?.postMessage({ type: 'reset', events: this.events });
  }

  reset() {
    this.events = [];
    this.bump(true);
    this.chan?.postMessage({ type: 'reset', events: [] });
  }

  exportJSON() { return JSON.stringify({ exported: new Date().toISOString(), events: this.events }, null, 2); }
}

export const store = new EventStore();

export function useEvents(): WPEvent[] {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store.events;
}

// Events visible at a point in time, minus anything undone.
export function effectiveEvents(events: WPEvent[], asOf?: string): WPEvent[] {
  const vis = asOf ? events.filter((e) => e.at <= asOf) : events;
  const undone = new Set<string>();
  // walk backwards so an undo of an undo restores the original
  for (let i = vis.length - 1; i >= 0; i--) {
    const e = vis[i];
    if (e.type !== 'undo' || undone.has(e.id)) continue;
    for (const t of e.data.targets as string[]) undone.add(t);
  }
  return vis.filter((e) => !undone.has(e.id) && e.type !== 'undo' && !(e.batch && undone.has(e.batch)));
}
