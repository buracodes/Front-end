import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DataEntryPage } from './data-entry';
import { ScorecardWorkspaceState } from '../strategic-scorecard/workspace-state.service';
import { UserStore } from '../../core/service/user-store.service';
import { AuthUser } from '../../core/model/auth.model';
import { EntryBoard, KPI } from '../../core/model/goal.model';

const API = 'https://localhost:5211/api/';
const ok = (data: unknown) => ({ success: true, message: 'ok', data });

const FY = {
  id: 'fy-1',
  label: 'FY 2026',
  status: 'Open',
  startDate: '2026-07-01',
  endDate: '2027-06-30',
};

/** Month 5 is the only open window, so it is always the reporting month. */
const LOCKS = {
  scorecardId: 'sc-1',
  fiscalYearId: 'fy-1',
  periods: Array.from({ length: 12 }, (_unused, index) => {
    const month = index + 1;
    const monthKey = String(month).padStart(2, '0');
    return {
      fiscalPeriodId: `fp-${month}`,
      fiscalMonth: month,
      quarter: Math.floor((month - 1) / 3) + 1,
      isQuarterEnd: month % 3 === 0,
      isYearEnd: month === 12,
      state: month < 5 ? 'locked' : month === 5 ? 'open' : 'notYetOpen',
      effectiveEntryOpenDate: `2026-${monthKey}-01`,
      effectiveCutoffDate: `2026-${monthKey}-07`,
      effectiveEntryOpenDay: 1,
      effectiveCutoffDay: 7,
      effectiveReminderDaysBeforeCutoff: 2,
      hasExplicitOverride: false,
    };
  }),
};

const boardKpi = (id: string, name: string): KPI =>
  ({
    id,
    scorecardId: 'sc-1',
    name,
    unit: '%',
    weight: 100,
    optimizationType: 'Maximize',
    dataSource: 'Manual',
    kpiType: 'Lagging',
    isCumulative: false,
    isActive: true,
    divisionOwnerName: 'Application Development',
    childKpiCount: 0,
  }) as KPI;

/** Exactly what the board read answers for a division account: its own KPIs, targets and values. */
const BOARD: EntryBoard = {
  fiscalYearId: 'fy-1',
  scorecards: [
    {
      id: 'sc-1',
      fiscalYearId: 'fy-1',
      name: 'Corporate Scorecard',
      scope: 'corporate',
      scorecardStatus: 'active',
    },
  ],
  kpis: [boardKpi('kpi-1', 'Application uptime'), boardKpi('kpi-2', 'Requirement delivery')],
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
          note: 'verified against the incident log',
        },
      ],
    },
  ],
};

const SAVED = {
  id: 'actual-2',
  kpiId: 'kpi-2',
  fiscalPeriodId: 'fp-5',
  fiscalMonth: 5,
  quarter: 2,
  value: 12,
  dataSource: 'Manual',
  asOfDate: '2026-11-05T09:00:00',
};

/** The Data Input User persona after the role trim: the board read, the entry right and the dashboard. */
const ENTRY_RIGHTS = ['dashboard:view', 'actuals:view', 'actuals:enter'];

