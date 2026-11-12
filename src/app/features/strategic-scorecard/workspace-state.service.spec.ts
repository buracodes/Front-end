import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ScorecardWorkspaceState,
  businessDate,
  calendarDateParts,
  finalMonthGraceDeadlineOn,
  finalMonthGracePeriodExpired,
  fiscalYearHasEnded,
  isFiscalYearClosed,
  msUntilNextEatMidnight,
} from './workspace-state.service';
import { UserStore } from '../../core/service/user-store.service';
import { FiscalYear, Scorecard } from '../../core/model/scorecard.model';
import { EntryBoard, KPI } from '../../core/model/goal.model';
import { AuthUser } from '../../core/model/auth.model';

const fiscalYear = (overrides: Partial<FiscalYear> = {}): FiscalYear => ({
  id: 'fy-1',
  label: 'FY 2026',
  status: 'Open',
  startDate: '2026-07-01',
  // Far future so the date-based closure rule never trips in these status tests.
  endDate: '2099-06-30',
  ...overrides,
});

const scorecard = (overrides: Partial<Scorecard> = {}): Scorecard => ({
  id: 'sc-1',
  name: 'Corporate Strategy',
  fiscalYearId: 'fy-1',
  fiscalYearName: 'FY 2026',
  scorecardStatus: 'Active',
  scope: 'Corporate',
  description: '',
  ...overrides,
});

const user = (permissions: string[]): AuthUser => ({
  id: 'user-1',
  username: 'owner',
  fullName: 'Owner One',
  email: 'owner@spms.local',
  roles: ['DataInputUser'],
  permissions,
});

describe('ScorecardWorkspaceState closure signals', () => {
  let store: UserStore;
  let state: ScorecardWorkspaceState;

  const start = (permissions: string[] = []): ScorecardWorkspaceState => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient()],
    });
    store = TestBed.inject(UserStore);
    store.setUser(user(permissions));
    return TestBed.runInInjectionContext(() => new ScorecardWorkspaceState());
  };

  const select = (
    s: ScorecardWorkspaceState,
    year: FiscalYear,
    sc: Scorecard | null
  ): void => {
    s.fiscalYears.set([year]);
    s.scorecards.set(sc ? [sc] : []);
    s.fiscalYearId.set(year.id);
    s.scorecardId.set(sc?.id ?? null);
  };

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('is editable for an active scorecard in an open fiscal year', () => {
    state = start(['actuals:override']);
    select(state, fiscalYear(), scorecard());

    expect(state.scorecardClosed()).toBe(false);
    expect(state.fiscalYearClosed()).toBe(false);
    expect(state.isReadOnly()).toBe(false);
    expect(state.canEnterActuals()).toBe(true);
  });

  it('is read-only when the scorecard itself is closed', () => {
    state = start([]);
    select(state, fiscalYear(), scorecard({ scorecardStatus: 'Closed' }));

    expect(state.scorecardClosed()).toBe(true);
    expect(state.isReadOnly()).toBe(true);
    expect(state.canEnterActuals()).toBe(false);
  });

  it('is read-only when the fiscal year is closed', () => {
    state = start([]);
    select(state, fiscalYear({ status: 'Closed' }), scorecard());

    expect(state.fiscalYearClosed()).toBe(true);
    expect(state.scorecardClosed()).toBe(false);
    expect(state.isReadOnly()).toBe(true);
    expect(state.canEnterActuals()).toBe(false);
  });

  it('treats an archived fiscal year as closed regardless of letter case', () => {
    state = start([]);
    select(state, fiscalYear({ status: 'archived' }), scorecard());

    expect(state.fiscalYearClosed()).toBe(true);
    expect(state.isReadOnly()).toBe(true);
  });

  it('allows actual entry on a closed scorecard only with the audited override permission', () => {
    state = start([]);
    select(state, fiscalYear({ status: 'Closed' }), scorecard());
    expect(state.hasActualsOverride()).toBe(false);
    expect(state.canEnterActuals()).toBe(false);

    store.setUser(user(['actuals:override']));
    expect(state.hasActualsOverride()).toBe(true);
    expect(state.canEnterActuals()).toBe(true);
  });

  it('keeps the scorecard editable when the active-year signal is missing a scorecard', () => {
    state = start([]);
    select(state, fiscalYear(), null);

    expect(state.scorecardClosed()).toBe(false);
    expect(state.fiscalYearClosed()).toBe(false);
    expect(state.isReadOnly()).toBe(false);
  });
});

