import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { ScorecardService } from '../scorecard/scorecard.service';
import { DivisionService } from '../division/division.service';
import {
  Division,
  DivisionPlanDto,
  DivisionGoalDto,
  DivisionKpiDto,
  DivisionFiscalPeriodDto,
  DivisionKpiTargetInputDto,
  RagStatus,
} from '../division/division.model';
import { NotificationService } from '../../core/service/notification.service';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import { UserStore } from '../../core/service/user-store.service';
import { KPIService } from '../../core/service/kpi.service';
import { PeriodLockStatusItem } from '../../core/model/goal.model';
import { DonutSegment } from '../dashboard/admin-dashboard.model';
import { Scorecard, FiscalYear } from '../../core/model/scorecard.model';
import { DivisionActualValueDto, EnterDivisionActualValueRequest } from '../division/division.model';
import { fiscalMonthForDate, fiscalMonthLabel } from '../strategic-scorecard/workspace-state.service';
import { ReportExportFormat, ReportFilter, ReportService, downloadBlob } from '../reports/report.service';

import { LucideDynamicIcon } from '@lucide/angular';

interface CorporateGoalItem {
  id: string;
  name: string;
  description?: string;
  contributesTo: boolean;
}

interface ReportGoalRow {
  name: string;
  weight: number;
  score: number;
  status?: RagStatus;
}

type ReportPeriod = 'Ytd' | 'Year' | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7' | 'M8' | 'M9' | 'M10' | 'M11' | 'M12' | 'Range';

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Backend sends "Green"/"Amber"/"Red"; the UI compares lowercase rag values. */
const normalizeStatus = (value?: string | null): RagStatus | undefined => {
  const lower = value?.toLowerCase();
  return lower === 'green' || lower === 'amber' || lower === 'red' ? lower : undefined;
};

type CanonicalPlanStatus = 'Draft' | 'Finalized' | 'Locked';

/** The API serializes the enum as camelCase ("draft"); the UI compares TitleCase. */
const normalizePlanStatus = (value?: string | null): CanonicalPlanStatus => {
  const lower = value?.toLowerCase();
  if (lower === 'finalized') return 'Finalized';
  if (lower === 'locked') return 'Locked';
  return 'Draft';
};

@Component({
  selector: 'app-division-planning',
  imports: [ReactiveFormsModule, FormsModule, LucideDynamicIcon],
  templateUrl: './division-planning.html',
  styleUrl: './division-planning.scss',
})
export class DivisionPlanningPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly scorecardService = inject(ScorecardService);
  private readonly divisionService = inject(DivisionService);
  private readonly kpiService = inject(KPIService);
