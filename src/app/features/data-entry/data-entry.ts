import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { KPI, KpiActualValue } from '../../core/model/goal.model';
import { KPIService } from '../../core/service/kpi.service';
import { UserStore } from '../../core/service/user-store.service';
import {
  ScorecardWorkspaceState,
  fiscalMonthForDate,
  fiscalMonthLabel,
  kpiEntries,
} from '../strategic-scorecard/workspace-state.service';
import { toApiError } from '../../core/model/api-error';
import { NotificationService } from '../../core/service/notification.service';

type CellState = 'open' | 'pending' | 'locked';

export interface DataCell {
  value: number | null;
  note?: string;
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
  reminderDays: number;
  counts: { filled: number; unfilled: number };
}

export interface PreviousMonthRow {
  month: number;
  label: string;
  target: number | null;
  actual: number | null;
  score: number | null;
  locked: boolean;
}

const DAY_MS = 86_400_000;

/** Parses the date part of an API date ('2026-08-01' or '2026-08-01T00:00:00') as a UTC calendar day. */
function utcDay(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}
const PREVIOUS_MONTHS_SHOWN = 4;

@Component({
  selector: 'app-data-entry',
  imports: [DecimalPipe],
  templateUrl: './data-entry.html',
  styleUrl: './data-entry.scss',
})
export class DataEntryPage implements OnInit {
  private readonly kpiService = inject(KPIService);
  private readonly state = inject(ScorecardWorkspaceState);
  private readonly notifications = inject(NotificationService);
  private readonly userStore = inject(UserStore);

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

