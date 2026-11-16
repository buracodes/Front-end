import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { DivisionPlanningPage } from './division-planning';
import { DivisionService } from '../division/division.service';
import { ScorecardService } from '../scorecard/scorecard.service';
import { KPIService } from '../../core/service/kpi.service';
import { NotificationService } from '../../core/service/notification.service';
import { UserStore } from '../../core/service/user-store.service';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import { ReportService } from '../reports/report.service';
import { DivisionPlanDto, DivisionGoalDto } from '../division/division.model';
import { FiscalYear, Scorecard } from '../../core/model/scorecard.model';
import { PeriodLockStatusItem } from '../../core/model/goal.model';

const DEFAULT_PERMISSIONS = [
  'scorecard:view',
  'divisions:view',
  'divisions:plan',
  'divisions:reports.view',
  'divisions:actuals.enter',
  'reports:export',
];

const FY: FiscalYear = {
  id: 'fy-1',
  label: '2026/27',
  startDate: '2026-07-01',
  endDate: '2027-06-30',
  status: 'Active',
};

const PLAN: DivisionPlanDto = {
  id: 'plan-1',
  divisionId: 'div-1',
  divisionName: 'Retail Operations',
  scorecardId: 'sc-1',
  scorecardName: 'ECX Corporate Strategy',
  fiscalYearId: 'fy-1',
  planStatus: 'draft',
  overallScore: 96,
  contributions: [
    { goalId: 'g1', name: 'Grow revenue', weight: 100 },
    { goalId: 'g3', name: 'Improve efficiency', weight: 50 },
  ],
  availableGoals: [{ goalId: 'g2', name: 'Expand ops', weight: 100 }],
  goals: [
    {
      id: 'dg1',
      divisionPlanId: 'plan-1',
      parentGoalId: 'g1',
      parentGoalName: 'Grow revenue',
      name: 'Retail network',
      description: 'Network growth',
      contributionDescription: 'Expands trade volume in new corridors',
      weight: 100,
      score: 88,
      status: 'Green',
      kpis: [
        {
          id: 'k1',
          divisionGoalId: 'dg1',
          name: 'Branches opened',
          weight: 100,
          score: 80,
          target: 10,
          actual: 8,
          status: 'Amber',
          isActive: true,
          isCumulative: true,
        },
      ],
    },
  ] as unknown as DivisionGoalDto[],
};

const CORPORATE_SCORECARD: Scorecard = {
  id: 'sc-1',
  fiscalYearId: 'fy-1',
  name: 'ECX Corporate Strategy',
  scope: 'Corporate',
  scorecardStatus: 'Active',
};

const DIVISION_SCORECARD: Scorecard = {
  id: 'sc-2',
  fiscalYearId: 'fy-1',
  name: 'ECX Division Scorecard',
  scope: 'Division',
  scorecardStatus: 'Active',
};

