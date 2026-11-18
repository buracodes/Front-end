import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DataEntryPage } from './data-entry';
import { ScorecardWorkspaceState } from '../strategic-scorecard/workspace-state.service';
import { UserStore } from '../../core/service/user-store.service';
import { AuthUser } from '../../core/model/auth.model';
import { EntryBoard, KPI, KpiActualValue } from '../../core/model/goal.model';

const API = 'https://localhost:5211/api/';
const ok = (data: unknown) => ({ success: true, message: 'ok', data });

const FY = {
  id: 'fy-1',
  label: 'FY 2026',
  status: 'Open',
  startDate: '2026-07-01',
  endDate: '2027-06-30',
};

const SCORECARDS = [
  {
    id: 'sc-1',
    fiscalYearId: 'fy-1',
    name: 'Corporate Scorecard',
    scope: 'Corporate',
    scorecardStatus: 'Active',
  },
];

const lockPeriod = (month: number, state: 'open' | 'notYetOpen' | 'locked') => {
  const monthKey = String(month).padStart(2, '0');
  return {
    fiscalPeriodId: `fp-${month}`,
    fiscalMonth: month,
    quarter: Math.floor((month - 1) / 3) + 1,
    isQuarterEnd: month % 3 === 0,
    isYearEnd: month === 12,
    state,
    effectiveEntryOpenDate: `2026-${monthKey}-01`,
    effectiveCutoffDate: `2026-${monthKey}-07`,
    effectiveEntryOpenDay: 1,
    effectiveCutoffDay: 7,
    effectiveReminderDaysBeforeCutoff: 2,
    hasExplicitOverride: false,
  };
};

/** Month 5 is the only open window, so it is the reporting month whenever entry is possible. */
const LOCKS = {
  scorecardId: 'sc-1',
  fiscalYearId: 'fy-1',
  periods: Array.from({ length: 12 }, (_unused, index) => {
    const month = index + 1;
    return lockPeriod(month, month < 5 ? 'locked' : month === 5 ? 'open' : 'notYetOpen');
  }),
};

const boardKpi = (id: string, name: string, overrides: Partial<KPI> = {}): KPI =>
  ({
    id,
    scorecardId: 'sc-1',
    goalId: 'goal-1',
    goalName: 'Operational Excellence',
    kraId: 'kra-1',
    kraName: 'Service Delivery',
    name,
    unit: '%',
    weight: 100,
    optimizationType: 'Maximize',
    dataSource: 'Manual',
    kpiType: 'Lagging',
    isCumulative: false,
    isActive: true,
    divisionOwnerId: 'div-1',
    divisionOwnerName: 'Application Development',
    childKpiCount: 0,
    ...overrides,
  }) as KPI;

const BOARD_ACTUAL: KpiActualValue = {
  id: 'actual-1',
  kpiId: 'kpi-1',
  fiscalPeriodId: 'fp-5',
  fiscalMonth: 5,
  quarter: 2,
  value: 98.5,
  dataSource: 'Manual',
  asOfDate: '2026-11-03T10:00:00',
  note: 'verified against the incident log',
};

/** The board an entry account reads: its own KPIs, targets and values in one payload. */
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
    { kpiId: 'kpi-1', fiscalYearId: 'fy-1', values: [BOARD_ACTUAL] },
  ],
};

/** The only payload an account without a division assignment may receive: no rows. */
const EMPTY_BOARD: EntryBoard = {
  fiscalYearId: 'fy-1',
  scorecards: BOARD.scorecards,
  kpis: [],
  targets: [],
  actuals: [],
};

