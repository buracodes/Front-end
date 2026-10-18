/**
 * FR-607 / FR-908: one canonical RAG band evaluator for the whole client.
 *
 * Wire tokens stay the existing API dialect ("Green" | "Amber" | "Red" | "NoData") so payloads need
 * no remapping; the user-facing labels reconcile the terminology to the FRD: Amber is shown as
 * "Yellow" and a missing/unusable score as "Gray". A missing score is never coerced to 0/Red.
 */
export type RagBand = 'Green' | 'Amber' | 'Red' | 'NoData';

/** Effective band boundaries. The API serves the administrator-configured values. */
export interface RagBands {
  /** Scores >= green are Green. */
  green: number;
  /** Scores >= yellow (and < green) are Amber; below yellow, Red. */
  yellow: number;
}

/** FRD defaults (>= 95 Green, 70-<95 Yellow, < 70 Red, no score Gray). */
export const DEFAULT_RAG_BANDS: RagBands = { green: 95, yellow: 70 };

/** Wire band token -> user-facing label (Amber displays as Yellow, NoData as Gray). */
export const RAG_DISPLAY_LABELS: Record<RagBand, string> = {
  Green: 'Green',
  Amber: 'Yellow',
  Red: 'Red',
  NoData: 'Gray',
};

/** Wire band token -> display color. */
export const RAG_DISPLAY_COLORS: Record<RagBand, string> = {
  Green: '#16a34a',
  Amber: '#d97706',
  Red: '#dc2626',
  NoData: '#94a3b8',
};

/**
 * Bands a score with the given thresholds. A missing score (null/undefined/NaN) is always "NoData"
 * - never Red. Scores above 100 remain Green; the Green band has no upper bound (FR-607).
 */
export function ragBandFromScore(
  score: number | null | undefined,
  bands: RagBands = DEFAULT_RAG_BANDS,
): RagBand {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return 'NoData';
  }
  if (score >= bands.green) {
    return 'Green';
  }
  return score >= bands.yellow ? 'Amber' : 'Red';
}

/** User-facing label for a band ("Yellow" for Amber, "Gray" for NoData). */
export function ragDisplayLabel(band: RagBand | string | null | undefined): string {
  if (!band) {
    return RAG_DISPLAY_LABELS.NoData;
  }
  return RAG_DISPLAY_LABELS[band as RagBand] ?? band;
}

/** CSS tone class for a band. */
export function ragToneClass(band: RagBand | string | null | undefined): string {
  switch (band) {
    case 'Green':
      return 'rag-pill--green';
    case 'Amber':
      return 'rag-pill--yellow';
    case 'Red':
      return 'rag-pill--red';
    case 'NoData':
      return 'rag-pill--gray';
    default:
      return 'rag-pill--none';
  }
}

/** CSS class suffix for a band: "rag-green" | "rag-amber" | "rag-red" | "rag-gray". */
export function ragSlug(band: RagBand | string | null | undefined): string {
  switch (band) {
    case 'Green':
      return 'green';
    case 'Amber':
      return 'amber';
    case 'Red':
      return 'red';
    case 'NoData':
      return 'gray';
    default:
      return 'gray';
  }
}
