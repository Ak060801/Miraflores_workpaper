import { jsonPointer, type Model, type VersionIndex } from './model';

// One resolver for every reference format in the packet (README.reference_formats)
// plus the workpaper's own ids (events, findings). Every chip, link and
// evidence list in the UI goes through here, so a reference is never a dead string.

export type RefKind =
  | 'ev' | 'doc' | 'page' | 'qa' | 'msg' | 'call' | 'py' | 'agency' | 'asset' | 'household'
  | 'param' | 'fx' | 'timeline' | 'line' | 'version' | 'finding' | 'event' | 'unknown';

export interface Resolved {
  ref: string;
  kind: RefKind;
  label: string;
  detail?: string;
  value?: any;
  docId?: string;
  page?: number;
  evId?: string;
}

export function refKind(ref: string): RefKind {
  if (/^ev-\d+/.test(ref)) return 'ev';
  if (/^D\d\d$/.test(ref)) return 'doc';
  if (ref.startsWith('doc:')) return 'page';
  if (ref.startsWith('qa-')) return 'qa';
  if (ref.startsWith('msg-')) return 'msg';
  if (ref.startsWith('call-')) return 'call';
  if (ref.startsWith('py:')) return 'py';
  if (ref.startsWith('agency:')) return 'agency';
  if (ref.startsWith('asset:')) return 'asset';
  if (ref.startsWith('household:')) return 'household';
  if (ref.startsWith('ref:param.')) return 'param';
  if (ref.startsWith('ref:fx.')) return 'fx';
  if (ref.startsWith('timeline:') || /^tl-\d+/.test(ref) || ref.startsWith('extension-')) return 'timeline';
  if (/^v\d$/.test(ref)) return 'version';
  if (ref.startsWith('chk:')) return 'finding';
  if (ref.startsWith('wp-')) return 'event';
  if (/^[A-Za-z0-9-]+\.[\w.-]+$/.test(ref)) return 'line';
  return 'unknown';
}

export function resolveRef(m: Model, vi: VersionIndex, ref: string): Resolved {
  const kind = refKind(ref);
  switch (kind) {
    case 'ev': {
      const e = m.evs.get(ref);
      if (!e) return { ref, kind, label: ref };
      const d = m.docs.get(e.document_id);
      return { ref, kind, label: `${e.label}`, detail: `${d?.title ?? e.document_id} · p.${e.page}`, value: e.value, docId: e.document_id, page: e.page, evId: e.id };
    }
    case 'doc': {
      const d = m.docs.get(ref);
      return { ref, kind, label: d ? d.title : ref, detail: d ? `${d.id} · received ${d.received_at.slice(0, 10)}` : undefined, docId: ref, page: 1 };
    }
    case 'page': {
      const mm = ref.match(/^doc:(D\d\d)#page(\d+)/);
      const d = mm ? m.docs.get(mm[1]) : undefined;
      return { ref, kind, label: d ? `${d.title}, page ${mm![2]}` : ref, detail: 'Page not extracted by the pipeline', docId: mm?.[1], page: mm ? +mm[2] : 1 };
    }
    case 'qa': {
      const q = m.qa.get(ref);
      return { ref, kind, label: q ? `Questionnaire: ${q.question}` : ref, detail: q ? `“${q.answer}”: ${q.answered_by}` : undefined, value: q?.answer };
    }
    case 'msg': {
      const q = m.msgs.get(ref);
      return { ref, kind, label: q ? `Message from ${q.from}` : ref, detail: q?.text, value: q?.text };
    }
    case 'call': {
      const c = m.calls.get(ref);
      return { ref, kind, label: c ? `Call notes ${c.date.slice(0, 10)}` : ref, detail: c?.notes.join(' · ') };
    }
    case 'py': {
      const v = jsonPointer(m.p.prior_years, ref.slice(3));
      return { ref, kind, label: `Prior year: ${ref.slice(4).replace(/\//g, ' › ')}`, detail: typeof v === 'object' ? JSON.stringify(v) : String(v), value: v };
    }
    case 'agency': {
      const v = jsonPointer(m.p.tax_agency_records, ref.slice(7));
      return { ref, kind, label: `Agency record: ${ref.slice(8).replace(/\//g, ' › ') || 'all'}`, value: v };
    }
    case 'asset': {
      const id = ref.slice(6);
      const a = vi.v.assets.find((x) => x.asset_id === id) || m.p.prior_years.asset_records.find((x: any) => x.asset_id === id);
      return { ref, kind, label: a ? `Asset ${id}: ${a.description}` : ref, detail: a ? `${a.method}, ${a.life_years} yr, cost ${a.cost}` : undefined, value: a };
    }
    case 'household': {
      const p = m.people.get(ref.slice(10));
      return { ref, kind, label: p ? `${p.name} (${p.role})` : ref, detail: p ? `DOB ${p.dob}${p.relationship ? ', ' + p.relationship : ''}` : undefined, value: p };
    }
    case 'param': {
      const name = ref.slice(10);
      const v = m.p.engine_reference.parameters[name];
      return { ref, kind, label: `Engine parameter ${name}`, detail: JSON.stringify(v), value: v };
    }
    case 'fx': {
      const rate = ref.split('.').pop()!;
      const v = m.p.engine_reference.parameters.fx?.SEK?.[rate];
      return { ref, kind, label: `FX SEK/USD ${rate.replace('_', ' ')}`, detail: String(v), value: v };
    }
    case 'timeline': {
      const id = ref.replace(/^timeline:/, '');
      const t = m.p.timeline.find((x) => x.id === id);
      return { ref, kind, label: t ? `Timeline: ${t.event.replace(/_/g, ' ')}` : ref, detail: t ? `${t.at.slice(0, 10)}${t.detail ? ': ' + t.detail : ''}` : undefined };
    }
    case 'version': {
      const v = m.versionById.get(ref);
      return { ref, kind, label: `Engine run ${ref}`, detail: v ? `${v.v.computed_at.slice(0, 10)}: ${v.v.trigger}` : undefined };
    }
    case 'line': {
      const l = vi.byKey.get(ref);
      return { ref, kind, label: l ? `${l.key} ${l.label}` : ref, value: l?.value };
    }
    default:
      return { ref, kind, label: ref };
  }
}