/** Two goals so each card can be collapsed independently. */
const TWO_GOAL_BOARD: EntryBoard = {
  ...BOARD,
  kpis: [
    boardKpi('kpi-1', 'Application uptime'),
    boardKpi('kpi-2', 'Requirement delivery', {
      goalId: 'goal-2',
      goalName: 'Financial Discipline',
      kraId: 'kra-2',
      kraName: 'Budget Control',
    }),
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

const DIVISIONS = [
  { id: 'div-1', name: 'Application Development' },
  { id: 'div-2', name: 'Trade Operations' },
];

const divisionPlan = (
  divisionId: string,
  divisionName: string,
  planId: string,
  goalId: string,
  kpiId: string,
  target: number
) => ({
  id: planId,
  divisionId,
  divisionName,
  scorecardId: 'sc-1',
  scorecardName: 'Corporate Scorecard',
  fiscalYearId: 'fy-1',
  planStatus: 'finalized',
  contributions: [],
  availableGoals: [],
  goals: [
    {
      id: goalId,
      divisionPlanId: planId,
      parentGoalId: 'goal-1',
      parentGoalName: 'Operational Excellence',
      name: 'Division Delivery Goal',
      weight: 100,
      kpis: [
        {
          id: kpiId,
          divisionGoalId: goalId,
          name: 'Ticket resolution',
          unit: '%',
          weight: 100,
          isCumulative: false,
          isActive: true,
          targets: [{ fiscalPeriodId: 'fp-5', fiscalMonth: 5, quarter: 2, granularity: 'Monthly', targetValue: target }],
        },
      ],
    },
  ],
  fiscalPeriods: [],
});

const DIVISION_PLAN = divisionPlan('div-1', 'Application Development', 'plan-1', 'dg-1', 'dkpi-1', 95);
const DIVISION_PLAN_2 = divisionPlan('div-2', 'Trade Operations', 'plan-2', 'dg-2', 'dkpi-2', 80);

const divisionActual = (id: string, divisionId: string, kpiId: string, value: number) => ({
  id,
  divisionId,
  kpiId,
  fiscalPeriodId: 'fp-5',
  fiscalMonth: 5,
  quarter: 2,
  value,
  dataSource: 'Manual',
  asOfDate: '2026-11-04T09:00:00',
});

const DIVISION_ACTUALS = [divisionActual('da-1', 'div-1', 'dkpi-1', 91)];
const DIVISION_ACTUALS_2 = [divisionActual('da-2', 'div-2', 'dkpi-2', 70)];

const DIVISION_SAVED = divisionActual('da-3', 'div-1', 'dkpi-1', 93);
const DIVISION_SAVED_2 = divisionActual('da-4', 'div-2', 'dkpi-2', 84);

const planSummary = (divisionId: string, planId: string) => ({
  id: planId,
  divisionId,
  scorecardId: 'sc-1',
  scorecardName: 'Corporate Scorecard',
  fiscalYearId: 'fy-1',
  planStatus: 'finalized',
  goalCount: 1,
  kpiCount: 1,
});

const PLAN_SUMMARIES: Record<string, ReturnType<typeof planSummary>> = {
  'div-1': planSummary('div-1', 'plan-1'),
  'div-2': planSummary('div-2', 'plan-2'),
};

/** Data Input User: reports division actuals, so the page opens on Division scope. */
const ENTRY_RIGHTS = ['dashboard:view', 'actuals:view', 'actuals:enter', 'divisions:actuals.enter'];

/** A division account that may read but not write actuals. */
const READ_RIGHTS = ['dashboard:view', 'actuals:view'];

/** A corporate author that may read the corporate catalog and enter its own KPIs. */
const CORPORATE_WRITE_RIGHTS = ['scorecard:view', 'actuals:view', 'actuals:enter'];

/** A corporate reader: corporate catalog only, no write right. */
const CORPORATE_READ_RIGHTS = ['scorecard:view', 'actuals:view'];

/**
 * Admin/Power User without an HR division: the administrative portfolio shows every
 * division, but viewing them never grants entry without the audited override right.
 */
const PORTFOLIO_RIGHTS = [
  'dashboard:view',
  'scorecard:view',
  'performance:monitor.view',
  'actuals:view',
  'actuals:enter',
  'divisions:actuals.enter',
];

/** The same administrative account with the explicit audited override right. */
const ADMIN_RIGHTS = [...PORTFOLIO_RIGHTS, 'actuals:override'];

/** Reports on the corporate board through the entry read instead of the corporate catalog. */
const BOARD_RIGHTS = ['dashboard:view', 'actuals:view', 'actuals:enter', 'performance:monitor.view'];

describe('DataEntryPage scope and division visibility', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<DataEntryPage>;
  let host: HTMLElement;
  let state: ScorecardWorkspaceState;
  let boardPayload: EntryBoard;
  let locksPayload: typeof LOCKS;
  let divisionsPayload: { id: string; name: string }[];
  let catalogPayload: KPI[];
  let divisionPlanPayload: typeof DIVISION_PLAN;
  let seenUrls: string[];
  /** Number of upcoming entry-board reads answered with a server error. */
  let boardFailures: number;

  const respond = (req: TestRequest): void => {
    seenUrls.push(req.request.urlWithParams);
    const { pathname: path, searchParams } = new URL(req.request.urlWithParams);
    const method = req.request.method;
    const divisionId = searchParams.get('divisionId');
    const kpiId = searchParams.get('kpiId');

    if (method === 'POST' && path.endsWith('/kpiactual')) {
      req.flush(ok(SAVED));
      return;
    }
    if (method === 'POST' && path.endsWith('/actuals')) {
      const body = req.request.body as { dto?: { divisionId?: string } };
      req.flush(ok(body.dto?.divisionId === 'div-2' ? DIVISION_SAVED_2 : DIVISION_SAVED));
      return;
    }
    if (path.endsWith('/fiscalyear')) {
      req.flush(ok([FY]));
      return;
    }
    if (path.includes('/entry-board')) {
      if (boardFailures > 0) {
        boardFailures--;
        req.flush(ok(null), { status: 500, statusText: 'Server Error' });
        return;
      }
      req.flush(ok(boardPayload));
      return;
    }
    if (path.includes('/periodlock')) {
      req.flush(ok(locksPayload));
      return;
    }
    if (path.includes('/plans/by-scorecard/')) {
      req.flush(ok(divisionId === 'div-2' ? DIVISION_PLAN_2 : divisionPlanPayload));
      return;
    }
    if (path.endsWith('/plans')) {
      const summaryDivision = /\/division\/([^/]+)\/plans$/.exec(path)?.[1] ?? 'div-1';
      req.flush(ok([PLAN_SUMMARIES[summaryDivision] ?? PLAN_SUMMARIES['div-1']]));
      return;
    }
    if (path.endsWith('/division/actuals')) {
      req.flush(ok(divisionId === 'div-2' ? DIVISION_ACTUALS_2 : DIVISION_ACTUALS));
      return;
    }
    if (path === '/api/division') {
      req.flush(ok(divisionsPayload));
      return;
    }
    if (path === '/api/scorecard') {
      req.flush(ok(SCORECARDS));
      return;
    }
    if (path.includes('/kpitarget')) {
      req.flush(ok({ targets: kpiId === 'kpi-1' ? [{ fiscalMonth: 5, quarter: 2, granularity: 'Monthly', targetValue: 99 }] : [] }));
      return;
    }
    if (method === 'GET' && path.endsWith('/kpiactual')) {
      req.flush(ok({ values: kpiId === 'kpi-1' ? [BOARD_ACTUAL] : [] }));
      return;
    }
    if (path.endsWith('/kpi')) {
      req.flush(ok(catalogPayload));
      return;
    }
    if (path.endsWith('/goal') || path.endsWith('/kra')) {
      req.flush(ok([]));
      return;
    }
    req.flush(ok(null));
  };

  /** Drains the chained reads: fiscal year, board/catalog, division plan, locks and actuals. */
  const settle = (): void => {
    for (let pass = 0; pass < 10; pass++) {
      const requests = http.match(() => true);
      if (!requests.length) break;
      for (const req of requests) respond(req);
      fixture?.detectChanges();
    }
    // Effects scheduled by the last response run on the next change detection.
    fixture?.detectChanges();
  };

  beforeEach(async () => {
    boardPayload = BOARD;
    locksPayload = LOCKS;
    divisionsPayload = DIVISIONS;
    catalogPayload = [boardKpi('kpi-1', 'Application uptime')];
    divisionPlanPayload = DIVISION_PLAN;
    seenUrls = [];
    boardFailures = 0;
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

  const start = (
    permissions: string[],
    divisionIds: string[] = ['div-1'],
    primaryDivisionId?: string
  ): DataEntryPage => {
    const user: AuthUser = {
      id: 'user-1',
      username: 'entry.user',
      fullName: 'Entry User',
      email: 'entry.user@spms.local',
      divisionId: primaryDivisionId ?? divisionIds[0],
      divisionIds,
      roles: ['Data Input User'],
      permissions,
    };
    TestBed.inject(UserStore).setUser(user);

    fixture = TestBed.createComponent(DataEntryPage);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    settle();
    return fixture.componentInstance;
  };

  const switchScope = (scope: 'Corporate' | 'Division'): void => {
    const select = host.querySelector<HTMLSelectElement>('#entry-scope');
    expect(select).not.toBeNull();
    select!.value = scope;
    select!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    settle();
  };

  const switchDivision = (divisionId: string): void => {
    const select = host.querySelector<HTMLSelectElement>('#entry-division');
    expect(select).not.toBeNull();
    select!.value = divisionId;
    select!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    settle();
  };

  const inputs = (): HTMLInputElement[] =>
    Array.from(host.querySelectorAll<HTMLInputElement>('.entry-input-value'));

  const goalHeads = (): HTMLButtonElement[] =>
    Array.from(host.querySelectorAll<HTMLButtonElement>('.entry-goal-head'));

  const goalCards = (): HTMLElement[] =>
    Array.from(host.querySelectorAll<HTMLElement>('.entry-goal-card'));

  const saveButton = (): HTMLButtonElement =>
    host.querySelector<HTMLButtonElement>('.entry-save') as HTMLButtonElement;

  it('opens a Data Input division account on its division while offering both scopes', () => {
    const page = start(ENTRY_RIGHTS);

    expect(state.usesEntryScope()).toBe(true);
    expect(page.scope()).toBe('Division');
    // The board carries the corporate KPIs assigned to the account, so Corporate is a real
    // responsibility next to its division plan rather than a hidden scope.
    expect(page.scopeOptions()).toEqual(['Corporate', 'Division']);
    expect(host.querySelector('#entry-scope')).not.toBeNull();
    expect(host.querySelector('#entry-division')).toBeNull();
    expect(host.querySelector('#entry-scorecard')).toBeNull();

    expect(page.visibleDivisions().map((division) => division.id)).toEqual(['div-1']);
    expect(page.selectedDivision()?.name).toBe('Application Development');
    expect(page.divisionPlan()?.scorecardName).toBe('Corporate Scorecard');
    expect(page.divisionPlanStatus()).toBe('Finalized');
    expect(page.entrySubtitle()).toContain('Application Development');

    expect(page.reportingMonth()).toBe(5);
    expect(page.targetFor('dkpi-1', 5)).toBe(95);
    expect(page.cellValue('dkpi-1', 5)?.value).toBe(91);
    expect(page.divisionGroups()[0].goal.name).toBe('Division Delivery Goal');

    expect(page.canEnter()).toBe(true);
    expect(inputs()).toHaveLength(1);
    expect(inputs()[0].disabled).toBe(false);
  });

  it('keeps a draft division plan read-only until it is finalized', () => {
    divisionPlanPayload = { ...DIVISION_PLAN, planStatus: 'draft' };
    const page = start(ENTRY_RIGHTS);

    expect(page.divisionPlanStatus()).toBe('Draft');
    // FR-906: Data Input Users may enter performance only after the plan is finalized.
    expect(page.canEnter()).toBe(false);
    expect(inputs()).toHaveLength(1);
    expect(inputs()[0].disabled).toBe(true);
    expect(host.textContent).toContain('read-only until a planner finalizes it');
    expect(saveButton().disabled).toBe(true);
  });

  it('switches a dual-assignment account between its corporate board and division plan', () => {
    const page = start(ENTRY_RIGHTS);

    switchScope('Corporate');

    expect(page.scope()).toBe('Corporate');
    expect(host.querySelector('#entry-scorecard')).not.toBeNull();
    expect(page.kpis().map((kpi) => kpi.id)).toEqual(['kpi-1', 'kpi-2']);
    expect(page.cellValue('kpi-1', 5)?.value).toBe(98.5);
    expect(page.canEnter()).toBe(true);
    expect(inputs()[0].disabled).toBe(false);

    switchScope('Division');

    expect(page.scope()).toBe('Division');
    expect(page.divisionPlan()?.id).toBe('plan-1');
    expect(page.cellValue('dkpi-1', 5)?.value).toBe(91);
  });

  it('serves a corporate assignment without any division claim and without division reads', () => {
    boardPayload = {
      ...BOARD,
      kpis: [boardKpi('kpi-1', 'Application uptime', { ownerId: 'user-1', divisionOwnerId: undefined })],
    };
    const page = start(ENTRY_RIGHTS, []);

    expect(page.scopeOptions()).toEqual(['Corporate']);
    // The default scope follows the only assignment once the board has resolved it.
    expect(page.scope()).toBe('Corporate');
    expect(host.querySelector('#entry-scope')).toBeNull();
    expect(host.querySelector('#entry-division')).toBeNull();

    expect(page.kpis().map((kpi) => kpi.id)).toEqual(['kpi-1']);
    expect(page.cellValue('kpi-1', 5)?.value).toBe(98.5);
    expect(page.canEnter()).toBe(true);
    expect(inputs()).toHaveLength(1);
    expect(inputs()[0].disabled).toBe(false);

    // Division scope is unavailable, so no division catalog or plan read is issued.
    expect(seenUrls.some((url) => url === `${API}division`)).toBe(false);
    expect(seenUrls.some((url) => url.endsWith('/plans'))).toBe(false);
  });

  it('offers only Division scope when the board carries no corporate KPI', () => {
    boardPayload = EMPTY_BOARD;
    const page = start(ENTRY_RIGHTS);

    expect(page.scopeOptions()).toEqual(['Division']);
    expect(page.scope()).toBe('Division');
    expect(host.querySelector('#entry-scope')).toBeNull();
    expect(page.divisionPlan()?.id).toBe('plan-1');
    expect(page.canEnter()).toBe(true);
  });

  it('opens a corporate assignee without entry right read-only on Corporate scope', () => {
    const page = start(READ_RIGHTS, []);

    expect(page.scopeOptions()).toEqual(['Corporate']);
    expect(page.scope()).toBe('Corporate');
    expect(page.kpis().map((kpi) => kpi.id)).toEqual(['kpi-1', 'kpi-2']);
    expect(page.canEnter()).toBe(false);
    expect(inputs()).toHaveLength(2);
    expect(inputs().every((input) => input.disabled)).toBe(true);
    expect(saveButton().disabled).toBe(true);
  });

  it('never exposes a division outside the account assignment', () => {
    // The catalog lists every division; the page still narrows to the assignment.
    const page = start(READ_RIGHTS);

    expect(divisionsPayload.map((division) => division.id)).toEqual(['div-1', 'div-2']);
    expect(page.visibleDivisions().map((division) => division.id)).toEqual(['div-1']);
    expect(seenUrls.some((url) => url.includes('div-2'))).toBe(false);
    expect(page.divisionPlan()?.divisionId).toBe('div-1');
  });

  it('limits a multi-division account to assigned divisions and preselects the HR primary', () => {
    const page = start(ENTRY_RIGHTS, ['div-1', 'div-2'], 'div-2');

    const select = host.querySelector<HTMLSelectElement>('#entry-division');
    expect(select).not.toBeNull();
    expect(Array.from(select!.options).map((option) => option.value)).toEqual(['div-1', 'div-2']);
    expect(select!.value).toBe('div-2');

    expect(page.divisionId()).toBe('div-2');
    expect(page.divisionPlan()?.id).toBe('plan-2');
    expect(page.cellValue('dkpi-2', 5)?.value).toBe(70);
    expect(page.targetFor('dkpi-2', 5)).toBe(80);
    expect(page.canEnter()).toBe(true);
  });

  it('reloads only the division that was just selected', () => {
    const page = start(ENTRY_RIGHTS, ['div-1', 'div-2'], 'div-2');

    switchDivision('div-1');

    expect(page.divisionId()).toBe('div-1');
    expect(page.divisionPlan()?.id).toBe('plan-1');
    expect(page.cellValue('dkpi-1', 5)?.value).toBe(91);
    expect(page.targetFor('dkpi-1', 5)).toBe(95);
    expect(page.visibleDivisions().map((division) => division.id)).toEqual(['div-1', 'div-2']);
  });

  it('shows no division performance to an account without a division assignment', () => {
    boardPayload = EMPTY_BOARD;
    divisionsPayload = [];
    const page = start(READ_RIGHTS, []);

    expect(page.scope()).toBe('Division');
    expect(page.canViewDivisionScope()).toBe(false);
    expect(page.canViewCorporate()).toBe(false);
    expect(host.querySelector('#entry-scope')).toBeNull();
    expect(host.querySelector('#entry-division')).toBeNull();
    expect(page.visibleDivisions()).toEqual([]);
    expect(page.divisionPlan()).toBeNull();
    expect(page.kpis()).toEqual([]);
    expect(inputs()).toHaveLength(0);
    expect(host.textContent).toContain('no division assignment');
    expect(page.canEnter()).toBe(false);

    // No division plan or actual read is ever issued for an unassigned account.
    expect(seenUrls.some((url) => url.endsWith('/plans'))).toBe(false);
    expect(seenUrls.some((url) => url.endsWith('/division/actuals'))).toBe(false);
    // Corporate data is not a fallback: the catalog reads stay behind `scorecard:view`.
    expect(seenUrls.some((url) => url === `${API}scorecard`)).toBe(false);
    expect(seenUrls.some((url) => url.endsWith('/goal'))).toBe(false);
  });

  it('keeps the division board read-only without the division entry right', () => {
    const page = start(READ_RIGHTS);

    expect(page.divisionPlan()).not.toBeNull();
    expect(page.canEnter()).toBe(false);
    expect(page.isReadOnly()).toBe(true);
    expect(inputs()).toHaveLength(1);
    expect(inputs()[0].disabled).toBe(true);
    expect(saveButton().disabled).toBe(true);
  });

  it('disables the division board when the Power User window is closed', () => {
    locksPayload = {
      ...LOCKS,
      periods: LOCKS.periods.map((period) => ({ ...period, state: 'locked' as const })),
    };
    const page = start(ENTRY_RIGHTS);

    expect(page.canEnter()).toBe(false);
    expect(inputs()).toHaveLength(1);
    expect(inputs()[0].disabled).toBe(true);
    expect(saveButton().disabled).toBe(true);
    expect(page.entrySubtitle()).toContain('Application Development');
  });

  it('saves a division value through the division actuals endpoint', () => {
    const page = start(ENTRY_RIGHTS);

    page.setCellValue('dkpi-1', 5, '93');
    fixture.detectChanges();
    expect(page.dirtyCount()).toBe(1);

    saveButton().click();
    const posted = http.expectOne(
      (req) => req.method === 'POST' && req.url.endsWith('/actuals')
    );
    expect(posted.request.body).toEqual({
      dto: expect.objectContaining({
        divisionId: 'div-1',
        kpiId: 'dkpi-1',
        fiscalPeriodId: 'fp-5',
        value: 93,
        dataSource: 'Manual',
      }),
    });
    posted.flush(ok(DIVISION_SAVED));
    settle();

    expect(page.savingAll()).toBe(false);
    expect(page.divisionId()).toBe('div-1');
  });

  it('keeps a corporate author on the catalog and groups rows by goal and KRA', () => {
    const page = start(CORPORATE_WRITE_RIGHTS, []);

    expect(state.usesEntryScope()).toBe(false);
    expect(page.scope()).toBe('Corporate');
    expect(host.querySelector('#entry-scope')).toBeNull();
    expect(host.querySelector('#entry-division')).toBeNull();
    expect(host.querySelector('#entry-scorecard')).not.toBeNull();

    expect(seenUrls.some((url) => url === `${API}scorecard`)).toBe(true);
    expect(seenUrls.some((url) => url.includes('entry-board'))).toBe(false);
    expect(seenUrls.some((url) => url.includes('/kpitarget'))).toBe(true);

    expect(page.kpis().map((kpi) => kpi.id)).toEqual(['kpi-1']);
    expect(page.reportingMonth()).toBe(5);
    expect(page.targetFor('kpi-1', 5)).toBe(99);
    expect(page.cellValue('kpi-1', 5)?.value).toBe(98.5);

    expect(page.corporateGroups()).toHaveLength(1);
    expect(page.corporateGroups()[0].goalName).toBe('Operational Excellence');
    expect(page.corporateGroups()[0].kras[0].kraName).toBe('Service Delivery');
    expect(
      Array.from(host.querySelectorAll('.entry-goal-name')).map((name) => name.textContent?.trim())
    ).toEqual(['Operational Excellence']);
    expect(
      Array.from(host.querySelectorAll('.entry-kra-name')).map((name) => name.textContent?.trim())
    ).toEqual(['Service Delivery']);
  });

  it('loads the corporate rows when the page opens on a selection another page left behind', () => {
    // Only the shared selection is set: no goals, KRAs or KPIs have been read yet.
    state.fiscalYearId.set('fy-1');
    state.scorecardId.set('sc-1');

    const page = start(CORPORATE_WRITE_RIGHTS, []);

    expect(page.scope()).toBe('Corporate');
    expect(page.kpis().map((kpi) => kpi.id)).toEqual(['kpi-1']);
    expect(goalCards()).toHaveLength(1);
    expect(host.querySelector('.entry-goal-name')?.textContent?.trim()).toBe('Operational Excellence');
    expect(host.querySelector('.entry-kra-name')?.textContent?.trim()).toBe('Service Delivery');
    expect(page.loadingCells()).toBe(false);
  });

  it('stops spinning and shows the empty board when the scorecard has no KPIs', () => {
    catalogPayload = [];

    const page = start(CORPORATE_WRITE_RIGHTS, []);

    expect(page.scope()).toBe('Corporate');
    expect(page.kpis()).toEqual([]);
    expect(page.loadingCells()).toBe(false);
    expect(goalCards()).toHaveLength(0);
    expect(host.textContent).toContain('No KPIs configured for this scorecard yet.');
  });

  it('re-reads the entry board when the first board read fails', () => {
    boardFailures = 1;

    const page = start(BOARD_RIGHTS);

    expect(page.scope()).toBe('Corporate');
    expect(seenUrls.filter((url) => url.includes('entry-board'))).toHaveLength(2);
    expect(page.kpis().map((kpi) => kpi.id)).toEqual(['kpi-1', 'kpi-2']);
    expect(page.cellValue('kpi-1', 5)?.value).toBe(98.5);
    expect(page.loadingCells()).toBe(false);
  });

  it('renders each goal as a card that expands its own KRA table independently', () => {
    boardPayload = TWO_GOAL_BOARD;
    start(BOARD_RIGHTS);

    expect(goalCards()).toHaveLength(2);
    expect(
      Array.from(host.querySelectorAll('.entry-goal-name')).map((name) => name.textContent?.trim())
    ).toEqual(['Financial Discipline', 'Operational Excellence']);
    expect(goalHeads()[0].getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelectorAll('.entry-kra-block')).toHaveLength(2);
    expect(host.querySelectorAll('.entry-goal-body .entry-table')).toHaveLength(2);
    expect(host.querySelector('.entry-goal-body .entry-table thead th')?.textContent?.trim()).toBe('KPI');

    goalHeads()[0].click();
    fixture.detectChanges();

    expect(goalCards()).toHaveLength(2);
    expect(goalHeads()[0].getAttribute('aria-expanded')).toBe('false');
    expect(goalHeads()[1].getAttribute('aria-expanded')).toBe('true');
    // Only the collapsed goal's KRA and rows disappear.
    expect(
      Array.from(host.querySelectorAll('.entry-kra-name')).map((name) => name.textContent?.trim())
    ).toEqual(['Service Delivery']);
    expect(inputs().map((input) => input.getAttribute('aria-label'))).toEqual([
      'Actual for Application uptime',
    ]);

    goalHeads()[1].click();
    fixture.detectChanges();

    expect(host.querySelectorAll('.entry-kra-block')).toHaveLength(0);
    expect(inputs()).toHaveLength(0);

    goalHeads()[0].click();
    fixture.detectChanges();

    expect(
      Array.from(host.querySelectorAll('.entry-kra-name')).map((name) => name.textContent?.trim())
    ).toEqual(['Budget Control']);
  });

  it('keeps an unsaved value when its goal is collapsed and still saves it', () => {
    boardPayload = TWO_GOAL_BOARD;
    const page = start(BOARD_RIGHTS);

    page.setCellValue('kpi-1', 5, '77');
    fixture.detectChanges();
    expect(page.dirtyCount()).toBe(1);

    const toggleOperational = (): void => {
      const head = goalHeads().find((entry) =>
        entry.textContent?.includes('Operational Excellence')
      )!;
      head.click();
      fixture.detectChanges();
    };

    toggleOperational();
    expect(
      inputs().some((input) => input.getAttribute('aria-label') === 'Actual for Application uptime')
    ).toBe(false);

    toggleOperational();
    const restored = inputs().find(
      (input) => input.getAttribute('aria-label') === 'Actual for Application uptime'
    );
    expect(restored?.value).toBe('77');
    expect(page.dirtyCount()).toBe(1);
    expect(saveButton().disabled).toBe(false);

    saveButton().click();
    const posted = http.expectOne(
      (req) => req.method === 'POST' && req.url.endsWith('kpiactual')
    );
    expect(posted.request.body).toEqual(expect.objectContaining({ kpiId: 'kpi-1', value: 77 }));
    posted.flush(ok(SAVED));
    settle();

    expect(page.savingAll()).toBe(false);
    expect(page.dirtyCount()).toBe(0);
  });

  it('renders a division goal as a collapsible card around the existing KPI table', () => {
    const page = start(ENTRY_RIGHTS);

    expect(goalCards()).toHaveLength(1);
    expect(host.querySelector('.entry-goal-name')?.textContent?.trim()).toBe('Division Delivery Goal');
    expect(host.querySelector('.entry-goal-meta')?.textContent).toContain('Contributes to Operational Excellence');
    expect(inputs()).toHaveLength(1);
    expect(inputs()[0].value).toBe('91');
    expect(inputs()[0].disabled).toBe(false);

    goalHeads()[0].click();
    fixture.detectChanges();

    expect(goalCards()).toHaveLength(1);
    expect(host.querySelector('.entry-goal-body')).toBeNull();
    expect(inputs()).toHaveLength(0);

    goalHeads()[0].click();
    fixture.detectChanges();

    expect(inputs()).toHaveLength(1);
    expect(inputs()[0].value).toBe('91');
    expect(page.canEnter()).toBe(true);
  });

  it('keeps corporate rows read-only when the account holds no entry right', () => {
    const page = start(CORPORATE_READ_RIGHTS, []);

    expect(page.kpis().map((kpi) => kpi.id)).toEqual(['kpi-1']);
    expect(page.canEnter()).toBe(false);
    expect(page.isReadOnly()).toBe(true);
    expect(inputs()).toHaveLength(1);
    expect(inputs()[0].disabled).toBe(true);
    expect(saveButton().disabled).toBe(true);
  });

  it('lets a corporate owner enter and save its own row', () => {
    catalogPayload = [boardKpi('kpi-1', 'Application uptime', { ownerId: 'user-1' })];
    const page = start(CORPORATE_WRITE_RIGHTS, []);

    expect(page.canEnter()).toBe(true);
    expect(inputs()[0].disabled).toBe(false);

    page.setCellValue('kpi-1', 5, '42');
    fixture.detectChanges();
    expect(page.dirtyCount()).toBe(1);

    saveButton().click();
    const posted = http.expectOne(
      (req) => req.method === 'POST' && req.url.endsWith('kpiactual')
    );
    expect(posted.request.body).toEqual(
      expect.objectContaining({
        kpiId: 'kpi-1',
        fiscalPeriodId: 'fp-5',
        value: 42,
        dataSource: 'Manual',
      })
    );
    posted.flush(ok(SAVED));
    settle();

    expect(page.savingAll()).toBe(false);
    expect(page.dirtyCount()).toBe(0);
  });

  it('gives an Admin without a division every division but no entry right by viewing alone', () => {
    const page = start(PORTFOLIO_RIGHTS, []);

    expect(page.scope()).toBe('Corporate');
    expect(page.scopeOptions()).toEqual(['Corporate', 'Division']);
    switchScope('Division');

    expect(page.scope()).toBe('Division');
    const select = host.querySelector<HTMLSelectElement>('#entry-division');
    expect(select).not.toBeNull();
    expect(Array.from(select!.options).map((option) => option.value)).toEqual(['div-1', 'div-2']);
    expect(select!.value).toBe('div-1');
    expect(page.divisionPlan()?.id).toBe('plan-1');

    // The portfolio right is visibility only: entry needs the audited override right.
    expect(page.canEnter()).toBe(false);
    expect(inputs()).toHaveLength(1);
    expect(inputs()[0].disabled).toBe(true);
    expect(saveButton().disabled).toBe(true);
  });

  it('lets an Admin without a division enter through the audited override right', () => {
    const page = start(ADMIN_RIGHTS, []);

    switchScope('Division');

    expect(page.visibleDivisions().map((division) => division.id)).toEqual(['div-1', 'div-2']);
    expect(page.canEnter()).toBe(true);
    expect(inputs()[0].disabled).toBe(false);
  });

  it('lets an Admin with an assignment enter another division through the override right', () => {
    const page = start(ADMIN_RIGHTS, ['div-1']);

    switchScope('Division');
    expect(page.divisionId()).toBe('div-1');
    expect(page.canEnter()).toBe(true);
    expect(inputs()[0].disabled).toBe(false);

    switchDivision('div-2');
    expect(page.divisionPlan()?.id).toBe('plan-2');
    expect(page.cellValue('dkpi-2', 5)?.value).toBe(70);
    // The live override right is evaluated before the assigned-division restriction.
    expect(page.canEnter()).toBe(true);
    expect(inputs()).toHaveLength(1);
    expect(inputs()[0].disabled).toBe(false);
  });

  it('keeps Data Input entry on the assigned division', () => {
    const page = start(ENTRY_RIGHTS, ['div-1']);

    expect(page.visibleDivisions().map((division) => division.id)).toEqual(['div-1']);
    expect(page.canEnter()).toBe(true);
    expect(inputs()[0].disabled).toBe(false);

    // Data Input has no portfolio right, so a sibling division is never selectable.
    expect(page.visibleDivisions().some((division) => division.id === 'div-2')).toBe(false);
  });

  it('reads nothing but the board for a board account', () => {
    const page = start(BOARD_RIGHTS);

    expect(state.usesEntryScope()).toBe(true);
    expect(page.scope()).toBe('Corporate');
    expect(seenUrls.filter((url) => url.includes('entry-board'))).toHaveLength(1);
    expect(seenUrls.some((url) => url === `${API}scorecard`)).toBe(false);
    expect(seenUrls.some((url) => url.includes('/kpitarget'))).toBe(false);
    expect(seenUrls.some((url) => url.includes('scoresnapshot'))).toBe(false);
    expect(seenUrls.filter((url) => /\/kpiactual\?/.test(url))).toHaveLength(0);

    expect(page.kpis().map((kpi) => kpi.id)).toEqual(['kpi-1', 'kpi-2']);
    expect(page.cellValue('kpi-1', 5)?.value).toBe(98.5);
    expect(page.loadingCells()).toBe(false);
  });

  it('saves a corporate board row and refreshes through the board', () => {
    const page = start(BOARD_RIGHTS);

    page.setCellValue('kpi-2', 5, '12');
    fixture.detectChanges();
    expect(page.dirtyCount()).toBe(1);

    saveButton().click();
    const posted = http.expectOne(
      (req) => req.method === 'POST' && req.url.endsWith('kpiactual')
    );
    expect(posted.request.body).toEqual(
      expect.objectContaining({ kpiId: 'kpi-2', fiscalPeriodId: 'fp-5', value: 12 })
    );
    posted.flush(ok(SAVED));
    settle();

    expect(page.savingAll()).toBe(false);
    expect(seenUrls.filter((url) => url.includes('entry-board'))).toHaveLength(2);
    expect(page.dirtyCount()).toBe(0);
  });

  it('stops the grid instead of spinning when the board read fails', () => {
    const page = start(BOARD_RIGHTS);
    state.loadEntryBoard('fy-9');
    http
      .expectOne(`${API}kpiactual/entry-board?fiscalYearId=fy-9`)
      .flush(ok(null), { status: 403, statusText: 'Forbidden' });

    expect(state.error()).not.toBeNull();
    expect(page.loadingCells()).toBe(false);
  });
});
