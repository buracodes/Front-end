export interface PerformanceKpiRow {
  kpiId: string;
  kpiName: string;
  kpiCode?: string;
  unit?: string;
  weight: number;
  goalName?: string;
  kraName?: string;
  ownerName?: string;
  divisionOwnerName?: string;
  target?: number | null;
  actual?: number | null;
  score?: number | null;
  rag?: string | null;
  trend?: string | null;
}

export interface PerformanceDivisionSummary {
  divisionId: string;
  divisionName: string;
  divisionCode?: string;
  overallScore?: number | null;
  rag?: string | null;
  kpiCount: number;
  goalsCount: number;
  greenCount: number;
  amberCount: number;
  redCount: number;
  noDataCount: number;
  planStatus?: string | null;
}

export interface PerformanceMonitoring {
  scope: 'Corporate' | 'Division';
  fiscalYearId?: string | null;
  fiscalYearName?: string | null;
  scorecardId?: string | null;
  scorecardName?: string | null;
  divisionId?: string | null;
  divisionName?: string | null;
  overallScore?: number | null;
  rag?: string | null;
  periodType: string;
  scorecardCount: number;
  goalsCount: number;
  kpiCount: number;
  greenCount: number;
  amberCount: number;
  redCount: number;
  noDataCount: number;
  kpis: PerformanceKpiRow[];
  divisions: PerformanceDivisionSummary[];
}