  readonly grid = signal(new Map<string, DataCell[]>());
  readonly loadingCells = signal(true);
  readonly savingCell = signal<{ kpiId: string; month: number } | null>(null);
  readonly savingAll = signal(false);
  readonly focusKpiId = signal<string | null>(null);
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
        reminderDays: raw?.effectiveReminderDaysBeforeCutoff ?? 2,
        counts: { filled, unfilled: kpiCount - filled },
      };
    });
  });

  readonly currentMonth = computed(() => {
    const fy = this.state.selectedFiscalYear();
    if (!fy) return null;
    return fiscalMonthForDate(fy.startDate);
  });

  /**
   * The month the user is reporting on: the earliest month whose entry window is open.
   * When nothing is open (e.g. between windows) it falls back to the current fiscal month,
   * which is then shown read-only.
   */
  readonly reportingMonth = computed<number | null>(() => {
    const periods = this.periods();
    if (!this.state.selectedFiscalYear()) return null;
    const open = periods.find((p) => p.state === 'open' && !!p.fiscalPeriodId);
    return open?.month ?? this.currentMonth();
  });

  readonly reportingPeriod = computed<PeriodCol | null>(() => {
    const month = this.reportingMonth();
    return month ? (this.periods()[month - 1] ?? null) : null;
  });

  readonly reportingShort = computed(() => this.reportingPeriod()?.short ?? '');

  readonly reportingLabel = computed(() => {
    const month = this.reportingMonth();
    return month ? this.monthYearLabel(month) : '';
  });

  readonly windowText = computed(() => {
    const p = this.reportingPeriod();
    if (!p?.entryOpenDate || !p.cutoffDate) return '—';
    const open = utcDay(p.entryOpenDate);
    const cutoff = utcDay(p.cutoffDate);
    const fmt = (d: Date, withYear: boolean) =>
      d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(withYear ? { year: 'numeric' as const } : {}),
        timeZone: 'UTC',
      });
    return open.getUTCFullYear() === cutoff.getUTCFullYear()
      ? `${fmt(open, false)} – ${fmt(cutoff, true)}`
      : `${fmt(open, true)} – ${fmt(cutoff, true)}`;
  });

  /** Whole days from today to the cutoff date (0 on the cutoff day), or null when not applicable. */
  readonly daysUntilLock = computed<number | null>(() => {
    const p = this.reportingPeriod();
    if (!p?.cutoffDate || p.state !== 'open') return null;
    const cutoffUtc = utcDay(p.cutoffDate).getTime();
    const now = new Date();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.round((cutoffUtc - todayUtc) / DAY_MS));
  });

  readonly lockText = computed(() => {
    const p = this.reportingPeriod();
    if (!p) return '—';
    if (p.state === 'locked') return 'Locked';
    if (p.state === 'pending') return 'Not yet open';
    const days = this.daysUntilLock();
    if (days === null) return '—';
    if (days === 0) return 'Last day';
    return days === 1 ? '1 day remaining' : `${days} days remaining`;
  });

  /** Highlights the countdown once the reminder threshold configured for the period is reached. */
  readonly lockUrgent = computed(() => {
    const p = this.reportingPeriod();
    const days = this.daysUntilLock();
    return !!p && days !== null && days <= p.reminderDays;
  });

  readonly windowBadge = computed<{ text: string; tone: 'ok' | 'soon' | 'locked' | 'pending' }>(() => {
    const p = this.reportingPeriod();
    if (!p) return { text: 'No open period', tone: 'pending' };
    if (p.state === 'locked') return { text: 'Entry window closed', tone: 'locked' };
    if (p.state === 'pending') return { text: 'Entry window not open yet', tone: 'pending' };
    return { text: 'Entry window open', tone: this.lockUrgent() ? 'soon' : 'ok' };
  });

  readonly canEnter = computed(() => {
    const p = this.reportingPeriod();
    return !!p && p.state === 'open' && !!p.fiscalPeriodId;
  });

  readonly canOverride = computed(() => this.userStore.hasPermission('actuals:override'));

  readonly entrySubtitle = computed(() => {
    const departments = new Set(
      this.kpis()
        .map((k) => k.divisionOwnerName ?? k.departmentName)
        .filter((n): n is string => !!n)
    );
    const scope =
      departments.size === 1
        ? [...departments][0]
        : (this.state.selectedScorecard()?.name ?? '');
    const kpiScope = this.canOverride() ? 'All KPIs in scope' : 'KPIs assigned to me';
    return scope ? `${scope} · ${kpiScope}` : kpiScope;
  });

  readonly entryRows = computed(() => {
    const month = this.reportingMonth();
    if (!month) return [];
    return this.kpis().map((kpi) => ({
      kpi,
      target: this.targetFor(kpi.id, month),
      cell: this.cellValue(kpi.id, month),
    }));
  });

  readonly dirtyCount = computed(() => {
    const month = this.reportingMonth();
    if (!month) return 0;
    let count = 0;
    for (const cells of this.grid().values()) {
      if (cells[month - 1]?.dirty) count++;
    }
    return count;
  });

  readonly focusKpi = computed<KPI | null>(
    () => this.kpis().find((k) => k.id === this.focusKpiId()) ?? this.kpis()[0] ?? null
  );

  /** The most recent months before the reporting month, within the same fiscal year. */
  readonly previousRows = computed<PreviousMonthRow[]>(() => {
    const kpi = this.focusKpi();
    const reporting = this.reportingMonth();
    if (!kpi || !reporting) return [];

    const scoreByMonth = new Map<number, { score: number; at: string }>();
    for (const entry of kpiEntries(this.state.snapshot())) {
      if (entry.entityId !== kpi.id || entry.isPeriodAggregate) continue;
      if (entry.score === undefined || entry.score === null) continue;
      const known = scoreByMonth.get(entry.fiscalMonth);
      if (!known || entry.calculatedAt > known.at) {
        scoreByMonth.set(entry.fiscalMonth, { score: entry.score, at: entry.calculatedAt });
      }
    }

    const rows: PreviousMonthRow[] = [];
    for (let month = reporting - 1; month >= 1 && rows.length < PREVIOUS_MONTHS_SHOWN; month--) {
      rows.push({
        month,
        label: this.monthYearLabel(month),
        target: this.targetFor(kpi.id, month),
        actual: this.cellValue(kpi.id, month)?.value ?? null,
        score: scoreByMonth.get(month)?.score ?? null,
        locked: this.periods()[month - 1]?.state === 'locked',
      });
    }
    return rows;
  });

  constructor() {
    effect(() => {
      const scorecardId = this.state.scorecardId();
      const fiscalYearId = this.state.fiscalYearId();
      const kpis = this.kpis();
      if (scorecardId && fiscalYearId && kpis.length) this.loadGrid();
    });
  }

  onFiscalYearChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (id) this.state.selectFiscalYear(id);
  }

  onScorecardChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (id) this.state.selectScorecard(id);
  }

  selectKpi(id: string): void {
    this.focusKpiId.set(id);
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
            cells.push({ value: a?.value ?? null, note: a?.note, dataSource: a?.dataSource, dirty: false });
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

  /** Monthly target configured for the KPI in the selected fiscal year, if any. */
  targetFor(kpiId: string, month: number): number | null {
    const targets = this.state.kpiTargets().get(kpiId);
    const monthly = targets?.find((t) => t.granularity === 'Monthly' && t.fiscalMonth === month);
    return monthly ? monthly.targetValue : null;
  }

  private emptyCells(): DataCell[] {
    return Array.from({ length: 12 }, () => ({ value: null as number | null, dirty: false }));
  }

  setCellValue(kpiId: string, month: number, value: string): void {
    const map = this.grid();
    const cells = [...(map.get(kpiId) ?? this.emptyCells())];
    const cell = cells[month - 1];
    cells[month - 1] = {
      value: value === '' ? null : Number(value),
      note: cell.note,
      dataSource: cell.dataSource,
      dirty: true,
    };
    map.set(kpiId, cells);
    this.grid.set(new Map(map));
  }

  setCellNote(kpiId: string, month: number, note: string): void {
    const map = this.grid();
    const cells = [...(map.get(kpiId) ?? this.emptyCells())];
    const cell = cells[month - 1];
    cells[month - 1] = { value: cell.value, note, dataSource: cell.dataSource, dirty: true };
    map.set(kpiId, cells);
    this.grid.set(new Map(map));
  }

  periodFor(month: number): PeriodCol {
    return this.periods()[month - 1];
  }

  isEditable(month: number): boolean {
    const p = this.periodFor(month);
    return p.state === 'open' && !!p.fiscalPeriodId;
  }

  /** Saves a single row (Enter in a value or comment field). */
  save(kpi: KPI, month: number): void {
    const period = this.periodFor(month);
    if (!period.fiscalPeriodId || period.state !== 'open') return;
    const cell = this.cellValue(kpi.id, month);
    if (!cell || !cell.dirty) return;
    if (cell.value === null) {
      this.notifications.error(`Enter a value for ${kpi.name} before saving.`);
      return;
    }

    this.savingCell.set({ kpiId: kpi.id, month });
    this.kpiService
      .enterActual({
        kpiId: kpi.id,
        fiscalPeriodId: period.fiscalPeriodId,
        value: cell.value,
        dataSource: 'Manual',
        note: cell.note?.trim() || undefined,
      })
      .subscribe({
        next: (saved) => {
          const map = this.grid();
          const cells = [...(map.get(kpi.id) ?? [])];
          cells[month - 1] = {
            value: saved.value,
            note: saved.note ?? cell.note,
            dataSource: saved.dataSource,
            dirty: false,
          };
          map.set(kpi.id, cells);
          this.grid.set(new Map(map));
          this.savingCell.set(null);
          this.notifications.success(`Saved ${kpi.name} for ${this.periodFor(month).short}.`);
          this.state.reloadScores();
        },
        error: (err) => {
          this.savingCell.set(null);
          this.notifications.error(toApiError(err).message);
        },
      });
  }

  /** "Save entries": saves every changed row of the reporting month. */
  saveEntries(): void {
    const month = this.reportingMonth();
    if (!month || this.savingAll()) return;
    const period = this.periodFor(month);
    if (!period.fiscalPeriodId || period.state !== 'open') return;

    const jobs: Observable<string | null>[] = [];
    let skipped = 0;
    for (const kpi of this.kpis()) {
      const cell = this.cellValue(kpi.id, month);
      if (!cell?.dirty) continue;
      if (cell.value === null) {
        skipped++;
        continue;
      }
      jobs.push(
        this.kpiService
          .enterActual({
            kpiId: kpi.id,
            fiscalPeriodId: period.fiscalPeriodId,
            value: cell.value,
            dataSource: 'Manual',
            note: cell.note?.trim() || undefined,
          })
          .pipe(
            map(() => null as string | null),
            catchError((err) => of(toApiError(err).message))
          )
      );
    }

    if (!jobs.length) {
      this.notifications.info(skipped ? 'Enter a value before saving.' : 'No unsaved changes.');
      return;
    }

    this.savingAll.set(true);
    forkJoin(jobs).subscribe((results) => {
      const errors = results.filter((r): r is string => r !== null);
      const saved = results.length - errors.length;
      this.savingAll.set(false);
      if (saved) this.notifications.success(`Saved ${saved} ${saved === 1 ? 'entry' : 'entries'}.`);
      if (errors.length) this.notifications.error(errors[0]);
      this.loadGrid();
      this.state.reloadScores();
    });
  }

  isSaving(kpiId: string, month: number): boolean {
    const s = this.savingCell();
    return !!s && s.kpiId === kpiId && s.month === month;
  }

  scoreTone(score: number | null): string {
    if (score === null) return 'none';
    if (score >= 95) return 'ok';
    if (score >= 70) return 'warn';
    return 'bad';
  }

  /** First letter lower-cased so the KPI name reads naturally inside the section heading. */
  lowerFirst(text: string): string {
    return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
  }

  private monthYearLabel(month: number): string {
    const fy = this.state.selectedFiscalYear();
    if (!fy?.startDate) return fiscalMonthLabel(undefined, month, true);
    const start = utcDay(fy.startDate);
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + month - 1, 1));
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  recalculateScores(): void {
    const scorecardId = this.state.scorecardId();
    const month = this.reportingMonth();
    if (!scorecardId || !month) return;
    const period = this.periodFor(month);
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

  // ── Revision history (FR-312: append-only audit trail of actual writes) ────

  /** Open revisions dialog: KPI + reporting month + fetched revisions. */
  readonly historyState = signal<{
    kpi: KPI;
    month: number;
    rows: KpiActualValue[];
    loading: boolean;
  } | null>(null);

  /** Shows every recorded write for one KPI in one fiscal period (append-only). */
  openHistory(kpi: KPI, month: number): void {
    const period = this.periodFor(month);
    if (!period.fiscalPeriodId) {
      this.notifications.error('No fiscal period is attached to that month yet.');
      return;
    }
    this.historyState.set({ kpi, month, rows: [], loading: true });
    this.kpiService.getActualHistory(kpi.id, period.fiscalPeriodId).subscribe({
      next: (rows) => {
        const state = this.historyState();
        if (state?.kpi.id !== kpi.id) return;
        this.historyState.set({ ...state, rows, loading: false });
      },
      error: (err) => {
        const state = this.historyState();
        if (state?.kpi.id !== kpi.id) return;
        this.historyState.set({ ...state, rows: [], loading: false });
        this.notifications.error(toApiError(err).message);
      },
    });
  }

  closeHistory(): void {
    this.historyState.set(null);
  }

  historyRowDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  historyRowMonthLabel(month: number): string {
    return this.monthYearLabel(month);
  }
}