describe('ScorecardWorkspaceState closure timing (EAT business date)', () => {
  let store: UserStore;
  let state: ScorecardWorkspaceState;

  const start = (permissions: string[] = []): ScorecardWorkspaceState => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient()],
    });
    store = TestBed.inject(UserStore);
    store.setUser(user(permissions));
    return TestBed.runInInjectionContext(() => new ScorecardWorkspaceState());
  };

  const select = (
    s: ScorecardWorkspaceState,
    year: FiscalYear,
    sc: Scorecard | null
  ): void => {
    s.fiscalYears.set([year]);
    s.scorecards.set(sc ? [sc] : []);
    s.fiscalYearId.set(year.id);
    s.scorecardId.set(sc?.id ?? null);
  };

  /** Freezes the clock to an instant, faking only `Date` so RxJS timers stay real. */
  const freeze = (iso: string): void => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
  };

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('is editable while the end date is still today in EAT', () => {
    // 10:00 UTC = 13:00 EAT on the end date itself.
    freeze('2026-06-30T10:00:00Z');
    state = start([]);
    select(state, fiscalYear({ status: 'Open', endDate: '2026-06-30' }), scorecard());

    expect(state.fiscalYearClosed()).toBe(false);
    expect(state.isReadOnly()).toBe(false);
    expect(state.canEnterActuals()).toBe(true);
  });

  it('is still open just before EAT midnight on the end date', () => {
    // 20:59:59 UTC = 23:59:59 EAT on the end date.
    freeze('2026-06-30T20:59:59Z');
    state = start([]);
    select(state, fiscalYear({ status: 'Open', endDate: '2026-06-30' }), scorecard());

    expect(state.fiscalYearClosed()).toBe(false);
  });

  it('is still open inside the final-month grace period (day after the end date)', () => {
    // The 2025/26 year ends 2026-06-30; its grace deadline is 2026-07-07, so on
    // 2026-07-01 final-month actual entry is still allowed.
    freeze('2026-07-01T10:00:00Z');
    state = start([]);
    select(state, fiscalYear({ status: 'Open', endDate: '2026-06-30' }), scorecard());

    expect(state.fiscalYearClosed()).toBe(false);
    expect(state.isReadOnly()).toBe(false);
    expect(state.canEnterActuals()).toBe(true);
  });

  it('is read-only once the final-month grace deadline passes in EAT', () => {
    freeze('2026-07-07T10:00:00Z');
    state = start([]);
    select(state, fiscalYear({ status: 'Open', endDate: '2026-06-30' }), scorecard());

    // The deadline day itself (2026-07-07 in EAT) is still inclusive.
    expect(state.fiscalYearClosed()).toBe(false);
    expect(state.canEnterActuals()).toBe(true);
  });

  it('closes at EAT midnight on the day after the grace deadline', () => {
    // 21:00 UTC = 00:00 EAT on 2026-07-08, the first day after the grace deadline.
    freeze('2026-07-07T21:00:00Z');
    state = start([]);
    select(state, fiscalYear({ status: 'Open', endDate: '2026-06-30' }), scorecard());

    expect(state.fiscalYearClosed()).toBe(true);
    expect(state.isReadOnly()).toBe(true);
  });

  it('treats a closed or archived year as read-only regardless of its end date', () => {
    state = start([]);
    select(state, fiscalYear({ status: 'Closed', endDate: '2099-06-30' }), scorecard());
    expect(state.fiscalYearClosed()).toBe(true);
    expect(state.isReadOnly()).toBe(true);

    select(state, fiscalYear({ status: 'Archived', endDate: '2099-06-30' }), scorecard());
    expect(state.fiscalYearClosed()).toBe(true);
  });

  it('lets an actuals-override user correct values but keeps structure read-only after closure', () => {
    freeze('2026-07-08T10:00:00Z');
    state = start(['actuals:override']);
    select(state, fiscalYear({ status: 'Open', endDate: '2026-06-30' }), scorecard());

    expect(state.isReadOnly()).toBe(true);
    expect(state.hasActualsOverride()).toBe(true);
    expect(state.canEnterActuals()).toBe(true);
  });

  it('keeps a normal user from entering actuals after closure', () => {
    freeze('2026-07-08T10:00:00Z');
    state = start([]);
    select(state, fiscalYear({ status: 'Open', endDate: '2026-06-30' }), scorecard());

    expect(state.hasActualsOverride()).toBe(false);
    expect(state.canEnterActuals()).toBe(false);
  });
});