private readonly notifications = inject(NotificationService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly userStore = inject(UserStore);
  private readonly reportService = inject(ReportService);

  readonly scorecardId = signal<string>('');

  readonly steps = [
    { id: 1, label: 'Select corporate goals' },
    { id: 2, label: 'Create division goals' },
    { id: 3, label: 'Define KPIs' },
    { id: 4, label: 'Finalize plan' },
  ];

  readonly plan = signal<DivisionPlanDto | null>(null);
  readonly fiscalYears = signal<FiscalYear[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly crudSubmitting = signal(false);

  readonly planStatus = computed<CanonicalPlanStatus>(() => normalizePlanStatus(this.plan()?.planStatus));
  /** Editing is only allowed while the plan is still a draft. */
  readonly canEdit = computed(() => this.planStatus() === 'Draft');

  readonly finalizedAt = computed(() => this.plan()?.finalizedAtUtc ?? null);
  readonly hasDivisionGoals = computed(() => this.divisionGoals().length > 0);
  readonly hasDivisionKpis = computed(() => this.divisionGoals().some((g) => g.kpis.length > 0));
  readonly canFinalize = computed(() => this.canEdit() && this.hasDivisionGoals() && this.hasDivisionKpis());

  stepState(stepId: number): 'done' | 'active' | 'idle' {
    const status = this.planStatus();
    const contributions = (this.plan()?.contributions.length ?? 0) > 0;
    switch (stepId) {
      case 1:
        return contributions || status === 'Finalized' ? 'done' : 'active';
      case 2:
        return this.hasDivisionGoals() ? 'done' : contributions ? 'active' : 'idle';
      case 3:
        return this.hasDivisionKpis() ? 'done' : this.hasDivisionGoals() ? 'active' : 'idle';
      case 4:
        return status === 'Finalized' ? 'done' : this.hasDivisionKpis() ? 'active' : 'idle';
      default:
        return 'idle';
    }
  }

  finalizedLabel(): string {
    const value = this.finalizedAt();
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  readonly divisionName = computed(() => this.plan()?.divisionName ?? '');
  readonly scorecardName = computed(() => this.plan()?.scorecardName ?? '');

  private readonly selectedFiscalYear = computed(() => {
    const fyId = this.plan()?.fiscalYearId;
    return this.fiscalYears().find((fy) => fy.id === fyId) ?? null;
  });

// ── Corporate goals checklist ──────────────────────────────────────────

  /** FR-901/FR-903: every corporate goal of the scorecard with its persisted
   *  contributed status (contributions first, then the available pool). */
  readonly corporateGoals = computed<CorporateGoalItem[]>(() => {
    const p = this.plan();
    if (!p) return [];
    return [
      ...p.contributions.map((c) => ({
        id: c.goalId,
        name: c.name,
        description: c.description,
        contributesTo: true,
      })),
      ...p.availableGoals.map((g) => ({
        id: g.goalId,
        name: g.name,
        description: g.description,
        contributesTo: false,
      })),
    ];
  });

  private readonly planContributionIds = () => new Set((this.plan()?.contributions ?? []).map((c) => c.goalId));

  /** The currently staged corporate goals (persisted plus just-ticked) for the goal modal. */
  readonly selectedCorporateGoals = computed<CorporateGoalItem[]>(() => {
    const byId = new Map(this.corporateGoals().map((g) => [g.id, g]));
    return [...this.selectedIds()]
      .map((id) => byId.get(id))
      .filter((g): g is CorporateGoalItem => !!g);
  });

  readonly selectedIds = signal<Set<string>>(new Set());
  readonly selectedCorporateGoalCount = computed(() => this.selectedIds().size);

  /** FR-902: a checkbox click only stages the choice; nothing is written until Save. */
  toggleContribution(id: string, checked: boolean): void {
    if (!this.canEdit()) return;
    const next = new Set(this.selectedIds());
    if (checked) next.add(id);
    else next.delete(id);
    this.selectedIds.set(next);
  }

  readonly selectionDirty = computed(() => {
    const current = this.planContributionIds();
    const staged = this.selectedIds();
    if (current.size !== staged.size) return true;
    for (const id of current) if (!staged.has(id)) return true;
    return false;
  });

  revertSelection(): void {
    this.selectedIds.set(this.planContributionIds());
  }

  async saveSelection(): Promise<void> {
    const p = this.plan();
    if (!p || !this.canEdit()) return;

    const current = new Set(p.contributions.map((c) => c.goalId));
    const staged = this.selectedIds();
    const removed = [...current].filter((id) => !staged.has(id));
    const dependents = this.divisionGoals().filter((g) => g.parentGoalId && removed.includes(g.parentGoalId!));
    const removedNames = removed
      .map((id) => p.contributions.find((c) => c.goalId === id)?.name)
      .filter((n): n is string => !!n);

    let cascadeRemoveDependents = false;
    if (dependents.length > 0) {
      const choice = await this.dialog.confirmChoice(
        'Remove corporate goal?',
        `“${removedNames.join('”, “')}” still has division goal${dependents.length > 1 ? 's' : ''}: ${dependents.map((g) => `“${g.name}”`).join(', ')}. Keep ${dependents.length > 1 ? 'them' : 'it'} and ${dependents.length > 1 ? 'their' : 'its'} KPIs in the plan, or delete ${dependents.length > 1 ? 'them' : 'it'} together with the corporate goal?`,
        {
          confirmText: 'Delete goals & KPIs',
          extraText: 'Keep goals & KPIs',
          cancelText: 'Cancel',
          variant: 'danger',
          extraVariant: 'info',
        }
      );
      if (choice === 'cancel') {
        this.revertSelection();
        return;
      }
      cascadeRemoveDependents = choice === 'confirm';
    }

    this.crudSubmitting.set(true);
    this.divisionService
      .setContributions({
        divisionId: p.divisionId,
        scorecardId: p.scorecardId,
        goalIds: [...staged],
        cascadeRemoveDependents,
      })
      .subscribe({
        next: () => {
          this.crudSubmitting.set(false);
          this.notifications.success('Corporate goals updated.');
          this.reloadPlan();
        },
        error: () => {
          this.crudSubmitting.set(false);
          this.revertSelection();
          this.notifications.error('Could not save the linked corporate goals.');
        },
      });
  }

  // ── Division goals & KPIs ───────────────────────────────────────────────

readonly divisionGoals = computed<DivisionGoalDto[]>(() =>
    (this.plan()?.goals ?? []).map((g) => ({
      ...g,
      status: normalizeStatus(g.status),
      kpis: g.kpis.map((k) => ({ ...k, status: normalizeStatus(k.status) })),
    }))
  );

  readonly reportGoalRows = computed<ReportGoalRow[]>(
    () =>
      this.divisionGoals().map((g) => ({
        name: g.name,
        weight: g.weight,
        score: g.score ?? 0,
        status: normalizeStatus(g.status),
      }))
  );

  readonly overallStatus = computed<RagStatus | undefined>(() => {
    const score = this.overallScore();
    if (score >= 95) return 'green';
    if (score >= 70) return 'amber';
    return 'red';
  });

readonly overallScore = computed(() => {
    const p = this.plan();
    if (p?.overallScore != null) return Math.round(p.overallScore);
    const goals = this.divisionGoals();
    const totalWeight = goals.reduce((sum, g) => sum + g.weight, 0);
    if (totalWeight <= 0) return 0;
    return Math.round(
      goals.reduce((sum, g) => sum + (g.score ?? 0) * g.weight, 0) / totalWeight
    );
  });

  readonly donutSize = 150;
  readonly donutThickness = 20;

  /** FR-908: single-ring doughnut — the overall score (orange) and the remainder
   *  (pale green-gray). */
  readonly donutSegments = computed<DonutSegment[]>(() => {
    const score = Math.max(0, Math.min(100, this.overallScore()));
    const tail = Math.max(0, 100 - score);
    return this.buildSegments([
      { value: score, color: '#C77B24' },
      { value: tail, color: '#E3EAE0' },
    ]);
  });

  private buildSegments(values: Array<{ value: number; color: string }>): DonutSegment[] {
    let acc = 0;
    return values.map((segment) => {
      const size = segment.value / 100;
      const start = acc;
      acc += size;
      return {
        dash: size > 0 ? Math.max(0, size - 0.008) : 0,
        gap: size > 0 ? 0.008 : 0,
        offset: -start,
        color: segment.color,
      };
    });
  }

  // ── Period filter ───────────────────────────────────────────────────────

  readonly reportPeriod = signal<ReportPeriod>('Ytd');
  readonly rangeFromMonth = signal(1);
  readonly rangeToMonth = signal(12);

  /** FR-908: a start/end fiscal-month pair for the Month Range filter. */
  onRangeChange(from: number, to: number): void {
    this.rangeFromMonth.set(from);
    this.rangeToMonth.set(to);
    this.reloadPlan();
  }

readonly periodOptions = computed(() => {
    const fy = this.selectedFiscalYear();
    const short = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    if (!fy?.startDate) {
      return [
        { value: 'Ytd' as ReportPeriod, label: 'Year to date' },
        { value: 'Range' as ReportPeriod, label: 'Month range' },
        { value: 'Year' as ReportPeriod, label: 'Full fiscal year' },
        { value: 'Q1', label: 'Q1' },
        { value: 'Q2', label: 'Q2' },
        { value: 'Q3', label: 'Q3' },
        { value: 'Q4', label: 'Q4' },
      ];
    }
    const startMonth = Number(fy.startDate.slice(5, 7)) - 1;
    const startYear = Number(fy.startDate.slice(0, 4));
    const quarters: Array<{ value: ReportPeriod; label: string }> = [0, 1, 2, 3].map((q) => {
      const from = (startMonth + q * 3) % 12;
      const to = (startMonth + q * 3 + 2) % 12;
      const toYear = to < from ? startYear + 1 : startYear;
      return {
        value: `Q${q + 1}` as ReportPeriod,
        label: `Q${q + 1} · ${short[from]}–${short[to]} ${toYear}`,
      };
    });
    const months: Array<{ value: ReportPeriod; label: string }> = Array.from({ length: 12 }, (_unused, i) => {
      const fiscalMonth = i + 1;
      return {
        value: `M${fiscalMonth}` as ReportPeriod,
        label: fiscalMonthLabel(fy.startDate, fiscalMonth),
      };
    });
    return [
      { value: 'Ytd', label: 'Year to date' },
      { value: 'Range' as ReportPeriod, label: 'Month range' },
      { value: 'Year', label: 'Full fiscal year' },
      ...quarters,
      ...months,
    ];
  });

  onPeriodChange(): void {
    this.reloadPlan();
  }

  private readonly periodQuery = computed(() => {
    const period = this.reportPeriod();
    const fy = this.selectedFiscalYear();
    const startYear = fy?.startDate ? Number(fy.startDate.slice(0, 4)) : undefined;
    if (period === 'Ytd') return { periodType: 'Ytd' as const };
    if (period === 'Range') {
      return {
        periodType: 'Month' as const,
        fromMonth: Math.min(this.rangeFromMonth(), this.rangeToMonth()),
        toMonth: Math.max(this.rangeFromMonth(), this.rangeToMonth()),
        year: startYear,
      };
    }
    if (period === 'Year') return { periodType: 'Year' as const, year: startYear };
    if (period.startsWith('Q')) return { periodType: 'Quarter' as const, quarter: Number(period.slice(1)) };
    return { periodType: 'Month' as const, fromMonth: Number(period.slice(1)), toMonth: Number(period.slice(1)), year: startYear };
  });

  // ── Goal CRUD ───────────────────────────────────────────────────────────

  readonly goalModalOpen = signal(false);
  readonly goalEditingId = signal<string | null>(null);

readonly goalForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
    contributionDescription: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(2000)],
    }),
    parentGoalId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    weight: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.min(0), Validators.max(100)],
    }),
  });

  readonly editedGoal = computed<DivisionGoalDto | null>(() => {
    const id = this.goalEditingId();
    return id ? this.divisionGoals().find((g) => g.id === id) ?? null : null;
  });

  goalWeightRemaining(): number {
    const others = this.divisionGoals()
      .filter((g) => g.id !== this.goalEditingId())
      .reduce((sum, g) => sum + (g.weight ?? 0), 0);
    return round1(100 - others - Number(this.goalForm.value.weight ?? 0));
  }

