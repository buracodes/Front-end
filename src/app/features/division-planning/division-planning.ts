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
  RagStatus,
} from '../division/division.model';
import { NotificationService } from '../../core/service/notification.service';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import { UserStore } from '../../core/service/user-store.service';
import { RagThresholdStore } from '../../core/service/rag-threshold-store.service';
import { KPIService } from '../../core/service/kpi.service';
import { PeriodLockStatusItem } from '../../core/model/goal.model';
import { DonutSegment } from '../dashboard/admin-dashboard.model';
import { Scorecard, FiscalYear } from '../../core/model/scorecard.model';
import { DivisionActualValueDto, EnterDivisionActualValueRequest } from '../division/division.model';
import { fiscalMonthForDate, fiscalMonthLabel } from '../strategic-scorecard/workspace-state.service';
import { ReportExportFormat, ReportFilter, ReportService, downloadBlob } from '../reports/report.service';
import { toApiError } from '../../core/model/api-error';

import { LucideDynamicIcon } from '@lucide/angular';

interface CorporateGoalItem {
  id: string;
  name: string;
  description?: string;
  contributesTo: boolean;
}

interface ReportGoalRow {
  kind: 'goal' | 'kpi';
  name: string;
  parentName?: string;
  weight: number;
  score: number | null;
  target?: number | null;
  actual?: number | null;
  unit?: string;
  status?: RagStatus;
  /** RAG bar width, already clamped to 0-100. */
  progress: number;
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
   private readonly ragThresholds = inject(RagThresholdStore);

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

  readonly canPlan = computed(() => this.userStore.hasPermission('divisions:plan'));
  /** Editing is only allowed while the plan is still a draft and the user may plan divisions. */
  readonly canEdit = computed(() => this.canPlan() && this.planStatus() === 'Draft');
  /** Target configuration is its own capability, matching the corporate scorecard. */
  readonly canConfigureTargets = computed(() => this.userStore.hasPermission('targets:edit'));
  /** FR-908: the division performance report is a separately granted capability. */
  readonly canViewReport = computed(() => this.userStore.hasPermission('divisions:reports.view'));
  readonly canExportReport = computed(
    () => this.canViewReport() && this.userStore.hasPermission('reports:export')
  );
  /** FR-906: actual entry needs the finalization state *and* the entry permission. */
  readonly canEnterActuals = computed(
    () => this.planStatus() === 'Finalized' && this.userStore.hasPermission('divisions:actuals.enter')
  );

  readonly finalizedAt = computed(() => this.plan()?.finalizedAtUtc ?? null);
  /** A plan always belongs to one division; nothing can be saved until one is chosen. */
  readonly hasDivision = computed(() => !!this.plan()?.divisionId);
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

  readonly divisionName = computed(() => {
    const plan = this.plan();
    if (!plan) return '';
    if (plan.divisionName) return plan.divisionName;
    // The plan payload can omit DivisionName (M3); fall back to the loaded division list.
    return this.divisions().find((d) => d.id === plan.divisionId)?.name ?? '';
  });
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

  /** The currently checked corporate goals, used by the division goal modal. */
  readonly selectedCorporateGoals = computed<CorporateGoalItem[]>(() => {
    const byId = new Map(this.corporateGoals().map((g) => [g.id, g]));
    return [...this.selectedIds()]
      .map((id) => byId.get(id))
      .filter((g): g is CorporateGoalItem => !!g);
  });

  readonly selectedIds = signal<Set<string>>(new Set());
  readonly selectedCorporateGoalCount = computed(() => this.selectedIds().size);
  readonly selectionSaving = signal(false);

