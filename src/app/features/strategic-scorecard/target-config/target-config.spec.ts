import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
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
});
