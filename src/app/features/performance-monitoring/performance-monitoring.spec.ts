import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PerformanceMonitoringPage } from './performance-monitoring';
import { PerformanceMonitoringService } from './performance-monitoring.service';
import { PerformanceMonitoring } from './performance-monitoring.model';
import { ScorecardService } from '../../core/service/scorecard.service';
import { FiscalYearService } from '../fiscal-year/fiscal-year.service';
import { DivisionService } from '../division/division.service';
import { NotificationService } from '../../core/service/notification.service';
import { UserStore } from '../../core/service/user-store.service';
import { ApiError } from '../../core/model/api-error';
import type { AuthUser } from '../../core/model/auth.model';

function payload(overrides: Partial<PerformanceMonitoring> = {}): PerformanceMonitoring {
  return {
    scope: 'Corporate',
    fiscalYearId: 'fy-1',
    fiscalYearName: '2025/26',
    scorecardId: 'sc-1',
    scorecardName: 'Corporate Scorecard',
    periodType: 'Ytd',
    scorecardCount: 4,
    goalsCount: 5,
    kpiCount: 8,
    greenCount: 3,
    amberCount: 2,
    redCount: 1,
    noDataCount: 2,
    kpis: [],
    divisions: [],
    ...overrides,
  };
}

describe('PerformanceMonitoringPage', () => {
  function setup(options: {
    permissions?: string[];
    divisionId?: string;
    response?: PerformanceMonitoring;
    error?: unknown;
  } = {}) {
    const get = vi.fn(() => (options.error ? throwError(() => options.error) : of(options.response ?? payload())));
    const fiscalYearGetAll = vi.fn(() =>
      of([
        { id: 'fy-1', label: '2025/26', startDate: '2025-07-01', endDate: '2026-06-30', status: 'Active' },
        { id: 'fy-2', label: '2026/27', startDate: '2026-07-01', endDate: '2027-06-30', status: 'Open' },
      ]),
    );
    const scorecardGetAll = vi.fn(() =>
      of([
        {
          id: 'sc-1',
          fiscalYearId: 'fy-1',
          name: 'Corporate Scorecard',
          scope: 'Corporate' as const,
          scorecardStatus: 'Active' as const,
        },
        {
          id: 'sc-div',
          fiscalYearId: 'fy-1',
          name: 'Division Scorecard',
          scope: 'Division' as const,
          scorecardStatus: 'Active' as const,
        },
      ]),
    );
    const divisionGetAll = vi.fn(() => of([{ id: 'div-1', name: 'Operations' }]));
    const notifications = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: PerformanceMonitoringService, useValue: { get } },
        { provide: ScorecardService, useValue: { getAll: scorecardGetAll } },
        { provide: FiscalYearService, useValue: { getAll: fiscalYearGetAll } },
        { provide: DivisionService, useValue: { getAll: divisionGetAll } },
        { provide: NotificationService, useValue: notifications },
      ],
    });

    TestBed.inject(UserStore).setUser({
      id: 'u-1',
      username: 'viewer',
      fullName: 'Viewer',
      divisionId: options.divisionId,
      roles: ['Viewer'],
      permissions: options.permissions ?? ['dashboard:view', 'performance:monitor.view'],
    } satisfies AuthUser);

    const page = TestBed.runInInjectionContext(() => new PerformanceMonitoringPage());
    return { page, get, notifications, divisionGetAll, fiscalYearGetAll, scorecardGetAll };
  }

  it('loads data on init and scopes the scorecard selector to corporate scorecards', () => {
    const { page, get, fiscalYearGetAll, scorecardGetAll } = setup();

    expect(get).toHaveBeenCalledTimes(1);
    expect(fiscalYearGetAll).toHaveBeenCalled();
    expect(scorecardGetAll).toHaveBeenCalled();
    expect(page.data()?.overallScore).toBeUndefined();
    expect(page.hasData()).toBe(true);
    expect(page.isCorporate()).toBe(true);
    expect(page.selectableScorecards().map((s) => s.id)).toEqual(['sc-1']);
  });

  it('adopts the resolved fiscal year and scorecard returned by the API', () => {
    const { page } = setup({ response: payload({ fiscalYearId: 'fy-1', scorecardId: 'sc-1' }) });

    expect(page.fiscalYearId()).toBe('fy-1');
    expect(page.scorecardId()).toBe('sc-1');
  });

  it('hides corporate filters and never loads divisions when the monitor permission is missing', () => {
    const { page, divisionGetAll } = setup({ permissions: ['dashboard:view'] });

    expect(page.canViewCorporate()).toBe(false);
    expect(page.canPickDivision()).toBe(false);
    expect(divisionGetAll).not.toHaveBeenCalled();
  });

  it('only offers the division picker after the corporate user selects division scope', () => {
    const { page } = setup();

    expect(page.canPickDivision()).toBe(false);

    page.onScopeModeChange('division');

    expect(page.scopeMode()).toBe('division');
    expect(page.divisionId()).toBe('div-1');
    expect(page.canPickDivision()).toBe(true);
  });

  it('drills into a division by setting the division filter and reloading', () => {
    const { page, get } = setup();

    page.drillDown('div-42');

    expect(page.scopeMode()).toBe('division');
    expect(page.divisionId()).toBe('div-42');
    expect(page.canPickDivision()).toBe(true);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenLastCalledWith(
      expect.objectContaining({ divisionId: 'div-42' }),
    );
  });

  it('returns to corporate scope by clearing the division filter', () => {
    const { page, get } = setup();

    page.onScopeModeChange('division');
    page.onScopeModeChange('all');

    expect(page.divisionId()).toBe('');
    expect(get).toHaveBeenLastCalledWith(expect.objectContaining({ divisionId: undefined }));
  });

  it('drops a scorecard from another year and adopts the new year default', () => {
    const { page, get } = setup({
      response: payload({ fiscalYearId: 'fy-2', scorecardId: 'sc-2' }),
    });

    page.scorecardId.set('sc-1');
    page.fiscalYearId.set('fy-2');
    page.onFiscalYearChange();

    // The stale selection is never sent; the server resolves the year's default scorecard.
    expect(get).toHaveBeenLastCalledWith(
      expect.objectContaining({ fiscalYearId: 'fy-2', scorecardId: undefined }),
    );
    expect(page.scorecardId()).toBe('sc-2');
  });

  it('keeps a scorecard selection that belongs to the selected fiscal year', () => {
    const { page } = setup();

    page.scorecardId.set('sc-1');
    page.fiscalYearId.set('fy-1');
    page.onFiscalYearChange();

    expect(page.scorecardId()).toBe('sc-1');
  });

  it('reports the empty state when the API resolves no fiscal year', () => {
    const { page } = setup({ response: payload({ fiscalYearId: null, fiscalYearName: null }) });

    expect(page.hasData()).toBe(false);
  });

  it('refreshes by re-requesting the current filters', () => {
    const { page, get } = setup();

    page.refresh();

    expect(get).toHaveBeenCalledTimes(2);
  });

  it('surfaces API failures through the notification service', () => {
    const { notifications } = setup({ error: new ApiError(403, 'You do not have access to this division.') });

    expect(notifications.error).toHaveBeenCalledWith('You do not have access to this division.');
  });

  it('maps RAG tokens to display classes and treats unknown values as no-data', () => {
    const { page } = setup();

    expect(page.ragClass('Green')).toBe('rag-green');
    expect(page.ragClass('amber')).toBe('rag-amber');
    expect(page.ragClass('Red')).toBe('rag-red');
    expect(page.ragClass(null)).toBe('rag-gray');
    expect(page.ragClass('NoData')).toBe('rag-gray');
  });
});

