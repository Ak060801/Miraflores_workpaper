// Types for the packet exactly as delivered. The packet is never mutated:
// everything the workpaper adds lives in the event log (src/store/events.ts).

export interface Position { x0: number; y0: number; x1: number; y1: number }

export interface ExtractedValue {
  id: string;
  document_id: string;
  page: number;
  field: string;
  label: string;
  value: any;
  value_type: string;
  text_as_read: string;
  position: Position;
  confidence: number;
}

export interface DocPage { page: number; printed_content: string }

export interface Document {
  id: string;
  title: string;
  document_type: string;
  issuer: string;
  belongs_to: string;
  tax_year: number;
  received_at: string;
  uploaded_by: string;
  file_name: string;
  page_count: number;
  pages: DocPage[];
  marked_corrected?: boolean;
  extraction: { status: string; values: number; reason?: string | null };
}

export interface Line {
  key: string;
  jurisdiction: 'federal' | 'california';
  form: string;
  line: string;
  label: string;
  value: any;
  rule: string;
  inputs: string[];
  sources: string[];
  note?: string | null;
}

export interface Summary {
  federal: { agi: number; taxable_income: number; total_tax: number; payments: number; balance_due: number; penalty: number };
  california: { total_agi: number; ca_agi: number; total_tax: number; payments: number; balance_due: number; penalty: number };
}

export type RateTable = Record<string, { federal_per_dollar: number; california_per_dollar: number }>;

export interface Diagnostic { code: string; severity: 'info' | 'warning'; message: string; refs: string[] }

export interface ReturnVersion {
  version: string;
  computed_at: string;
  trigger: string;
  documents_used: string[];
  documents_superseded: string[];
  summary: Summary;
  tax_effect_rates: RateTable;
  carryovers_out: any;
  assets: any[];
  diagnostics: Diagnostic[];
  changes_from_previous: { key: string; change: string; old?: any; new?: any }[];
  lines: Line[];
}

export interface Staff { id: string; name: string; role: string; credential: string | null; sensitive_data_clearance: boolean; active_from: string; note?: string }

export interface Packet {
  packet: { name: string; version: string; generated: string; client_id: string };
  readme: any;
  household: any;
  documents: Document[];
  extracted_values: ExtractedValue[];
  client: {
    questionnaire: { id: string; question: string; answer: string; answered_by: string; answered_at: string }[];
    messages: { id: string; sent_at: string; from: string; to: string; text: string }[];
    call_notes: { id: string; date: string; participants: string[]; notes: string[] }[];
  };
  firm: any;
  prior_years: any;
  tax_agency_records: any;
  timeline: { id: string; at: string; event: string; actor: string | null; detail: string | null; refs: string[] }[];
  engine_reference: { parameters: any; rules: Record<string, string> };
  return_versions: ReturnVersion[];
  what_if: any;
  planning_reference_2026: any;
  post_filing_rates: any;
  fx_rates: any;
}
