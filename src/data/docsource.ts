// Document renditions.
//
// Tracing never depends on how a page is drawn. A trace link is always
// (document id, page, extracted-value id, bounding box). The viewer asks a
// DocumentSource for a page rendition and draws highlight boxes from the
// regions it returns.
//
// Today: SimulatedSource builds pages from documents[].pages[].printed_content
// and the synthetic positions in extracted_values.
// Later: a PdfSource implements the same interface with pdf.js (render the real
// page to a canvas, return the same regions from the extraction pipeline's real
// coordinates). Nothing else in the app changes.

import type { Model } from './model';
import type { ExtractedValue, Position } from './types';

export interface Region { evId: string; box: Position; label: string; text: string }
export interface PageRendition {
  docId: string;
  page: number;
  kind: 'simulated' | 'pdf' | 'image';
  printedText: string;     // what is actually printed (ground truth for "read vs printed")
  regions: Region[];
  imageUrl?: string;       // for real documents
}

export interface DocumentSource {
  pageCount(docId: string): number;
  page(docId: string, page: number): PageRendition;
}

export class SimulatedSource implements DocumentSource {
  constructor(private m: Model) {}
  pageCount(docId: string) { return this.m.docs.get(docId)?.page_count ?? 0; }
  page(docId: string, page: number): PageRendition {
    const d = this.m.docs.get(docId);
    const pg = d?.pages.find((p) => p.page === page);
    const evs: ExtractedValue[] = (this.m.evsByDoc.get(docId) || []).filter((e) => e.page === page);
    return {
      docId, page, kind: 'simulated',
      printedText: pg?.printed_content ?? '(This page is in the file but its content was not provided.)',
      regions: evs.map((e) => ({ evId: e.id, box: e.position, label: e.label, text: e.text_as_read })),
    };
  }
}
