import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DashboardPage } from './dashboard';
import {
  DashboardFilter,
  DashboardRoleContext,
  DashboardWidgetBundle,
  GoalDrilldown,
} from './role-dashboard.model';
import { resolveWidget } from './dashboard-widget-registry';

const FILTER: DashboardFilter = {
  fiscalYearId: 'fy-1',
  scorecardId: null,
  periodType: 'Ytd',
  quarter: null,
  fromMonth: null,
  toMonth: null,
};

const APPLIED_FILTER = {
  fiscalYearId: 'fy-1',
  scorecardId: 'sc-1',
  periodType: 'Ytd',
  fiscalYearLabel: '2026/2027',
  scorecardName: 'Corporate Scorecard',
  periodLabel: 'Year to date',
  fiscalYearClosed: false,
  quarter: null,
  fromMonth: null,
  toMonth: null,
};

const KPI_SUMMARY = {
  title: 'KPI summary',
  description: null,
  cards: [
    { key: 'assigned', label: 'Assigned KPIs', value: '4', unit: null, detail: null, tone: null, ragLabel: null, route: null },
  ],
};

const ASSIGNED_KPIS = {
  title: 'My KPIs',
  description: 'Only KPIs you own or help own.',
  columns: [
    { key: 'name', label: 'KPI', format: 'text' as const, align: 'left' as const, width: null },
    { key: 'rag', label: 'Status', format: 'rag' as const, align: 'center' as const, width: null },
  ],
  rows: [{ id: 'kpi-1', route: null, cells: { name: 'Trade value growth rate', rag: 'Amber' } }],
  emptyMessage: 'No KPIs assigned to you yet.',
  showRowLinks: true,
};

const RAG = { title: 'KPI RAG distribution', description: null, green: 2, amber: 1, red: 1, noData: 0, total: 4 };

const DELIVERY_BAR_CHART = {
  title: 'Initiative delivery',
  description: 'Weighted milestone delivery for every active initiative.',
  categories: ['Market Expansion', 'Digital Platform'],
  series: [{ name: 'Delivery', kind: 'bar', color: 'primary', values: [0, 50] }],
  orientation: 'horizontal' as const,
  valueSuffix: '%',
  valueFormat: 'percent' as const,
  axisMin: 0,
  axisMax: 100,
  categoryColors: ['Red', 'Amber'],
  routes: ['/initiatives/a', '/initiatives/b'],
  cards: [
    { key: 'initiatives', label: 'Funded initiatives', value: '2', unit: null, detail: null, tone: null, ragLabel: null, route: null },
  ],
  emptyMessage: 'No active initiatives with milestones to track.',
};

const GOAL_TABLE = {
  title: 'Goal performance',
  description: null,
  columns: [
    { key: 'goal', label: 'Goal', format: 'text' as const, align: 'left' as const, width: null },
    { key: 'score', label: 'Score', format: 'percent' as const, align: 'right' as const, width: null },
  ],
  rows: [{ id: 'goal-1', route: null, cells: { goal: 'Grow trade volume', score: 88.4 } }],
  emptyMessage: 'No goals for the selected period.',
  showRowLinks: true,
};

const DRILLDOWN: GoalDrilldown = {
  goalId: 'goal-1',
  goalName: 'Grow trade volume',
  weight: 40,
  score: 88.4,
  ragLabel: 'Amber',
  trend: 2.5,
  kras: [
    {
      kraId: 'kra-1',
      name: 'Increase export volume',
      weight: 60,
      score: 91.2,
      ragLabel: 'Green',
      kpiCount: 2,
      kpiWithDataCount: 2,
      trend: 1.2,
      kpis: [
        {
          kpiId: 'kpi-1',
          name: 'Trade value growth rate',
          unit: '%',
          optimizationType: 'Maximize',
          weight: 50,
          target: 12,
          actual: 13.1,
          score: 100,
          ragLabel: 'Green',
          kpiType: 1,
          hasData: true,
          note: null,
        },
      ],
    },
  ],
};

