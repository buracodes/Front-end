/** FR-607: effective RAG threshold configuration served by GET/PUT api/RagThreshold. */
export interface RagThresholdConfiguration {
  scopeKey: string;
  /** Scores at or above this are Green ("On track"). */
  green: number;
  /** Scores at or above this (but below `green`) are Amber ("At risk"); below it, Red. */
  yellow: number;
  isConfigured: boolean;
  /** "Database" when stored configuration drives the values, "Defaults" when the FRD bands do. */
  source: 'Database' | 'Defaults';
  greenColor: string;
  yellowColor: string;
  redColor: string;
  grayColor: string;
  /** Problems found in stored configuration; empty when healthy. */
  warnings: string[];
}

/** Payload for updating the effective thresholds (FR-607). Colors stay administrator-independent. */
export interface UpdateRagThresholds {
  green: number;
  yellow: number;
}
