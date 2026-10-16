export interface Goal {
  id: string;
  scorecardId: string;
  scorecardName?: string;
  fiscalYearName?: string;
  name: string;
  description?: string;
  weight: number;
  kraCount?: number;
  kpiCount?: number;
  progress?: number;
  children?: Goal[];
}

export interface CreateGoalRequest {
  scorecardId: string;
  name: string;
  description?: string;
  weight?: number;
}

export interface UpdateGoalRequest {
  name?: string;
  description?: string;
  weight?: number;
}

export interface GoalWithHierarchy extends Goal {
  kras?: KRA[];
  expanded?: boolean;
}

export interface KRA {
  id: string;
  goalId: string;
  scorecardId: string;
  name: string;
  description?: string;
  weight: number;
  isActive: boolean;
  kpiCount: number;
  progress?: number;
  children?: KPI[];
}

export interface CreateKraRequest {
  goalId: string;
  scorecardId: string;
  name: string;
  description?: string;
  weight: number;
}

export interface UpdateKraRequest {
  name?: string;
  description?: string;
  weight?: number;
  isActive?: boolean;
}

export interface KPI {
  id: string;
  scorecardId: string;
  kraId?: string;
  goalId?: string;
  name: string;
  description?: string;
  code?: string;
  unit?: string;
  weight: number;
  optimizationType: 'Maximize' | 'Minimize' | 'ExactHit' | 'Binary';
  dataSource: 'Manual' | 'Automated' | 'Calculated';
  kpiType: 'Leading' | 'Lagging';
  isCumulative: boolean;
  baseline?: number;
  minValue?: number;
  maxValue?: number;
  formula?: string;
  isActive: boolean;
  ownerId?: string;
  ownerName?: string;
  divisionOwnerId?: string;
  divisionOwnerName?: string;
  departmentId?: string;
  departmentName?: string;
  targetAnnual?: number;
  actualYTD?: number;
  score?: number;
  ragStatus?: 'Green' | 'Amber' | 'Red';
  trend?: 'up' | 'down' | 'stable';
  childKpiCount: number;
  createdDate?: string;
  status?: string;
}

export interface CreateKpiRequest {
  scorecardId: string;
  kraId?: string;
  goalId?: string;
  name: string;
  code?: string;
  description?: string;
  unit?: string;
  weight: number;
  optimizationType?: 'Maximize' | 'Minimize' | 'ExactHit' | 'Binary';
  dataSource?: 'Manual' | 'Automated' | 'Calculated';
  kpiType?: 'Leading' | 'Lagging';
  isCumulative?: boolean;
  baseline?: number;
  minValue?: number;
  maxValue?: number;
  formula?: string;
  ownerId?: string;
  divisionOwnerId?: string;
  departmentId?: string;
}

export interface UpdateKpiRequest {
  name?: string;
  code?: string;
  description?: string;
  unit?: string;
  weight?: number;
  optimizationType?: 'Maximize' | 'Minimize' | 'ExactHit' | 'Binary';
  kpiType?: 'Leading' | 'Lagging';
  dataSource?: 'Manual' | 'Automated' | 'Calculated';
  isCumulative?: boolean;
  baseline?: number;
  minValue?: number;
  maxValue?: number;
  formula?: string;
  isActive?: boolean;
  ownerId?: string;
  divisionOwnerId?: string;
  departmentId?: string;
}

export interface KpiTargetValue {
  fiscalMonth: number;
  quarter: number;
  granularity: 'Monthly' | 'Quarterly' | 'Annual';
  targetValue: number;
}

export interface SetKpiTargetsRequest {
  kpiId: string;
  fiscalYearId: string;
  monthlyTargets: number[];
  quarterlyTargets?: number[] | null;
  annualTarget?: number | null;
}

/** One KPI's targets as returned by the bulk read. */
export interface KpiTargetsBundle {
  kpiId: string;
  fiscalYearId: string;
  targets: KpiTargetValue[];
}

export interface KpiTargetsBulk {
  fiscalYearId: string;
  scorecardId?: string | null;
  kpis: KpiTargetsBundle[];
}

export interface SetKpiTargetsItem {
  kpiId: string;
  monthlyTargets: number[];
  quarterlyTargets?: number[] | null;
  annualTarget?: number | null;
}

export interface SetKpiTargetsBulkRequest {
  fiscalYearId: string;
  targets: SetKpiTargetsItem[];
}

/** Per-row outcome, so one bad KPI does not hide the rows that were saved. */
export interface KpiTargetSaveResult {
  kpiId: string;
  success: boolean;
  message?: string | null;
}

export interface SetKpiTargetsBulkResult {
  savedCount: number;
  failedCount: number;
  results: KpiTargetSaveResult[];
}

export interface KpiActualValue {
  id: string;
  kpiId: string;
  fiscalPeriodId: string;
  fiscalMonth: number;
  quarter: number;
  value: number;
  dataSource: 'Manual' | 'Automated' | 'Calculated';
  asOfDate: string;
  note?: string;
}

export interface EnterKpiActualRequest {
  kpiId: string;
  fiscalPeriodId: string;
  value: number;
  dataSource?: 'Manual' | 'Automated' | 'Calculated';
  note?: string;
  overrideReason?: string;
}

export interface PeriodLockStatusItem {
  fiscalPeriodId: string;
  fiscalMonth: number;
  quarter: number;
  isQuarterEnd: boolean;
  isYearEnd: boolean;
  state: 'open' | 'notYetOpen' | 'locked';
  effectiveEntryOpenDate: string;
  effectiveCutoffDate: string;
  effectiveEntryOpenDay: number;
  effectiveCutoffDay: number;
  effectiveReminderDaysBeforeCutoff: number;
  hasExplicitOverride: boolean;
  lockedAtUtc?: string;
  unlockedAtUtc?: string;
}

export interface PeriodLockStatus {
  scorecardId: string;
  fiscalYearId: string;
  periods: PeriodLockStatusItem[];
}

export interface SetPeriodLockConfigRequest {
  scorecardId: string;
  fiscalPeriodId: string;
  entryOpenDay?: number | null;
  cutoffDay?: number | null;
  reminderDaysBeforeCutoff?: number | null;
  lock: boolean;
  unlock: boolean;
  forceOpen: boolean;
}

export interface HierarchyNode {
  id: string;
  type: 'scorecard' | 'goal' | 'kra' | 'kpi';
  name: string;
  code?: string;
  weight?: number;
  progress?: number;
  children?: HierarchyNode[];
  expanded?: boolean;
  metadata?: {
    goalCount?: number;
    kraCount?: number;
    kpiCount?: number;
    overallScore?: number;
    ragStatus?: 'Green' | 'Amber' | 'Red';
    trend?: 'up' | 'down' | 'stable';
    ownerName?: string;
    unit?: string;
    target?: number;
    actual?: number;
  };
}