  /**
   * Ticking a corporate goal links or unlinks the division immediately — there is no
   * separate Save/Revert step. The checkbox is updated optimistically and rolled back if
   * the API call fails. Unlinking a goal that still owns division goals asks the user
   * whether those goals and their KPIs should be deleted with it.
   */
  async toggleContribution(id: string, checked: boolean): Promise<void> {
    if (!this.canEdit() || this.selectionSaving()) return;
    const p = this.plan();
    if (!p) return;
    if (!p.divisionId) {
      this.notifications.error('Select a division before linking corporate goals.');
      return;
    }

    const persisted = new Set(p.contributions.map((c) => c.goalId));
    const next = new Set(this.selectedIds());
    if (checked) next.add(id);
    else next.delete(id);

    const unchanged =
      next.size === persisted.size && [...next].every((goalId) => persisted.has(goalId));
    if (unchanged) return;

    const previous = new Set(this.selectedIds());
    this.selectedIds.set(next);

    const removed = [...persisted].filter((goalId) => !next.has(goalId));
    let cascadeRemoveDependents = false;
    if (removed.length > 0) {
      const dependents = this.divisionGoals().filter(
        (g) => g.parentGoalId && removed.includes(g.parentGoalId)
      );
      if (dependents.length > 0) {
        const removedNames = removed
          .map((goalId) => p.contributions.find((c) => c.goalId === goalId)?.name)
          .filter((n): n is string => !!n);
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
          this.selectedIds.set(previous);
          return;
        }
        cascadeRemoveDependents = choice === 'confirm';
      }
    }

    this.selectionSaving.set(true);
    this.divisionService
      .setContributions({
        divisionId: p.divisionId,
        scorecardId: p.scorecardId,
        goalIds: [...next],
        cascadeRemoveDependents,
      })
      .subscribe({
        next: () => {
          this.selectionSaving.set(false);
          this.notifications.success('Corporate goals updated.');
          this.reloadPlan();
        },
        error: (error) => {
          this.selectionSaving.set(false);
          this.selectedIds.set(previous);
          this.notifications.error(toApiError(error).message);
        },
      });
  }

  // ── Division goals & KPIs ───────────────────────────────────────────────

