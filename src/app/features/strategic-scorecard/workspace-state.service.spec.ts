import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  ScorecardWorkspaceState,
  businessDate,
  calendarDateParts,
  fiscalYearHasEnded,
  isFiscalYearClosed,
  msUntilNextEatMidnight,
} from './workspace-state.service';
import { UserStore } from '../../core/service/user-store.service';
import { FiscalYear, Scorecard } from '../../core/model/scorecard.model';
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

  it('is read-only once the end date was yesterday in EAT', () => {
    // 10:00 UTC = 13:00 EAT the day after the end date.
    freeze('2026-07-01T10:00:00Z');
    state = start([]);
    select(state, fiscalYear({ status: 'Open', endDate: '2026-06-30' }), scorecard());

    expect(state.fiscalYearClosed()).toBe(true);
    expect(state.isReadOnly()).toBe(true);
    expect(state.canEnterActuals()).toBe(false);
  });

  it('closes at EAT midnight even though the UTC date has not rolled over', () => {
    // 21:00 UTC = 00:00 EAT the next day, so the end date has already passed in EAT.
    freeze('2026-06-30T21:00:00Z');
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
    freeze('2026-07-01T10:00:00Z');
    state = start(['actuals:override']);
    select(state, fiscalYear({ status: 'Open', endDate: '2026-06-30' }), scorecard());

    expect(state.isReadOnly()).toBe(true);
    expect(state.hasActualsOverride()).toBe(true);
    expect(state.canEnterActuals()).toBe(true);
  });

  it('keeps a normal user from entering actuals after closure', () => {
    freeze('2026-07-01T10:00:00Z');
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

  it('combines status and the date rule', () => {
    const now = new Date('2026-07-01T10:00:00Z');
    expect(isFiscalYearClosed({ status: 'Open', endDate: '2026-06-30' }, now)).toBe(true);
    expect(isFiscalYearClosed({ status: 'Open', endDate: '2026-07-01' }, now)).toBe(false);
    expect(isFiscalYearClosed({ status: 'Closed', endDate: '2099-06-30' }, now)).toBe(true);
    expect(isFiscalYearClosed({ status: 'Archived', endDate: '2099-06-30' }, now)).toBe(true);
    expect(isFiscalYearClosed(null, now)).toBe(false);
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

  it('re-evaluates the closure state when the EAT business date rolls at midnight', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-06-30T20:59:00Z')); // 23:59 EAT on the end date
    state = start([]);
    select(state, fiscalYear({ status: 'Open', endDate: '2026-06-30' }), scorecard());

    expect(state.fiscalYearClosed()).toBe(false);

    // Crossing EAT midnight fires the scheduled rollover timer.
    vi.advanceTimersByTime(2 * 60 * 1000);

    expect(state.fiscalYearClosed()).toBe(true);
    expect(state.isReadOnly()).toBe(true);
    expect(state.canEnterActuals()).toBe(false);
  });

  it('refreshes the closure state when the tab regains focus after midnight', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-06-30T10:00:00Z'));
    state = start([]);
    select(state, fiscalYear({ status: 'Open', endDate: '2026-06-30' }), scorecard());

    expect(state.fiscalYearClosed()).toBe(false);

    // The tab was backgrounded while the clock crossed EAT midnight, then refocused.
    vi.setSystemTime(new Date('2026-07-01T10:00:00Z'));
    window.dispatchEvent(new Event('focus'));

    expect(state.fiscalYearClosed()).toBe(true);
    expect(state.isReadOnly()).toBe(true);
  });
});