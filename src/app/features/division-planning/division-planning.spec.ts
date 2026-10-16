import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { DivisionPlanningPage } from './division-planning';
import { DivisionService } from '../division/division.service';
import { ScorecardService } from '../scorecard/scorecard.service';
import { KPIService } from '../../core/service/kpi.service';
import { NotificationService } from '../../core/service/notification.service';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import { ReportService } from '../reports/report.service';
import { DivisionPlanDto, DivisionGoalDto } from '../division/division.model';
import { FiscalYear } from '../../core/model/scorecard.model';

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
  fiscalPeriods: Array.from({ length: 12 }, (_, i) => ({
    id: `p${i + 1}`,
    fiscalMonth: i + 1,
    quarter: Math.floor(i / 3) + 1,
    isQuarterEnd: (i + 1) % 3 === 0,
    isYearEnd: i + 1 === 12,
  })),
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
          targets: [
            ...Array.from({ length: 12 }, (_, i) => ({
              fiscalPeriodId: `p${i + 1}`,
              fiscalMonth: i + 1,
              quarter: Math.floor(i / 3) + 1,
              granularity: 'Monthly' as const,
              targetValue: 5,
            })),
            { fiscalPeriodId: 'p3', fiscalMonth: 3, quarter: 1, granularity: 'Quarterly' as const, targetValue: 15 },
            { fiscalPeriodId: 'p6', fiscalMonth: 6, quarter: 2, granularity: 'Quarterly' as const, targetValue: 15 },
            { fiscalPeriodId: 'p9', fiscalMonth: 9, quarter: 3, granularity: 'Quarterly' as const, targetValue: 15 },
            { fiscalPeriodId: 'p12', fiscalMonth: 12, quarter: 4, granularity: 'Quarterly' as const, targetValue: 15 },
            { fiscalPeriodId: 'p12', fiscalMonth: 12, quarter: 4, granularity: 'Annual' as const, targetValue: 60 },
          ],
        },
      ],
    },
  ] as unknown as DivisionGoalDto[],
};

const paramMap = {
  get: (key: string) => (key === 'scorecardId' ? 'sc-1' : null),
  getAll: () => [],
  has: (key: string) => key === 'scorecardId',
  keys: () => ['scorecardId'],
};

