import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TargetsPage } from './targets';
import { PlanFilterService } from '../../../core/service/plan-filter.service';
import { NotificationService } from '../../../core/service/notification.service';
import { Kpi } from '../../kpi/kpi.model';

const KPI_ONE: Kpi = {
  id: 'kpi-1',
  scorecardId: 'sc-1',
  scorecardName: 'Corporate',
  goalId: 'g-1',
  goalName: 'Grow trade volume',
  kraId: 'kra-1',
  kraName: 'Win mandates',
  name: 'Trade value',
  weight: 40,
  optimizationType: 'Maximize',
  dataSource: 'Manual',
  kpiType: 'Leading',
  isCumulative: false,
  isActive: true,
  childKpiCount: 0,
};

const KPI_TWO: Kpi = { ...KPI_ONE, id: 'kpi-2', name: 'Margin' };

const FISCAL_YEARS = [
  // Far future so the date-based closure rule keeps this an editable year.
  { id: 'fy-1', label: '2025/2026', startDate: '2025-07-01', endDate: '2099-06-30', status: 'Open' },
];

const SCORECARDS = [{ id: 'sc-1', name: 'Corporate', fiscalYearId: 'fy-1', fiscalYearName: '2025/2026' }];

const GOAL = { id: 'g-1', scorecardId: 'sc-1', name: 'Grow trade volume', weight: 40 };
const KRA = { id: 'kra-1', goalId: 'g-1', scorecardId: 'sc-1', name: 'Win mandates', weight: 50, isActive: true, kpiCount: 1 };

const ok = (data: unknown) => ({ success: true, message: 'ok', data });

/** A target bundle for `kpis`, each carrying one annual, one monthly and one quarterly value. */
const bulkTargets = (kpis: string[], value: number) => ({
  fiscalYearId: 'fy-1',
  scorecardId: null,
  kpis: kpis.map((kpiId) => ({
    kpiId,
    fiscalYearId: 'fy-1',
    targets: [
      { fiscalMonth: 12, quarter: 4, granularity: 'Annual', targetValue: value },
      { fiscalMonth: 1, quarter: 1, granularity: 'Monthly', targetValue: value },
      { fiscalMonth: 1, quarter: 1, granularity: 'Quarterly', targetValue: value },
    ],
  })),
});

