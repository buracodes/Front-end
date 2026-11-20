import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { KPI, KpiActualValue, PeriodLockStatusItem } from '../../core/model/goal.model';
import { KPIService } from '../../core/service/kpi.service';
import { UserStore } from '../../core/service/user-store.service';
import {
  ScorecardWorkspaceState,
  fiscalMonthForDate,
  fiscalMonthLabel,
  isFiscalYearClosed,
  kpiEntries,
} from '../strategic-scorecard/workspace-state.service';
import { toApiError } from '../../core/model/api-error';
import { NotificationService } from '../../core/service/notification.service';
import { DivisionService } from '../division/division.service';
import {
  Division,
  DivisionActualValueDto,
  DivisionGoalDto,
  DivisionKpiDto,
  DivisionPlanDto,
  PlanStatusValue,
} from '../division/division.model';

type CellState = 'open' | 'pending' | 'locked';

/** Corporate reads the scorecard board; Division reads the selected division's plan. */
export type EntryScope = 'Corporate' | 'Division';

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

export interface EntryKpiRow {
  kpi: KPI;
  target: number | null;
  cell?: DataCell;
}

export interface CorporateKraGroup {
  key: string;
  kraName: string;
  rows: EntryKpiRow[];
}

export interface CorporateGoalGroup {
  key: string;
  goalName: string;
  kras: CorporateKraGroup[];
}

export interface DivisionKpiRow {
  kpi: DivisionKpiDto;
  target: number | null;
  cell?: DataCell;
}

export interface DivisionGoalRows {
  goal: DivisionGoalDto;
  rows: DivisionKpiRow[];
}

const DAY_MS = 86_400_000;

