export interface Scorecard {
  id: string;
  fiscalYearId: string;
  fiscalYearName?: string;
  name: string;
  description?: string;
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
}

export interface UpdateScorecardRequest {
  name?: string;
  description?: string;
}

/** The API serializes enums as camelCase (e.g. "corporate"); the UI models use TitleCase. */
export function normalizeScorecard(scorecard: Scorecard): Scorecard {
  const titleCase = (value: string | null | undefined): string =>
    value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
  return {
    ...scorecard,
    scorecardStatus: titleCase(scorecard.scorecardStatus) as Scorecard['scorecardStatus'],
  };
}
