export interface Division {
  id: string;
  name: string;
  code?: string;
  createdDate?: string;
}

/** Backend serializes DivisionPlanStatus as a camelCase string ("draft"); UI code compares TitleCase. */
export type PlanStatusValue = 'Draft' | 'Finalized' | 'Locked' | 'draft' | 'finalized' | 'locked';

export interface DivisionPlanSummary {
  id: string;
  divisionId: string;
  scorecardId: string;
  scorecardName?: string;
  fiscalYearId?: string;
  planStatus: PlanStatusValue;
  goalCount?: number;
  kpiCount?: number;
}

export interface CorporateGoalDto {
  goalId: string;
  name: string;
  description?: string;
  weight: number;
}

export type RagStatus = 'green' | 'amber' | 'red';

export type TargetGranularity = 'Monthly' | 'Quarterly' | 'Annual';

/** FR-904: a persisted target for one fiscal period at one granularity. */
export interface DivisionKpiTargetDto {
  fiscalPeriodId: string;
  fiscalMonth: number;
  quarter: number;
  granularity: TargetGranularity;
  targetValue: number;
}

/** FR-904: a target supplied when creating/updating a division KPI. */
export interface DivisionKpiTargetInputDto {
  fiscalPeriodId: string;
  targetValue: number;
  granularity: TargetGranularity;
}

/** FR-904: fiscal periods of the plan's fiscal year, used to resolve target period ids. */
export interface DivisionFiscalPeriodDto {
  id: string;
  fiscalMonth: number;
  quarter: number;
  isQuarterEnd: boolean;
  isYearEnd: boolean;
}

export interface DivisionKpiDto {
  id: string;
  divisionGoalId?: string;
  name: string;
  description?: string;
  unit?: string;
  unitOfMeasureId?: string;
  ownerId?: string;
  divisionOwnerId?: string;
  divisionOwnerName?: string;
  weight: number;
  toleranceBandPercent?: number;
  optimizationType?: string;
  kpiType?: string;
  dataSource?: string;
  isCumulative: boolean;
  baseline?: number;
  minValue?: number;
  maxValue?: number;
  formula?: string;
  isActive: boolean;
  score?: number;
  target?: number;
  actual?: number;
  status?: RagStatus;
  targets?: DivisionKpiTargetDto[];
}

export interface DivisionGoalDto {
  id: string;
  divisionPlanId?: string;
  parentGoalId?: string;
  parentGoalName?: string;
  name: string;
  description?: string;
  weight: number;
  contributionDescription?: string;
  kpis: DivisionKpiDto[];
  score?: number;
  status?: RagStatus;
}

export interface DivisionPlanDto {
  id: string;
  divisionId: string;
  divisionName: string;
  scorecardId: string;
  scorecardName: string;
  fiscalYearId: string;
  planStatus: PlanStatusValue;
  finalizedAtUtc?: string;
  corporateScorecardId?: string;
  corporateScorecardName?: string;
  overallScore?: number;
  contributions: CorporateGoalDto[];
  availableGoals: CorporateGoalDto[];
  goals: DivisionGoalDto[];
  fiscalPeriods?: DivisionFiscalPeriodDto[];
}

export type PeriodType = 'Ytd' | 'Month' | 'Quarter' | 'Year';

export interface DivisionPlanQuery {
  periodType?: PeriodType;
  quarter?: number;
  fromMonth?: number;
  toMonth?: number;
  year?: number;
}

export interface CreateDivisionRequest {
  name: string;
  code?: string;
}

export interface SetDivisionContributionsRequest {
  divisionId: string;
  scorecardId: string;
  goalIds: string[];
  /** FR-902.5/FR-907: true only after the user confirms removal of the dependent goals/KPIs. */
  cascadeRemoveDependents?: boolean;
}

export interface CreateDivisionGoalRequest {
  divisionId: string;
  scorecardId: string;
  parentGoalId: string;
  name: string;
  description?: string;
  weight: number;
  contributionDescription?: string;
}

export interface UpdateDivisionGoalRequest {
  parentGoalId?: string;
  name?: string;
  description?: string;
  weight?: number;
  contributionDescription?: string;
}

export interface CreateDivisionKpiRequest {
  divisionId: string;
  scorecardId: string;
  divisionGoalId: string;
  ownerId?: string;
  divisionOwnerId?: string;
  unitOfMeasureId?: string;
  name: string;
  description?: string;
  unit?: string;
  weight: number;
  toleranceBandPercent?: number;
  optimizationType?: string;
  kpiType?: string;
  dataSource?: string;
  isCumulative: boolean;
  baseline?: number;
  minValue?: number;
  maxValue?: number;
  formula?: string;
  targets?: DivisionKpiTargetInputDto[];
}

export interface UpdateDivisionKpiRequest {
  ownerId?: string;
  divisionOwnerId?: string;
  unitOfMeasureId?: string;
  name?: string;
  description?: string;
  unit?: string;
  weight?: number;
  toleranceBandPercent?: number;
  optimizationType?: string;
  kpiType?: string;
  dataSource?: string;
  isCumulative?: boolean;
  baseline?: number;
  minValue?: number;
  maxValue?: number;
  formula?: string;
  isActive?: boolean;
  targets?: DivisionKpiTargetInputDto[];
}

export type KpiDataSource = 'Manual' | 'Automated' | 'Calculated';

export interface DivisionActualValueDto {
  id: string;
  divisionId: string;
  kpiId: string;
  fiscalPeriodId: string;
  fiscalMonth: number;
  quarter: number;
  value: number;
  dataSource?: KpiDataSource;
  asOfDate: string;
  note?: string;
}

export interface EnterDivisionActualValueRequest {
  divisionId: string;
  kpiId: string;
  fiscalPeriodId: string;
  value: number;
  dataSource?: KpiDataSource;
  note?: string;
}

export interface ResetDivisionPasswordRequest {
  divisionId: string;
  newPassword: string;
  confirmPassword: string;
}
