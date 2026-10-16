import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';
import { Kpi } from '../../../features/kpi/kpi.model';
import { KpiService } from '../../../features/kpi/kpi.service';
import { PlanFilterService } from '../../../core/service/plan-filter.service';
import { KPIService } from '../../../core/service/kpi.service';
import { KpiTargetValue, SetKpiTargetsItem } from '../../../core/model/goal.model';
import { toApiError } from '../../../core/model/api-error';
import { NotificationService } from '../../../core/service/notification.service';
import { PlanFilterBar } from '../../../shared/reusableComponent/plan-filter-bar/plan-filter-bar';
import { fiscalMonthLabel, isFiscalYearClosed } from '../workspace-state.service';

/** One editable KPI row: the targets of a single KPI in the selected fiscal year. */
interface TargetRow {
  kpiId: string;
  name: string;
  scorecardName: string;
  goalName: string;
  kraName: string;
  unit: string;
  monthly: number[];
  quarterly: number[];
  annual: number | null;
  /** True when the KPI already had targets in this fiscal year. */
  hasTargets: boolean;
  /** Edited since the last successful save, so only those rows are sent. */
  dirty: boolean;
  /** Client side or server side problem that keeps this row from being saved. */
  error: string | null;
}

const emptyMonthly = (): number[] => Array(12).fill(0) as number[];

/**
 * Create Targets for a whole fiscal year at once: the shared cascade filter narrows the
 * scope, every KPI in it becomes an editable row, and one Save sends the changed rows.
 */
@Component({
  selector: 'app-targets',
  imports: [DecimalPipe, PlanFilterBar],
  templateUrl: './targets.html',
  styleUrl: './targets.scss',
})
export class TargetsPage implements OnDestroy {
  private readonly filters = inject(PlanFilterService);
  private readonly kpiService = inject(KpiService);
  private readonly kpiTargetService = inject(KPIService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);

