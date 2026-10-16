/** Mirrors the backend role dashboard contract (`Application/DTOS/Dashboard`). */

export type DashboardPeriodType = 'Ytd' | 'Quarter' | 'Month' | 'Year';
export type DashboardDataScope = 'OrganizationWide' | 'AssignedOnly';
export type DashboardRagLabel = 'Green' | 'Amber' | 'Red' | 'NoData';

export interface DashboardFilter {
  fiscalYearId: string | null;
  scorecardId: string | null;
  periodType: DashboardPeriodType;
  quarter: number | null;
  fromMonth: number | null;
  toMonth: number | null;
}

export interface DashboardFilterOption {
  id: string;
  label: string;
  isSelected: boolean;
  detail: string | null;
}

export interface DashboardPeriodOption {
  value: string;
  label: string;
  detail: string | null;
  isSelected: boolean;
}

export interface DashboardAppliedFilter {
  fiscalYearId: string | null;
  scorecardId: string | null;
  periodType: string;
  fiscalYearLabel: string | null;
  scorecardName: string | null;
  periodLabel: string | null;
  fiscalYearClosed: boolean;
  quarter: number | null;
  fromMonth: number | null;
  toMonth: number | null;
}

export interface DashboardWidgetDescriptor {
  key: string;
  title: string;
  description: string | null;
  span: number;
}

export interface DashboardQuickAction {
  key: string;
  label: string;
  route: string;
  icon: string;
  emphasis: string | null;
}

export interface DashboardRoleContext {
  role: string;
  displayName: string;
  purpose: string;
  insight: string;
  dataScope: DashboardDataScope;
  readOnly: boolean;
  filter: DashboardAppliedFilter;
  widgets: DashboardWidgetDescriptor[];
  quickActions: DashboardQuickAction[];
  fiscalYears: DashboardFilterOption[];
  scorecards: DashboardFilterOption[];
  periods: DashboardPeriodOption[];
}

// ------------------------------------------------------------------ payloads

export interface StatCard {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  detail: string | null;
  tone: string | null;
  ragLabel: DashboardRagLabel | null;
  route: string | null;
}

export interface StatCardWidget {
  title: string;
  description: string | null;
  cards: StatCard[];
}

export interface GaugeWidget {
  title: string;
  description: string | null;
  value: number | null;
  unit: string;
  ragLabel: DashboardRagLabel | null;
  caption: string | null;
  footnote: string | null;
}

export interface RagBucket {
  label: DashboardRagLabel;
  count: number;
  percentage: number;
}

/** RAG counts straight from the server; the shell only turns them into slices. */
export interface RagDistributionWidget {
  title: string;
  description: string | null;
  green: number;
  amber: number;
  red: number;
  noData: number;
  total: number;
}

export interface WidgetSeries {
  name: string;
  kind: string;
  color: string | null;
  values: (number | null)[];
}

export interface TrendWidget {
  title: string;
  description: string | null;
  categories: string[];
  series: WidgetSeries[];
  valueSuffix: string;
  emptyMessage: string | null;
}

/**
 * Comparison chart. One payload covers a single ranked series (goal or division
 * scores) and a grouped comparison (target vs actual, budget by priority).
 * Categories arrive pre-sorted, so the chart never re-orders server data.
 */
export interface BarChartWidget {
  title: string;
  description: string | null;
  categories: string[];
  series: WidgetSeries[];
  orientation: 'horizontal' | 'vertical';
  valueSuffix: string;
  valueFormat: 'number' | 'percent' | 'money';
  axisMin: number | null;
  axisMax: number | null;
  categoryColors: string[];
  routes: (string | null)[];
  cards: StatCard[];
  emptyMessage: string;
}

export interface TableColumn {
  key: string;
  label: string;
  format: 'text' | 'number' | 'percent' | 'money' | 'date' | 'rag' | 'status';
  align: 'left' | 'right' | 'center';
  width: number | null;
}

export interface TableRow {
  id: string | null;
  route: string | null;
  cells: Record<string, string | number | boolean | null>;
}

export interface TableWidget {
  title: string;
  description: string | null;
  columns: TableColumn[];
  rows: TableRow[];
  emptyMessage: string;
  showRowLinks: boolean;
}

export interface AlertItem {
  key: string;
  severity: string;
  title: string;
  description: string;
  route: string | null;
  occurredAt: string | null;
}

export interface AlertListWidget {
  title: string;
  description: string | null;
  alerts: AlertItem[];
  emptyMessage: string;
}

/** Cards + optional table in one widget (budget summary, data entry status, system stats). */
export interface CompositeWidget {
  title: string;
  description: string | null;
  cards: StatCard[];
  columns: TableColumn[];
  rows: TableRow[];
  emptyMessage: string;
  showRowLinks: boolean;
}

export interface GoalKraKpi {
  kpiId: string;
  name: string;
  unit: string;
  optimizationType: string;
  weight: number | null;
  target: number | null;
  actual: number | null;
  score: number | null;
  ragLabel: DashboardRagLabel | null;
  kpiType: number;
  hasData: boolean;
  note: string | null;
}

export interface GoalKraDto {
  kraId: string;
  name: string;
  weight: number | null;
  score: number | null;
  ragLabel: DashboardRagLabel | null;
  kpiCount: number;
  kpiWithDataCount: number;
  trend: number | null;
  kpis: GoalKraKpi[];
}

export interface GoalDrilldown {
  goalId: string;
  goalName: string;
  weight: number | null;
  score: number | null;
  ragLabel: DashboardRagLabel | null;
  trend: number | null;
  kras: GoalKraDto[];
}

/**
 * One bundle per request. The role's widget list arrives as `widgets` (descriptors) and is
 * the only thing the shell renders; the payload slots below always exist on the wire, with
 * `null` meaning "no data for this role" or "not part of this role's dashboard".
 */
export interface DashboardWidgetBundle {
  role: string;
  dataScope: string;
  filter: DashboardAppliedFilter;
  widgets: DashboardWidgetDescriptor[];
  summary?: StatCardWidget | null;
  overallScore?: GaugeWidget | null;
  ragDistribution?: RagDistributionWidget | null;
  performanceTrend?: TrendWidget | null;
  scorecardPerformance?: TableWidget | null;
  scorecardHealth?: TableWidget | null;
  goalHealth?: TableWidget | null;
  goalPerformance?: TableWidget | null;
  topBottomKpis?: TableWidget | null;
  kpiExceptions?: TableWidget | null;
  strategicAlignment?: TableWidget | null;
  initiativeStatus?: TableWidget | null;
  milestoneTrend?: TrendWidget | null;
  budgetSummary?: CompositeWidget | null;
  divisionComparison?: TableWidget | null;
  targetVsActual?: BarChartWidget | null;
  goalPerformanceChart?: BarChartWidget | null;
  divisionPerformanceChart?: BarChartWidget | null;
  initiativeDeliveryChart?: BarChartWidget | null;
  budgetAllocationChart?: BarChartWidget | null;
  assignedKpis?: TableWidget | null;
  dataEntryStatus?: CompositeWidget | null;
  periodLocks?: TableWidget | null;
  systemStats?: CompositeWidget | null;
  auditActivity?: TableWidget | null;
  reportsSummary?: TableWidget | null;
  alerts?: AlertListWidget | null;
}