describe('DivisionPlanningPage', () => {
  let divisionService: {
    getAll: ReturnType<typeof vi.fn>;
    getPlanningContext: ReturnType<typeof vi.fn>;
    setContributions: ReturnType<typeof vi.fn>;
    updateGoal: ReturnType<typeof vi.fn>;
    createGoal: ReturnType<typeof vi.fn>;
    deleteGoal: ReturnType<typeof vi.fn>;
    updateKpi: ReturnType<typeof vi.fn>;
    createKpi: ReturnType<typeof vi.fn>;
    deleteKpi: ReturnType<typeof vi.fn>;
    finalizePlan: ReturnType<typeof vi.fn>;
    getActuals: ReturnType<typeof vi.fn>;
    enterActual: ReturnType<typeof vi.fn>;
  };
  let dialog: { confirm: ReturnType<typeof vi.fn>; confirmChoice: ReturnType<typeof vi.fn> };
  let reportService: { export: ReturnType<typeof vi.fn> };
  let notifications: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let permissions: string[];
  let ownDivisionId: string | null = null;
  let scorecardGetAll: ReturnType<typeof vi.fn>;

  const userStore = {
    hasPermission: (permission: string) => permissions.includes(permission),
    divisionId: () => ownDivisionId,
    isDivisionAccount: () => ownDivisionId !== null,
  };

  const routeParams = (scorecardId: string | null) =>
    scorecardId
      ? {
          get: (key: string) => (key === 'scorecardId' ? scorecardId : null),
          getAll: () => [],
          has: (key: string) => key === 'scorecardId',
          keys: () => ['scorecardId'],
        }
      : { get: () => null, getAll: () => [], has: () => false, keys: () => [] };

  const start = (
    scorecards: Scorecard[] = [],
    granted: string[] = DEFAULT_PERMISSIONS,
    divisionId = '',
    routeScorecardId: string | null = 'sc-1',
    ownDivision: string | null = null
  ): DivisionPlanningPage => {
    permissions = granted;
    ownDivisionId = ownDivision;
    scorecardGetAll = vi.fn(() => of(scorecards));
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(routeParams(routeScorecardId)),
            snapshot: { queryParamMap: convertToParamMap(divisionId ? { divisionId } : {}) },
          },
        },
        {
          provide: ScorecardService,
          useValue: { getFiscalYears: () => of([FY]), getAll: scorecardGetAll },
        },
        { provide: DivisionService, useValue: divisionService },
        { provide: KPIService, useValue: { getLockStatus: () => of({ periods: [] }) } },
        { provide: NotificationService, useValue: notifications },
        { provide: ConfirmDialogService, useValue: dialog },
        { provide: ReportService, useValue: reportService },
        { provide: UserStore, useValue: userStore },
      ],
    });
    return TestBed.runInInjectionContext(() => new DivisionPlanningPage());
  };

  beforeEach(() => {
    permissions = DEFAULT_PERMISSIONS;
    divisionService = {
      getAll: vi.fn(() => of([])),
      getPlanningContext: vi.fn(() => of(PLAN)),
      setContributions: vi.fn(() => of(PLAN)),
      updateGoal: vi.fn(() => of({})),
      createGoal: vi.fn(() => of({})),
      deleteGoal: vi.fn(() => of(true)),
      updateKpi: vi.fn(() => of({})),
      createKpi: vi.fn(() => of({})),
      deleteKpi: vi.fn(() => of(true)),
      finalizePlan: vi.fn(() => of({})),
      getActuals: vi.fn(() => of([])),
      enterActual: vi.fn(() => of({})),
    };
    dialog = {
      confirm: vi.fn(() => Promise.resolve(false)),
      confirmChoice: vi.fn(() => Promise.resolve('cancel' as const)),
    };
    reportService = { export: vi.fn(() => of(new Blob(['x']))) };
    notifications = { success: vi.fn(), error: vi.fn() };
    router = { navigate: vi.fn(() => Promise.resolve(true)) };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads the plan from the route scorecard and exposes it', () => {
    const page = start();

    expect(page.plan()?.divisionName).toBe('Retail Operations');
    expect(divisionService.getPlanningContext).toHaveBeenCalledTimes(1);
  });

  it('opens the first corporate scorecard when the route has no scorecard id', () => {
    start([CORPORATE_SCORECARD], DEFAULT_PERMISSIONS, '', null);

    expect(router.navigate).toHaveBeenCalledWith(
      ['/division-planning', 'sc-1'],
      expect.objectContaining({ replaceUrl: true })
    );
  });

  it('reports when no corporate scorecard exists to plan', () => {
    const page = start([], DEFAULT_PERMISSIONS, '', null);

    expect(page.loadError()).toContain('No corporate scorecard is available');
  });

  it('keeps the planning surface closed to principals without divisions:plan', () => {
    const page = start(
      [CORPORATE_SCORECARD],
      ['division:scorecard.view', 'division:performance.view'],
      '',
      'sc-1'
    );

    expect(page.canPlan()).toBe(false);
    expect(page.canEdit()).toBe(false);
    // The corporate scorecard catalog is not even requested for a non-planner.
    expect(scorecardGetAll).not.toHaveBeenCalled();
  });

  it('offers only corporate scorecards in the scorecard picker', () => {
    const page = start([DIVISION_SCORECARD, CORPORATE_SCORECARD]);

    expect(page.scorecards().map((s) => s.id)).toEqual(['sc-1']);
    expect(divisionService.getPlanningContext).toHaveBeenCalledTimes(1);
  });

  it('redirects a division-scope route scorecard to the corporate scorecard of the same fiscal year', () => {
    start([
      { ...CORPORATE_SCORECARD, scope: 'Division', name: 'ECX Division Scorecard' },
      { ...CORPORATE_SCORECARD, id: 'sc-8', name: 'Corporate 2026' },
      { ...CORPORATE_SCORECARD, id: 'sc-9', fiscalYearId: 'fy-9', name: 'Corporate 2027' },
    ]);

    expect(router.navigate).toHaveBeenCalledWith(['/division-planning', 'sc-8'], { replaceUrl: true });
    expect(divisionService.getPlanningContext).not.toHaveBeenCalled();
  });

  it('falls back to the first corporate scorecard when none shares the fiscal year', () => {
    start([
      { ...CORPORATE_SCORECARD, scope: 'Division', name: 'ECX Division Scorecard' },
      { ...CORPORATE_SCORECARD, id: 'sc-9', fiscalYearId: 'fy-9', name: 'Corporate 2027' },
    ]);

    expect(router.navigate).toHaveBeenCalledWith(['/division-planning', 'sc-9'], { replaceUrl: true });
    expect(divisionService.getPlanningContext).not.toHaveBeenCalled();
  });

  it('treats the API camelCase status "draft" as editable', () => {
    const page = start();

    expect(page.plan()?.planStatus).toBe('draft');
    expect(page.planStatus()).toBe('Draft');
    expect(page.canEdit()).toBe(true);
  });

  it('normalizes finalized and locked statuses; only the FR-308 lock blocks editing', () => {
    const page = start();
    const planSignal = (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan;

    // The FRD does not require reopening a finalized plan to edit its structure.
    planSignal.set({ ...PLAN, planStatus: 'finalized' });
    expect(page.planStatus()).toBe('Finalized');
    expect(page.canEdit()).toBe(true);

    planSignal.set({ ...PLAN, planStatus: 'locked' });
    expect(page.planStatus()).toBe('Locked');
    expect(page.canEdit()).toBe(false);
  });

  it('keeps contribution edits available on a finalized plan but not on a locked one', () => {
    const page = start();
    const planSignal = (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan;

    planSignal.set({ ...PLAN, planStatus: 'finalized' });
    // FR-907 only asks for the selection to be changeable with a warning; the plan
    // stays finalized so Data Input Users do not lose entry access.
    expect(page.canEditContributions()).toBe(true);

    planSignal.set({ ...PLAN, planStatus: 'locked' });
    expect(page.canEditContributions()).toBe(false);
  });

  it('sends a finalized plan contribution change instead of silently ignoring the tick', async () => {
    const page = start();
    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({
      ...PLAN,
      planStatus: 'finalized',
    });

    await page.toggleContribution('g2', true);

    expect(divisionService.setContributions).toHaveBeenCalledWith({
      divisionId: 'div-1',
      scorecardId: 'sc-1',
      goalIds: ['g1', 'g3', 'g2'],
      cascadeRemoveDependents: false,
    });
  });

  it('ignores contribution ticks on a locked plan', async () => {
    const page = start();
    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({
      ...PLAN,
      planStatus: 'locked',
    });

    await page.toggleContribution('g2', true);

    expect(divisionService.setContributions).not.toHaveBeenCalled();
  });

  it('seeds the linked-goal selection from persisted contributions on load', () => {
    const page = start();

    expect([...page.selectedIds()].sort()).toEqual(['g1', 'g3']);
    expect(page.selectedCorporateGoalCount()).toBe(2);
    expect(page.selectionSaving()).toBe(false);
  });

  it('lists every corporate goal with its persisted contributed state', () => {
    const page = start();

    expect(page.corporateGoals().map((g) => g.id)).toEqual(['g1', 'g3', 'g2']);
    expect(page.corporateGoals()[0]).toMatchObject({ name: 'Grow revenue', contributesTo: true });
    expect(page.corporateGoals()[2]).toMatchObject({ name: 'Expand ops', contributesTo: false });
  });

  it('persists a ticked corporate goal immediately without a save step', async () => {
    const page = start();

    await page.toggleContribution('g2', true);

    const sent = divisionService.setContributions.mock.calls[0][0];
    expect(sent).toMatchObject({
      divisionId: 'div-1',
      scorecardId: 'sc-1',
      cascadeRemoveDependents: false,
    });
    expect([...sent.goalIds].sort()).toEqual(['g1', 'g2', 'g3']);
    // The checkbox itself reflects the save; a contribution tick shows no toast.
    expect(notifications.success).not.toHaveBeenCalled();
    // The page reloads the plan so the checklist reflects what the backend stored.
    expect(divisionService.getPlanningContext).toHaveBeenCalledTimes(2);
  });

  it('unticks a corporate goal that owns no division goals without asking', async () => {
    const page = start();

    await page.toggleContribution('g3', false);

    expect(dialog.confirmChoice).not.toHaveBeenCalled();
    expect(divisionService.setContributions).toHaveBeenCalledWith({
      divisionId: 'div-1',
      scorecardId: 'sc-1',
      goalIds: ['g1'],
      cascadeRemoveDependents: false,
    });
  });

  it('rolls a failed auto-save back to the persisted selection', async () => {
    const page = start();
    divisionService.setContributions.mockReturnValueOnce(throwError(() => new Error('boom')));

    await page.toggleContribution('g2', true);

    expect(notifications.error).toHaveBeenCalled();
    expect([...page.selectedIds()].sort()).toEqual(['g1', 'g3']);
    expect(page.selectionSaving()).toBe(false);
  });

  it('refuses to link a corporate goal before a division is selected', async () => {
    const page = start();
    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({
      ...PLAN,
      divisionId: '',
      divisionName: '',
    });

    expect(page.hasDivision()).toBe(false);
    await page.toggleContribution('g2', true);

    expect(divisionService.setContributions).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith('Select a division before linking corporate goals.');
  });

  it('defaults the division filter to the first division so goals can be linked', () => {
    divisionService.getAll.mockReturnValue(
      of([
        { id: 'div-2', name: 'Beta Division' },
        { id: 'div-1', name: 'Alpha Division' },
      ])
    );

    const page = start();

    expect(page.divisions().map((d) => d.id)).toEqual(['div-1', 'div-2']);
    expect(page.divisionFilter()).toBe('div-1');
    expect(divisionService.getPlanningContext).toHaveBeenCalledWith(
      'sc-1',
      expect.anything(),
      'div-1'
    );
  });

  // ── Select All ─────────────────────────────────────────────────────────

  it('links every corporate goal in one update when Select All is ticked', async () => {
    const page = start();

    await page.toggleAllContributions(true);

    expect(divisionService.setContributions).toHaveBeenCalledTimes(1);
    expect(divisionService.setContributions).toHaveBeenCalledWith({
      divisionId: 'div-1',
      scorecardId: 'sc-1',
      goalIds: ['g1', 'g3', 'g2'],
      cascadeRemoveDependents: false,
    });
    // The saved plan is reloaded so the checklist and Select All reflect the backend.
    expect(divisionService.getPlanningContext).toHaveBeenCalledTimes(2);
  });

  it('reports Select All as indeterminate while only some goals are linked', () => {
    const page = start();
    const selectedIds = (page as unknown as {
      selectedIds: { set: (s: Set<string>) => void };
    }).selectedIds;

    expect(page.allCorporateGoalsSelected()).toBe(false);
    expect(page.corporateSelectionIndeterminate()).toBe(true);

    selectedIds.set(new Set(['g1', 'g3', 'g2']));
    expect(page.allCorporateGoalsSelected()).toBe(true);
    expect(page.corporateSelectionIndeterminate()).toBe(false);
  });

  it('asks before clearing all goals when one of them owns division goals', async () => {
    const page = start();
    dialog.confirmChoice.mockResolvedValue('cancel');

    await page.toggleAllContributions(false);

    expect(dialog.confirmChoice).toHaveBeenCalled();
    expect(divisionService.setContributions).not.toHaveBeenCalled();
    expect([...page.selectedIds()].sort()).toEqual(['g1', 'g3']);
  });

  it('unlinks every goal with a cascade once the user confirms', async () => {
    const page = start();
    dialog.confirmChoice.mockResolvedValue('confirm');

    await page.toggleAllContributions(false);

    expect(divisionService.setContributions).toHaveBeenCalledWith({
      divisionId: 'div-1',
      scorecardId: 'sc-1',
      goalIds: [],
      cascadeRemoveDependents: true,
    });
  });

  it('does not call the API when every goal is already selected and Select All is ticked', async () => {
    const page = start();
    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({
      ...PLAN,
      contributions: [
        { goalId: 'g1', name: 'Grow revenue', weight: 100 },
        { goalId: 'g2', name: 'Expand ops', weight: 100 },
        { goalId: 'g3', name: 'Improve efficiency', weight: 100 },
        { goalId: 'g4', name: 'Extra goal', weight: 100 },
      ],
      availableGoals: [],
    });

    await page.toggleAllContributions(true);

    expect(divisionService.setContributions).not.toHaveBeenCalled();
  });

  // ── Collapsible division goal cards ────────────────────────────────────

  it('collapses and re-expands each division goal independently', () => {
    const page = start();
    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({
      ...PLAN,
      goals: [
        PLAN.goals[0],
        { ...PLAN.goals[0], id: 'dg2', name: 'Trade finance' } as DivisionGoalDto,
      ],
    });

    expect(page.isGoalExpanded('dg1')).toBe(true);
    expect(page.isGoalExpanded('dg2')).toBe(true);

    page.toggleGoal('dg1');
    expect(page.isGoalExpanded('dg1')).toBe(false);
    expect(page.isGoalExpanded('dg2')).toBe(true);

    page.toggleGoal('dg1');
    expect(page.isGoalExpanded('dg1')).toBe(true);
  });

  // ── Division picker ────────────────────────────────────────────────────

  it('filters the division picker by name and shows the selected division', () => {
    divisionService.getAll.mockReturnValue(
      of([
        { id: 'div-2', name: 'Beta Division' },
        { id: 'div-1', name: 'Alpha Division' },
      ])
    );

    const page = start();

    expect(page.selectedDivisionName()).toBe('Alpha Division');

    page.divisionSearch.set('beta');
    expect(page.filteredDivisions().map((d) => d.id)).toEqual(['div-2']);

    page.divisionSearch.set('   ');
    expect(page.filteredDivisions()).toHaveLength(2);
  });

  it('clears the previous division plan and goal selection when the division changes', () => {
    divisionService.getAll.mockReturnValue(
      of([
        { id: 'div-1', name: 'Alpha Division' },
        { id: 'div-2', name: 'Beta Division' },
      ])
    );
    divisionService.getPlanningContext.mockImplementation(
      (_scorecardId: string, _query: unknown, divisionId?: string) =>
        of(
          divisionId === 'div-2'
            ? {
                ...PLAN,
                divisionId: 'div-2',
                divisionName: 'Beta Division',
                contributions: [],
                availableGoals: [],
                goals: [],
              }
            : PLAN
        )
    );

    const page = start();
    page.toggleGoal('dg1');

    page.selectDivision('div-2');

    expect(divisionService.getPlanningContext).toHaveBeenLastCalledWith(
      'sc-1',
      expect.anything(),
      'div-2'
    );
    expect(page.plan()?.divisionId).toBe('div-2');
    expect(page.selectedIds().size).toBe(0);
    // Collapse state does not leak between divisions.
    expect(page.isGoalExpanded('dg1')).toBe(true);
    expect(page.divisionPickerOpen()).toBe(false);
  });

  it('ignores a division re-selection of the division already loaded', () => {
    divisionService.getAll.mockReturnValue(of([{ id: 'div-1', name: 'Alpha Division' }]));
    const page = start();

    page.selectDivision('div-1');

    expect(divisionService.getPlanningContext).toHaveBeenCalledTimes(1);
  });

  it('surfaces the currently linked corporate goals for the goal-modal picker', () => {
    const page = start();

    expect(page.selectedCorporateGoals().map((g) => g.id)).toEqual(['g1', 'g3']);
    expect(page.goalParentOptions().map((g) => g.id)).toEqual(['g1', 'g3']);
  });

  it('does not open the goal modal when no corporate goal is linked', () => {
    const page = start();
    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({
      ...PLAN,
      contributions: [],
      goals: [],
    });
    (page as unknown as { selectedIds: { set: (s: Set<string>) => void } }).selectedIds.set(new Set());

    page.openCreateGoal();

    expect(page.goalModalOpen()).toBe(false);
    expect(notifications.error).toHaveBeenCalled();
  });

  it('defaults a new division goal to the first linked goal and the remaining weight', () => {
    const page = start();
    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({
      ...PLAN,
      goals: [{ ...PLAN.goals[0], weight: 60 }],
    });

    page.openCreateGoal();

    expect(page.goalModalOpen()).toBe(true);
    expect(page.goalForm.controls.parentGoalId.value).toBe('g1');
    expect(page.goalForm.controls.weight.value).toBe(40);
  });

  it('creates a goal under an already-saved contribution without flushing the selection', () => {
    const page = start();
    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({
      ...PLAN,
      goals: [{ ...PLAN.goals[0], weight: 60 }],
    });

    page.openCreateGoal();
    page.goalForm.patchValue({ name: 'Network goal', weight: 40 });
    page.submitGoal();

    expect(divisionService.setContributions).not.toHaveBeenCalled();
    expect(divisionService.createGoal).toHaveBeenCalledWith(
      expect.objectContaining({ parentGoalId: 'g1' })
    );
  });

  it('refuses to create a goal whose corporate goal is not linked yet', () => {
    const page = start();
    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({
      ...PLAN,
      contributions: [],
      goals: [],
    });
    (page as unknown as { selectedIds: { set: (s: Set<string>) => void } }).selectedIds.set(new Set(['g2']));

    page.openCreateGoal();
    expect(page.goalForm.controls.parentGoalId.value).toBe('g2');

    page.goalForm.patchValue({ name: 'New goal', weight: 40 });
    page.submitGoal();

    expect(notifications.error).toHaveBeenCalled();
    expect(divisionService.setContributions).not.toHaveBeenCalled();
    expect(divisionService.createGoal).not.toHaveBeenCalled();
  });

  it('normalizes the capitalized backend rag status to lowercase', () => {
    const page = start();

    expect(page.divisionGoals()[0].status).toBe('green');
    expect(page.divisionGoals()[0].kpis[0].status).toBe('amber');

    const goalRow = page.reportGoalRows()[0];
    expect(goalRow.status).toBe('green');
  });

  it('builds a goal row followed by its KPI rows with target, actual, score and status', () => {
    const page = start();

    const rows = page.reportGoalRows();
    expect(rows.map((r) => [r.kind, r.name])).toEqual([
      ['goal', 'Retail network'],
      ['kpi', 'Branches opened'],
    ]);
    expect(rows[0]).toMatchObject({ weight: 100, score: 88, status: 'green', progress: 88 });
    expect(rows[1]).toMatchObject({
      parentName: 'Retail network',
      weight: 100,
      target: 10,
      actual: 8,
      score: 80,
      status: 'amber',
      progress: 80,
    });
  });

  it('sums division goal weights so below-100 totals can be normalized', () => {
    const page = start();
    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({
      ...PLAN,
      goals: [
        { ...PLAN.goals[0], weight: 40 },
        { ...PLAN.goals[0], id: 'dg2', name: 'Service quality', weight: 30 },
      ],
    });

    expect(page.divisionGoalWeightTotal()).toBe(70);
    // Below-100 totals are legal while planning; scores normalize proportionally.
    expect(page.canEdit()).toBe(true);
  });

  it('clamps report progress bars to the 0-100 range', () => {
    const page = start();
    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({
      ...PLAN,
      goals: [
        {
          ...PLAN.goals[0],
          score: 140,
          kpis: [{ ...PLAN.goals[0].kpis[0], score: -5 }],
        },
      ],
    });

    const rows = page.reportGoalRows();
    expect(rows[0].progress).toBe(100);
    expect(rows[1].progress).toBe(0);
  });

  it('formats report target/actual values and scores with placeholders', () => {
    const page = start();

    expect(page.reportValue(8, '%')).toBe('8 %');
    expect(page.reportValue(8)).toBe('8');
    expect(page.reportValue(null, '%')).toBe('—');
    expect(page.reportScore(80)).toBe('80%');
    expect(page.reportScore(null)).toBe('—');
  });

  it('derives the overall rag from the 95/70 thresholds', () => {
    const page = start();

    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({ ...PLAN, overallScore: 96 });
    expect(page.overallStatus()).toBe('green');

    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({ ...PLAN, overallScore: 80 });
    expect(page.overallStatus()).toBe('amber');

    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({ ...PLAN, overallScore: 40 });
    expect(page.overallStatus()).toBe('red');
  });

  it('renders the overall-score doughnut in its RAG colour against the remainder', () => {
    const page = start();

    const segments = page.donutSegments();
    expect(segments).toHaveLength(2);
    expect(segments[0].color).toBe('#16A34A');
    expect(segments[1].color).toBe('#E3EAE0');
    expect(segments[0].dash + segments[0].gap + segments[1].dash + segments[1].gap).toBeCloseTo(1, 3);
    expect(segments[0].dash).toBeCloseTo(0.952, 3);

    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({ ...PLAN, overallScore: 40 });
    expect(page.donutSegments()[0].color).toBe('#DC2626');
    expect(page.donutSegments()[0].dash).toBeCloseTo(0.392, 3);
  });

  it('defaults to the YTD period filter', () => {
    const page = start();

    expect(page.periodFilter()).toEqual({ type: 'Ytd' });
    expect((page as unknown as { periodQuery: () => unknown }).periodQuery()).toEqual({
      periodType: 'Ytd',
    });
  });

  it('maps the selected period filter to the backend query', () => {
    const page = start();

    page.onPeriodFilterChange({ type: 'Quarter', quarter: 2 });
    expect((page as unknown as { periodQuery: () => unknown }).periodQuery()).toEqual({
      periodType: 'Quarter',
      quarter: 2,
    });

    page.onPeriodFilterChange({ type: 'Month', fromMonth: 3, toMonth: 6 });
    expect((page as unknown as { periodQuery: () => unknown }).periodQuery()).toEqual({
      periodType: 'Month',
      fromMonth: 3,
      toMonth: 6,
      year: 2026,
    });

    page.onPeriodFilterChange({ type: 'Year', fiscalYearId: 'fy-1' });
    expect((page as unknown as { periodQuery: () => unknown }).periodQuery()).toEqual({
      periodType: 'Year',
      year: 2026,
    });

    page.onPeriodFilterChange({ type: 'Ytd' });
    expect((page as unknown as { periodQuery: () => unknown }).periodQuery()).toEqual({
      periodType: 'Ytd',
    });
  });

  it('normalizes an inverted month range before querying', () => {
    const page = start();

    page.onPeriodFilterChange({ type: 'Month', fromMonth: 11, toMonth: 2 });

    expect((page as unknown as { periodQuery: () => unknown }).periodQuery()).toEqual({
      periodType: 'Month',
      fromMonth: 2,
      toMonth: 11,
      year: 2026,
    });
  });

  it('treats a month filter without a To month as a single month', () => {
    const page = start();

    page.onPeriodFilterChange({ type: 'Month', fromMonth: 3 });

    expect((page as unknown as { periodQuery: () => unknown }).periodQuery()).toEqual({
      periodType: 'Month',
      fromMonth: 3,
      toMonth: 3,
      year: 2026,
    });
  });

  it('labels period columns with the selected month, quarter or YTD', () => {
    const page = start();
    const label = () => (page as unknown as { periodColumnLabel: () => string }).periodColumnLabel();

    expect(label()).toBe('YTD');
    page.onPeriodFilterChange({ type: 'Month', fromMonth: 3 });
    expect(label()).toBe('September');
    page.onPeriodFilterChange({ type: 'Quarter', quarter: 2 });
    expect(label()).toBe('Q2');
  });

  it('builds the report from the division goals and their KPIs with normalized rag', () => {
    const page = start();

    const rows = page.reportGoalRows();
    expect(rows.map((r) => r.name)).toEqual(['Retail network', 'Branches opened']);
    expect(rows[0].weight).toBe(100);
    expect(rows[0].score).toBe(88);
    expect(rows[0].status).toBe('green');
    expect(rows[1].status).toBe('amber');
  });

  it('asks for confirmation before cascading a removal that owns division goals', async () => {
    const page = start();
    dialog.confirmChoice.mockResolvedValue('cancel');

    // g1 is the parent of the plan's only division goal.
    await page.toggleContribution('g1', false);

    expect(dialog.confirmChoice).toHaveBeenCalled();
    expect(divisionService.setContributions).not.toHaveBeenCalled();
    expect([...page.selectedIds()].sort()).toEqual(['g1', 'g3']);
  });

  it('cascades removal once the user confirms deletion', async () => {
    const page = start();
    dialog.confirmChoice.mockResolvedValue('confirm');

    await page.toggleContribution('g1', false);

    expect(divisionService.setContributions).toHaveBeenCalledWith({
      divisionId: 'div-1',
      scorecardId: 'sc-1',
      goalIds: ['g3'],
      cascadeRemoveDependents: true,
    });
  });

  it('keeps division goals and KPIs when the user chooses keep', async () => {
    const page = start();
    dialog.confirmChoice.mockResolvedValue('extra');

    await page.toggleContribution('g1', false);

    expect(divisionService.setContributions).toHaveBeenCalledWith({
      divisionId: 'div-1',
      scorecardId: 'sc-1',
      goalIds: ['g3'],
      cascadeRemoveDependents: false,
    });
  });

  it('does not export without a loaded plan', () => {
    const page = start();

    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set(null);

    page.exportPlan('pdf', { stopPropagation: () => {} } as Event);
    expect(reportService.export).not.toHaveBeenCalled();
  });

  it('exports the current period on the division-performance template', () => {
    const page = start();

    page.onPeriodFilterChange({ type: 'Quarter', quarter: 4 });
    page.exportPlan('xlsx', { stopPropagation: () => {} } as Event);

    expect(reportService.export).toHaveBeenCalledWith(
      expect.objectContaining({
        reportType: 'division-performance',
        scorecardId: 'sc-1',
        fiscalYearId: 'fy-1',
        divisionId: 'div-1',
        granularity: 'quarter',
        quarter: 4,
      }),
      'xlsx'
    );
  });

  // ── Permission gating and entry windows ─────────────────────────────────

  it('blocks plan editing without divisions:plan even while the plan is a draft', () => {
    const page = start([], ['divisions:view', 'divisions:reports.view']);

    expect(page.planStatus()).toBe('Draft');
    expect(page.canPlan()).toBe(false);
    expect(page.canEdit()).toBe(false);

    page.openCreateGoal();
    expect(page.goalModalOpen()).toBe(false);
    expect(page.openCreateKpi(page.divisionGoals()[0])).toBeUndefined();
    expect(page.kpiModalOpen()).toBe(false);
  });

  it('hides the division report and export without their own permissions', () => {
    const page = start([], ['divisions:view', 'divisions:plan']);

    expect(page.canViewReport()).toBe(false);
    expect(page.canExportReport()).toBe(false);

    page.exportPlan('pdf', { stopPropagation: () => {} } as Event);
    expect(reportService.export).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith('You do not have permission to export reports.');
  });

  it('requires reports:export in addition to report visibility before exporting', () => {
    const page = start([], ['divisions:view', 'divisions:reports.view']);

    expect(page.canViewReport()).toBe(true);
    expect(page.canExportReport()).toBe(false);

    page.exportPlan('pdf', { stopPropagation: () => {} } as Event);
    expect(reportService.export).not.toHaveBeenCalled();
  });

  it('requires divisions:actuals.enter in addition to a finalized plan', () => {
    const page = start([], ['divisions:view', 'divisions:plan']);
    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({
      ...PLAN,
      planStatus: 'finalized',
    });

    expect(page.planStatus()).toBe('Finalized');
    expect(page.canEnterActuals()).toBe(false);
  });

  const lock = (
    fiscalMonth: number,
    state: 'open' | 'notYetOpen' | 'locked'
  ): PeriodLockStatusItem => ({
    fiscalPeriodId: `p${fiscalMonth}`,
    fiscalMonth,
    quarter: Math.floor((fiscalMonth - 1) / 3) + 1,
    isQuarterEnd: fiscalMonth % 3 === 0,
    isYearEnd: fiscalMonth === 12,
    state,
    effectiveEntryOpenDate: '2026-07-01',
    effectiveCutoffDate: '2026-12-31',
    effectiveEntryOpenDay: 1,
    effectiveCutoffDay: 31,
    effectiveReminderDaysBeforeCutoff: 3,
    hasExplicitOverride: false,
  });

  it('treats only open periods with a fiscal period id as enterable', () => {
    const page = start();
    const locks = (page as unknown as {
      periodLocks: { set: (m: Map<number, PeriodLockStatusItem>) => void };
    }).periodLocks;

    locks.set(
      new Map([
        [1, lock(1, 'notYetOpen')],
        [2, lock(2, 'locked')],
        [3, lock(3, 'open')],
      ])
    );

    expect(page.isEntryOpen(1)).toBe(false);
    expect(page.isEntryOpen(2)).toBe(false);
    expect(page.isEntryOpen(3)).toBe(true);
    expect(page.isEntryOpen(null)).toBe(false);
  });

  it('surfaces the API message when finalizing a plan fails', async () => {
    const page = start();
    dialog.confirm.mockResolvedValueOnce(true);
    divisionService.finalizePlan.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { detail: 'Add at least one KPI to the division goal “Retail network” before finalizing this plan.' },
          })
      )
    );

    await page.finalizePlan();

    expect(notifications.error).toHaveBeenCalledWith(
      'Add at least one KPI to the division goal “Retail network” before finalizing this plan.'
    );
  });

  it('rejects a KPI weight of zero so it matches the database check constraint', () => {
    const page = start();
    page.openCreateKpi(page.divisionGoals()[0]);
    page.kpiForm.controls.name.setValue('Zero weight KPI');
    page.kpiForm.controls.weight.setValue(0);

    expect(page.kpiForm.controls.weight.hasError('min')).toBe(true);
    page.submitKpi();
    expect(divisionService.createKpi).not.toHaveBeenCalled();
  });

  // ── Division KPI form mirrors the corporate KPI form ────────────────────

  const openKpiModal = (page: DivisionPlanningPage): DivisionPlanningPage => {
    // Leave room in the goal's 100% weight budget so the new KPI passes the
    // positive-weight rule (the DB rejects a zero-weight KPI).
    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({
      ...PLAN,
      goals: [{ ...PLAN.goals[0], kpis: [{ ...PLAN.goals[0].kpis[0], weight: 40 }] }],
    });
    page.openCreateKpi(page.divisionGoals()[0]);
    page.kpiForm.controls.name.setValue('Branches opened');
    return page;
  };

  it('submits a KPI without owner or target fields', () => {
    const page = start();
    openKpiModal(page);

    page.submitKpi();

    expect(divisionService.createKpi).toHaveBeenCalledTimes(1);
    const sent = divisionService.createKpi.mock.calls[0][0];
    expect(sent).toEqual(
      expect.objectContaining({
        divisionId: 'div-1',
        scorecardId: 'sc-1',
        divisionGoalId: 'dg1',
        name: 'Branches opened',
      })
    );
    expect(sent).not.toHaveProperty('ownerId');
    expect(sent).not.toHaveProperty('divisionOwnerId');
    expect(sent).not.toHaveProperty('targets');
  });

  it('opens the KPI modal on the corporate goal with the remaining goal weight', () => {
    const page = start();
    openKpiModal(page);

    expect(page.kpiModalOpen()).toBe(true);
    expect(page.kpiParentGoal()?.id).toBe('dg1');
    expect(page.kpiParentGoal()?.parentGoalName).toBe('Grow revenue');
    expect(page.kpiForm.controls.weight.value).toBe(60);
    expect('divisionOwnerId' in page.kpiForm.controls).toBe(false);
  });

  it('tolerates a goal payload that omits KPIs', () => {
    const page = start();
    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({
      ...PLAN,
      goals: [{ ...PLAN.goals[0], kpis: undefined } as unknown as DivisionGoalDto],
    });

    expect(page.divisionGoals()[0].kpis).toEqual([]);
  });

  it('retries the plan load after a failure', () => {
    divisionService.getPlanningContext.mockReturnValueOnce(throwError(() => new Error('down')));

    const page = start();
    expect(page.loadError()).toBeTruthy();

    page.retryLoad();

    expect(divisionService.getPlanningContext).toHaveBeenCalledTimes(2);
    expect(page.loadError()).toBeNull();
  });

  // ── Division KPI target configuration (reuses /target-config) ───────────

  it('opens the corporate target page for a division KPI and returns to this plan', () => {
    const page = start([], [...DEFAULT_PERMISSIONS, 'targets:edit']);

    page.openKpiTargets(page.divisionGoals()[0].kpis[0]);

    expect(router.navigate).toHaveBeenCalledWith(['/target-config'], {
      queryParams: {
        kpiId: 'k1',
        scorecardId: 'sc-1',
        fiscalYearId: 'fy-1',
        returnUrl: '/division-planning/sc-1?divisionId=div-1',
      },
    });
  });

  it('requires targets:edit before opening target configuration', () => {
    const page = start();

    expect(page.canConfigureTargets()).toBe(false);
    page.openKpiTargets(page.divisionGoals()[0].kpis[0]);

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('restores the division selected before opening target configuration', () => {
    divisionService.getAll.mockReturnValue(
      of([
        { id: 'div-1', name: 'Alpha Division' },
        { id: 'div-2', name: 'Beta Division' },
      ])
    );
    divisionService.getPlanningContext.mockReturnValue(
      of({ ...PLAN, divisionId: 'div-2', divisionName: 'Beta Division' })
    );

    const page = start([], DEFAULT_PERMISSIONS, 'div-2');

    expect(page.divisionFilter()).toBe('div-2');
    expect(divisionService.getPlanningContext).toHaveBeenCalledWith(
      'sc-1',
      expect.anything(),
      'div-2'
    );
  });

  it('keeps target configuration available on a finalized plan but not on a locked one', () => {
    const page = start([], [...DEFAULT_PERMISSIONS, 'targets:edit']);
    const planSignal = (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan;

    planSignal.set({ ...PLAN, planStatus: 'finalized' });
    page.openKpiTargets(page.divisionGoals()[0].kpis[0]);
    expect(router.navigate).toHaveBeenCalled();

    router.navigate.mockClear();
    planSignal.set({ ...PLAN, planStatus: 'locked' });
    page.openKpiTargets(page.divisionGoals()[0].kpis[0]);
    expect(router.navigate).not.toHaveBeenCalled();
  });
});