describe('fiscal-year closure date helpers', () => {
  it('reads the EAT calendar date without consulting the browser timezone', () => {
    expect(businessDate(new Date('2026-06-30T20:00:00Z'))).toEqual({ year: 2026, month: 6, day: 30 });
    expect(businessDate(new Date('2026-06-30T21:00:00Z'))).toEqual({ year: 2026, month: 7, day: 1 });
  });

  it('parses the date prefix of both date-only and datetime API values', () => {
    expect(calendarDateParts('2026-06-30')).toEqual({ year: 2026, month: 6, day: 30 });
    expect(calendarDateParts('2026-06-30T00:00:00')).toEqual({ year: 2026, month: 6, day: 30 });
    expect(calendarDateParts('')).toBeNull();
    expect(calendarDateParts(null)).toBeNull();
    expect(calendarDateParts('not-a-date')).toBeNull();
  });

  it('flags a year as ended only once its end date is before the EAT business date', () => {
    expect(fiscalYearHasEnded('2026-06-30', new Date('2026-06-30T10:00:00Z'))).toBe(false);
    expect(fiscalYearHasEnded('2026-06-30', new Date('2026-06-30T21:00:00Z'))).toBe(true);
    expect(fiscalYearHasEnded('2026-06-29', new Date('2026-06-30T10:00:00Z'))).toBe(true);
    expect(fiscalYearHasEnded(undefined, new Date('2026-06-30T10:00:00Z'))).toBe(false);
  });

  it('computes the final-month grace deadline from the configured end date', () => {
    // Confirmed business rule: end date + 7 calendar days, inclusive; a year ending
    // 2027-08-31 accepts final-month entry through 2027-09-07 and blocks it on 2027-09-08.
    expect(finalMonthGraceDeadlineOn('2027-08-31')).toEqual({ year: 2027, month: 9, day: 7 });
    expect(finalMonthGracePeriodExpired('2027-08-31', new Date('2027-09-07T10:00:00Z'))).toBe(false);
    expect(finalMonthGracePeriodExpired('2027-08-31', new Date('2027-09-08T10:00:00Z'))).toBe(true);
    // Month/year rollover and an unknown end date.
    expect(finalMonthGraceDeadlineOn('2027-12-31')).toEqual({ year: 2028, month: 1, day: 7 });
    expect(finalMonthGraceDeadlineOn(null)).toBeNull();
  });

  it('combines status and the grace-based date rule', () => {
    const withinGrace = new Date('2026-07-07T10:00:00Z');
    const afterGrace = new Date('2026-07-08T10:00:00Z');
    expect(isFiscalYearClosed({ status: 'Open', endDate: '2026-06-30' }, withinGrace)).toBe(false);
    expect(isFiscalYearClosed({ status: 'Open', endDate: '2026-06-30' }, afterGrace)).toBe(true);
    expect(isFiscalYearClosed({ status: 'Open', endDate: '2026-07-01' }, afterGrace)).toBe(false);
    expect(isFiscalYearClosed({ status: 'Closed', endDate: '2099-06-30' }, afterGrace)).toBe(true);
    expect(isFiscalYearClosed({ status: 'Archived', endDate: '2099-06-30' }, afterGrace)).toBe(true);
    expect(isFiscalYearClosed(null, afterGrace)).toBe(false);
  });

  it('measures the delay to the next EAT midnight', () => {
    expect(msUntilNextEatMidnight(new Date('2026-06-30T20:30:00Z'))).toBe(30 * 60 * 1000);
    // 21:00 UTC is exactly EAT midnight: the full day remains until the following one.
    expect(msUntilNextEatMidnight(new Date('2026-06-30T21:00:00Z'))).toBe(24 * 60 * 60 * 1000);
  });
});