function contextFor(role: string, overrides: Partial<DashboardRoleContext> = {}): DashboardRoleContext {
  return {
    role,
    displayName: `${role} dashboard`,
    purpose: 'Purpose for this role.',
    insight: 'One thing worth knowing today.',
    dataScope: 'OrganizationWide',
    readOnly: false,
    filter: APPLIED_FILTER,
    widgets: [
      { key: 'kpiSummary', title: 'KPI summary', description: null, span: 12 },
      { key: 'assignedKpis', title: 'My KPIs', description: 'Only KPIs you own or help own.', span: 12 },
    ],
    quickActions: [{ key: 'enterActuals', label: 'Enter actuals', route: '/actuals-data', icon: 'plus', emphasis: null }],
    fiscalYears: [{ id: 'fy-1', label: '2026/2027', isSelected: true, detail: null }],
    scorecards: [{ id: 'sc-1', label: 'Corporate Scorecard', isSelected: false, detail: null }],
    periods: [{ value: 'Ytd', label: 'Year to date', detail: null, isSelected: true }],
    ...overrides,
  };
}

function bundleFor(context: DashboardRoleContext, extra: Partial<DashboardWidgetBundle> = {}): DashboardWidgetBundle {
  return {
    role: context.role,
    dataScope: context.dataScope,
    filter: context.filter,
    widgets: context.widgets,
    summary: KPI_SUMMARY,
    assignedKpis: ASSIGNED_KPIS,
    ...extra,
  };
}