openCreateGoal(parentGoalId?: string): void {
    if (!this.canEdit()) return;
    this.goalEditingId.set(null);
    this.goalForm.reset({
      name: '',
      description: '',
      contributionDescription: '',
      parentGoalId: parentGoalId ?? this.plan()?.contributions[0]?.goalId ?? this.selectedCorporateGoals()[0]?.id ?? '',
      weight: 0,
    });
    this.goalModalOpen.set(true);
  }

  openEditGoal(goal: DivisionGoalDto): void {
    if (!this.canEdit()) return;
    this.goalEditingId.set(goal.id);
    this.goalForm.reset({
      name: goal.name,
      description: goal.description ?? '',
      contributionDescription: goal.contributionDescription ?? '',
      parentGoalId: goal.parentGoalId ?? this.plan()?.contributions[0]?.goalId ?? this.selectedCorporateGoals()[0]?.id ?? '',
      weight: goal.weight,
    });
    this.goalModalOpen.set(true);
  }

  closeGoalModal(): void {
    this.goalModalOpen.set(false);
  }

submitGoal(): void {
    const f = this.goalForm;
    if (f.invalid || this.crudSubmitting()) return;
    // FR-905: plan validation blocks any sum that exceeds 100%.
    if (this.goalWeightRemaining() < 0) {
      this.notifications.error('Division goal weights cannot exceed 100%.');
      return;
    }
    const p = this.plan();
    if (!p) return;

    const payload = {
      name: f.controls.name.value.trim(),
      description: f.controls.description.value.trim() || undefined,
      contributionDescription: f.controls.contributionDescription.value.trim() || undefined,
      parentGoalId: f.controls.parentGoalId.value,
      weight: Number(f.controls.weight.value),
    };

    const contributedIds = new Set(p.contributions.map((c) => c.goalId));
    const stagedIds = this.selectedIds();
    const removed = [...contributedIds].filter((id) => !stagedIds.has(id));
    const parentIsContributed = contributedIds.has(f.controls.parentGoalId.value);

    // The goal modal only lists ticked corporate goals, which may still be staged
    // (not yet saved). The backend only allows goals under persisted contributions,
    // so flush a purely additive staged selection before creating the first goal
    // under it; refuse when a removal is also pending to avoid a silent unlink.
    const needsSelectionPersist = !this.goalEditingId() && !parentIsContributed && removed.length === 0;
    if (!parentIsContributed && !needsSelectionPersist) {
      this.notifications.error('Save your linked corporate goals before adding a division goal.');
      return;
    }

    this.crudSubmitting.set(true);

    const persistGoal = (): void => {
      const call = this.goalEditingId()
        ? this.divisionService.updateGoal(this.goalEditingId()!, payload)
        : this.divisionService.createGoal({ ...payload, divisionId: p.divisionId, scorecardId: p.scorecardId });

      call.subscribe({
        next: () => {
          this.crudSubmitting.set(false);
          this.goalModalOpen.set(false);
          this.notifications.success(this.goalEditingId() ? 'Division goal updated.' : 'Division goal added.');
          this.reloadPlan();
        },
        error: () => {
          this.crudSubmitting.set(false);
          this.reloadPlan();
          this.notifications.error('Could not save the division goal.');
        },
      });
    };

    if (needsSelectionPersist) {
      this.divisionService
        .setContributions({
          divisionId: p.divisionId,
          scorecardId: p.scorecardId,
          goalIds: [...stagedIds],
          cascadeRemoveDependents: false,
        })
        .subscribe({
          next: persistGoal,
          error: () => {
            this.crudSubmitting.set(false);
            this.notifications.error('Could not save the linked corporate goals.');
          },
        });
      return;
    }

    persistGoal();
  }

  async deleteGoal(goal: DivisionGoalDto): Promise<void> {
    if (!this.canEdit()) return;
    const ok = await this.dialog.confirm(
      'Delete division goal',
      `Delete “${goal.name}” and its KPIs? This cannot be undone.`,
      { confirmText: 'Delete', variant: 'danger' }
    );
    if (!ok) return;
    this.divisionService.deleteGoal(goal.id).subscribe({
      next: () => {
        this.notifications.success('Division goal deleted.');
        this.reloadPlan();
      },
      error: () => this.notifications.error('Could not delete the division goal.'),
    });
  }

  // ── KPI CRUD ────────────────────────────────────────────────────────────

  readonly kpiModalOpen = signal(false);
  readonly kpiEditingId = signal<string | null>(null);
  readonly kpiParentGoalId = signal<string | null>(null);

  readonly kpiForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
    unit: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(50)] }),
    divisionOwnerId: new FormControl<string | null>(null, {
      nonNullable: true,
      validators: [Validators.required],
    }),
    weight: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.min(0), Validators.max(100)],
    }),
    optimizationType: new FormControl<'Maximize' | 'Minimize' | 'ExactHit' | 'Binary'>('Maximize', {
      nonNullable: true,
    }),
    kpiType: new FormControl<'Leading' | 'Lagging'>('Lagging', { nonNullable: true }),
    dataSource: new FormControl<'Manual' | 'Automated' | 'Calculated'>('Manual', { nonNullable: true }),
    isCumulative: new FormControl(true, { nonNullable: true }),
    baseline: new FormControl<number | null>(null, { nonNullable: true }),
    minValue: new FormControl<number | null>(null, { nonNullable: true }),
    maxValue: new FormControl<number | null>(null, { nonNullable: true }),
  });

  // ── FR-904: KPI targets (annual / quarterly / monthly) ───────────────────

  readonly kpiQuarterIndexes = [0, 1, 2, 3];

  readonly kpiAnnualTarget = signal<number | null>(null);
  readonly kpiQuarterly = signal<number[]>([0, 0, 0, 0]);
  readonly kpiMonthly = signal<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  /** Fiscal periods of the loaded plan, used to resolve target period ids. */
  private readonly kpiPeriods = computed<DivisionFiscalPeriodDto[]>(() =>
    (this.plan()?.fiscalPeriods ?? []).slice().sort((a, b) => a.fiscalMonth - b.fiscalMonth)
  );

  private resetKpiTargets(): void {
    this.kpiAnnualTarget.set(null);
    this.kpiQuarterly.set([0, 0, 0, 0]);
    this.kpiMonthly.set([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  }

  /** Reloads an existing KPI's persisted annual/quarterly/monthly targets. */
  private loadKpiTargets(kpi: DivisionKpiDto): void {
    this.resetKpiTargets();
    const quarterly = this.kpiQuarterly().slice();
    const monthly = this.kpiMonthly().slice();
    let annual: number | null = null;
    for (const t of kpi.targets ?? []) {
      if (t.granularity === 'Annual') annual = t.targetValue;
      if (t.granularity === 'Quarterly' && t.quarter >= 1 && t.quarter <= 4) quarterly[t.quarter - 1] = t.targetValue;
      if (t.granularity === 'Monthly' && t.fiscalMonth >= 1 && t.fiscalMonth <= 12) monthly[t.fiscalMonth - 1] = t.targetValue;
    }
    this.kpiAnnualTarget.set(annual);
    this.kpiQuarterly.set(quarterly);
    this.kpiMonthly.set(monthly);
  }

  private kpiIsCumulative(): boolean {
    return this.kpiForm.controls.isCumulative.value === true;
  }

  monthsOfKpiQuarter(q: number): number[] {
    return [q * 3, q * 3 + 1, q * 3 + 2];
  }

  kpiMonthLabel(fiscalMonth: number): string {
    const fy = this.selectedFiscalYear();
    return fy ? fiscalMonthLabel(fy.startDate, fiscalMonth) : `M${fiscalMonth}`;
  }

  kpiQuarterLabel(q: number): string {
    return `Q${q + 1}`;
  }

  kpiQuarterDisplay(q: number): number {
    return this.kpiQuarterly()[q];
  }

  kpiQuarterSum(q: number): number {
    return this.monthsOfKpiQuarter(q).reduce((s, mi) => s + this.kpiMonthly()[mi], 0);
  }

  private kpiMonthsFilled(q: number): boolean {
    return this.monthsOfKpiQuarter(q).every((mi) => this.kpiMonthly()[mi] !== 0);
  }

  onKpiAnnualChange(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    const n = raw === '' ? null : Number(raw);
    this.kpiAnnualTarget.set(n !== null && Number.isNaN(n) ? null : n);
  }

  onKpiQuarterChange(q: number, event: Event): void {
    const next = this.kpiQuarterly().slice();
    next[q] = this.parseTargetNumber((event.target as HTMLInputElement).value);
    this.kpiQuarterly.set(next);
  }

  onKpiMonthChange(mi: number, event: Event): void {
    const next = this.kpiMonthly().slice();
    next[mi] = this.parseTargetNumber((event.target as HTMLInputElement).value);
    this.kpiMonthly.set(next);
  }

  private parseTargetNumber(raw: string): number {
    const t = raw.trim();
    if (t === '') return 0;
    const n = Number(t);
    return Number.isNaN(n) ? 0 : n;
  }

  /** True when the user has entered at least one target value. */
  kpiTargetsProvided(): boolean {
    return (
      this.kpiAnnualTarget() !== null ||
      this.kpiQuarterly().some((v) => v !== 0) ||
      this.kpiMonthly().some((v) => v !== 0)
    );
  }

  /** Mirrors the corporate target rules: annual required, cumulative sums, or non-cumulative equality. */
  kpiQuarterError(q: number): string | null {
    const annual = this.kpiAnnualTarget();
    if (annual === null) return null;
    if (this.kpiIsCumulative()) {
      if (!this.kpiMonthsFilled(q)) return 'Fill all 3 month targets.';
      if (Math.abs(this.kpiQuarterSum(q) - this.kpiQuarterDisplay(q)) >= 0.005) {
        return `Month total (${round1(this.kpiQuarterSum(q))}) must equal the quarter target (${round1(this.kpiQuarterDisplay(q))}).`;
      }
      return null;
    }
    if (this.kpiQuarterDisplay(q) !== annual) {
      return `Quarter target must equal the annual target (${round1(annual)}).`;
    }
    if (this.monthsOfKpiQuarter(q).some((mi) => this.kpiMonthly()[mi] !== this.kpiQuarterDisplay(q))) {
      return `Each month target must equal the quarter target (${round1(this.kpiQuarterDisplay(q))}).`;
    }
    return null;
  }

  /** Empty targets are allowed; otherwise the annual target and reconciliation are enforced. */
  kpiTargetsError(): string | null {
    if (!this.kpiTargetsProvided()) return null;
    const annual = this.kpiAnnualTarget();
    if (annual === null) return 'Annual target is required.';
    if (this.kpiIsCumulative()) {
      const quarters = this.kpiQuarterly();
      if (quarters.some((v) => v === 0)) return 'All four quarterly targets must be filled.';
      const sum = quarters.reduce((s, v) => s + v, 0);
      if (Math.abs(sum - annual) >= 0.005) {
        return `Quarterly targets total ${round1(sum)}, but the annual target is ${round1(annual)}. They must match exactly.`;
      }
      for (let q = 0; q < 4; q++) {
        const err = this.kpiQuarterError(q);
        if (err) return err;
      }
      return null;
    }
    for (let q = 0; q < 4; q++) {
      const err = this.kpiQuarterError(q);
      if (err) return err;
    }
    return null;
  }

  kpiTargetsValid(): boolean {
    return this.kpiTargetsError() === null;
  }

  /** Materialises the entered targets into the request shape (empty list when nothing entered). */
  private buildKpiTargets(): DivisionKpiTargetInputDto[] {
    if (!this.kpiTargetsProvided()) return [];

    const periods = this.kpiPeriods();
    const annual = this.kpiAnnualTarget();
    const monthlyById = new Map<number, string>();
    const quarterEndById = new Map<number, string>();
    let yearEndId: string | undefined;
    for (const period of periods) {
      monthlyById.set(period.fiscalMonth, period.id);
      if (period.isQuarterEnd) quarterEndById.set(period.quarter, period.id);
      if (period.isYearEnd) yearEndId = period.id;
    }

    const targets: DivisionKpiTargetInputDto[] = [];
    const months = this.kpiMonthly();
    for (let month = 1; month <= 12; month++) {
      const periodId = monthlyById.get(month);
      if (periodId) {
        targets.push({ fiscalPeriodId: periodId, targetValue: months[month - 1], granularity: 'Monthly' });
      }
    }

    const quarters = this.kpiQuarterly();
    for (let quarter = 1; quarter <= 4; quarter++) {
      const periodId = quarterEndById.get(quarter);
      if (!periodId) continue;
      const value = this.kpiIsCumulative() ? quarters[quarter - 1] : annual ?? 0;
      targets.push({ fiscalPeriodId: periodId, targetValue: value, granularity: 'Quarterly' });
    }

    if (yearEndId && annual !== null) {
      targets.push({ fiscalPeriodId: yearEndId, targetValue: annual, granularity: 'Annual' });
    }

    return targets;
  }

  readonly kpiParentGoal = computed<DivisionGoalDto | null>(() => {
    const id = this.kpiParentGoalId();
    return id ? this.divisionGoals().find((g) => g.id === id) ?? null : null;
  });

  readonly editedKpi = computed<DivisionKpiDto | null>(() => {
    const id = this.kpiEditingId();
    const goal = this.kpiParentGoal();
    if (!id || !goal) return null;
    return goal.kpis.find((k) => k.id === id) ?? null;
  });

  kpiWeightRemaining(): number {
    const goal = this.kpiParentGoal();
    if (!goal) return 0;
    const others = goal.kpis
      .filter((k) => k.id !== this.kpiEditingId())
      .reduce((sum, k) => sum + (k.weight ?? 0), 0);
    return round1(100 - others - Number(this.kpiForm.value.weight ?? 0));
  }

  openCreateKpi(goal: DivisionGoalDto): void {
    if (!this.canEdit()) return;
    this.kpiEditingId.set(null);
    this.kpiParentGoalId.set(goal.id);
    this.kpiForm.reset({
      name: '',
      description: '',
      unit: '',
      divisionOwnerId: this.plan()?.divisionId ?? null,
      weight: 0,
      optimizationType: 'Maximize',
      kpiType: 'Lagging',
      dataSource: 'Manual',
isCumulative: true,
      baseline: null,
      minValue: null,
      maxValue: null,
    });
    this.resetKpiTargets();
    this.kpiModalOpen.set(true);
  }

  openEditKpi(kpi: DivisionKpiDto, goal: DivisionGoalDto): void {
    if (!this.canEdit()) return;
    this.kpiEditingId.set(kpi.id);
    this.kpiParentGoalId.set(goal.id);
    this.kpiForm.reset({
      name: kpi.name,
      description: kpi.description ?? '',
      unit: kpi.unit ?? '',
      divisionOwnerId: kpi.divisionOwnerId ?? null,
      weight: kpi.weight,
      optimizationType: (kpi.optimizationType as 'Maximize' | 'Minimize' | 'ExactHit' | 'Binary') || 'Maximize',
      kpiType: (kpi.kpiType as 'Leading' | 'Lagging') || 'Lagging',
      dataSource: (kpi.dataSource as 'Manual' | 'Automated' | 'Calculated') || 'Manual',
      isCumulative: kpi.isCumulative,
baseline: kpi.baseline ?? null,
      minValue: kpi.minValue ?? null,
      maxValue: kpi.maxValue ?? null,
    });
    this.loadKpiTargets(kpi);
    this.kpiModalOpen.set(true);
  }

  closeKpiModal(): void {
    this.kpiModalOpen.set(false);
  }

submitKpi(): void {
    if (this.kpiForm.invalid || this.crudSubmitting()) return;
    // FR-905: KPI weights under a goal cannot exceed 100%.
    if (this.kpiWeightRemaining() < 0) {
      this.notifications.error('KPI weights for this goal cannot exceed 100%.');
      return;
    }
    // FR-904: when targets are entered they must reconcile (annual required, etc.).
    const targetError = this.kpiTargetsError();
    if (targetError) {
      this.notifications.error(targetError);
      return;
    }
    const p = this.plan();
    const goal = this.kpiParentGoal();
    if (!p || !goal) return;

    const f = this.kpiForm;
    const payload = {
      name: f.controls.name.value.trim(),
      description: f.controls.description.value.trim() || undefined,
      unit: f.controls.unit.value.trim() || undefined,
      divisionOwnerId: f.controls.divisionOwnerId.value ?? undefined,
      weight: Number(f.controls.weight.value),
      optimizationType: f.controls.optimizationType.value,
      kpiType: f.controls.kpiType.value,
      dataSource: f.controls.dataSource.value,
      isCumulative: f.controls.isCumulative.value,
      baseline: f.controls.baseline.value ?? undefined,
      minValue: f.controls.minValue.value ?? undefined,
      maxValue: f.controls.maxValue.value ?? undefined,
      // FR-904: without fiscal periods the target grid cannot be materialised, so on edit we
      // leave the persisted targets untouched rather than risk clearing them.
      targets: this.kpiPeriods().length > 0 ? this.buildKpiTargets() : undefined,
    };

    this.crudSubmitting.set(true);
    const call = this.kpiEditingId()
      ? this.divisionService.updateKpi(this.kpiEditingId()!, payload)
      : this.divisionService.createKpi({
          ...payload,
          divisionId: p.divisionId,
          scorecardId: p.scorecardId,
          divisionGoalId: goal.id,
        });

    call.subscribe({
      next: () => {
        this.crudSubmitting.set(false);
        this.kpiModalOpen.set(false);
        this.notifications.success(this.kpiEditingId() ? 'Division KPI updated.' : 'Division KPI added.');
        this.reloadPlan();
      },
      error: () => {
        this.crudSubmitting.set(false);
        this.notifications.error('Could not save the division KPI.');
      },
    });
  }

  async deleteKpi(kpi: DivisionKpiDto): Promise<void> {
    if (!this.canEdit()) return;
    const ok = await this.dialog.confirm(
      'Delete division KPI',
      `Delete “${kpi.name}”? This cannot be undone.`,
      { confirmText: 'Delete', variant: 'danger' }
    );
    if (!ok) return;
    this.divisionService.deleteKpi(kpi.id).subscribe({
      next: () => {
        this.notifications.success('Division KPI deleted.');
        this.reloadPlan();
      },
      error: () => this.notifications.error('Could not delete the division KPI.'),
    });
  }

  // ── Plan finalization ──────────────────────────────────────────────────

  readonly finalizing = signal(false);

  async finalizePlan(): Promise<void> {
    const p = this.plan();
    if (!p || !this.canFinalize() || this.finalizing()) return;
    const ok = await this.dialog.confirm(
      'Finalize division plan',
      `Finalize the plan for ${p.divisionName}? Goals and KPIs will be locked and division performance entry can begin.`,
      { confirmText: 'Finalize', variant: 'info' }
    );
    if (!ok) return;
    this.finalizing.set(true);
    this.divisionService.finalizePlan(p.divisionId, p.scorecardId).subscribe({
      next: () => {
        this.finalizing.set(false);
        this.notifications.success('Division plan finalized.');
        this.reloadPlan();
      },
      error: () => {
        this.finalizing.set(false);
        this.notifications.error('Could not finalize the division plan.');
      },
    });
  }

  // ── Division performance entry (unlocked after finalization) ───────────

  readonly entryMonth = signal<number | null>(null);
  readonly entrySaving = signal<string | null>(null);
  private readonly periodLocks = signal<Map<number, PeriodLockStatusItem>>(new Map());
  private readonly actualsByKpi = signal<Map<string, DivisionActualValueDto[]>>(new Map());
  private readonly entryInputs = signal<Map<string, string>>(new Map());
  private readonly entryNotes = signal<Map<string, string>>(new Map());

  readonly entryMonths = computed(() => {
    const fy = this.selectedFiscalYear();
    return Array.from({ length: 12 }, (_unused, i) => i + 1).map((month) => ({
      month,
      label: fy ? fiscalMonthLabel(fy.startDate, month) : `Month ${month}`,
    }));
  });

  readonly actualRows = computed(() =>
    this.divisionGoals().flatMap((goal) =>
      goal.kpis.map((kpi) => ({
        goal,
        kpi,
        saved: this.actualFor(kpi.id, this.entryMonth()),
      }))
    )
  );

  private periodIdFor(month: number | null): string {
    return month ? this.periodLocks().get(month)?.fiscalPeriodId ?? '' : '';
  }

  isEntryOpen(month: number | null): boolean {
    if (!month) return false;
    const lock = this.periodLocks().get(month);
    return !!lock && lock.state !== 'locked' && !!lock.fiscalPeriodId;
  }

  private actualFor(kpiId: string, month: number | null): DivisionActualValueDto | undefined {
    if (!month) return undefined;
    return this.actualsByKpi().get(kpiId)?.find((a) => a.fiscalMonth === month);
  }

  currentFiscalMonth(): number | null {
    const fy = this.selectedFiscalYear();
    return fy ? fiscalMonthForDate(fy.startDate) : null;
  }

  onEntryMonthChange(): void {
    const month = this.entryMonth();
    const inputs = new Map<string, string>();
    const notes = new Map<string, string>();
    for (const goal of this.divisionGoals()) {
      for (const kpi of goal.kpis) {
        const existing = this.actualFor(kpi.id, month);
        inputs.set(kpi.id, existing?.value != null ? String(existing.value) : '');
        notes.set(kpi.id, existing?.note ?? '');
      }
    }
    this.entryInputs.set(inputs);
    this.entryNotes.set(notes);
  }

  entryValue(kpiId: string): string {
    return this.entryInputs().get(kpiId) ?? '';
  }

  entryNote(kpiId: string): string {
    return this.entryNotes().get(kpiId) ?? '';
  }

  setEntryValue(kpiId: string, value: string): void {
    const map = this.entryInputs();
    map.set(kpiId, value);
    this.entryInputs.set(new Map(map));
  }

  setEntryNote(kpiId: string, note: string): void {
    const map = this.entryNotes();
    map.set(kpiId, note);
    this.entryNotes.set(new Map(map));
  }

  canSaveEntry(kpiId: string): boolean {
    if (!this.isEntryOpen(this.entryMonth())) return false;
    const raw = this.entryValue(kpiId).trim();
    if (raw === '') return false;
    return !Number.isNaN(Number(raw));
  }

  saveActual(kpiId: string): void {
    const p = this.plan();
    const month = this.entryMonth();
    const periodId = this.periodIdFor(month);
    if (!p || !month || !periodId || this.entrySaving()) return;
    const raw = this.entryValue(kpiId).trim();
    if (raw === '') return;

    this.entrySaving.set(kpiId);
    const body: EnterDivisionActualValueRequest = {
      divisionId: p.divisionId,
      kpiId,
      fiscalPeriodId: periodId,
      value: Number(raw),
      dataSource: 'Manual',
      note: this.entryNote(kpiId).trim() || undefined,
    };
    this.divisionService.enterActual(body).subscribe({
      next: () => {
        this.entrySaving.set(null);
        this.notifications.success('Actual saved.');
        if (p.divisionId && p.fiscalYearId) {
          this.loadDivisionActuals(p.divisionId, p.fiscalYearId);
        }
        this.reloadPlan();
      },
      error: () => {
        this.entrySaving.set(null);
        this.notifications.error('Could not save the actual value.');
      },
    });
  }

  isSavingActual(kpiId: string): boolean {
    return this.entrySaving() === kpiId;
  }

  private loadDivisionActuals(divisionId: string, fiscalYearId: string): void {
    this.divisionService.getActuals(divisionId, fiscalYearId).subscribe({
      next: (actuals) => {
        const byKpi = new Map<string, DivisionActualValueDto[]>();
        for (const a of actuals) {
          const list = byKpi.get(a.kpiId) ?? [];
          list.push(a);
          byKpi.set(a.kpiId, list);
        }
        this.actualsByKpi.set(byKpi);
        this.onEntryMonthChange();
      },
      error: () => {
        this.actualsByKpi.set(new Map());
        this.onEntryMonthChange();
      },
    });
  }

  private loadPeriodLocks(scorecardId: string, fiscalYearId: string): void {
    this.kpiService.getLockStatus(scorecardId, fiscalYearId).subscribe({
      next: (locks) => {
        const map = new Map<number, PeriodLockStatusItem>();
        for (const p of locks.periods) map.set(p.fiscalMonth, p);
        this.periodLocks.set(map);
        if (this.entryMonth() == null) {
          this.entryMonth.set(this.currentFiscalMonth() ?? 1);
          this.onEntryMonthChange();
        }
      },
      error: () => {
        this.periodLocks.set(new Map());
        if (this.entryMonth() == null) {
          this.entryMonth.set(1);
        }
        this.onEntryMonthChange();
      },
    });
  }

  private prepareEntry(): void {
    const p = this.plan();
    if (!p?.scorecardId || !p.fiscalYearId) return;
    if (this.planStatus() === 'Finalized') {
      this.loadPeriodLocks(p.scorecardId, p.fiscalYearId);
      if (p.divisionId) {
        this.loadDivisionActuals(p.divisionId, p.fiscalYearId);
      }
      if (this.entryMonth() == null) {
        this.entryMonth.set(this.currentFiscalMonth() ?? 1);
        this.onEntryMonthChange();
      }
    } else {
      this.entryMonth.set(null);
      this.periodLocks.set(new Map());
      this.actualsByKpi.set(new Map());
      this.entryInputs.set(new Map());
      this.entryNotes.set(new Map());
    }
  }

  // ── Division / scorecard filter ─────────────────────────────────────────

  readonly divisions = signal<Division[]>([]);
  readonly divisionFilter = signal<string>('');
  readonly scorecards = signal<Scorecard[]>([]);
  readonly scorecardFilter = signal<string>('');

  onDivisionChange(): void {
    if (!this.scorecardId()) return;
    this.reloadPlan();
  }

  onScorecardChange(): void {
    const scorecardId = this.scorecardFilter();
    if (!scorecardId) return;
    this.router.navigate(['/division-planning', scorecardId]);
  }

  private syncFilters(plan: DivisionPlanDto): void {
    if (plan.divisionId && this.divisionFilter() !== plan.divisionId) {
      this.divisionFilter.set(plan.divisionId);
    }
    if (this.scorecardFilter() !== plan.scorecardId) {
      this.scorecardFilter.set(plan.scorecardId);
    }
  }

  // ── Load / render helpers ───────────────────────────────────────────────

  constructor() {
    this.scorecardService.getFiscalYears().subscribe({
      next: (years) => this.fiscalYears.set(years),
    });
    this.divisionService.getAll().subscribe({
      next: (divisions) => {
        const ownId = this.userStore.divisionId();
        const scoped = ownId ? divisions.filter((d) => d.id === ownId) : divisions;
        this.divisions.set(scoped);
        if (ownId) {
          this.divisionFilter.set(ownId);
        }
      },
    });
    this.scorecardService.getAll().subscribe({
      next: (scorecards) => this.scorecards.set(scorecards),
    });
    this.route.paramMap.subscribe((params) => {
      const id = params.get('scorecardId') ?? '';
      if (!id) {
        this.loading.set(false);
        this.loadError.set('No division scorecard was selected.');
        return;
      }
      this.scorecardId.set(id);
      this.reloadPlan();
    });
  }

  private reloadPlan(): void {
    if (!this.scorecardId()) {
      this.loading.set(false);
      this.loadError.set('No division scorecard was selected.');
      return;
    }
    this.loading.set(true);
    const ownDivision = this.userStore.isDivisionAccount() ? this.userStore.divisionId() : null;
    const divisionId = this.divisionFilter() || ownDivision || undefined;
    this.divisionService
      .getPlanContextByScorecard(this.scorecardId(), this.periodQuery(), divisionId)
.subscribe({
        next: (plan) => {
          this.plan.set(plan);
          this.selectedIds.set(new Set(plan.contributions.map((c) => c.goalId)));
          this.loading.set(false);
          this.syncFilters(plan);
          this.prepareEntry();
        },
        error: () => {
          this.loading.set(false);
          this.loadError.set('Could not load the division plan.');
        },
      });
  }

statusLabel(status?: RagStatus): string {
    switch (status) {
      case 'green':
        return 'Green';
      case 'amber':
        return 'Amber';
      default:
        return 'Red';
    }
  }

readonly exporting = signal(false);

  /** Small format menu beneath the single "Export plan" button. */
  readonly exportMenuOpen = signal(false);

  toggleExportMenu(): void {
    this.exportMenuOpen.set(!this.exportMenuOpen());
  }

  /** FR-908/FR-909: mirrors the on-screen period into the report/export filter. */
  private currentExportFilter(): ReportFilter | null {
    const p = this.plan();
    if (!p?.scorecardId || !p.fiscalYearId || !p.divisionId) return null;
    return {
      reportType: 'division-performance',
      scorecardId: p.scorecardId,
      fiscalYearId: p.fiscalYearId,
      divisionId: p.divisionId,
      ...this.periodExportGranularity(),
    };
  }

  private periodExportGranularity(): Pick<ReportFilter, 'granularity' | 'quarter' | 'fromMonth' | 'toMonth'> {
    const period = this.reportPeriod();
    if (period === 'Q1' || period === 'Q2' || period === 'Q3' || period === 'Q4') {
      return { granularity: 'quarter', quarter: Number(period.slice(1)) };
    }
    if (period === 'Range') {
      return {
        granularity: 'month',
        fromMonth: Math.min(this.rangeFromMonth(), this.rangeToMonth()),
        toMonth: Math.max(this.rangeFromMonth(), this.rangeToMonth()),
      };
    }
    if (period.startsWith('M')) {
      const month = Number(period.slice(1));
      return { granularity: 'month', fromMonth: month, toMonth: month };
    }
    return { granularity: period === 'Year' ? 'year' : 'ytd' };
  }

  exportPlan(format: ReportExportFormat, event?: Event): void {
    event?.stopPropagation();
    this.exportMenuOpen.set(false);
    const filter = this.currentExportFilter();
    if (!filter || this.exporting()) {
      this.notifications.error('No plan is loaded to export.');
      return;
    }
    this.exporting.set(true);
    this.reportService.export(filter, format).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
        downloadBlob(blob, `division-performance-${stamp}.${format}`);
        this.notifications.success('Division report exported.');
      },
      error: () => {
        this.exporting.set(false);
        this.notifications.error('Could not export the division report.');
      },
    });
  }
}