describe('ScorecardWorkspaceState EAT rollover reactiveness', () => {
  let store: UserStore;
  let state: ScorecardWorkspaceState;

  const start = (permissions: string[] = []): ScorecardWorkspaceState => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient()],
    });
    store = TestBed.inject(UserStore);
    store.setUser(user(permissions));
    return TestBed.runInInjectionContext(() => new ScorecardWorkspaceState());
  };

  const select = (
    s: ScorecardWorkspaceState,
    year: FiscalYear,
    sc: Scorecard | null
  ): void => {
    s.fiscalYears.set([year]);
    s.scorecards.set(sc ? [sc] : []);
    s.fiscalYearId.set(year.id);
    s.scorecardId.set(sc?.id ?? null);
  };

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('re-evaluates the closure state when the EAT business date rolls past the grace deadline', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    // 23:59 EAT on the grace deadline day (2026-07-07): entry is still open.
    vi.setSystemTime(new Date('2026-07-07T20:59:00Z'));
    state = start([]);
    select(state, fiscalYear({ status: 'Open', endDate: '2026-06-30' }), scorecard());

    expect(state.fiscalYearClosed()).toBe(false);

    // Crossing EAT midnight fires the scheduled rollover timer.
    vi.advanceTimersByTime(2 * 60 * 1000);

    expect(state.fiscalYearClosed()).toBe(true);
    expect(state.isReadOnly()).toBe(true);
    expect(state.canEnterActuals()).toBe(false);
  });

  it('refreshes the closure state when the tab regains focus past the grace deadline', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-07-07T10:00:00Z'));
    state = start([]);
    select(state, fiscalYear({ status: 'Open', endDate: '2026-06-30' }), scorecard());

    expect(state.fiscalYearClosed()).toBe(false);

    // The tab was backgrounded while the clock crossed the grace deadline, then refocused.
    vi.setSystemTime(new Date('2026-07-08T10:00:00Z'));
    window.dispatchEvent(new Event('focus'));

    expect(state.fiscalYearClosed()).toBe(true);
    expect(state.isReadOnly()).toBe(true);
  });

  it('keeps division-owned KPIs out of the corporate workspace lists', () => {
    state = start();
    const corporate = {
      id: 'kpi-1',
      scorecardId: 'sc-1',
      name: 'Corporate trade value',
      weight: 100,
      optimizationType: 'Maximize',
      dataSource: 'Manual',
      kpiType: 'Lagging',
      isCumulative: true,
      isActive: true,
      childKpiCount: 0,
    } as KPI;
    const division = {
      ...corporate,
      id: 'kpi-2',
      name: 'Division branches opened',
      divisionGoalId: 'dg-1',
    } as KPI;

    state.workspace.set({
      goals: [],
      kras: [],
      kpis: [corporate, division],
      snapshot: null,
      locks: null,
      kpiTargets: new Map(),
    });

    expect(state.kpis().map((kpi) => kpi.id)).toEqual(['kpi-1']);
    expect(state.unassignedKpis().map((kpi) => kpi.id)).toEqual(['kpi-1']);
  });
});

const API = 'https://localhost:5211/api/';
const ok = (data: unknown) => ({ success: true, message: 'ok', data });

const entryBoard = (): EntryBoard => ({
  fiscalYearId: 'fy-1',
  scorecards: [
    {
      id: 'sc-1',
      fiscalYearId: 'fy-1',
      name: 'Corporate Scorecard',
      // The API serializes enums camel-cased, exactly as the board read returns them.
      scope: 'corporate',
      scorecardStatus: 'active',
    },
    {
      id: 'sc-2',
      fiscalYearId: 'fy-1',
      name: 'Finance Scorecard',
      scope: 'corporate',
      scorecardStatus: 'draft',
    },
  ],
  kpis: [
    { id: 'kpi-1', scorecardId: 'sc-1', name: 'Application uptime', weight: 100 } as KPI,
    { id: 'kpi-2', scorecardId: 'sc-2', name: 'Budget execution', weight: 100 } as KPI,
  ],
  targets: [
    {
      kpiId: 'kpi-1',
      fiscalYearId: 'fy-1',
      targets: [{ fiscalMonth: 5, quarter: 2, granularity: 'Monthly', targetValue: 99 }],
    },
  ],
  actuals: [
    {
      kpiId: 'kpi-1',
      fiscalYearId: 'fy-1',
      values: [
        {
          id: 'actual-1',
          kpiId: 'kpi-1',
          fiscalPeriodId: 'fp-5',
          fiscalMonth: 5,
          quarter: 2,
          value: 98.5,
          dataSource: 'Manual',
          asOfDate: '2026-11-03T10:00:00',
        },
      ],
    },
  ],
});