readonly divisionGoals = computed<DivisionGoalDto[]>(() =>
    (this.plan()?.goals ?? []).map((g) => ({
      ...g,
      status: normalizeStatus(g.status),
      kpis: (g.kpis ?? []).map((k) => ({ ...k, status: normalizeStatus(k.status) })),
    }))
  );

  /** FR-908: the report lists every goal followed by its KPIs, so targets, actuals and
   *  per-KPI scores are visible — not just the rolled-up goal score. */
  readonly reportGoalRows = computed<ReportGoalRow[]>(() =>
    this.divisionGoals().flatMap((g) => {
      const clamp = (value: number | null | undefined): number =>
        Math.max(0, Math.min(100, value ?? 0));

      return [
        {
          kind: 'goal' as const,
          name: g.name,
          weight: g.weight,
          score: g.score ?? null,
          status: normalizeStatus(g.status),
          progress: clamp(g.score),
        },
        ...(g.kpis ?? []).map((k) => ({
          kind: 'kpi' as const,
          name: k.name,
          parentName: g.name,
          weight: k.weight,
          score: k.score ?? null,
          target: k.target ?? null,
          actual: k.actual ?? null,
          unit: k.unit,
          status: normalizeStatus(k.status),
          progress: clamp(k.score),
        })),
      ];
    })
  );

  readonly overallStatus = computed<RagStatus | undefined>(() => {
    const score = this.overallScore();
    const bands = this.ragThresholds.bands();
    if (score >= bands.green) return 'green';
    if (score >= bands.yellow) return 'amber';
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

  private readonly ragColor = computed(() => {
    switch (this.overallStatus()) {
      case 'green':
        return '#16A34A';
      case 'amber':
        return '#D97706';
      default:
        return '#DC2626';
    }
  });

  /** FR-908: single-ring doughnut — the overall score in its RAG colour and the
   *  remainder (pale green-gray). */
  readonly donutSegments = computed<DonutSegment[]>(() => {
    const score = Math.max(0, Math.min(100, this.overallScore()));
    const tail = Math.max(0, 100 - score);
    return this.buildSegments([
      { value: score, color: this.ragColor() },
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

  /**
   * Corporate goals offered by the Add/Edit division goal modal. Selected corporate goals
   * only; when editing a legacy goal whose linkage was removed, its own parent stays
   * visible so the goal can be re-linked without losing context.
   */
  readonly goalParentOptions = computed<CorporateGoalItem[]>(() => {
    const selected = this.selectedCorporateGoals();
    const edited = this.editedGoal();
    if (edited?.parentGoalId && !selected.some((g) => g.id === edited.parentGoalId)) {
      return [
        {
          id: edited.parentGoalId,
          name: edited.parentGoalName || 'Corporate goal (current)',
          contributesTo: true,
        },
        ...selected,
      ];
    }
    return selected;
  });

  goalWeightRemaining(): number {
    const others = this.divisionGoals()
      .filter((g) => g.id !== this.goalEditingId())
      .reduce((sum, g) => sum + (g.weight ?? 0), 0);
    return round1(100 - others - Number(this.goalForm.value.weight ?? 0));
  }

  /** Unallocated weight across division goals, used as the default for a new goal. */
  private remainingDivisionGoalWeight(): number {
    const used = this.divisionGoals().reduce((sum, g) => sum + (g.weight ?? 0), 0);
    return Math.max(0, round1(100 - used));
  }

openCreateGoal(parentGoalId?: string): void {
    if (!this.canEdit()) return;
    if (!this.plan()?.divisionId) {
      this.notifications.error('Select a division before adding a division goal.');
      return;
    }
    if (this.selectionSaving()) {
      this.notifications.error('The corporate goal selection is still saving. Try again in a moment.');
      return;
    }
    const selected = this.selectedCorporateGoals();
    if (selected.length === 0) {
      this.notifications.error('Tick at least one corporate goal before adding a division goal.');
      return;
    }
    this.goalEditingId.set(null);
    this.goalForm.reset({
      name: '',
      description: '',
      contributionDescription: '',
      parentGoalId: parentGoalId ?? selected[0].id,
      weight: this.remainingDivisionGoalWeight(),
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
      parentGoalId: goal.parentGoalId ?? this.selectedCorporateGoals()[0]?.id ?? '',
      weight: goal.weight,
    });
    this.goalModalOpen.set(true);
  }

  closeGoalModal(): void {
    this.goalModalOpen.set(false);
  }

submitGoal(): void {
    const f = this.goalForm;
    if (f.invalid || this.crudSubmitting() || this.selectionSaving()) return;
    // FR-905: plan validation blocks any sum that exceeds 100%.
    if (this.goalWeightRemaining() < 0) {
      this.notifications.error('Division goal weights cannot exceed 100%.');
      return;
    }
    const p = this.plan();
    if (!p) return;
    if (!p.divisionId) {
      this.notifications.error('Select a division before adding a division goal.');
      return;
    }

    const parentGoalId = f.controls.parentGoalId.value;
    // The corporate goal must already be linked (checking a box persists immediately).
    if (!p.contributions.some((c) => c.goalId === parentGoalId)) {
      this.notifications.error(
        'The selected corporate goal is not linked to this plan yet. Tick it above and wait for the update, then try again.'
      );
      return;
    }

    const payload = {
      name: f.controls.name.value.trim(),
      description: f.controls.description.value.trim() || undefined,
      contributionDescription: f.controls.contributionDescription.value.trim() || undefined,
      parentGoalId,
      weight: Number(f.controls.weight.value),
    };

    this.crudSubmitting.set(true);
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
      error: (error) => {
        this.crudSubmitting.set(false);
        this.reloadPlan();
        this.notifications.error(toApiError(error).message);
      },
    });
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
      error: (error) => this.notifications.error(toApiError(error).message),
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
    weight: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.min(0.01), Validators.max(100)],
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

  /** Unallocated KPI weight inside a goal, used as the default for a new KPI. */
  private remainingKpiWeight(goal: DivisionGoalDto): number {
    const used = goal.kpis.reduce((sum, k) => sum + (k.weight ?? 0), 0);
    return Math.max(0, round1(100 - used));
  }

  openCreateKpi(goal: DivisionGoalDto): void {
    if (!this.canEdit()) return;
    this.kpiEditingId.set(null);
    this.kpiParentGoalId.set(goal.id);
    this.kpiForm.reset({
      name: '',
      description: '',
      unit: '',
      weight: this.remainingKpiWeight(goal),
      optimizationType: 'Maximize',
      kpiType: 'Lagging',
      dataSource: 'Manual',
      isCumulative: true,
      baseline: null,
      minValue: null,
      maxValue: null,
    });
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
      weight: kpi.weight,
      optimizationType: (kpi.optimizationType as 'Maximize' | 'Minimize' | 'ExactHit' | 'Binary') || 'Maximize',
      kpiType: (kpi.kpiType as 'Leading' | 'Lagging') || 'Lagging',
      dataSource: (kpi.dataSource as 'Manual' | 'Automated' | 'Calculated') || 'Manual',
      isCumulative: kpi.isCumulative,
      baseline: kpi.baseline ?? null,
      minValue: kpi.minValue ?? null,
      maxValue: kpi.maxValue ?? null,
    });
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
    const p = this.plan();
    const goal = this.kpiParentGoal();
    if (!p || !goal) return;

    const f = this.kpiForm;
    const payload = {
      name: f.controls.name.value.trim(),
      description: f.controls.description.value.trim() || undefined,
      unit: f.controls.unit.value.trim() || undefined,
      weight: Number(f.controls.weight.value),
      optimizationType: f.controls.optimizationType.value,
      kpiType: f.controls.kpiType.value,
      dataSource: f.controls.dataSource.value,
      isCumulative: f.controls.isCumulative.value,
      baseline: f.controls.baseline.value ?? undefined,
      minValue: f.controls.minValue.value ?? undefined,
      maxValue: f.controls.maxValue.value ?? undefined,
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
      error: (error) => {
        this.crudSubmitting.set(false);
        this.notifications.error(toApiError(error).message);
      },
    });
  }

  /**
   * Reuses the corporate target-configuration page for a division KPI. The KPI is a normal
   * Kpi row, so the same persisted KpiTarget values drive the scoring engine; the return
   * URL brings the user back to this plan with the division still selected.
   */
  openKpiTargets(kpi: DivisionKpiDto): void {
    const p = this.plan();
    if (!p || !this.canEdit() || !this.canConfigureTargets()) return;
    const returnUrl = `/division-planning/${p.scorecardId}?divisionId=${encodeURIComponent(p.divisionId)}`;
    this.router.navigate(['/target-config'], {
      queryParams: {
        kpiId: kpi.id,
        scorecardId: p.scorecardId,
        fiscalYearId: p.fiscalYearId,
        returnUrl,
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
      error: (error) => this.notifications.error(toApiError(error).message),
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
      error: (error) => {
        this.finalizing.set(false);
        this.notifications.error(toApiError(error).message);
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
    return lock?.state === 'open' && !!lock.fiscalPeriodId;
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
    if (!p || !month || !periodId || this.entrySaving() || !this.canEnterActuals()) return;
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
      error: (error) => {
        this.entrySaving.set(null);
        this.notifications.error(toApiError(error).message);
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
    if (this.canEnterActuals()) {
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
  /** Every scorecard, kept private: the picker only offers corporate scorecards. */
  private readonly allScorecards = signal<Scorecard[]>([]);
  /** Division plans always align to the corporate scorecard, so the picker is Corporate-only. */
  readonly scorecards = computed<Scorecard[]>(() =>
    this.allScorecards()
      .filter((s) => s.scope === 'Corporate')
      .sort((a, b) => a.name.localeCompare(b.name))
  );
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

  /**
   * Division plans are built against a corporate scorecard. A route that points at a
   * Division-scope scorecard (the scorecard list still links those here) is redirected to
   * the corporate scorecard of the same fiscal year, or the first corporate scorecard.
   * Returns false when a redirect was issued so the caller can skip loading the old plan.
   */
  private ensureCorporateScorecard(routeScorecardId: string): boolean {
    const all = this.allScorecards();
    // Scorecards have not arrived yet; the loader re-runs this check once they do.
    if (all.length === 0) return true;

    const routeScorecard = all.find((s) => s.id === routeScorecardId);
    if (routeScorecard?.scope === 'Corporate') return true;

    const corporate = this.scorecards();
    if (corporate.length === 0) return true;

    const sameFiscalYear = routeScorecard
      ? corporate.find((s) => s.fiscalYearId === routeScorecard.fiscalYearId)
      : undefined;
    const target = sameFiscalYear ?? corporate[0];
    if (target.id === routeScorecardId) return true;

    this.loading.set(true);
    this.scorecardFilter.set(target.id);
    void this.router.navigate(['/division-planning', target.id], { replaceUrl: true });
    return false;
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
    // Returning from target configuration carries the division that was selected so the
    // plan reopens on the same division instead of falling back to the default.
    const requestedDivisionId = this.route.snapshot?.queryParamMap?.get('divisionId')?.trim() ?? '';
    if (requestedDivisionId) this.divisionFilter.set(requestedDivisionId);

    this.scorecardService.getFiscalYears().subscribe({
      next: (years) => this.fiscalYears.set(years),
    });
    this.divisionService.getAll().subscribe({
      next: (divisions) => {
        const ownId = this.userStore.divisionId();
        const scoped = ownId
          ? divisions.filter((d) => d.id === ownId)
          : [...divisions].sort((a, b) => a.name.localeCompare(b.name));
        this.divisions.set(scoped);

        // A plan always belongs to a division. Default to the account's own division, or to
        // the first division for corporate users, so linking goals never posts an empty
        // DivisionId (the API rejects that with "Division is required."). A division restored
        // from the return URL is kept only while it is still in the visible list.
        const requested = this.divisionFilter();
        const restored = scoped.some((d) => d.id === requested) ? requested : '';
        const preferred = ownId || restored || scoped[0]?.id || '';
        if (preferred && preferred !== this.divisionFilter()) {
          this.divisionFilter.set(preferred);
          if (this.scorecardId()) this.reloadPlan();
        }
      },
    });
    // The corporate scorecard picker is a corporate capability; a baseline employee is
    // pinned to the scorecard their own division plan references and must not probe others.
    if (this.userStore.hasPermission('scorecard:view')) {
      this.scorecardService.getAll().subscribe({
        next: (scorecards) => {
          this.allScorecards.set(scorecards);
          const current = this.scorecardId();
          if (current) this.ensureCorporateScorecard(current);
        },
      });
    }
    this.route.paramMap.subscribe((params) => {
      const id = params.get('scorecardId') ?? '';
      if (!id) {
        this.openOwnDivisionPlan();
        return;
      }
      this.scorecardId.set(id);
      if (!this.ensureCorporateScorecard(id)) return;
      this.reloadPlan();
    });
  }

  /**
   * Baseline employees have no corporate scorecard list, so the navigation entry lands here
   * without an id. Their own division is known from the authenticated scope; the plan summaries
   * are already scoped by the backend, so any id returned here belongs to that division.
   */
  private openOwnDivisionPlan(): void {
    const ownDivisionId = this.userStore.divisionId();
    if (!ownDivisionId) {
      this.loading.set(false);
      this.loadError.set('No corporate scorecard was selected.');
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);
    this.divisionService.getPlans(ownDivisionId).subscribe({
      next: (plans) => {
        const plan = plans[0];
        if (!plan) {
          this.loading.set(false);
          this.loadError.set('No scorecard has been assigned to your division yet.');
          return;
        }

        this.divisionFilter.set(ownDivisionId);
        this.scorecardFilter.set(plan.scorecardId);
        void this.router.navigate(['/division-planning', plan.scorecardId], {
          queryParams: { divisionId: ownDivisionId },
          replaceUrl: true,
        });
      },
      error: (error) => {
        this.loading.set(false);
        this.loadError.set(toApiError(error).message);
      },
    });
  }

  private reloadSequence = 0;

  private reloadPlan(): void {
    if (!this.scorecardId()) {
      this.loading.set(false);
      this.loadError.set('No corporate scorecard was selected.');
      return;
    }
    // Period/division/filter changes can overlap; only the newest response may win.
    const sequence = ++this.reloadSequence;
    this.loading.set(true);
    this.loadError.set(null);
    const ownDivision = this.userStore.isDivisionAccount() ? this.userStore.divisionId() : null;
    const divisionId = this.divisionFilter() || ownDivision || undefined;
    this.divisionService
      .getPlanContextByScorecard(this.scorecardId(), this.periodQuery(), divisionId)
.subscribe({
        next: (plan) => {
          if (sequence !== this.reloadSequence) return;
          this.plan.set(plan);
          this.selectedIds.set(new Set(plan.contributions.map((c) => c.goalId)));
          this.loading.set(false);
          this.syncFilters(plan);
          this.prepareEntry();
        },
        error: (error) => {
          if (sequence !== this.reloadSequence) return;
          this.loading.set(false);
          this.loadError.set(toApiError(error).message);
        },
      });
  }

  /** Re-runs the plan request after a failed load (or after the API comes back up). */
  retryLoad(): void {
    this.reloadPlan();
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

  reportValue(value?: number | null, unit?: string): string {
    if (value == null) return '—';
    return unit ? `${value} ${unit}` : `${value}`;
  }

  reportScore(value?: number | null): string {
    return value == null ? '—' : `${value}%`;
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
    if (!this.canExportReport()) {
      this.notifications.error('You do not have permission to export reports.');
      return;
    }
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
      error: (error) => {
        this.exporting.set(false);
        this.notifications.error(toApiError(error).message);
      },
    });
  }
}