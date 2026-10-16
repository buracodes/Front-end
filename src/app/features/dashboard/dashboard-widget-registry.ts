import {
  AlertListWidget,
  BarChartWidget,
  CompositeWidget,
  DashboardRagLabel,
  DashboardWidgetBundle,
  GaugeWidget,
  RagDistributionWidget,
  StatCardWidget,
  TableWidget,
  TrendWidget,
} from './role-dashboard.model';

/**
 * Widget registry for the shared shell.
 *
 * The server sends the widget list for the signed-in role; each key maps to one
 * payload slot and one renderer. The shell therefore never branches on the role -
 * it branches on the widget kind, which is what keeps every role on one page.
 */
export type DashboardWidgetKind =
  | 'statCards'
  | 'gauge'
  | 'ragDistribution'
  | 'trend'
  | 'barChart'
  | 'table'
  | 'composite'
  | 'alerts';

export type DashboardWidgetPayload =
  | { kind: 'statCards'; payload: StatCardWidget }
  | { kind: 'gauge'; payload: GaugeWidget }
  | { kind: 'ragDistribution'; payload: RagDistributionWidget }
  | { kind: 'trend'; payload: TrendWidget }
  | { kind: 'barChart'; payload: BarChartWidget }
  | { kind: 'table'; payload: TableWidget }
  | { kind: 'composite'; payload: CompositeWidget }
  | { kind: 'alerts'; payload: AlertListWidget };

type WidgetSlot = keyof Omit<DashboardWidgetBundle, 'role' | 'dataScope' | 'filter' | 'widgets'>;

const SLOTS: Record<string, WidgetSlot> = {
  kpiSummary: 'summary',
  overallScore: 'overallScore',
  ragDistribution: 'ragDistribution',
  performanceTrend: 'performanceTrend',
  scorecardPerformance: 'scorecardPerformance',
  scorecardHealth: 'scorecardHealth',
  goalHealth: 'goalHealth',
  goalPerformance: 'goalPerformance',
  goalPerformanceChart: 'goalPerformanceChart',
  topBottomKpis: 'topBottomKpis',
  kpiExceptions: 'kpiExceptions',
  strategicAlignment: 'strategicAlignment',
  initiativeStatus: 'initiativeStatus',
  initiativeDeliveryChart: 'initiativeDeliveryChart',
  milestoneTrend: 'milestoneTrend',
  budgetSummary: 'budgetSummary',
  budgetAllocationChart: 'budgetAllocationChart',
  divisionComparison: 'divisionComparison',
  divisionPerformanceChart: 'divisionPerformanceChart',
  targetVsActual: 'targetVsActual',
  assignedKpis: 'assignedKpis',
  dataEntryStatus: 'dataEntryStatus',
  periodLocks: 'periodLocks',
  systemStats: 'systemStats',
  auditActivity: 'auditActivity',
  reportsSummary: 'reportsSummary',
  alerts: 'alerts',
};

/** Maps a widget key to the renderer it needs, or null when the payload is absent/empty. */
export function resolveWidget(bundle: DashboardWidgetBundle, key: string): DashboardWidgetPayload | null {
  const slot = SLOTS[key];
  if (!slot) {
    return null;
  }

  const value = bundle[slot];
  if (!value) {
    return null;
  }

  switch (key) {
    case 'kpiSummary':
      return isStatCards(value) ? { kind: 'statCards', payload: value } : null;
    case 'overallScore':
      return isGauge(value) ? { kind: 'gauge', payload: value } : null;
    case 'ragDistribution':
      return isRag(value) ? { kind: 'ragDistribution', payload: value } : null;
    case 'performanceTrend':
    case 'milestoneTrend':
      return isTrend(value) ? { kind: 'trend', payload: value } : null;
    case 'targetVsActual':
    case 'goalPerformanceChart':
    case 'divisionPerformanceChart':
    case 'initiativeDeliveryChart':
    case 'budgetAllocationChart':
      return isBarChart(value) ? { kind: 'barChart', payload: value } : null;
    case 'budgetSummary':
    case 'dataEntryStatus':
    case 'systemStats':
      return isComposite(value) ? { kind: 'composite', payload: value } : null;
    case 'alerts':
      return isAlerts(value) ? { kind: 'alerts', payload: value } : null;
    default:
      return isTable(value) ? { kind: 'table', payload: value } : null;
  }
}

/** True when the widget has nothing to show, so the shell can render the empty state itself. */
export function isEmptyPayload(resolved: DashboardWidgetPayload | null): boolean {
  if (!resolved) {
    return true;
  }

  switch (resolved.kind) {
    case 'statCards':
      return resolved.payload.cards.length === 0;
    case 'gauge':
      return resolved.payload.value == null;
    case 'ragDistribution':
      return resolved.payload.total === 0;
    case 'trend':
      return resolved.payload.series.length === 0;
    case 'barChart':
      return resolved.payload.categories.length === 0 || resolved.payload.series.length === 0;
    case 'table':
      return resolved.payload.rows.length === 0;
    case 'composite':
      return resolved.payload.cards.length === 0 && resolved.payload.rows.length === 0;
    case 'alerts':
      return resolved.payload.alerts.length === 0;
  }
}

export const RAG_LABELS: Record<DashboardRagLabel, string> = {
  Green: 'On track',
  Amber: 'At risk',
  Red: 'Off track',
  NoData: 'No data',
};

export function ragToneClass(rag: unknown): string {
  switch (rag) {
    case 'Green':
      return 'rag-pill--green';
    case 'Amber':
      return 'rag-pill--amber';
    case 'Red':
      return 'rag-pill--red';
    default:
      return 'rag-pill--none';
  }
}

function isStatCards(value: unknown): value is StatCardWidget {
  return Array.isArray((value as StatCardWidget)?.cards);
}

function isGauge(value: unknown): value is GaugeWidget {
  return typeof (value as GaugeWidget)?.value !== 'undefined' && (value as GaugeWidget) !== null;
}

function isRag(value: unknown): value is RagDistributionWidget {
  return typeof (value as RagDistributionWidget)?.total === 'number';
}

function isTrend(value: unknown): value is TrendWidget {
  return Array.isArray((value as TrendWidget)?.series);
}

function isBarChart(value: unknown): value is BarChartWidget {
  return Array.isArray((value as BarChartWidget)?.categories)
    && Array.isArray((value as BarChartWidget)?.series);
}

function isTable(value: unknown): value is TableWidget {
  return Array.isArray((value as TableWidget)?.rows) && Array.isArray((value as TableWidget)?.columns);
}

function isComposite(value: unknown): value is CompositeWidget {
  return Array.isArray((value as CompositeWidget)?.cards);
}

function isAlerts(value: unknown): value is AlertListWidget {
  return Array.isArray((value as AlertListWidget)?.alerts);
}