describe('PerformanceMonitoringService', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return { http: TestBed.inject(HttpTestingController), service: TestBed.inject(PerformanceMonitoringService) };
  }

  it('normalizes camelCase scope tokens and defaults missing collections', () => {
    const { http, service } = setup();
    let result: PerformanceMonitoring | undefined;

    service.get().subscribe((r) => (result = r));

    const req = http.expectOne((r) => r.method === 'GET' && r.url.includes('performancemonitoring'));
    req.flush({
      success: true,
      data: {
        ...payload(),
        scope: 'corporate',
        kpis: undefined,
        divisions: undefined,
      },
    });

    expect(result?.scope).toBe('Corporate');
    expect(result?.kpis).toEqual([]);
    expect(result?.divisions).toEqual([]);
  });

  it('serializes every provided filter into the query string', () => {
    const { http, service } = setup();

    service.get({
      fiscalYearId: 'fy-1',
      scorecardId: 'sc-1',
      divisionId: 'div-1',
      periodType: 'Quarter',
      quarter: 2,
      fromMonth: 4,
      toMonth: 6,
    }).subscribe();

    const req = http.expectOne((r) => r.method === 'GET' && r.url.includes('performancemonitoring'));
    expect(req.request.url).toContain('fiscalYearId=fy-1');
    expect(req.request.url).toContain('scorecardId=sc-1');
    expect(req.request.url).toContain('divisionId=div-1');
    expect(req.request.url).toContain('periodType=Quarter');
    expect(req.request.url).toContain('quarter=2');
    expect(req.request.url).toContain('fromMonth=4');
    expect(req.request.url).toContain('toMonth=6');
    req.flush({ success: true, data: payload() });
    http.verify();
  });

  it('omits the query string when no filters are supplied', () => {
    const { http, service } = setup();

    service.get().subscribe();

    const req = http.expectOne((r) => r.method === 'GET' && r.url.includes('performancemonitoring'));
    expect(req.request.url).not.toContain('?');
    req.flush({ success: true, data: payload() });
  });
});