describe('DashboardPage (role driven shell)', () => {
  let httpMock: HttpTestingController;
  let nextContext: DashboardRoleContext;
  let nextBundle: DashboardWidgetBundle;
  let drilldown: GoalDrilldown | null = DRILLDOWN;

  const flushOutstanding = (): void => {
    for (const req of httpMock.match(() => true)) {
      if (req.request.url.includes('/dashboard/context')) {
        req.flush({ success: true, message: 'ok', data: nextContext });
      } else if (req.request.url.includes('/dashboard/widgets')) {
        req.flush({ success: true, message: 'ok', data: nextBundle });
      } else if (req.request.url.includes('/kras')) {
        req.flush({ success: true, message: 'ok', data: drilldown });
      } else {
        req.flush({ success: true, message: 'ok', data: null });
      }
    }
    drilldown = DRILLDOWN;
  };

  const render = (context: DashboardRoleContext, bundle?: DashboardWidgetBundle) => {
    nextContext = context;
    nextBundle = bundle ?? bundleFor(context);

    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    flushOutstanding();
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(async () => {
    nextContext = contextFor('Data Input User', { dataScope: 'AssignedOnly' });
    nextBundle = bundleFor(nextContext);
    drilldown = DRILLDOWN;

    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    flushOutstanding();
    httpMock.verify();
  });

  it('loads the role context and widget bundle on init', () => {
    const fixture = render(nextContext);
    const page = fixture.componentInstance;

    expect(page.loading()).toBe(false);
    expect(page.context()?.role).toBe('Data Input User');
    expect(page.bundle()?.dataScope).toBe('AssignedOnly');
    expect(page.widgets().map((w) => w.descriptor.key)).toEqual(['kpiSummary', 'assignedKpis']);
  });

  it('requests the default Year-to-date period on first load', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();

    const request = httpMock.expectOne((req) => req.url.includes('/dashboard/widgets'));
    expect(request.request.urlWithParams).toContain('periodType=Ytd');
    request.flush({ success: true, message: 'ok', data: nextBundle });
    httpMock
      .expectOne((req) => req.url.includes('/dashboard/context'))
      .flush({ success: true, message: 'ok', data: nextContext });
  });

  it('shows the role, scope and period from the server', () => {
    const fixture = render(nextContext);
    const page = fixture.componentInstance;

    expect(page.scopeLabel()).toBe('Your assignments only');
    expect(page.appliedPeriod()).toBe('Year to date');
    expect(page.quickActions()[0].route).toBe('/actuals-data');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Data Input User');
    expect(text).toContain('One thing worth knowing today.');
  });

  it('re-filters the whole dashboard when a global filter changes', () => {
    const fixture = render(nextContext);

    fixture.componentInstance.onFilterChange({ ...FILTER, periodType: 'Quarter', quarter: 2 });
    fixture.detectChanges();

    const request = httpMock.expectOne((req) => req.url.includes('/dashboard/widgets'));
    expect(request.request.urlWithParams).toContain('periodType=Quarter');
    expect(request.request.urlWithParams).toContain('quarter=2');
    request.flush({ success: true, message: 'ok', data: nextBundle });
    httpMock
      .expectOne((req) => req.url.includes('/dashboard/context'))
      .flush({ success: true, message: 'ok', data: nextContext });
  });

  it('adopts the filter the server actually applied', () => {
    // The requested scorecard was out of scope, so the server answered with the
    // one it fell back to; the shell must keep that instead of retrying the old id.
    const fallback = contextFor('Power User', {
      filter: { ...APPLIED_FILTER, scorecardId: 'sc-9', scorecardName: 'Operations' },
    });
    const fixture = render(fallback);

    expect(fixture.componentInstance.filter().scorecardId).toBe('sc-9');
  });

  it('resolves each descriptor to a renderable payload', () => {
    const fixture = render(nextContext);

    expect(fixture.componentInstance.visibleWidgets().map((entry) => entry.payload?.kind)).toEqual([
      'statCards',
      'table',
    ]);
  });

  it('lists the goal widgets that can open the drill-down drawer', () => {
    const page = render(nextContext).componentInstance;

    expect(page.isGoalWidget('goalPerformance')).toBe(true);
    expect(page.isGoalWidget('goalHealth')).toBe(true);
    expect(page.isGoalWidget('kpiExceptions')).toBe(false);
    expect(page.isGoalWidget('assignedKpis')).toBe(false);
  });

  it('opens the goal drill-down with KRA and KPI detail', () => {
    const goalContext = contextFor('Executive', {
      readOnly: true,
      widgets: [{ key: 'goalPerformance', title: 'Goal performance', description: null, span: 8 }],
    });
    const fixture = render(goalContext, bundleFor(goalContext, { goalPerformance: GOAL_TABLE }));

    const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr') as HTMLElement;
    row.click();
    fixture.detectChanges();
    flushOutstanding();
    fixture.detectChanges();

    const drawer = (fixture.nativeElement as HTMLElement).querySelector('aside.drawer') as HTMLElement;
    expect(drawer).toBeTruthy();
    expect(drawer.textContent).toContain('Grow trade volume');
    expect(drawer.textContent).toContain('Increase export volume');
    expect(drawer.textContent).toContain('On track');
  });

  it('hides widgets that have no data and keeps the rest', () => {
    const bundle: DashboardWidgetBundle = {
      ...bundleFor(nextContext),
      alerts: { title: 'Alerts', description: null, alerts: [], emptyMessage: 'Nothing needs attention.' },
    };

    expect(resolveWidget(bundle, 'alerts')?.kind).toBe('alerts');
    expect(resolveWidget(bundle, 'kpiExceptions')).toBeNull();
  });

  it('maps every configured span to a grid width class', () => {
    const spans = contextFor('Executive', {
      widgets: [
        { key: 'kpiSummary', title: 'KPI summary', description: null, span: 1 },
        { key: 'ragDistribution', title: 'KPI RAG distribution', description: null, span: 2 },
        { key: 'assignedKpis', title: 'My KPIs', description: null, span: 6 },
      ],
    });
    const fixture = render(spans, bundleFor(spans, { ragDistribution: RAG }));

    const classes = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.dx-widgets .dx-widget')
    ).map((section) => (section as HTMLElement).className);

    expect(classes).toEqual([
      'dx-panel dx-widget dx-widget--third',
      'dx-panel dx-widget dx-widget--two-thirds',
      'dx-panel dx-widget dx-widget--full',
    ]);
  });

  it('renders a comparison bar chart widget with bars and its stat cards', () => {
    const chartContext = contextFor('Executive', {
      widgets: [
        { key: 'initiativeDeliveryChart', title: 'Initiative delivery', description: null, span: 2 },
      ],
    });
    const fixture = render(chartContext, bundleFor(chartContext, { initiativeDeliveryChart: DELIVERY_BAR_CHART }));

    const page = fixture.componentInstance;
    const payload = page.visibleWidgets()[0].payload;
    expect(payload?.kind).toBe('barChart');
    if (payload?.kind === 'barChart') {
      expect(payload.payload.categories).toEqual(['Market Expansion', 'Digital Platform']);
    }

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-dashboard-chart[kind="comparison"]')).toBeTruthy();
    expect(root.textContent).toContain('Funded initiatives');
    expect(root.textContent).toContain('2');
  });

  it('hides a bar chart that has no categories as empty', () => {
    const emptyChart = { ...DELIVERY_BAR_CHART, categories: [], series: [{ name: 'Delivery', kind: 'bar', color: 'primary', values: [] }] };
    const chartContext = contextFor('Executive', {
      widgets: [{ key: 'initiativeDeliveryChart', title: 'Initiative delivery', description: null, span: 2 }],
    });
    const fixture = render(chartContext, bundleFor(chartContext, { initiativeDeliveryChart: emptyChart }));

    expect(fixture.componentInstance.visibleWidgets()).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('nothing to show');
  });

  it('renders the server RAG counts with a text label, never color alone', () => {
    const withRag = contextFor('Power User', {
      widgets: [
        { key: 'kpiSummary', title: 'KPI summary', description: null, span: 12 },
        { key: 'ragDistribution', title: 'KPI RAG distribution', description: null, span: 4 },
      ],
    });
    const fixture = render(withRag, bundleFor(withRag, { ragDistribution: RAG }));

    const legend = (fixture.nativeElement as HTMLElement).querySelector('.rag-legend');
    const text = legend?.textContent ?? '';

    expect(text).toContain('On track');
    expect(text).toContain('At risk');
    expect(text).toContain('Off track');
    expect(text).toContain('50%');
    expect(text).toContain('25%');
  });

  it('shows a single empty state when the role has nothing in scope', () => {
    const empty = contextFor('View Only', {
      readOnly: true,
      widgets: [{ key: 'assignedKpis', title: 'My KPIs', description: null, span: 12 }],
    });
    const fixture = render(empty, {
      ...bundleFor(empty),
      summary: { ...KPI_SUMMARY, cards: [] },
      assignedKpis: { ...ASSIGNED_KPIS, rows: [] },
    });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(fixture.componentInstance.hasWidgets()).toBe(false);
    expect(text).toContain('nothing to show');
  });

  it('warns when the selected fiscal year is closed', () => {
    const closed = contextFor('Executive', {
      readOnly: true,
      filter: { ...APPLIED_FILTER, fiscalYearClosed: true },
    });
    const fixture = render(closed, bundleFor(closed, { filter: closed.filter }));

    expect(fixture.componentInstance.fiscalYearClosed()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('This fiscal year is closed');
  });

  it('surfaces a load failure without a context', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();

    httpMock
      .match((req) => req.url.includes('/dashboard/'))
      .forEach((req) => req.flush({ message: 'Forbidden' }, { status: 403, statusText: 'Forbidden' }));
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBeTruthy();
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  describe('all five roles on one page', () => {
    const roles: { role: string; readOnly: boolean; dataScope: DashboardRoleContext['dataScope'] }[] = [
      { role: 'Admin', readOnly: false, dataScope: 'OrganizationWide' },
      { role: 'Power User', readOnly: false, dataScope: 'OrganizationWide' },
      { role: 'Executive', readOnly: true, dataScope: 'OrganizationWide' },
      { role: 'Data Input User', readOnly: false, dataScope: 'AssignedOnly' },
      { role: 'View Only', readOnly: true, dataScope: 'OrganizationWide' },
    ];

    for (const expected of roles) {
      it(`renders the ${expected.role} dashboard from server configuration only`, () => {
        const context = contextFor(expected.role, {
          readOnly: expected.readOnly,
          dataScope: expected.dataScope,
        });
        const fixture = render(context);
        const page = fixture.componentInstance;

        expect(page.readOnly()).toBe(expected.readOnly);
        expect(page.context()?.dataScope).toBe(expected.dataScope);
        expect(page.scopeLabel()).toBe(
          expected.dataScope === 'AssignedOnly' ? 'Your assignments only' : 'Organization wide'
        );
        // Role identity comes from the payload, never from a client-side role check.
        expect(page.widgets().map((w) => w.descriptor.key)).toEqual(['kpiSummary', 'assignedKpis']);

        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain(expected.role);
        expect(text.includes('Read only')).toBe(expected.readOnly);
      });
    }
  });
});
