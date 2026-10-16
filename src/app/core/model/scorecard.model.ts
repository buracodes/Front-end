export interface Scorecard {
  id: string;
  fiscalYearId: string;
  fiscalYearName?: string;
  name: string;
  description?: string;
  scope: 'Corporate' | 'Division' | 'Department';
  scorecardStatus: 'Active' | 'Closed' | 'Draft';
  goalCount?: number;
  kraCount?: number;
  kpiCount?: number;
  overallScore?: number;
  scoreChange?: number;
  createdDate?: string;
  createdBy?: string;
  updatedDate?: string;
}

export interface CreateScorecardRequest {
  fiscalYearId: string;
  name: string;
  description?: string;
  scope?: 'Corporate' | 'Division' | 'Department';
}

/** The API serializes enums as camelCase (e.g. "corporate"); the UI models use TitleCase. */
export function titleCaseEnumName(value: string | null | undefined): string {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Normalizes a scorecard's enum values so form selects and strict comparisons match. */
export function normalizeScorecard(scorecard: Scorecard): Scorecard {
  return {
    ...scorecard,
    scope: titleCaseEnumName(scorecard.scope) as Scorecard['scope'],
    scorecardStatus: titleCaseEnumName(scorecard.scorecardStatus) as Scorecard['scorecardStatus'],
  };
}

export interface UpdateScorecardRequest {
  name?: string;
  description?: string;
  scope?: 'Corporate' | 'Division' | 'Department';
  scorecardStatus?: 'Active' | 'Closed' | 'Draft';
}

export interface ScorecardSummary {
  id: string;
  name: string;
  fiscalYearName: string;
  scope: string;
  status: string;
  goalCount: number;
  kraCount: number;
  kpiCount: number;
  overallScore: number;
  scoreChange: number;
  isActive: boolean;
}

export interface FiscalYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface CloneScorecardResult {
  sourceScorecardId: string;
  targetScorecardId: string;
  targetFiscalYearId: string;
  name: string;
  goalCount: number;
  kraCount: number;
  kpiCount: number;
  targetCount: number;
}

export interface CreateFiscalYearRequest {
  label: string;
  startDate: string;
  endDate: string;
}