  readonly rows = signal<TargetRow[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  /** Rows that failed on the server, so the user can correct and retry just those. */
  readonly failedKpiIds = signal<string[]>([]);

  /** The KPI a Configure Target link pointed at, highlighted once the rows arrive. */
  readonly highlightedKpiId = signal<string | null>(null);

  private loadRequest = 0;
  private optionsApplied = false;
  private readonly subscription: Subscription;

  /** Targets belong to a fiscal year, so the grid stays empty until one is chosen. */
  readonly hasFiscalYear = computed(() => !!this.filters.fiscalYearId());

  /** `Jan`, `Feb`… derived from the selected fiscal year's start month. */
  readonly monthHeaders = computed(() => {
    const startDate = this.selectedFiscalYear()?.startDate;
    return Array.from({ length: 12 }, (_unused, i) => fiscalMonthLabel(startDate, i + 1));
  });

  readonly selectedFiscalYear = computed(() =>
    this.filters.fiscalYears().find((year) => year.id === this.filters.fiscalYearId())
  );

  /** FR-703: a closed or ended fiscal year makes all of its targets read-only. */
  readonly isReadOnly = computed(() => isFiscalYearClosed(this.selectedFiscalYear()));

  readonly dirtyRows = computed(() => this.rows().filter((row) => row.dirty));
  readonly invalidRows = computed(() => this.dirtyRows().filter((row) => !!row.error));
  readonly savedCount = computed(() => this.rows().filter((row) => row.hasTargets).length);

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    this.highlightedKpiId.set(params.get('kpiId'));
    this.filters.applyHierarchy({
      fiscalYearId: params.get('fiscalYearId'),
      scorecardId: params.get('scorecardId'),
      goalId: params.get('goalId'),
      kraId: params.get('kraId'),
    });

    this.subscription = this.filters.applies.subscribe(() => this.reload());

    // Reached straight from the sidebar, so this page owns loading the option lists. The
    // call is safe to repeat: the last one wins.
    this.filters.loadOptions();

    // The deep link is applied before the option lists arrive, so the scorecard filter is
    // still empty at that point. Reload once the options land to pick up the labels.
    effect(() => {
      if (this.filters.allScorecards().length && !this.optionsApplied) {
        this.optionsApplied = true;
        this.reload();
      }
    });
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  canSave(): boolean {
    return this.dirtyRows().length > 0 && this.invalidRows().length === 0 && !this.saving() && !this.isReadOnly();
  }

  onAnnualChange(row: TargetRow, value: string): void {
    this.update(row.kpiId, (current) => ({ ...current, annual: value === '' ? null : Number(value) }));
  }

  onMonthlyChange(row: TargetRow, index: number, value: string): void {
    this.update(row.kpiId, (current) => {
      const monthly = [...current.monthly];
      monthly[index] = value === '' ? 0 : Number(value);
      return { ...current, monthly };
    });
  }

  onQuarterlyChange(row: TargetRow, index: number, value: string): void {
    this.update(row.kpiId, (current) => {
      const quarterly = [...current.quarterly];
      quarterly[index] = value === '' ? 0 : Number(value);
      return { ...current, quarterly };
    });
  }

  /** Spreads one row's annual target over its 12 months, largest remainder first. */
  distribute(row: TargetRow): void {
    if (row.annual === null) return;
    this.update(row.kpiId, (current) => ({ ...current, monthly: spreadEvenly(current.annual!) }));
  }

  /** Same as {@link distribute} for every row that already has an annual target. */
  distributeAll(): void {
    const rows = this.rows();
    if (!rows.some((row) => row.annual !== null)) return;
    this.rows.set(
      rows.map((row) =>
        row.annual === null
          ? row
          : { ...row, monthly: spreadEvenly(row.annual), dirty: true, error: null }
      )
    );
  }

  monthlyTotal(row: TargetRow): number {
    return row.monthly.reduce((acc, value) => acc + (+value || 0), 0);
  }

  quarterlyTotal(row: TargetRow): number {
    return row.quarterly.reduce((acc, value) => acc + (+value || 0), 0);
  }

  /** Advisory only: the backend does not require the annual target to equal the month sum. */
  annualMismatch(row: TargetRow): boolean {
    if (row.annual === null) return false;
    return Math.abs(row.annual - this.monthlyTotal(row)) >= 0.01;
  }

  rowState(row: TargetRow): string {
    if (row.error || this.failedKpiIds().includes(row.kpiId)) return 'invalid';
    if (row.dirty) return 'dirty';
    return row.hasTargets ? 'saved' : 'blank';
  }

  save(): void {
    if (this.isReadOnly()) return;
    const fiscalYearId = this.filters.fiscalYearId();
    const targets = this.dirtyRows().filter((row) => !row.error);
    if (!fiscalYearId || targets.length === 0) return;

    const items: SetKpiTargetsItem[] = targets.map((row) => ({
      kpiId: row.kpiId,
      monthlyTargets: row.monthly.map((value) => +value || 0),
      quarterlyTargets: row.quarterly.map((value) => +value || 0),
      annualTarget: row.annual,
    }));

    this.saving.set(true);
    this.kpiTargetService
      .setTargetsBulk({ fiscalYearId, targets: items })
      .subscribe({
        next: (response) => {
          this.saving.set(false);
          this.applyResults(response.result?.results ?? []);

          const failed = response.result?.failedCount ?? 0;
          if (failed === 0) {
            this.notifications.success(response.message || 'KPI targets saved successfully.');
            return;
          }

          // Keep the rejected rows dirty so their values are not lost.
          this.notifications.error(
            `${response.message} Correct the highlighted rows and save again.`
          );
        },
        error: (err) => {
          this.saving.set(false);
          this.notifications.error(toApiError(err).message);
        },
      });
  }

  private applyResults(results: { kpiId: string; success: boolean; message?: string | null }[]): void {
    const outcome = new Map(results.map((r) => [r.kpiId, r]));
    this.rows.update((rows) =>
      rows.map((row) => {
        const result = outcome.get(row.kpiId);
        if (!result) return row;
        if (result.success) return { ...row, dirty: false, error: null };
        return { ...row, dirty: true, error: result.message ?? 'Could not be saved.' };
      })
    );
    this.failedKpiIds.set(results.filter((r) => !r.success).map((r) => r.kpiId));
  }

  private update(
    kpiId: string,
    change: (row: TargetRow) => Pick<TargetRow, 'annual' | 'monthly' | 'quarterly'>
  ): void {
    this.rows.update((rows) =>
      rows.map((row) => {
        if (row.kpiId !== kpiId) return row;
        const edited: TargetRow = { ...row, ...change(row), dirty: true };
        return { ...edited, error: this.validate(edited) };
      })
    );
  }

  /** Mirrors the per-KPI rules the bulk endpoint applies on the server. */
  private validate(row: TargetRow): string | null {
    if (row.annual === null || Number.isNaN(row.annual)) return 'Annual target is required.';
    if (row.annual < 0) return 'Annual target must be zero or greater.';
    if (row.monthly.length !== 12) return 'Monthly targets for all 12 months are required.';
    if (row.monthly.some((value) => Number.isNaN(value) || value < 0)) {
      return 'Monthly target must be zero or greater.';
    }
    if (row.quarterly.length !== 4 || row.quarterly.some((value) => Number.isNaN(value) || value < 0)) {
      return 'Quarterly targets must cover all 4 quarters and be zero or greater.';
    }
    return null;
  }

  private reload(): void {
    const fiscalYearId = this.filters.fiscalYearId();
    if (!fiscalYearId) {
      this.rows.set([]);
      this.loading.set(false);
      this.failedKpiIds.set([]);
      return;
    }

    const request = ++this.loadRequest;
    this.loading.set(true);
    this.failedKpiIds.set([]);

    forkJoin({
      kpis: this.kpiService.getAll({
        fiscalYearId,
        scorecardId: this.filters.scorecardId() || undefined,
        goalId: this.filters.goalId() || undefined,
        kraId: this.filters.kraId() || undefined,
      }),
      targets: this.kpiTargetService.getTargetsBulk(fiscalYearId, this.filters.scorecardId() || undefined),
    }).subscribe({
      next: ({ kpis, targets }) => {
        if (request !== this.loadRequest) return;
        const bundles = new Map(targets.kpis.map((bundle) => [bundle.kpiId, bundle.targets]));
        this.rows.set(kpis.map((kpi) => this.toRow(kpi, bundles.get(kpi.id) ?? [])));
        this.loading.set(false);
      },
      error: (err) => {
        if (request !== this.loadRequest) return;
        this.rows.set([]);
        this.loading.set(false);
        this.notifications.error(toApiError(err).message);
      },
    });
  }

  private toRow(kpi: Kpi, targets: KpiTargetValue[]): TargetRow {
    const monthly = emptyMonthly();
    const quarterly = [0, 0, 0, 0];
    let annual: number | null = null;

    for (const target of targets) {
      if (target.granularity === 'Monthly' && target.fiscalMonth >= 1 && target.fiscalMonth <= 12) {
        monthly[target.fiscalMonth - 1] = +target.targetValue || 0;
      } else if (target.granularity === 'Quarterly' && target.quarter >= 1 && target.quarter <= 4) {
        quarterly[target.quarter - 1] = +target.targetValue || 0;
      } else if (target.granularity === 'Annual') {
        annual = +target.targetValue || 0;
      }
    }

    return {
      kpiId: kpi.id,
      name: kpi.name,
      scorecardName: kpi.scorecardName ?? '—',
      goalName: kpi.goalName ?? '—',
      kraName: kpi.kraName ?? '—',
      unit: kpi.unit ?? '',
      monthly,
      quarterly,
      annual,
      hasTargets: targets.length > 0,
      dirty: false,
      error: null,
    };
  }
}

/** Even split of `annual` over 12 months, with the remainder pushed into the first months. */
function spreadEvenly(annual: number): number[] {
  const base = Math.floor(annual / 12);
  const months = emptyMonthly().fill(base);
  let remainder = annual - base * 12;
  for (let i = 0; remainder > 0 && i < 12; i++, remainder--) {
    months[i] += 1;
  }
  return months;
}