describe('DataEntryPage entry board', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<DataEntryPage>;
  let host: HTMLElement;
  let state: ScorecardWorkspaceState;
  let boardPayload: EntryBoard;
  let seenUrls: string[];

  const respond = (req: TestRequest): void => {
    seenUrls.push(req.request.urlWithParams);
    const url = req.request.url;
    if (url.endsWith('fiscalyear')) {
      req.flush(ok([FY]));
    } else if (url.includes('entry-board')) {
      req.flush(ok(boardPayload));
    } else if (url.includes('periodlock')) {
      req.flush(ok(LOCKS));
    } else if (url === `${API}scorecard`) {
      req.flush(ok([]));
    } else if (req.request.method === 'POST' && url.endsWith('kpiactual')) {
      req.flush(ok(SAVED));
    } else {
      req.flush(ok(null));
    }
  };

  /** Drains the chained reads: fiscal years, then the board, then the period windows. */
  const settle = (): void => {
    for (let pass = 0; pass < 5; pass++) {
      const requests = http.match(() => true);
      if (!requests.length) break;
      for (const req of requests) respond(req);
      fixture?.detectChanges();
    }
  };

  beforeEach(async () => {
    boardPayload = BOARD;
    seenUrls = [];
    await TestBed.configureTestingModule({
      imports: [DataEntryPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    state = TestBed.inject(ScorecardWorkspaceState);
  });

  afterEach(() => {
    try {
      settle();
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  const start = (permissions: string[]): DataEntryPage => {
    const user: AuthUser = {
      id: 'user-1',
      username: 'entry.user',
      fullName: 'Entry User',
      email: 'entry.user@spms.local',
      roles: ['DataInputUser'],
      permissions,
    };
    TestBed.inject(UserStore).setUser(user);

    fixture = TestBed.createComponent(DataEntryPage);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    settle();
    return fixture.componentInstance;
  };

  const inputs = (): HTMLInputElement[] =>
    Array.from(host.querySelectorAll<HTMLInputElement>('.entry-input-value'));

  const saveButton = (): HTMLButtonElement =>
    host.querySelector<HTMLButtonElement>('.entry-save') as HTMLButtonElement;

  it('loads its KPIs, targets and values from one board read', () => {
    const page = start(ENTRY_RIGHTS);

    expect(state.usesEntryScope()).toBe(true);
    expect(page.kpis().map((kpi) => kpi.id)).toEqual(['kpi-1', 'kpi-2']);
    expect(page.reportingMonth()).toBe(5);
    expect(page.targetFor('kpi-1', 5)).toBe(99);
    expect(page.cellValue('kpi-1', 5)?.value).toBe(98.5);
    expect(page.cellValue('kpi-2', 5)?.value).toBeNull();
    expect(page.loadingCells()).toBe(false);
  });

  it('reads nothing but the board for an entry account', () => {
    start(ENTRY_RIGHTS);

    expect(seenUrls.filter((url) => url.includes('entry-board'))).toHaveLength(1);
    // The corporate catalog, target catalog and score reads all sit behind `scorecard:view`.
    expect(seenUrls.some((url) => /\/scorecard(\?|$)/.test(url))).toBe(false);
    expect(seenUrls.some((url) => url.includes('kpitarget'))).toBe(false);
    expect(seenUrls.some((url) => url.includes('scoresnapshot'))).toBe(false);
    // One board replaces the former one-actuals-call-per-KPI fan-out.
    expect(seenUrls.filter((url) => /kpiactual\?/.test(url))).toHaveLength(0);
  });

  it('renders the recorded value in the reporting-month input', () => {
    start(ENTRY_RIGHTS);
    expect(inputs().map((input) => input.value)).toEqual(['98.5', '']);
  });

  it('keeps the board read-only for a division employee without the entry right', () => {
    const page = start(['dashboard:view', 'actuals:view']);

    expect(page.canEnter()).toBe(false);
    expect(page.isReadOnly()).toBe(true);
    expect(page.entrySubtitle()).toContain('KPIs assigned to my division');
    expect(inputs()).toHaveLength(2);
    expect(inputs().every((input) => input.disabled)).toBe(true);
    expect(saveButton().disabled).toBe(true);
  });

  it('saves the owning division value and refreshes through the board', () => {
    const page = start(ENTRY_RIGHTS);
    expect(inputs().every((input) => !input.disabled)).toBe(true);

    page.setCellValue('kpi-2', 5, '12');
    fixture.detectChanges();
    expect(page.dirtyCount()).toBe(1);

    saveButton().click();

    const posted = http.expectOne(
      (req) => req.method === 'POST' && req.url.endsWith('kpiactual')
    );
    expect(posted.request.body).toEqual(
      expect.objectContaining({
        kpiId: 'kpi-2',
        fiscalPeriodId: 'fp-5',
        value: 12,
        dataSource: 'Manual',
      })
    );
    posted.flush(ok(SAVED));
    settle();

    expect(page.savingAll()).toBe(false);
    expect(seenUrls.filter((url) => url.includes('entry-board'))).toHaveLength(2);
    expect(page.dirtyCount()).toBe(0);
  });

  it('keeps a corporate author on the scorecard catalog path', () => {
    const page = start(['scorecard:view', 'actuals:view', 'actuals:enter']);

    expect(state.usesEntryScope()).toBe(false);
    expect(seenUrls.some((url) => url === `${API}scorecard`)).toBe(true);
    expect(seenUrls.some((url) => url.includes('entry-board'))).toBe(false);
    expect(page.kpis()).toEqual([]);
  });

  it('stops the grid instead of spinning when the board read fails', () => {
    const page = start(ENTRY_RIGHTS);
    state.loadEntryBoard('fy-9');
    http
      .expectOne('https://localhost:5211/api/kpiactual/entry-board?fiscalYearId=fy-9')
      .flush(ok(null), { status: 403, statusText: 'Forbidden' });

    expect(state.error()).not.toBeNull();
    expect(page.loadingCells()).toBe(false);
  });
});
