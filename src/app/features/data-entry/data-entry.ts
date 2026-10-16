import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { LowerCasePipe } from '@angular/common';
import { KPI, KpiActualValue } from '../../core/model/goal.model';
import { KPIService } from '../../core/service/kpi.service';
import {
  ScorecardWorkspaceState,
  fiscalMonthForDate,
  fiscalMonthLabel,
} from '../strategic-scorecard/workspace-state.service';
import { toApiError } from '../../core/model/api-error';
import { NotificationService } from '../../core/service/notification.service';

type CellState = 'open' | 'pending' | 'locked';

export interface DataCell {
  value: number | null;
  dataSource?: string;
  dirty: boolean;
}

export interface PeriodCol {
  month: number;
  short: string;
  state: CellState;
  fiscalPeriodId: string;
  entryOpenDate?: string;
  cutoffDate?: string;
  counts: { filled: number; unfilled: number };
}

@Component({
  selector: 'app-data-entry',
  imports: [LowerCasePipe],
  templateUrl: './data-entry.html',
  styleUrl: './data-entry.scss',
})
export class DataEntryPage implements OnInit {
  private readonly kpiService = inject(KPIService);
  private readonly state = inject(ScorecardWorkspaceState);
  private readonly notifications = inject(NotificationService);

  ngOnInit(): void {
    this.state.loadFiscalYearsAndScorecards();
  }

  readonly fiscalYears = this.state.fiscalYears;
  readonly fiscalYearId = this.state.fiscalYearId;
  readonly scorecardId = this.state.scorecardId;

  /** Scorecards belonging to the selected fiscal year only. */
  readonly scorecardsForFiscalYear = computed(() =>
    this.state
      .scorecards()
      .filter((sc) => sc.fiscalYearId === this.state.fiscalYearId())
  );

  readonly monthState = this.state.monthState;
  readonly kpis = this.state.kpis;
  readonly loading = this.state.loading;

  // ── FR-703 closure gating ────────────────────────────────────────────────
  readonly isReadOnly = this.state.isReadOnly;
  readonly scorecardClosed = this.state.scorecardClosed;
  readonly fiscalYearClosed = this.state.fiscalYearClosed;
  readonly canEnterActuals = this.state.canEnterActuals;
  readonly hasActualsOverride = this.state.hasActualsOverride;
  /** Audited reason captured when entering actuals on a closed scorecard. */
  readonly overrideReason = signal('');

  readonly grid = signal(new Map<string, DataCell[]>());
  readonly loadingCells = signal(true);
  readonly savingCell = signal<{ kpiId: string; month: number } | null>(null);
  private gridRequest = 0;

  readonly periods = computed<PeriodCol[]>(() => {
    const lockMap = this.monthState();
    const grid = this.grid();
    const kpiCount = this.kpis().length;
    const startDate = this.state.selectedFiscalYear()?.startDate;
    return Array.from({ length: 12 }, (_unused, i) => i + 1).map((month) => {
      const raw = lockMap.get(month);
      const state: CellState =
        !raw ? 'open' : raw.state === 'open' ? 'open' : raw.state === 'notYetOpen' ? 'pending' : 'locked';
      let filled = 0;
      if (state !== 'locked') {
        for (const cells of grid.values()) {
          const cell = cells[month - 1];
          if (cell && cell.value !== null && cell.value !== undefined) filled++;
        }
      }
      return {
        month,
        short: fiscalMonthLabel(startDate, month),
        state,
        fiscalPeriodId: raw?.fiscalPeriodId ?? '',
        entryOpenDate: raw?.effectiveEntryOpenDate,
        cutoffDate: raw?.effectiveCutoffDate,
        counts: { filled, unfilled: kpiCount - filled },
      };
    });
  });

  readonly currentMonth = computed(() => {
    const fy = this.state.selectedFiscalYear();
    if (!fy) return null;
    return fiscalMonthForDate(fy.startDate);
  });

  onFiscalYearChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (id) this.state.selectFiscalYear(id);
  }

  onScorecardChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (id) this.state.selectScorecard(id);
  }

  onOverrideReasonInput(event: Event): void {
    this.overrideReason.set((event.target as HTMLInputElement).value);
  }

    constructor() {
    effect(() => {
      const scorecardId = this.state.scorecardId();
      const fiscalYearId = this.state.fiscalYearId();
      const kpis = this.kpis();
      if (scorecardId && fiscalYearId && kpis.length) this.loadGrid();
    });
  }

  loadGrid(): void {
    const request = ++this.gridRequest;
    const kpis = this.kpis();
    if (!kpis.length) {
      this.grid.set(new Map());
      this.loadingCells.set(false);
      return;
    }
    this.loadingCells.set(true);
    const results = new Map<string, DataCell[]>();
    let pending = kpis.length;

    for (const kpi of kpis) {
      this.kpiService.getActuals(kpi.id, this.state.fiscalYearId()!).subscribe({
        next: (actuals) => {
          if (request !== this.gridRequest) return;
          const cells: DataCell[] = [];
          const byMonth = new Map<number, KpiActualValue>();
          for (const a of actuals) byMonth.set(a.fiscalMonth, a);
          for (let m = 1; m <= 12; m++) {
            const a = byMonth.get(m);
            cells.push({ value: a?.value ?? null, dataSource: a?.dataSource, dirty: false });
          }
          results.set(kpi.id, cells);
          if (--pending === 0) {
            this.grid.set(results);
            this.loadingCells.set(false);
          }
        },
        error: () => {
          if (request !== this.gridRequest) return;
          results.set(kpi.id, Array.from({ length: 12 }, () => ({ value: null, dirty: false })));
          if (--pending === 0) {
            this.grid.set(results);
            this.loadingCells.set(false);
          }
        },
      });
    }
  }

  cellsFor(kpiId: string): DataCell[] {
    return this.grid().get(kpiId) ?? [];
  }

  cellValue(kpiId: string, month: number): DataCell | undefined {
    return this.cellsFor(kpiId)[month - 1];
  }

  setCellValue(kpiId: string, month: number, value: string): void {
    const map = this.grid();
    const cells = [
      ...(map.get(kpiId) ?? (Array.from({ length: 12 }, () => ({ value: null as number | null, dirty: false })) as DataCell[])),
    ];
    const cell = cells[month - 1];
    cells[month - 1] = {
      value: value === '' ? null : Number(value),
      dataSource: cell.dataSource,
      dirty: true,
    };
    map.set(kpiId, cells);
    this.grid.set(new Map(map));
  }

  periodFor(month: number): PeriodCol {
    return this.periods()[month - 1];
  }

  isEditable(month: number): boolean {
    if (!this.canEnterActuals()) return false;
    const p = this.periodFor(month);
    if (!p.fiscalPeriodId) return false;
    // On a closed scorecard an audited override unlocks any existing period;
    // otherwise only calendar-open periods accept entry.
    if (this.isReadOnly()) return true;
    return p.state === 'open';
  }

  save(kpi: KPI, month: number): void {
    if (!this.canEnterActuals()) return;
    const period = this.periodFor(month);
    if (!period.fiscalPeriodId) return;
    if (!this.isReadOnly() && period.state === 'locked') return;

    const reason = this.overrideReason().trim();
    if (this.isReadOnly() && !reason) {
      this.notifications.error('An override reason is required to edit a closed scorecard.');
      return;
    }

    const cell = this.cellValue(kpi.id, month);
    if (!cell || !cell.dirty) return;

    this.savingCell.set({ kpiId: kpi.id, month });
    this.kpiService
      .enterActual({
        kpiId: kpi.id,
        fiscalPeriodId: period.fiscalPeriodId,
        value: cell.value ?? 0,
        dataSource: 'Manual',
        overrideReason: this.isReadOnly() ? reason : undefined,
      })
      .subscribe({
        next: (saved) => {
          const map = this.grid();
          const cells = [...(map.get(kpi.id) ?? [])];
          cells[month - 1] = { value: saved.value, dataSource: saved.dataSource, dirty: false };
          map.set(kpi.id, cells);
          this.grid.set(new Map(map));
          this.savingCell.set(null);
          this.notifications.success(`Saved ${kpi.name} for ${this.periodFor(month).short}.`);
        },
        error: (err) => {
          this.savingCell.set(null);
          this.notifications.error(toApiError(err).message);
        },
      });
  }

  bulkFill(): void {
    if (!this.canEnterActuals()) return;
    const kpis = this.kpis();
    const periods = this.periods();
    const map = this.grid();
    const readOnly = this.isReadOnly();
    const reason = this.overrideReason().trim();
    if (readOnly && !reason) {
      this.notifications.error('An override reason is required to edit a closed scorecard.');
      return;
    }
    let saved = 0;
    let failed = 0;

    for (const kpi of kpis) {
      const cells = this.cellsFor(kpi.id);
      for (const period of periods) {
        const eligible = readOnly
          ? !!period.fiscalPeriodId
          : period.state === 'open' && !!period.fiscalPeriodId;
        if (!eligible) continue;
        const cell = cells[period.month - 1];
        if (cell?.dirty) {
          this.kpiService
            .enterActual({
              kpiId: kpi.id,
              fiscalPeriodId: period.fiscalPeriodId,
              value: cell.value ?? 0,
              dataSource: 'Manual',
              overrideReason: readOnly ? reason : undefined,
            })
            .subscribe({
              next: () => {
                saved++;
                if (saved + failed === this.totalDirtyCount()) {
                  if (saved) this.notifications.success(`Saved ${saved} cell(s).`);
                  if (failed) this.notifications.error(`${failed} cell(s) could not be saved.`);
                  this.loadGrid();
                }
              },
              error: () => {
                failed++;
                if (saved + failed === this.totalDirtyCount()) {
                  if (saved) this.notifications.success(`Saved ${saved} cell(s).`);
                  if (failed) this.notifications.error(`${failed} cell(s) could not be saved.`);
                  this.loadGrid();
                }
              },
            });
        }
      }
    }
    if (!this.totalDirtyCount()) {
      this.notifications.info('No unsaved changes.');
    }
  }

  totalDirtyCount(): number {
    let count = 0;
    for (const cells of this.grid().values()) {
      for (const c of cells) if (c.dirty) count++;
    }
    return count;
  }

  ytd(cells: DataCell[]): number {
    return cells.reduce((acc, c) => acc + (c.value ?? 0), 0);
  }

  periodTone(state: CellState): string {
    return state === 'open' ? 'ok' : state === 'pending' ? 'soon' : 'locked';
  }

  stateLabel(state: CellState): string {
    return state === 'open' ? 'Open' : state === 'pending' ? 'Not yet open' : 'Locked';
  }

  isSaving(kpiId: string, month: number): boolean {
    const s = this.savingCell();
    return !!s && s.kpiId === kpiId && s.month === month;
  }

  recalculateScores(): void {
    const scorecardId = this.state.scorecardId();
    const current = this.currentMonth();
    if (!scorecardId || !current) return;
    const period = this.periodFor(current);
    if (!period.fiscalPeriodId) {
      this.notifications.error('No fiscal period available to recalculate.');
      return;
    }
    this.state.loading.set(true);
    this.kpiService.recalculate(scorecardId, period.fiscalPeriodId).subscribe({
      next: (res) => {
        this.state.loading.set(false);
        this.notifications.success(res.message ?? 'Scores recalculated.');
        this.state.reloadScores();
      },
      error: (err) => {
        this.state.loading.set(false);
        this.notifications.error(toApiError(err).message);
      },
    });
  }
}