/** Parses the date part of an API date ('2026-08-01' or '2026-08-01T00:00:00') as a UTC calendar day. */
function utcDay(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

/** The API serializes the plan status as a camelCase string; the UI compares title case. */
function planStatusOf(value: PlanStatusValue | string | null | undefined): 'Draft' | 'Finalized' | 'Locked' {
  const status = (value ?? '').toString().toLowerCase();
  return status === 'finalized' ? 'Finalized' : status === 'locked' ? 'Locked' : 'Draft';
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
  private readonly divisionService = inject(DivisionService);

  ngOnInit(): void {
    this.state.loadFiscalYearsAndScorecards();
  }

  /**
   * Actuals are only entered in a year that is still open, so the picker offers the active
   * years only; closed years stay reachable on the targets and monitoring pages.
   */
  readonly fiscalYears = computed(() =>
    this.state.fiscalYears().filter((fy) => !isFiscalYearClosed(fy))
  );
  readonly fiscalYearId = this.state.fiscalYearId;
  readonly scorecardId = this.state.scorecardId;

  /** Corporate catalog visibility; the entry-scoped board replaces it for a data entry account. */
  readonly canViewCorporate = computed(
    () =>
      this.userStore.hasPermission('scorecard:view') ||
      this.userStore.hasPermission('performance:monitor.view')
  );

  /** Admin/Power User cross-division browse; mirrors the backend portfolio rule. */
  readonly isPortfolioViewer = computed(() =>
    this.userStore.hasPermission('performance:monitor.view')
  );

  /** An assigned division or the administrative portfolio is required for Division scope. */
  readonly canViewDivisionScope = computed(
    () => this.userStore.divisionIds().length > 0 || this.isPortfolioViewer()
  );

  /** Corporate rows are the KPIs the API assigned to this principal in the entry board. */
  readonly hasCorporateAssignments = computed(() => this.kpis().length > 0);

  /**
   * The two scopes are independent: a corporate reader or an account with assigned corporate
   * KPIs reports in Corporate scope, while a division assignment or the portfolio opens
   * Division scope. A data entry account with both responsibilities gets both options.
   */
  readonly corporateScopeAvailable = computed(
    () => this.canViewCorporate() || this.hasCorporateAssignments()
  );

  readonly scopeOptions = computed<EntryScope[]>(() => {
    const options: EntryScope[] = [];
    if (this.corporateScopeAvailable()) options.push('Corporate');
    if (this.canViewDivisionScope()) options.push('Division');
    return options;
  });

  readonly showScopePicker = computed(() => this.scopeOptions().length > 1);

  /**
   * Corporate | Division: which board the page is showing and entering. The page opens on
   * Corporate whenever the principal has a corporate board: a corporate viewer knows that
   * up front, an entry account once its board read resolves.
   */
  readonly scope = signal<EntryScope>(this.canViewCorporate() ? 'Corporate' : 'Division');

  /** Every scorecard in the selected fiscal year may be entered from the corporate board. */
  readonly corporateScorecards = computed(() => {
    const fiscalYearId = this.state.fiscalYearId();
    return this.state
      .scorecards()
      .filter((sc) => sc.fiscalYearId === fiscalYearId)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  });

  readonly monthState = this.state.monthState;
  readonly kpis = this.state.kpis;
  readonly loading = this.state.loading;

  readonly grid = signal(new Map<string, DataCell[]>());
  readonly loadingCells = signal(true);
  readonly savingCell = signal<{ kpiId: string; month: number } | null>(null);
  readonly savingAll = signal(false);
  readonly focusKpiId = signal<string | null>(null);
  private gridRequest = 0;

  /** Goal cards start expanded; each card collapses independently and keeps its unsaved cells. */
  private readonly collapsedGoals = signal<ReadonlySet<string>>(new Set<string>());

  // ── Division scope ───────────────────────────────────────────────────────

  readonly divisions = signal<Division[]>([]);
  readonly divisionsLoading = signal(false);
  readonly divisionId = signal<string | null>(null);
  readonly divisionPlan = signal<DivisionPlanDto | null>(null);
  readonly divisionPlanLoading = signal(false);
  readonly divisionLocks = signal<Map<number, PeriodLockStatusItem>>(new Map());
  readonly divisionActuals = signal<Map<string, DivisionActualValueDto[]>>(new Map());
  private divisionRequest = 0;
  private divisionBootstrapped = false;
  /** Fiscal year (and scorecard) whose Corporate rows have already been requested. */
  private corporateLoadKey = '';
  /** The opening-scope decision runs once; a scope the user picked by hand always wins. */
  private readonly scopeDefaultDecided = signal(false);
  private scopePickedByUser = false;

  /**
   * Divisions the page may show. An assigned account sees exactly its HR primary and
   * explicitly authorized divisions; Admin/Power User keep the existing portfolio browse;
   * an ordinary unassigned account sees none.
   */
  readonly visibleDivisions = computed<Division[]>(() => {
    const all = this.divisions();
    if (this.isPortfolioViewer()) return all;
    const assigned = this.userStore.divisionIds();
    return assigned.length ? all.filter((division) => assigned.includes(division.id)) : [];
  });

  readonly hasDivisionChoice = computed(() => this.visibleDivisions().length > 1);

  readonly selectedDivision = computed(
    () => this.visibleDivisions().find((division) => division.id === this.divisionId()) ?? null
  );

  readonly divisionPlanStatus = computed(() => {
    const plan = this.divisionPlan();
    return plan ? planStatusOf(plan.planStatus) : null;
  });

  readonly divisionKpis = computed<DivisionKpiDto[]>(() =>
    (this.divisionPlan()?.goals ?? []).flatMap((goal) => goal.kpis)
  );

  readonly periods = computed<PeriodCol[]>(() => {
    const divisionScope = this.scope() === 'Division';
    const lockMap = divisionScope ? this.divisionLocks() : this.monthState();
    const grid = this.grid();
    const kpiCount = divisionScope ? this.divisionKpis().length : this.kpis().length;
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
    if (!p?.entryOpenDate || !p.cutoffDate) return ' ';
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
    if (!p) return '';
    if (p.state === 'locked') return 'Locked';
    if (p.state === 'pending') return 'Not yet open';
    const days = this.daysUntilLock();
    if (days === null) return ' ';
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
    if (this.scope() === 'Division' && !this.divisionPlan()) {
      return { text: 'No division plan', tone: 'pending' };
    }
    if (!p) return { text: 'No open period', tone: 'pending' };
    if (p.state === 'locked') return { text: 'Entry window closed', tone: 'locked' };
    if (p.state === 'pending') return { text: 'Entry window not open yet', tone: 'pending' };
    return { text: 'Entry window open', tone: this.lockUrgent() ? 'soon' : 'ok' };
  });

  /**
   * Entry needs an open Power User window, the role right for the channel and an editable
   * plan/scorecard. Ownership of the individual row is checked separately by
   * {@link rowEditable}; the backend re-checks both.
   */
  readonly canEnter = computed(() => {
    const p = this.reportingPeriod();
    if (!(!!p && p.state === 'open' && !!p.fiscalPeriodId)) return false;
    if (this.scope() === 'Division') {
      const divisionId = this.divisionId();
      if (!divisionId || !this.divisionPlan()) return false;
      // FR-906: division performance entry starts after the plan is finalized. The plan
      // status is the plan-integrity checkpoint; FR-308 windows are checked separately.
      if (this.divisionPlanStatus() !== 'Finalized') return false;
      // Explicitly authorized cross-division entry (the audited override right held by
      // Admin/Power User) is evaluated before the ordinary assigned-division restriction.
      // Data Input stays limited to its assigned divisions.
      if (this.userStore.hasPermission('actuals:override')) return true;
      return (
        this.userStore.divisionIds().includes(divisionId) &&
        this.userStore.hasPermission('divisions:actuals.enter')
      );
    }
    if (!(this.userStore.hasPermission('actuals:enter') || this.canOverride())) return false;
    return this.state.canEnterActuals();
  });

  readonly canOverride = computed(() => this.userStore.hasPermission('actuals:override'));

  readonly isReadOnly = computed(() => !this.canEnter() && !this.canOverride());

  readonly entrySubtitle = computed(() => {
    if (this.scope() === 'Division') {
      const division = this.selectedDivision();
      if (!division) {
        return this.canViewDivisionScope()
          ? 'No division is available for the selected fiscal year'
          : 'Your account has no division assignment';
      }
      const plan = this.divisionPlan();
      if (!plan) return `${division.name} · No division plan for the selected fiscal year`;
      return `${division.name} · Division scorecard ${plan.scorecardName || ''} (${this.divisionPlanStatus()})`;
    }
    const departments = new Set(
      this.kpis()
        .map((k) => k.divisionOwnerName ?? k.departmentName)
        .filter((n): n is string => !!n)
    );
    const scope =
      departments.size === 1
        ? [...departments][0]
        : (this.state.selectedScorecard()?.name ?? '');
    const kpiScope = this.canOverride()
      ? 'All KPIs in scope'
      : (this.state.usesEntryScope() ? 'KPIs assigned to me or my division' : 'KPIs assigned to me');
    return scope ? `${scope} · ${kpiScope}` : kpiScope;
  });

  /** Corporate rows grouped Goal › KRA, as the requirement lays the board out. */
  readonly corporateGroups = computed<CorporateGoalGroup[]>(() => {
    const month = this.reportingMonth();
    if (!month) return [];

    const goals = new Map<string, { goalName: string; kras: Map<string, { kraName: string; rows: KPI[] }> }>();
    for (const kpi of this.kpis()) {
      const goalName = kpi.goalName?.trim() || 'No goal';
      const kraName = kpi.kraName?.trim() || 'No KRA';
      const goalKey = kpi.goalId ?? goalName;
      const kraKey = kpi.kraId ?? kraName;

      const goal = goals.get(goalKey) ?? { goalName, kras: new Map() };
      const kra = goal.kras.get(kraKey) ?? { kraName, rows: [] };
      kra.rows.push(kpi);
      goal.kras.set(kraKey, kra);
      goals.set(goalKey, goal);
    }

    return [...goals.entries()]
      .sort(([, a], [, b]) => a.goalName.localeCompare(b.goalName))
      .map(([goalKey, goal]) => ({
        key: `goal:${goalKey}`,
        goalName: goal.goalName,
        kras: [...goal.kras.entries()]
          .sort(([, a], [, b]) => a.kraName.localeCompare(b.kraName))
          .map(([kraKey, kra]) => ({
            key: `kra:${goalKey}:${kraKey}`,
            kraName: kra.kraName,
            rows: kra.rows
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((kpi) => ({
                kpi,
                target: this.targetFor(kpi.id, month),
                cell: this.cellValue(kpi.id, month),
              })),
          })),
      }));
  });

  /** Division plan rows grouped under their division goal. */
  readonly divisionGroups = computed<DivisionGoalRows[]>(() => {
    const month = this.reportingMonth();
    const plan = this.divisionPlan();
    if (!plan || !month) return [];
    return plan.goals.map((goal) => ({
      goal,
      rows: goal.kpis.map((kpi) => ({
        kpi,
        target: this.divisionTargetFor(kpi, month),
        cell: this.cellValue(kpi.id, month),
      })),
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

  readonly activeKpis = computed<{ id: string; name: string }[]>(() =>
    this.scope() === 'Division' ? this.divisionKpis() : this.kpis()
  );

  readonly focusKpi = computed<{ id: string; name: string } | null>(
    () => this.activeKpis().find((k) => k.id === this.focusKpiId()) ?? this.activeKpis()[0] ?? null
  );

  /** The most recent months before the reporting month, within the same fiscal year. */
  readonly previousRows = computed<PreviousMonthRow[]>(() => {
    const kpi = this.focusKpi();
    const reporting = this.reportingMonth();
    if (!kpi || !reporting) return [];

    const scoreByMonth = new Map<number, { score: number; at: string }>();
    if (this.scope() === 'Corporate') {
      for (const entry of kpiEntries(this.state.snapshot())) {
        if (entry.entityId !== kpi.id || entry.isPeriodAggregate) continue;
        if (entry.score === undefined || entry.score === null) continue;
        const known = scoreByMonth.get(entry.fiscalMonth);
        if (!known || entry.calculatedAt > known.at) {
          scoreByMonth.set(entry.fiscalMonth, { score: entry.score, at: entry.calculatedAt });
        }
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
    // A closed year can arrive as the shared selection from another workspace page. The
    // picker only lists active years, so move the selection onto one of them once they load.
    effect(() => {
      const years = this.fiscalYears();
      if (!years.length) return;
      const current = this.state.fiscalYearId();
      if (current && years.some((fy) => fy.id === current)) return;
      const fallback = years.find((fy) => fy.status.toLowerCase() === 'active') ?? years[0];
      if (fallback) this.state.selectFiscalYear(fallback.id);
    });

    // Scope follows the principal's assignments, and the page opens on Corporate whenever a
    // corporate board exists. The board's rows arrive with the entry read, so the default is
    // only decided once that read settles; a scope the user picked by hand is never overridden.
    effect(() => {
      const options = this.scopeOptions();
      if (!options.length) return;

      if (!this.scopeDefaultDecided()) {
        if (!this.state.fiscalYears().length) return;
        if (this.state.usesEntryScope() && this.state.loading()) return;
        this.scopeDefaultDecided.set(true);
        if (!this.scopePickedByUser && options.includes('Corporate') && this.scope() !== 'Corporate') {
          this.scope.set('Corporate');
          this.focusKpiId.set(null);
          this.loadingCells.set(true);
          return;
        }
      }

      if (options.includes(this.scope())) return;
      this.scope.set(options[0]);
      this.focusKpiId.set(null);
      if (options[0] === 'Division') {
        this.ensureDivisions();
      } else {
        this.loadingCells.set(true);
      }
    });

    // A division account reads its plan only after the opening scope is settled: starting the
    // division read first would issue reads the Corporate default is about to replace. An
    // account without a division assignment has nothing to read here.
    effect(() => {
      if (this.divisionBootstrapped || !this.scopeDefaultDecided()) return;
      if (this.scope() !== 'Division') return;
      if (!this.canViewDivisionScope()) return;
      if (!this.state.fiscalYearId()) return;
      this.divisionBootstrapped = true;
      this.ensureDivisions();
    });

    // Corporate is the default scope for a corporate account, so its rows must load on their
    // own: the shared selection may carry over from another page without its catalog rows, and
    // a scorecard with no KPIs still has to settle the board instead of spinning indefinitely.
    effect(() => {
      if (this.scope() !== 'Corporate') return;
      const fiscalYearId = this.state.fiscalYearId();
      const scorecardId = this.state.scorecardId();
      if (!fiscalYearId || this.state.loading()) return;
      const usesBoard = this.state.usesEntryScope();
      if (!usesBoard && !scorecardId) return;
      const key = usesBoard ? `board:${fiscalYearId}` : `catalog:${fiscalYearId}:${scorecardId}`;
      if (this.corporateLoadKey === key) return;
      this.corporateLoadKey = key;
      if (usesBoard) {
        // The board read is the entry account's only source; recover once when it delivered
        // no rows, which is also what a manual scope change used to do.
        if (!this.kpis().length) {
          this.loadingCells.set(true);
          this.state.reloadEntryBoard();
        }
        return;
      }
      this.loadingCells.set(true);
      this.loadGrid();
    });

    // An entry account gets its values inside the board read, so the grid follows the board
    // instead of issuing one actuals request per KPI.
    effect(() => {
      if (this.scope() !== 'Corporate') return;
      if (!this.state.usesEntryScope()) return;
      const valuesByKpi = this.state.entryActuals();
      const grid = new Map<string, DataCell[]>();
      for (const kpi of this.kpis()) {
        const byMonth = new Map<number, KpiActualValue>();
        for (const actual of valuesByKpi.get(kpi.id) ?? []) byMonth.set(actual.fiscalMonth, actual);
        grid.set(
          kpi.id,
          Array.from({ length: 12 }, (_unused, index) => {
            const actual = byMonth.get(index + 1);
            return {
              value: actual?.value ?? null,
              note: actual?.note,
              dataSource: actual?.dataSource,
              dirty: false,
            };
          })
        );
      }
      this.grid.set(grid);
      this.loadingCells.set(false);
    });

    // The division plan and its stored actuals are the Division board's single source.
    effect(() => {
      if (this.scope() !== 'Division') return;
      const plan = this.divisionPlan();
      if (!plan) return;
      const valuesByKpi = this.divisionActuals();
      const grid = new Map<string, DataCell[]>();
      for (const goal of plan.goals) {
        for (const kpi of goal.kpis) {
          const byMonth = new Map<number, DivisionActualValueDto>();
          for (const actual of valuesByKpi.get(kpi.id) ?? []) byMonth.set(actual.fiscalMonth, actual);
          grid.set(
            kpi.id,
            Array.from({ length: 12 }, (_unused, index) => {
              const actual = byMonth.get(index + 1);
              return {
                value: actual?.value ?? null,
                note: actual?.note,
                dataSource: actual?.dataSource,
                dirty: false,
              };
            })
          );
        }
      }
      this.grid.set(grid);
      this.loadingCells.set(false);
    });
  }

  onFiscalYearChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (!id) return;
    this.state.selectFiscalYear(id);
    if (this.scope() === 'Division') this.loadDivisionContext();
  }

  onScorecardChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (id) this.state.selectScorecard(id);
  }

  onScopeChange(event: Event): void {
    const scope = (event.target as HTMLSelectElement).value as EntryScope;
    if (scope !== 'Corporate' && scope !== 'Division') return;
    if (scope === 'Corporate' && !this.corporateScopeAvailable()) return;
    if (scope === 'Division' && !this.canViewDivisionScope()) return;
    // A hand-picked scope wins over the Corporate default, even before it was applied.
    this.scopePickedByUser = true;
    this.scopeDefaultDecided.set(true);
    if (scope === this.scope()) return;
    this.scope.set(scope);
    this.focusKpiId.set(null);
    if (scope === 'Division') {
      // A corporate read still in flight must not paint the division board.
      this.gridRequest++;
      this.ensureDivisions();
      return;
    }
    // Leave nothing of the division board behind, and abandon its in-flight reads, so the
    // corporate rows load from a clean state.
    this.divisionRequest++;
    this.divisionPlan.set(null);
    this.divisionLocks.set(new Map());
    this.divisionActuals.set(new Map());
    this.grid.set(new Map());
    this.loadingCells.set(true);
    if (this.state.usesEntryScope()) {
      this.state.reloadEntryBoard();
    } else {
      this.loadGrid();
    }
  }

  onDivisionChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value || null;
    this.divisionId.set(id);
    this.loadDivisionContext();
  }

  selectKpi(id: string): void {
    this.focusKpiId.set(id);
  }

  // ── Goal cards ───────────────────────────────────────────────────────────

  /** Goal cards start expanded and keep their state while the reporting month changes. */
  isGoalExpanded(key: string): boolean {
    return !this.collapsedGoals().has(key);
  }

  toggleGoal(key: string): void {
    const next = new Set(this.collapsedGoals());
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.collapsedGoals.set(next);
  }

  divisionGoalKey(goalId: string): string {
    return `division:${goalId}`;
  }

  goalKpiCount(group: CorporateGoalGroup): number {
    return group.kras.reduce((total, kra) => total + kra.rows.length, 0);
  }

  loadGrid(): void {
    if (this.scope() === 'Division') {
      this.loadDivisionContext();
      return;
    }
    if (this.state.usesEntryScope()) {
      this.loadingCells.set(true);
      this.state.reloadEntryBoard();
      return;
    }

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

  // ── Division loading ─────────────────────────────────────────────────────

  private ensureDivisions(): void {
    if (this.divisions().length) {
      this.loadDivisionContext();
      return;
    }
    if (this.divisionsLoading()) return;

    this.divisionsLoading.set(true);
    this.loadingCells.set(true);
    this.divisionService.getAll().subscribe({
      next: (divisions) => {
        this.divisionsLoading.set(false);
        const assigned = this.userStore.divisionIds();
        const visible = this.isPortfolioViewer()
          ? divisions
          : assigned.length
            ? divisions.filter((division) => assigned.includes(division.id))
            : [];
        this.divisions.set(visible);

        // Default selection: the HR primary division, otherwise the first authorized one.
        const current = this.divisionId();
        const primary = this.userStore.divisionId();
        const next =
          (current && visible.some((d) => d.id === current) ? current : null) ??
          (primary && visible.some((d) => d.id === primary) ? primary : null) ??
          visible[0]?.id ??
          null;
        this.divisionId.set(next);
        this.loadDivisionContext();
      },
      error: (err) => {
        this.divisionsLoading.set(false);
        this.loadingCells.set(false);
        this.notifications.error(toApiError(err).message);
      },
    });
  }

  /** Loads the selected authorized division's plan, its period windows and its actuals. */
  loadDivisionContext(): void {
    // A read that resolves after the user switched back to Corporate must not restore the
    // division board behind the corporate rows.
    if (this.scope() !== 'Division') return;
    const token = ++this.divisionRequest;
    const divisionId = this.divisionId();
    const fiscalYearId = this.state.fiscalYearId();

    this.divisionPlan.set(null);
    this.divisionLocks.set(new Map());
    this.divisionActuals.set(new Map());
    this.grid.set(new Map());

    // Never issue a division read for a division the account may not see.
    if (!divisionId || !fiscalYearId || !this.visibleDivisions().some((d) => d.id === divisionId)) {
      this.loadingCells.set(false);
      return;
    }

    this.divisionPlanLoading.set(true);
    this.loadingCells.set(true);
    this.divisionService.getPlans(divisionId).subscribe({
      next: (plans) => {
        if (token !== this.divisionRequest) return;
        const summary = plans.find((plan) => plan.fiscalYearId === fiscalYearId);
        if (!summary) {
          this.divisionPlanLoading.set(false);
          this.loadingCells.set(false);
          return;
        }
        this.divisionService
          .getPlanContextByScorecard(summary.scorecardId, undefined, divisionId)
          .subscribe({
            next: (plan) => {
              if (token !== this.divisionRequest) return;
              this.divisionPlanLoading.set(false);
              this.divisionPlan.set(plan);
              this.loadDivisionLocks(plan.scorecardId, plan.fiscalYearId, token);
              this.loadDivisionActuals(divisionId, plan.fiscalYearId, token);
            },
            error: (err) => {
              if (token !== this.divisionRequest) return;
              this.divisionPlanLoading.set(false);
              this.loadingCells.set(false);
              this.notifications.error(toApiError(err).message);
            },
          });
      },
      error: (err) => {
        if (token !== this.divisionRequest) return;
        this.divisionPlanLoading.set(false);
        this.loadingCells.set(false);
        this.notifications.error(toApiError(err).message);
      },
    });
  }

  private loadDivisionLocks(scorecardId: string, fiscalYearId: string, token: number): void {
    this.kpiService.getLockStatus(scorecardId, fiscalYearId).subscribe({
      next: (locks) => {
        if (token !== this.divisionRequest) return;
        const map = new Map<number, PeriodLockStatusItem>();
        for (const period of locks.periods) map.set(period.fiscalMonth, period);
        this.divisionLocks.set(map);
      },
      error: () => {
        if (token === this.divisionRequest) this.divisionLocks.set(new Map());
      },
    });
  }

  private loadDivisionActuals(divisionId: string, fiscalYearId: string, token: number): void {
    this.divisionService.getActuals(divisionId, fiscalYearId).subscribe({
      next: (actuals) => {
        if (token !== this.divisionRequest) return;
        const byKpi = new Map<string, DivisionActualValueDto[]>();
        for (const actual of actuals) {
          const list = byKpi.get(actual.kpiId) ?? [];
          list.push(actual);
          byKpi.set(actual.kpiId, list);
        }
        this.divisionActuals.set(byKpi);
      },
      error: () => {
        if (token === this.divisionRequest) this.divisionActuals.set(new Map());
      },
    });
  }

  // ── Cells ────────────────────────────────────────────────────────────────

  cellsFor(kpiId: string): DataCell[] {
    return this.grid().get(kpiId) ?? [];
  }

  cellValue(kpiId: string, month: number): DataCell | undefined {
    return this.cellsFor(kpiId)[month - 1];
  }

  /** Monthly target of the KPI in the selected fiscal year, for the active scope. */
  targetFor(kpiId: string, month: number): number | null {
    if (this.scope() === 'Division') {
      const kpi = this.divisionKpis().find((k) => k.id === kpiId);
      return kpi ? this.divisionTargetFor(kpi, month) : null;
    }
    const targets = this.state.kpiTargets().get(kpiId);
    const monthly = targets?.find((t) => t.granularity === 'Monthly' && t.fiscalMonth === month);
    return monthly ? monthly.targetValue : null;
  }

  private divisionTargetFor(kpi: DivisionKpiDto, month: number): number | null {
    const monthly = kpi.targets?.find((t) => t.granularity === 'Monthly' && t.fiscalMonth === month);
    return monthly ? monthly.targetValue : (kpi.target ?? null);
  }

  private emptyCells(): DataCell[] {
    return Array.from({ length: 12 }, () => ({ value: null as number | null, dirty: false }));
  }

  /**
   * Mirrors the backend write rule for the corporate channel: an open window is not enough —
   * the principal must own the KPI personally or through one of their divisions, unless they
   * hold the audited override right.
   */
  rowEditable(kpi: KPI): boolean {
    if (!this.canEnter()) return false;
    if (this.canOverride()) return true;
    const user = this.userStore.user();
    if (!user) return false;
    if (kpi.ownerId && kpi.ownerId === user.id) return true;
    return !!kpi.divisionOwnerId && this.userStore.divisionIds().includes(kpi.divisionOwnerId);
  }

  private cellEditable(kpiId: string, month: number): boolean {
    if (!this.isEditable(month)) return false;
    if (this.scope() === 'Division') {
      return this.canEnter() && this.divisionKpis().some((k) => k.id === kpiId);
    }
    const kpi = this.kpis().find((k) => k.id === kpiId);
    return !!kpi && this.rowEditable(kpi);
  }

  setCellValue(kpiId: string, month: number, value: string): void {
    if (!this.cellEditable(kpiId, month)) return;
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
    if (!this.cellEditable(kpiId, month)) return;
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
  save(kpi: { id: string; name: string }, month: number): void {
    if (this.scope() === 'Division') {
      this.saveDivisionEntry(kpi.id, kpi.name, month);
      return;
    }
    const corporate = this.kpis().find((k) => k.id === kpi.id);
    if (!corporate || !this.rowEditable(corporate)) return;
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

  private saveDivisionEntry(kpiId: string, name: string, month: number): void {
    if (!this.canEnter()) return;
    const divisionId = this.divisionId();
    const period = this.periodFor(month);
    if (!divisionId || !period.fiscalPeriodId || period.state !== 'open') return;
    const cell = this.cellValue(kpiId, month);
    if (!cell || !cell.dirty) return;
    if (cell.value === null) {
      this.notifications.error(`Enter a value for ${name} before saving.`);
      return;
    }

    this.savingCell.set({ kpiId, month });
    this.divisionService
      .enterActual({
        divisionId,
        kpiId,
        fiscalPeriodId: period.fiscalPeriodId,
        value: cell.value,
        dataSource: 'Manual',
        note: cell.note?.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.savingCell.set(null);
          this.notifications.success(`Saved ${name} for ${this.periodFor(month).short}.`);
          this.loadDivisionContext();
        },
        error: (err) => {
          this.savingCell.set(null);
          this.notifications.error(toApiError(err).message);
        },
      });
  }

  /** "Save entries": saves every changed row of the reporting month. */
  saveEntries(): void {
    if (this.scope() === 'Division') {
      this.saveDivisionEntries();
      return;
    }
    const month = this.reportingMonth();
    if (!month || this.savingAll()) return;
    const period = this.periodFor(month);
    if (!period.fiscalPeriodId || period.state !== 'open') return;

    const jobs: Observable<string | null>[] = [];
    let skipped = 0;
    for (const kpi of this.kpis()) {
      const cell = this.cellValue(kpi.id, month);
      if (!cell?.dirty) continue;
      if (!this.rowEditable(kpi)) continue;
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

  private saveDivisionEntries(): void {
    const month = this.reportingMonth();
    const divisionId = this.divisionId();
    if (!month || !divisionId || this.savingAll() || !this.canEnter()) return;
    const period = this.periodFor(month);
    if (!period.fiscalPeriodId || period.state !== 'open') return;

    const jobs: Observable<string | null>[] = [];
    let skipped = 0;
    for (const kpi of this.divisionKpis()) {
      const cell = this.cellValue(kpi.id, month);
      if (!cell?.dirty) continue;
      if (cell.value === null) {
        skipped++;
        continue;
      }
      jobs.push(
        this.divisionService
          .enterActual({
            divisionId,
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
      this.loadDivisionContext();
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
    kpi: { id: string; name: string };
    month: number;
    rows: KpiActualValue[];
    loading: boolean;
  } | null>(null);

  /** Shows every recorded write for one KPI in one fiscal period (append-only). */
  openHistory(kpi: { id: string; name: string }, month: number): void {
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