describe('TargetsPage', () => {
  let page: TargetsPage;
  let filters: PlanFilterService;
  let http: HttpTestingController;
  /** Read by the ActivatedRoute stub when the page is constructed. */
  let deepLink: Record<string, string>;

  beforeEach(() => {
    deepLink = {};
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { get queryParamMap() { return convertToParamMap(deepLink); } } },
        },
      ],
    });
  });

  /** Builds the page for the given URL query parameters. */
  const configure = (params: Record<string, string> = {}): void => {
    deepLink = params;
    page = TestBed.runInInjectionContext(() => new TargetsPage());
    filters = TestBed.inject(PlanFilterService);
    http = TestBed.inject(HttpTestingController);
  };

  /** Answers the option requests the page fires on construction. */
  const flushOptions = (): void => {
    http.expectOne((r) => r.urlWithParams.endsWith('/api/fiscalyear')).flush(ok(FISCAL_YEARS));
    http.expectOne((r) => r.urlWithParams.endsWith('/api/scorecard')).flush(ok(SCORECARDS));
    TestBed.tick();
  };

  const flushHierarchyOptions = (): void => {
    http.expectOne((r) => r.urlWithParams.includes('/api/goal?')).flush(ok([GOAL]));
    http.expectOne((r) => r.urlWithParams.includes('/api/kra?')).flush(ok([KRA]));
  };

  const isKpiList = (r: { urlWithParams: string }): boolean => r.urlWithParams.includes('/api/kpi?');
  const isBulkRead = (r: { urlWithParams: string }): boolean =>
    r.urlWithParams.includes('/api/kpitarget/bulk?');

  /** Answers the KPI list and the bulk target read together. */
  const flushGrid = (kpis: Kpi[], targetKpis: string[], value = 100): void => {
    const kpiRequest = http.expectOne(isKpiList);
    const bulkRequest = http.expectOne(isBulkRead);
    kpiRequest.flush(ok(kpis));
    bulkRequest.flush(ok(bulkTargets(targetKpis, value)));
  };

  /** Configures the page and answers its option requests, leaving an empty grid. */
  const start = (params: Record<string, string> = {}): void => {
    configure(params);
    if (params['scorecardId']) flushHierarchyOptions();
    flushOptions();
  };

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('does not read the grid until a fiscal year is chosen', () => {
    start();

    expect(page.hasFiscalYear()).toBeFalsy();
    expect(page.rows()).toEqual([]);
    http.expectNone(isKpiList);
  });

  it('loads the KPIs of the chosen fiscal year together with their targets', () => {
    start();

    filters.selectFiscalYear('fy-1');
    const kpiRequest = http.expectOne(isKpiList);
    const bulkRequest = http.expectOne(isBulkRead);
    kpiRequest.flush(ok([KPI_ONE, KPI_TWO]));
    bulkRequest.flush(ok(bulkTargets(['kpi-1'], 120)));

    expect(kpiRequest.request.urlWithParams).toContain('fiscalYearId=fy-1');
    expect(bulkRequest.request.urlWithParams).toContain('fiscalYearId=fy-1');
    expect(page.rows().map((row) => row.kpiId)).toEqual(['kpi-1', 'kpi-2']);
    expect(page.savedCount()).toBe(1);
    expect(page.rows()[0].annual).toBe(120);
  });

  it('restores a deep linked hierarchy and highlights the KPI it came from', () => {
    start({ fiscalYearId: 'fy-1', scorecardId: 'sc-1', goalId: 'g-1', kraId: 'kra-1', kpiId: 'kpi-2' });

    const kpiRequest = http.expectOne(isKpiList);
    const bulkRequest = http.expectOne(isBulkRead);
    kpiRequest.flush(ok([KPI_ONE, KPI_TWO]));
    bulkRequest.flush(ok(bulkTargets(['kpi-1', 'kpi-2'], 10)));

    const params = kpiRequest.request.urlWithParams;
    expect(params).toContain('fiscalYearId=fy-1');
    expect(params).toContain('scorecardId=sc-1');
    expect(params).toContain('goalId=g-1');
    expect(params).toContain('kraId=kra-1');
    expect(bulkRequest.request.urlWithParams).toContain('scorecardId=sc-1');
    expect(page.highlightedKpiId()).toBe('kpi-2');
  });

  /** Two rows, one of which already has targets. */
  const loadTwoRows = (): void => {
    filters.selectFiscalYear('fy-1');
    flushGrid([KPI_ONE, KPI_TWO], ['kpi-1']);
  };

  it('sends only the rows the user changed', () => {
    start();
    loadTwoRows();

    const first = page.rows()[0];
    page.onAnnualChange(first, '250');
    page.onMonthlyChange(first, 0, '30');
    page.onQuarterlyChange(first, 0, '30');
    page.save();

    const request = http.expectOne((r) => r.method === 'POST' && r.url.includes('/kpitarget/bulk'));
    const body = request.request.body;
    expect(body.fiscalYearId).toBe('fy-1');
    expect(body.targets.length).toBe(1);
    expect(body.targets[0].kpiId).toBe('kpi-1');
    expect(body.targets[0].annualTarget).toBe(250);
    expect(body.targets[0].monthlyTargets.length).toBe(12);
    expect(body.targets[0].monthlyTargets[0]).toBe(30);

    request.flush(ok({ savedCount: 1, failedCount: 0, results: [{ kpiId: 'kpi-1', success: true }] }));
    expect(page.dirtyRows().length).toBe(0);
  });

  it('keeps a rejected row dirty and reports it', () => {
    start();
    loadTwoRows();
    const error = vi.spyOn(TestBed.inject(NotificationService), 'error');

    page.onAnnualChange(page.rows()[1], '400');
    page.save();

    const request = http.expectOne((r) => r.method === 'POST' && r.url.includes('/kpitarget/bulk'));
    request.flush({
      success: false,
      message: '1 saved, 1 failed.',
      data: {
        savedCount: 1,
        failedCount: 1,
        results: [{ kpiId: 'kpi-2', success: false, message: 'The period is locked.' }],
      },
    });

    const rejected = page.rows()[1];
    expect(rejected.dirty).toBeTruthy();
    expect(rejected.error).toBe('The period is locked.');
    expect(page.failedKpiIds()).toEqual(['kpi-2']);
    expect(error).toHaveBeenCalled();
  });

  it('blocks the save while a changed row is invalid', () => {
    start();
    loadTwoRows();

    page.onAnnualChange(page.rows()[0], '50');
    page.onMonthlyChange(page.rows()[0], 0, '-4');

    expect(page.rows()[0].error).toBeTruthy();
    expect(page.canSave()).toBeFalsy();
    http.expectNone((r) => r.method === 'POST');
  });

  it('requires an annual target before a row can be saved', () => {
    start();
    filters.selectFiscalYear('fy-1');
    flushGrid([KPI_ONE], []);

    page.onAnnualChange(page.rows()[0], '');

    expect(page.rows()[0].error).toBe('Annual target is required.');
    expect(page.canSave()).toBeFalsy();
  });

  it('warns without blocking when the annual target differs from the month sum', () => {
    start();
    loadTwoRows();

    page.onAnnualChange(page.rows()[0], '900');

    expect(page.annualMismatch(page.rows()[0])).toBeTruthy();
    expect(page.rows()[0].error).toBeNull();
    expect(page.canSave()).toBeTruthy();
  });

  it('spreads an annual target over the twelve months', () => {
    start();
    loadTwoRows();

    page.onAnnualChange(page.rows()[0], '100');
    page.distribute(page.rows()[0]);

    const spread = page.rows()[0].monthly;
    expect(spread.length).toBe(12);
    expect(spread.reduce((acc, value) => acc + value, 0)).toBe(100);
  });

  it('clears the grid when the fiscal year is cleared', () => {
    start();
    loadTwoRows();
    expect(page.rows().length).toBe(2);

    filters.reset();

    expect(page.rows()).toEqual([]);
    expect(page.hasFiscalYear()).toBeFalsy();
  });

  it('reports a failed read and leaves the grid empty', () => {
    start();
    const error = vi.spyOn(TestBed.inject(NotificationService), 'error');

    filters.selectFiscalYear('fy-1');
    http.expectOne(isKpiList).flush(ok([KPI_ONE]));
    http
      .expectOne(isBulkRead)
      .flush('boom', { status: 500, statusText: 'Server Error' });

    expect(page.rows()).toEqual([]);
    expect(error).toHaveBeenCalled();
  });

  it('locks the grid and blocks the save once the fiscal year has ended', () => {
    start();
    loadTwoRows();

    page.onAnnualChange(page.rows()[0], '250');
    expect(page.canSave()).toBeTruthy();

    // The year is still 'Open' but its end date is long past in EAT.
    filters.fiscalYears.update((list) =>
      list.map((fy) => ({ ...fy, endDate: '2000-06-30' }))
    );

    expect(page.isReadOnly()).toBeTruthy();
    expect(page.canSave()).toBeFalsy();

    page.save();
    http.expectNone((r) => r.method === 'POST');
  });

  it('locks the grid when the fiscal year status is closed regardless of its end date', () => {
    start();
    loadTwoRows();

    filters.fiscalYears.update((list) =>
      list.map((fy) => ({ ...fy, status: 'Closed' }))
    );

    expect(page.isReadOnly()).toBeTruthy();
    expect(page.canSave()).toBeFalsy();
  });
});