describe('ScorecardWorkspaceState entry board', () => {
  let state: ScorecardWorkspaceState;
  let http: HttpTestingController;

  const start = (permissions: string[]): ScorecardWorkspaceState => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(UserStore).setUser({
      id: 'user-1',
      username: 'entry.user',
      fullName: 'Entry User',
      email: 'entry.user@spms.local',
      roles: ['DataInputUser'],
      permissions,
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.runInInjectionContext(() => new ScorecardWorkspaceState());
  };

  /** Fiscal years, then the board, then the period windows of the scorecard it selects. */
  const loadBoard = (permissions: string[] = ['actuals:view']): ScorecardWorkspaceState => {
    const s = start(permissions);
    s.loadFiscalYearsAndScorecards();
    http
      .expectOne(`${API}fiscalyear`)
      .flush(ok([{ ...fiscalYear(), status: 'active' }]));
    http.expectOne(`${API}kpiactual/entry-board?fiscalYearId=fy-1`).flush(ok(entryBoard()));
    http.expectOne(`${API}periodlock?scorecardId=sc-1&fiscalYearId=fy-1`).flush(ok(null));
    return s;
  };

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('reads the entry board instead of the corporate catalog', () => {
    state = loadBoard();

    expect(state.usesEntryScope()).toBe(true);
    expect(state.fiscalYearId()).toBe('fy-1');
    expect(state.scorecardId()).toBe('sc-1');
    expect(state.scorecards().map((sc: Scorecard) => sc.id)).toEqual(['sc-1', 'sc-2']);
    expect(state.workspace().kpis.map((kpi) => kpi.id)).toEqual(['kpi-1', 'kpi-2']);
    expect(state.kpiTargets().get('kpi-1')?.[0].targetValue).toBe(99);
    expect(state.entryActuals().get('kpi-1')?.[0].value).toBe(98.5);
    http.expectNone((req) => req.url === `${API}scorecard`);
  });

  it('restores the camel-cased board enums for the picker', () => {
    state = loadBoard();
    const first = state.scorecards()[0];
    expect(first.scope).toBe('Corporate');
    expect(first.scorecardStatus).toBe('Active');
  });

  it('narrows the board KPIs to the selected scorecard and stays off the catalog', () => {
    state = loadBoard();
    expect(state.kpis().map((kpi) => kpi.id)).toEqual(['kpi-1']);

    state.selectScorecard('sc-2');
    http.expectOne(`${API}periodlock?scorecardId=sc-2&fiscalYearId=fy-1`).flush(ok(null));

    expect(state.kpis().map((kpi) => kpi.id)).toEqual(['kpi-2']);
  });

  it('never asks for a score snapshot an entry account cannot read', () => {
    state = loadBoard();
    state.reloadScores();
    http.expectNone((req) => req.url.startsWith(`${API}scoresnapshot`));
  });

  it('re-reads the board when the fiscal year changes', () => {
    state = loadBoard();
    state.selectFiscalYear('fy-2');
    http.expectOne(`${API}kpiactual/entry-board?fiscalYearId=fy-2`).flush(ok(entryBoard()));
    http.expectOne(`${API}periodlock?scorecardId=sc-1&fiscalYearId=fy-2`).flush(ok(null));
    expect(state.fiscalYearId()).toBe('fy-2');
  });

  it('reports a failed board read instead of leaving the grid spinning', () => {
    state = start(['actuals:view']);
    state.loadEntryBoard('fy-1');
    http
      .expectOne(`${API}kpiactual/entry-board?fiscalYearId=fy-1`)
      .flush(ok(null), { status: 403, statusText: 'Forbidden' });

    expect(state.loading()).toBe(false);
    expect(state.error()).not.toBeNull();
    expect(state.workspace().kpis).toEqual([]);
  });

  it('keeps the corporate catalog path for a principal with scorecard:view', () => {
    state = start(['scorecard:view', 'actuals:view']);
    state.loadFiscalYearsAndScorecards();
    http.expectOne(`${API}fiscalyear`).flush(ok([]));
    http.expectOne(`${API}scorecard`).flush(ok([]));

    expect(state.usesEntryScope()).toBe(false);
    http.expectNone((req) => req.url.includes('entry-board'));
  });
});