import { Scorecard } from '../../core/model/scorecard.model';

export type SummaryTone = 'green' | 'orange' | 'blue' | 'purple' | 'teal' | 'amber';

export type Priority = 'High' | 'Medium' | 'Low';

export type DashboardTrend = 'up' | 'down' | 'flat';

/** Global counts returned by `GET /api/dashboard/summary`. */
export interface DashboardSummary {
  totalScorecards: number;
  activeScorecards: number;
  closedScorecards: number;
  totalGoals: number;
  totalKras: number;
  totalKpis: number;
  totalInitiatives: number;
  activeInitiatives: number;
  completedInitiatives: number;
}

/** Role-aware dashboard returned by `GET /api/dashboard/overview`. */
export interface DashboardOverview {
  role: string;
  insight: string;
  tiles: DashboardTile[];
  quickLinks: DashboardQuickLink[];
}

export interface DashboardTile {
  key: string;
  label: string;
  value: string;
  detail?: string;
  tone: string;
}

export interface DashboardQuickLink {
  label: string;
  route: string;
}

/** A real recent activity entry from the audit log. */
export interface DashboardActivityItem {
  entityType: string;
  action: string;
  description: string;
  user: string;
  timestamp: string;
}

/** A real pending-action item derived on the backend. */
export interface DashboardPendingActionItem {
  key: string;
  title: string;
  description: string;
  count: number;
  priority: string;
  route: string;
}

/** One of the six headline summary cards. */
export interface DashboardSummaryCard {
  key: 'scorecards' | 'goals' | 'kras' | 'kpis' | 'users' | 'divisions' | 'initiatives';
  label: string;
  value: number;
  /** Percentage change vs the previous period; null when the data source is unavailable. */
  change: number | null;
  changeLabel: string;
  trend: DashboardTrend;
  icon: string;
  tone: SummaryTone;
  route: string;
  /** Optional contextual detail shown under the value (e.g. "1 active · 0 closed"). */
  detail?: string;
}

/** Strategic Performance card: overall score, trend and RAG distribution. */
export interface StrategicPerformance {
  overallScore: number | null;
  previousScore: number | null;
  changePoints: number | null;
  rag: RagCounts;
  calculatedAt: string | null;
}

export interface RagCounts {
  onTrack: number;
  atRisk: number;
  critical: number;
}

/** Row in the Scorecard Performance table. */
export interface ScorecardPerformanceRow {
  id: string;
  name: string;
  scope: Scorecard['scope'];
  status: Scorecard['scorecardStatus'];
  fiscalYearName?: string;
  goalCount: number | null;
  kraCount: number | null;
  kpiCount: number | null;
  score: number | null;
  change: number | null;
}

/** Ranked row in the Goal Performance card. */
export interface GoalPerformanceRow {
  rank: number;
  id: string;
  name: string;
  weight: number;
  score: number | null;
}

/** KPI Overview card: leading/lagging split, total count and RAG distribution. */
export interface KpiOverview {
  total: number;
  leading: number;
  leadingPercent: number;
  lagging: number;
  laggingPercent: number;
  rag: RagCounts;
}

/** Administrator action queue row. */
export interface PendingAction {
  key: string;
  icon: string;
  title: string;
  description: string;
  count: number;
  priority: Priority;
  route: string;
}

/** Recent system activity row. */
export interface RecentActivity {
  icon: string;
  description: string;
  user: string;
  timestamp: string;
}

/** Quick action tile. */
export interface QuickAction {
  icon: string;
  label: string;
  route: string;
}

/** A slice rendered by the SVG donut chart. */
export interface DonutSegment {
  dash: number;
  gap: number;
  offset: number;
  color: string;
}

/** Quarter option for the header period dropdown. */
export interface PeriodOption {
  value: string;
  label: string;
}

// ── Chart data models ────────────────────────────────────────────────

/** Performance trend data point for the fiscal-year trend chart. */
export interface PerformanceTrendPoint {
  period: string;
  score: number;
  target?: number;
}

/** Division performance data for the division table/chart. */
export interface DivisionPerformance {
  id: string;
  name: string;
  score: number | null;
  status: 'Green' | 'Amber' | 'Red';
  goals: number;
  kpis: number;
}

/** Scorecard performance summary for corporate vs division chart. */
export interface ScorecardPerformanceSummary {
  label: string;
  score: number | null;
  type: 'Corporate' | 'Division';
  status: 'Green' | 'Amber' | 'Red';
}

/** KPI distribution across RAG categories. */
export interface KpiDistribution {
  total: number;
  green: number;
  amber: number;
  red: number;
  noData: number;
}

/** An item requiring power-user attention. */
export interface AttentionItem {
  type: 'KPI' | 'Scorecard' | 'Goal' | 'Initiative' | 'Data';
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  route: string;
}

/** Fiscal year performance summary for the trend chart. */
export interface FiscalYearTrend {
  fiscalYear: string;
  periods: PerformanceTrendPoint[];
}