describe('DivisionPlanningPage', () => {
  let divisionService: {
    getAll: ReturnType<typeof vi.fn>;
    getPlanContextByScorecard: ReturnType<typeof vi.fn>;
    setContributions: ReturnType<typeof vi.fn>;
    createGoal: ReturnType<typeof vi.fn>;
    createKpi: ReturnType<typeof vi.fn>;
    updateKpi: ReturnType<typeof vi.fn>;
  } & Record<string, unknown>;
  let dialog: { confirm: ReturnType<typeof vi.fn>; confirmChoice: ReturnType<typeof vi.fn> };
  let reportService: { export: ReturnType<typeof vi.fn> };
  let notifications: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const start = (): DivisionPlanningPage => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(paramMap) } },
        { provide: ScorecardService, useValue: { getFiscalYears: () => of([FY]), getAll: () => of([]) } },
        { provide: DivisionService, useValue: divisionService },
        { provide: KPIService, useValue: { getLockStatus: () => of({ periods: [] }) } },
        { provide: NotificationService, useValue: notifications },
        { provide: ConfirmDialogService, useValue: dialog },
        { provide: ReportService, useValue: reportService },
      ],
    });
    return TestBed.runInInjectionContext(() => new DivisionPlanningPage());
  };

  beforeEach(() => {
    divisionService = {
      getAll: vi.fn(() => of([])),
      getPlanContextByScorecard: vi.fn(() => of(PLAN)),
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
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads the plan from the route scorecard and exposes it', () => {
    const page = start();

    expect(page.plan()?.divisionName).toBe('Retail Operations');
    expect(divisionService.getPlanContextByScorecard).toHaveBeenCalledTimes(1);
  });

  it('treats the API camelCase status "draft" as editable', () => {
    const page = start();

    expect(page.plan()?.planStatus).toBe('draft');
    expect(page.planStatus()).toBe('Draft');
    expect(page.canEdit()).toBe(true);
  });

  it('normalizes finalized and locked statuses and blocks editing', () => {
    const page = start();
    const planSignal = (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan;

    planSignal.set({ ...PLAN, planStatus: 'finalized' });
    expect(page.planStatus()).toBe('Finalized');
    expect(page.canEdit()).toBe(false);

    planSignal.set({ ...PLAN, planStatus: 'locked' });
    expect(page.planStatus()).toBe('Locked');
    expect(page.canEdit()).toBe(false);
  });

  it('seeds the staged selection from persisted contributions on load', () => {
    const page = start();

    expect([...page.selectedIds()].sort()).toEqual(['g1', 'g3']);
    expect(page.selectedCorporateGoalCount()).toBe(2);
    expect(page.selectionDirty()).toBe(false);
  });

  it('seeds the checklist with persisted contributed state and lets checkboxes stage choices', () => {
    const page = start();

    expect(page.corporateGoals().map((g) => g.id)).toEqual(['g1', 'g3', 'g2']);
    expect(page.corporateGoals()[0]).toMatchObject({ name: 'Grow revenue', contributesTo: true });
    expect(page.corporateGoals()[2]).toMatchObject({ name: 'Expand ops', contributesTo: false });

    page.toggleContribution('g2', true);
    page.toggleContribution('g1', false);

    expect(page.selectedIds().has('g2')).toBe(true);
    expect(page.selectedIds().has('g1')).toBe(false);
    expect(page.selectionDirty()).toBe(true);
  });

  it('surfaces the staged corporate goals for the goal-modal picker', () => {
    const page = start();

    expect(page.selectedCorporateGoals().map((g) => g.id)).toEqual(['g1', 'g3']);

    page.toggleContribution('g2', true);
    expect(page.selectedCorporateGoals().map((g) => g.id)).toEqual(['g1', 'g3', 'g2']);
  });

  it('creates a division goal under a ticked corporate goal even before saving the selection', async () => {
    const page = start();
    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({
      ...PLAN,
      contributions: [],
      goals: [],
    });
    page.revertSelection();
    page.toggleContribution('g2', true);

    page.openCreateGoal();
    expect(page.goalForm.controls.parentGoalId.value).toBe('g2');

    page.goalForm.patchValue({ name: 'New division goal', weight: 40 });
    page.submitGoal();

    expect(divisionService.setContributions).toHaveBeenCalledWith(
      expect.objectContaining({ goalIds: ['g2'], cascadeRemoveDependents: false })
    );
    expect(divisionService.createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New division goal',
        parentGoalId: 'g2',
        weight: 40,
        divisionId: 'div-1',
        scorecardId: 'sc-1',
      })
    );
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

  it('asks the user to save the selection when creating a goal also implies a removal', () => {
    const page = start();
    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({
      ...PLAN,
      contributions: [{ goalId: 'g1', name: 'Grow revenue', weight: 100 }],
      goals: [],
    });
    page.revertSelection();
    page.toggleContribution('g1', false);

    page.openCreateGoal();
    page.goalForm.patchValue({ name: 'New goal', parentGoalId: 'g2', weight: 40 });
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

  it('builds one report row per division goal with weight, score and status', () => {
    const page = start();

    const rows = page.reportGoalRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Retail network', weight: 100, score: 88, status: 'green' });
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

  it('renders the overall-score doughnut as an orange ring against the remainder', () => {
    const page = start();

    const segments = page.donutSegments();
    expect(segments).toHaveLength(2);
    expect(segments[0].color).toBe('#C77B24');
    expect(segments[1].color).toBe('#E3EAE0');
    expect(segments[0].dash + segments[0].gap + segments[1].dash + segments[1].gap).toBeCloseTo(1, 3);
    expect(segments[0].dash).toBeCloseTo(0.952, 3);

    (page as unknown as { plan: { set: (p: DivisionPlanDto | null) => void } }).plan.set({ ...PLAN, overallScore: 40 });
    expect(page.donutSegments()[0].dash).toBeCloseTo(0.392, 3);
  });

  it('publishes ytd, full year, quarters, months and month range as period options', () => {
    const page = start();

    const values = page.periodOptions().map((o) => o.value);
    expect(values).toContain('Ytd');
    expect(values).toContain('Year');
    expect(values).toContain('Q1');
    expect(values).toContain('M1');
    expect(values).toContain('Range');
  });

  it('maps the selected period to the backend filter', () => {
    const page = start();
    const query = (page as unknown as { periodQuery: () => unknown }).periodQuery();

    page.reportPeriod.set('Q2');
    expect((page as unknown as { periodQuery: () => unknown }).periodQuery()).toEqual({
      periodType: 'Quarter',
      quarter: 2,
    });

    page.reportPeriod.set('M3');
    expect((page as unknown as { periodQuery: () => unknown }).periodQuery()).toEqual({
      periodType: 'Month',
      fromMonth: 3,
      toMonth: 3,
      year: 2026,
    });

    page.reportPeriod.set('Year');
    expect((page as unknown as { periodQuery: () => unknown }).periodQuery()).toEqual({
      periodType: 'Year',
      year: 2026,
    });

    page.reportPeriod.set('Ytd');
    expect(query).toEqual({ periodType: 'Ytd' });
  });

  it('maps the month-range filter to from/to months on the backend filter', () => {
    const page = start();

    page.reportPeriod.set('Range');
    page.onRangeChange(3, 6);

    expect(page.rangeFromMonth()).toBe(3);
    expect(page.rangeToMonth()).toBe(6);
    expect((page as unknown as { periodQuery: () => unknown }).periodQuery()).toEqual({
      periodType: 'Month',
      fromMonth: 3,
      toMonth: 6,
      year: 2026,
    });
  });

  it('normalizes an inverted month range before querying', () => {
    const page = start();

    page.reportPeriod.set('Range');
    page.onRangeChange(11, 2);

    expect((page as unknown as { periodQuery: () => unknown }).periodQuery()).toEqual({
      periodType: 'Month',
      fromMonth: 2,
      toMonth: 11,
      year: 2026,
    });
  });

  it('stages selection and only saves once confirmed', () => {
    const page = start();

    page.toggleContribution('g3', false);
    expect(page.selectionDirty()).toBe(true);
    expect(divisionService.setContributions).not.toHaveBeenCalled();
  });

  it('builds the report from the division goals with normalized rag', () => {
    const page = start();

    const rows = page.reportGoalRows();
    expect(rows.map((r) => r.name)).toEqual(['Retail network']);
    expect(rows[0].weight).toBe(100);
    expect(rows[0].score).toBe(88);
    expect(rows[0].status).toBe('green');
  });

  it('removing a cargo with no division goals saves without cascading', async () => {
    const page = start();

    (page as unknown as { selectedIds: { set: (s: Set<string>) => void } })
      .selectedIds.set(new Set(['g1']));

    await page.saveSelection();

    expect(divisionService.setContributions).toHaveBeenCalledWith({
      divisionId: 'div-1',
      scorecardId: 'sc-1',
      goalIds: ['g1'],
      cascadeRemoveDependents: false,
    });
  });

  it('asks for confirmation before cascading a removal that owns division goals', async () => {
    const page = start();

    (page as unknown as { selectedIds: { set: (s: Set<string>) => void } })
      .selectedIds.set(new Set());
    dialog.confirmChoice.mockResolvedValue('cancel');

    await page.saveSelection();

    expect(dialog.confirmChoice).toHaveBeenCalled();
    expect(divisionService.setContributions).not.toHaveBeenCalled();
  });

  it('cascades removal once the user confirms deletion', async () => {
    const page = start();

    (page as unknown as { selectedIds: { set: (s: Set<string>) => void } })
      .selectedIds.set(new Set(['g3']));
    dialog.confirmChoice.mockResolvedValue('confirm');

    await page.saveSelection();

    expect(divisionService.setContributions).toHaveBeenCalledWith({
      divisionId: 'div-1',
      scorecardId: 'sc-1',
      goalIds: ['g3'],
      cascadeRemoveDependents: true,
    });
  });

  it('keeps division goals and KPIs when the user chooses keep', async () => {
    const page = start();

    (page as unknown as { selectedIds: { set: (s: Set<string>) => void } })
      .selectedIds.set(new Set(['g3']));
    dialog.confirmChoice.mockResolvedValue('extra');

    await page.saveSelection();

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

    page.reportPeriod.set('Q4');
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

  // ── FR-904: KPI target configuration ────────────────────────────────────

  const openKpiModal = (page: DivisionPlanningPage): DivisionPlanningPage => {
    page.openCreateKpi(page.divisionGoals()[0]);
    page.kpiForm.controls.name.setValue('Branches opened');
    return page;
  };

  it('accepts a reconciled cumulative target set and submits it', () => {
    const page = start();
    openKpiModal(page);

    page.kpiMonthly.set(Array.from({ length: 12 }, () => 5));
    page.kpiQuarterly.set([15, 15, 15, 15]);
    page.kpiAnnualTarget.set(60);

    expect(page.kpiTargetsValid()).toBe(true);
    page.submitKpi();

    const sent = divisionService.createKpi.mock.calls[0][0];
    expect(divisionService.createKpi).toHaveBeenCalledTimes(1);
    expect(sent.targets).toHaveLength(17);
    expect(sent.targets).toEqual(expect.arrayContaining([
      { fiscalPeriodId: 'p1', targetValue: 5, granularity: 'Monthly' },
      { fiscalPeriodId: 'p3', targetValue: 15, granularity: 'Quarterly' },
      { fiscalPeriodId: 'p12', targetValue: 60, granularity: 'Annual' },
    ]));
  });

  it('blocks a partial target entry with a validation error', () => {
    const page = start();
    openKpiModal(page);

    // Annual present but no quarterly/monthly reconciliation.
    page.kpiAnnualTarget.set(60);

    expect(page.kpiTargetsValid()).toBe(false);
    expect(page.kpiTargetsError()).toContain('quarterly');
    page.submitKpi();
    expect(divisionService.createKpi).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalled();
  });

  it('requires the annual target once any target value is entered', () => {
    const page = start();
    openKpiModal(page);

    page.kpiMonthly.set(Array.from({ length: 12 }, () => 5));

    expect(page.kpiTargetsValid()).toBe(false);
    expect(page.kpiTargetsError()).toBe('Annual target is required.');
  });

  it('allows a KPI without targets and submits an empty list', () => {
    const page = start();
    openKpiModal(page);

    expect(page.kpiTargetsValid()).toBe(true);
    expect(page.kpiTargetsError()).toBeNull();
    page.submitKpi();

    expect(divisionService.createKpi).toHaveBeenCalledWith(
      expect.objectContaining({ targets: [] })
    );
  });

  it('reloads an edited KPI annual/quarterly/monthly targets', () => {
    const page = start();
    const goal = page.divisionGoals()[0];

    page.openEditKpi(goal.kpis[0], goal);

    expect(page.kpiAnnualTarget()).toBe(60);
    expect(page.kpiQuarterly()).toEqual([15, 15, 15, 15]);
    expect(page.kpiMonthly()).toEqual(Array.from({ length: 12 }, () => 5));
    expect(page.kpiTargetsValid()).toBe(true);
  });

  it('validates non-cumulative targets as equal to the annual target', () => {
    const page = start();
    openKpiModal(page);
    page.kpiForm.controls.isCumulative.setValue(false);

    page.kpiAnnualTarget.set(50);
    page.kpiQuarterly.set([10, 10, 10, 10]);
    page.kpiMonthly.set(Array.from({ length: 12 }, () => 10));

    expect(page.kpiQuarterError(0)).toContain('Quarter target must equal');
    expect(page.kpiTargetsValid()).toBe(false);

    page.kpiAnnualTarget.set(10);
    expect(page.kpiTargetsValid()).toBe(true);
  });
});