export interface Scorecard {
  id: string;
  fiscalYearId: string;
  fiscalYearName?: string;
  name: string;
  description?: string;
  scope: 'Corporate' | 'Division' | 'Department';
  scorecardStatus: 'Active' | 'Closed';
  goalCount?: number;
  kraCount?: number;
  kpiCount?: number;
  overallScore?: number;
  scoreChange?: number;
  createdDate?: string;
}

export interface CreateScorecardRequest {
  fiscalYearId: string;
  name: string;
  description?: string;
  scope?: 'Corporate' | 'Division' | 'Department';
}

export interface UpdateScorecardRequest {
  name?: string;
  description?: string;
  scope?: 'Corporate' | 'Division' | 'Department';
}

/** The API serializes enums as camelCase (e.g. "corporate"); the UI models use TitleCase. */
export function normalizeScorecard(scorecard: Scorecard): Scorecard {
  const titleCase = (value: string | null | undefined): string =>
    value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
  return {
    ...scorecard,
    scope: titleCase(scorecard.scope) as Scorecard['scope'],
    scorecardStatus: titleCase(scorecard.scorecardStatus) as Scorecard['scorecardStatus'],
  };
}
