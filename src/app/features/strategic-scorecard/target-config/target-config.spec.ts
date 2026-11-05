import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TargetConfigPage } from './target-config';

const FISCAL_YEARS = [
  // Far future so the date-based closure rule keeps these editable years.
  { id: 'fy-1', label: '2025/2026', startDate: '2025-07-01', endDate: '2099-06-30', status: 'Open' },
  { id: 'fy-2', label: '2026/2027', startDate: '2026-07-01', endDate: '2099-06-30', status: 'Open' },
];

const SCORECARDS = [
  { id: 'sc-1', name: 'Corporate', fiscalYearId: 'fy-1' },
  { id: 'sc-2', name: 'Division', fiscalYearId: 'fy-2' },
];

const KPI = {
  id: 'kpi-1',
  scorecardId: 'sc-2',
  name: 'Trade value',
  isCumulative: false,
  weight: 40,
};

const ok = (data: unknown) => ({ success: true, message: 'ok', data });

describe('TargetConfigPage', () => {
  let page: TargetConfigPage;
  let http: HttpTestingController;
  let deepLink: Record<string, string>;

  beforeEach(() => {
    deepLink = { kpiId: 'kpi-1' };
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

  const create = (): void => {
    page = TestBed.runInInjectionContext(() => new TargetConfigPage());
    page.ngOnInit();
    http = TestBed.inject(HttpTestingController);
  };

  const kpiRequest = () => http.expectOne((r) => r.urlWithParams.includes('/api/kpi/kpi-1'));
  const scorecardRequest = () => http.expectOne((r) => r.urlWithParams.endsWith('/api/scorecard'));
  const fiscalYearRequest = () => http.expectOne((r) => r.urlWithParams.endsWith('/api/fiscalyear'));
  const targetRequest = () => http.expectOne((r) => r.urlWithParams.includes('/api/kpitarget?'));

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('reports a missing KPI id instead of loading', () => {
    deepLink = {};
    create();

    expect(page.loadError()).toBe('Missing KPI id.');
    expect(page.loading()).toBeFalsy();
  });

  it('opens the scorecard the link asked for and loads that fiscal year targets', () => {
    deepLink = { kpiId: 'kpi-1', scorecardId: 'sc-2', fiscalYearId: 'fy-2' };
    create();

    kpiRequest().flush(ok(KPI));
    scorecardRequest().flush(ok(SCORECARDS));
    fiscalYearRequest().flush(ok(FISCAL_YEARS));
    targetRequest().flush(ok({ targets: [{ fiscalMonth: 12, quarter: 4, granularity: 'Annual', targetValue: 900 }] }));

    expect(page.scorecard()?.id).toBe('sc-2');
    expect(page.fiscalYear()?.id).toBe('fy-2');
    expect(page.annualTarget()).toBe(900);
  });

  it('falls back to the KPI own scorecard when the link carries none', () => {
    create();

    kpiRequest().flush(ok(KPI));
    scorecardRequest().flush(ok(SCORECARDS));
    fiscalYearRequest().flush(ok(FISCAL_YEARS));
    targetRequest().flush(ok({ targets: [] }));

    expect(page.scorecard()?.id).toBe('sc-2');
    expect(page.fiscalYearIdResolved()).toBe('fy-2');
  });

  it('resolves the same scorecard when the scorecard list arrives before the KPI', () => {
    create();

    // The scorecard list first: the page must not settle on the first scorecard.
    scorecardRequest().flush(ok(SCORECARDS));
    fiscalYearRequest().flush(ok(FISCAL_YEARS));
    expect(page.fiscalYearIdResolved()).toBeNull();

    kpiRequest().flush(ok(KPI));
    targetRequest().flush(ok({ targets: [] }));

    expect(page.scorecard()?.id).toBe('sc-2');
  });

  it('falls back to the newest fiscal year when the link omits one', () => {
    create();

    kpiRequest().flush(ok(KPI));
    scorecardRequest().flush(ok(SCORECARDS));
    fiscalYearRequest().flush(ok(FISCAL_YEARS));
    targetRequest().flush(ok({ targets: [] }));

    // fy-2 sorts first, and it is also the KPI's scorecard year.
    expect(page.fiscalYearIdResolved()).toBe('fy-2');
  });

  it('stops loading when the KPI cannot be read', () => {
    create();

    kpiRequest().flush('boom', { status: 500, statusText: 'Server Error' });
    scorecardRequest().flush(ok(SCORECARDS));
    fiscalYearRequest().flush(ok(FISCAL_YEARS));

    expect(page.loading()).toBeFalsy();
    expect(page.loadError()).toBe('Failed to load KPI details.');
  });

  it('marks the targets read-only once the fiscal year has ended', () => {
    create();

    kpiRequest().flush(ok(KPI));
    scorecardRequest().flush(ok(SCORECARDS));
    fiscalYearRequest().flush(ok(FISCAL_YEARS));
    targetRequest().flush(ok({ targets: [] }));

    expect(page.isReadOnly()).toBeFalsy();

    page.fiscalYear.set({
      id: 'fy-old',
      label: '2000/2001',
      startDate: '2000-07-01',
      endDate: '2001-06-30',
      status: 'Open',
    });

    expect(page.isReadOnly()).toBeTruthy();
  });

  it('marks the targets read-only when the fiscal year is closed regardless of its end date', () => {
    create();

    kpiRequest().flush(ok(KPI));
    scorecardRequest().flush(ok(SCORECARDS));
    fiscalYearRequest().flush(ok(FISCAL_YEARS));
    targetRequest().flush(ok({ targets: [] }));

    page.fiscalYear.set({
      id: 'fy-2',
      label: '2026/2027',
      startDate: '2026-07-01',
      endDate: '2099-06-30',
      status: 'Closed',
    });

    expect(page.isReadOnly()).toBeTruthy();
  });

  it('returns to the internal page that opened it when a returnUrl is supplied', () => {
    deepLink = { kpiId: 'kpi-1', returnUrl: '/division-planning/sc-2?divisionId=div-1' };
    create();

    kpiRequest().flush(ok(KPI));
    scorecardRequest().flush(ok(SCORECARDS));
    fiscalYearRequest().flush(ok(FISCAL_YEARS));
    targetRequest().flush(ok({ targets: [] }));

    const router = TestBed.inject(Router);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl');
    page.goBack();

    expect(navigateByUrl).toHaveBeenCalledWith('/division-planning/sc-2?divisionId=div-1');
  });

  it('ignores an off-site returnUrl and falls back to the scorecard page', () => {
    deepLink = { kpiId: 'kpi-1', returnUrl: '//evil.example/steal' };
    create();

    kpiRequest().flush(ok(KPI));
    scorecardRequest().flush(ok(SCORECARDS));
    fiscalYearRequest().flush(ok(FISCAL_YEARS));
    targetRequest().flush(ok({ targets: [] }));

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl');
    page.goBack();

    expect(navigateByUrl).not.toHaveBeenCalledWith('//evil.example/steal');
    expect(navigate).toHaveBeenCalledWith(['/scorecards', 'sc-2']);
  });

  it('labels months and quarters from an arbitrary fiscal-year start (September)', () => {
    create();

    kpiRequest().flush(ok(KPI));
    scorecardRequest().flush(ok(SCORECARDS));
    fiscalYearRequest().flush(ok(FISCAL_YEARS));
    targetRequest().flush(ok({ targets: [] }));

    page.fiscalYear.set({
      id: 'fy-sep',
      label: '2026/27',
      startDate: '2026-09-01',
      endDate: '2027-08-31',
      status: 'Open',
    });

    expect(page.monthLabel(0)).toBe('Sep');
    expect(page.monthLabel(11)).toBe('Aug');
    expect(page.quarterLabel(0)).toBe('Q1 · Sep–Nov 2026');
    expect(page.quarterLabel(3)).toBe('Q4 · Jun–Aug 2027');
  });

  describe('auto-calculate mode', () => {
    const cumulativeKpi = { ...KPI, isCumulative: true };

    // Months 1..12 sum to 78 and each quarter is its three months, so the same rows come back
    // whether the quarters were typed or derived — only the flag distinguishes them.
    const targetRows = (derived: boolean) => [
      ...[6, 15, 24, 33].map((value, i) => ({
        fiscalMonth: (i + 1) * 3,
        quarter: i + 1,
        granularity: 'Quarterly',
        targetValue: value,
        isDerivedFromMonthly: derived,
      })),
      ...Array.from({ length: 12 }, (_, i) => ({
        fiscalMonth: i + 1,
        quarter: Math.floor(i / 3) + 1,
        granularity: 'Monthly',
        targetValue: i + 1,
      })),
      { fiscalMonth: 12, quarter: 4, granularity: 'Annual', targetValue: 78 },
    ];

    const loadWith = (rows: unknown[]): void => {
      create();
      kpiRequest().flush(ok(cumulativeKpi));
      scorecardRequest().flush(ok(SCORECARDS));
      fiscalYearRequest().flush(ok(FISCAL_YEARS));
      targetRequest().flush(ok({ targets: rows }));
    };

    const check = (checked: boolean) => ({ target: { checked } }) as unknown as Event;

    it('reopens in auto-calculate mode when the saved quarter rows are derived', () => {
      loadWith(targetRows(true));

      expect(page.autoCalc()).toBe(true);
    });

    it('reopens with auto-calculate off when the quarter rows were typed', () => {
      loadWith(targetRows(false));

      expect(page.autoCalc()).toBe(false);
    });

    it('sends the mode the user chose when saving', () => {
      create();
      kpiRequest().flush(ok(cumulativeKpi));
      scorecardRequest().flush(ok(SCORECARDS));
      fiscalYearRequest().flush(ok(FISCAL_YEARS));
      targetRequest().flush(ok({ targets: [] }));

      page.annualTarget.set(78);
      page.monthly.set(Array.from({ length: 12 }, (_, i) => i + 1));
      page.quarterly.set([6, 15, 24, 33]);
      page.setAutoCalc(check(true));

      page.save();

      const post = http.expectOne((r) => r.method === 'POST' && r.url.includes('/api/kpitarget'));
      expect(post.request.body).toMatchObject({ autoCalculateQuarterly: true });
      post.flush(ok(true));
    });
  });
});
