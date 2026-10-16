// Per-tab session state: who I am (role switcher), where I am, what I'm inspecting,
// and whether I'm replaying the season. Not part of the workpaper record.
import { useSyncExternalStore } from 'react';

export type Role = 'preparer' | 'reviewer' | 'partner' | 'firm_administrator' | 'quality_reviewer' | 'client';

export interface User {
  id: string;
  name: string;
  role: Role;
  clearance: boolean;
  credential?: string | null;
  note?: string;
}

export interface Session {
  userId: string;
  route: string;
  inspect: string | null;      // a ref open in the inspector drawer
  docFocus: { docId: string; page: number; evId?: string } | null;
  replayAt: string | null;     // null = live; ISO = read-only view of the season at that moment
  showContrib: boolean;
}

const KEY = 'miraflores.session.v1';
let state: Session = {
  userId: 'st-01', route: location.hash.slice(1) || '/home', inspect: null, docFocus: null, replayAt: null, showContrib: false,
};
try {
  const raw = sessionStorage.getItem(KEY) || localStorage.getItem(KEY);
  if (raw) state = { ...state, ...JSON.parse(raw), route: location.hash.slice(1) || JSON.parse(raw).route || '/home', inspect: null, docFocus: null };
} catch { /* ignore */ }

const ls = new Set<() => void>();
let ver = 0;

export function setSession(patch: Partial<Session>) {
  if (patch.route !== undefined && patch.route !== state.route && patch.docFocus === undefined) patch = { ...patch, docFocus: null };
  state = { ...state, ...patch };
  ver++;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(KEY, JSON.stringify({ userId: state.userId, showContrib: state.showContrib }));
  } catch { /* ignore */ }
  if (patch.route !== undefined && location.hash.slice(1) !== patch.route) location.hash = patch.route;
  ls.forEach((l) => l());
}
window.addEventListener('hashchange', () => { if (location.hash.slice(1) !== state.route) setSession({ route: location.hash.slice(1) }); });

export function useSession(): Session {
  useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => ver);
  return state;
}
export const getSession = () => state;

export const go = (route: string) => setSession({ route });
export const inspect = (ref: string | null) => setSession({ inspect: ref });
export const openDoc = (docId: string, page = 1, evId?: string) => setSession({ docFocus: { docId, page, evId } });

// ---------------------------------------------------------------------------
// Roles and what each may do. Enforced in the UI and re-checked in actions.ts.
// ---------------------------------------------------------------------------
export type Permission =
  | 'adjust' | 'verify' | 'note.open' | 'note.resolve' | 'note.reply' | 'question.ask' | 'question.answer'
  | 'signoff.preparer' | 'signoff.reviewer' | 'signoff.partner' | 'approve.adjustment'
  | 'judgment' | 'disposition' | 'assign' | 'time' | 'standards' | 'accesslog'
  | 'file' | 'extension' | 'client.approve' | 'unmask' | 'clock' | 'evidence' | 'pii.correct';

const PERMS: Record<Role, Permission[]> = {
  preparer: ['adjust', 'verify', 'note.reply', 'question.ask', 'question.answer', 'signoff.preparer', 'judgment', 'disposition', 'time', 'evidence', 'unmask', 'pii.correct', 'clock'],
  reviewer: ['adjust', 'verify', 'note.open', 'note.resolve', 'note.reply', 'question.ask', 'signoff.reviewer', 'judgment', 'disposition', 'time', 'evidence', 'unmask', 'extension', 'pii.correct', 'clock', 'assign'],
  partner: ['adjust', 'verify', 'note.open', 'note.resolve', 'note.reply', 'question.ask', 'signoff.partner', 'approve.adjustment', 'judgment', 'time', 'evidence', 'unmask', 'file', 'extension', 'assign', 'clock'],
  firm_administrator: ['assign', 'standards', 'accesslog', 'unmask', 'clock', 'time'],
  quality_reviewer: ['note.open', 'note.reply', 'note.resolve', 'unmask', 'accesslog'],
  client: ['question.answer', 'client.approve', 'evidence'],
};

export function can(u: User, p: Permission): boolean {
  if (p === 'unmask' && !u.clearance) return false;
  return PERMS[u.role]?.includes(p) ?? false;
}

export function usersFrom(firm: any): User[] {
  const staff: User[] = firm.staff.map((s: any) => ({ id: s.id, name: s.name, role: s.role, clearance: s.sensitive_data_clearance, credential: s.credential, note: s.note }));
  const clients: User[] = firm.client_users.map((c: any) => ({ id: c.id, name: c.name, role: 'client' as Role, clearance: false }));
  return [...staff, ...clients];
}

export const ROLE_LABEL: Record<string, string> = {
  preparer: 'Preparer', reviewer: 'Reviewer', partner: 'Partner', firm_administrator: 'Firm admin', quality_reviewer: 'Quality reviewer', client: 'Client',
};
