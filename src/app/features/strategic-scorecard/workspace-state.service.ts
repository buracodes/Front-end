import { Injectable, inject, computed, signal, effect, DestroyRef } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { Scorecard, FiscalYear, titleCaseEnumName } from '../../core/model/scorecard.model';
import { Goal, KRA, KPI, KpiActualValue, EntryBoard, EntryScorecard } from '../../core/model/goal.model';
import { GoalService } from '../../core/service/goal.service';
import { KRAService } from '../../core/service/kra.service';
import { KPIService, ScoreSnapshotDto, ScoreSnapshotEntry, KpiTargetValue, PeriodFilterParams } from '../../core/service/kpi.service';
import { ScorecardService } from '../../core/service/scorecard.service';
import { PeriodLockStatus, PeriodLockStatusItem } from '../../core/model/goal.model';
import { UserStore } from '../../core/service/user-store.service';
import {
  DEFAULT_RAG_BANDS,
  RagBands,
  RagBand,
  RAG_DISPLAY_COLORS,
  ragBandFromScore,
} from '../../core/model/rag-band';

export interface WorkspaceData {
  goals: Goal[];
  kras: KRA[];
  kpis: KPI[];
  snapshot: ScoreSnapshotDto | null;
  locks: PeriodLockStatus | null;
  kpiTargets: Map<string, KpiTargetValue[]>; // kpiId -> targets
}

@Injectable({ providedIn: 'root' })
export class ScorecardWorkspaceState {
  private readonly goalService = inject(GoalService);
  private readonly kraService = inject(KRAService);
  private readonly kpiService = inject(KPIService);
  private readonly scorecardService = inject(ScorecardService);
  private readonly userStore = inject(UserStore);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Reactive ECX business date (EAT) driving the FR-703 closure signals. A single timer
   * is rescheduled for the next EAT midnight (`0` polling) and the value is refreshed
   * when the tab regains focus, so a page left open across midnight cannot keep an ended
   * year looking editable. The backend stays authoritative on every write.
   */
  readonly currentBusinessDate = signal<CalendarDate>(businessDate());

  private rolloverTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Guarded for SSR/prerender, where neither window nor document exists.
    if (typeof window !== 'undefined') {
      this.scheduleBusinessDateRollover();
      window.addEventListener('focus', this.onWindowFocus);
      document.addEventListener('visibilitychange', this.onWindowFocus);
      this.destroyRef.onDestroy(() => {
        this.clearRolloverTimer();
        window.removeEventListener('focus', this.onWindowFocus);
        document.removeEventListener('visibilitychange', this.onWindowFocus);
      });
    }
  }

  private readonly onWindowFocus = (): void => this.refreshBusinessDate();

  /**
   * Recomputes the EAT business date, updates the signal when the day changed and
   * reschedules the next rollover. Called by the timer and by focus/visibility events.
   */
  refreshBusinessDate(now: Date = new Date()): void {
    const next = businessDate(now);
    const current = this.currentBusinessDate();
    if (next.year !== current.year || next.month !== current.month || next.day !== current.day) {
      this.currentBusinessDate.set(next);
    }
    this.scheduleBusinessDateRollover(now);
  }

  private scheduleBusinessDateRollover(now: Date = new Date()): void {
    this.clearRolloverTimer();
    this.rolloverTimer = setTimeout(() => {
      this.rolloverTimer = null;
      this.refreshBusinessDate();
    }, msUntilNextEatMidnight(now));
  }

  private clearRolloverTimer(): void {
    if (this.rolloverTimer !== null) {
      clearTimeout(this.rolloverTimer);
      this.rolloverTimer = null;
    }
  }

  // Effect to reload scores when period filter changes
  private readonly _periodFilterEffect = effect(() => {
    const filter = this.periodFilterParams();
    const scorecardId = this.scorecardId();
    const fiscalYearId = this.fiscalYearId();
    if (scorecardId && fiscalYearId) {
      this.reloadScores();
    }
  });

  readonly fiscalYears = signal<FiscalYear[]>([]);
  readonly scorecards = signal<Scorecard[]>([]);
  readonly fiscalYearId = signal<string | null>(null);
  readonly scorecardId = signal<string | null>(null);
  readonly workspace = signal<WorkspaceData>({ goals: [], kras: [], kpis: [], snapshot: null, locks: null, kpiTargets: new Map() });
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedKpiId = signal<string | null>(null);

  readonly periodFilterOpen = signal(false);
  readonly periodType = signal<'quarter' | 'month' | 'year' | 'ytd'>('quarter');
  readonly quarterFilter = signal('');
  readonly monthFrom = signal('');
  readonly monthTo = signal('');
  readonly yearFilter = signal<string | null>(null);

  /** Month filter From/To values normalized to fiscal months (1-12), or null when unset/unparseable. */
  readonly fiscalMonthFrom = computed(() => this.monthValueToFiscalMonth(this.monthFrom()));
  readonly fiscalMonthTo = computed(() => this.monthValueToFiscalMonth(this.monthTo()));

  /** Computed period filter params for backend API calls. */
  readonly periodFilterParams = computed<PeriodFilterParams | null>(() => {
    if (!this.hasPeriodFilter()) return null;
    
    const periodType = this.periodType();
    if (periodType === 'ytd') {
      return { periodType: 'ytd' };
    }
    if (periodType === 'quarter' && this.quarterFilter()) {
      const quarter = Number(this.quarterFilter().replace('Q', ''));
      return { periodType: 'quarter', quarter };
    }
    if (periodType === 'month') {
      const fromMonth = this.fiscalMonthFrom();
      const toMonth = this.fiscalMonthTo();
      return { periodType: 'month', fromMonth: fromMonth ?? undefined, toMonth: toMonth ?? undefined };
    }
    if (periodType === 'year') {
      return { periodType: 'year' };
    }
    return null;
  });

  /** Monotonic token so a slow response can't clobber a newer selection. */
  private loadRequest = 0;

  readonly selectedFiscalYear = computed(() =>
    this.fiscalYears().find((fy) => fy.id === this.fiscalYearId()) ?? null
  );

  readonly selectedScorecard = computed(() =>
    this.scorecards().find((sc) => sc.id === this.scorecardId()) ?? null
  );

  readonly selectedKpi = computed(() =>
    this.kpis().find((kpi) => kpi.id === this.selectedKpiId()) ?? null
  );

  // ── FR-703 closure state ─────────────────────────────────────────────────
  // A scorecard becomes read-only when it is explicitly closed OR when its
  // fiscal year's final-month grace period has expired. The backend enforces the
  // same rule centrally; these signals only drive the UI affordances.

  /** True when the selected scorecard's own status is `Closed`. */
  readonly scorecardClosed = computed(
    () => this.selectedScorecard()?.scorecardStatus === 'Closed'
  );

  /**
   * True when the selected fiscal year is closed or archived, or its final-month grace
   * period has expired in ECX business time (EAT) even before the closure job flips its
   * status. Reads the reactive {@link currentBusinessDate}, so it re-evaluates when the
   * EAT day rolls over or the tab regains focus.
   */
  readonly fiscalYearClosed = computed(() =>
    isFiscalYearClosedOn(this.selectedFiscalYear(), this.currentBusinessDate())
  );

  /** True when no structural/actual edits should be offered for the selection. */
  readonly isReadOnly = computed(() => this.scorecardClosed() || this.fiscalYearClosed());

  /** True when the signed-in user may override closed/locked actual entry (audited). */
  readonly hasActualsOverride = computed(() => this.userStore.hasPermission('actuals:override'));

  /**
   * True when actual values can be written for the selection: open scorecard,
   * or a closed one where the user holds the audited override permission.
   */
  readonly canEnterActuals = computed(() => !this.isReadOnly() || this.hasActualsOverride());

  /**
   * True for a principal that reports actuals but cannot browse the corporate scorecard, so the
   * whole workspace comes from the entry-scoped board read instead of the corporate catalog reads.
   * Resolved from the live permission list, exactly like the page guards.
   */
  readonly usesEntryScope = computed(() => !this.userStore.hasPermission('scorecard:view'));

  /** Actual values of the entry board, per KPI. Empty for a corporate account, which reads them per KPI. */
  readonly entryActuals = signal<Map<string, KpiActualValue[]>>(new Map());

  /** Monotonic token so a slow board response can't clobber a newer fiscal year. */
  private boardRequest = 0;

  readonly hasPeriodFilter = computed(
    () =>
      (this.periodType() === 'quarter' && !!this.quarterFilter()) ||
      (this.periodType() === 'month' && (!!this.monthFrom() || !!this.monthTo())) ||
      this.periodType() === 'year' ||
      (this.periodType() === 'ytd')
  );

  /** Fiscal month range [from, to] (1-12) selected by the active period filter, or null when inactive. */
  readonly periodMonthRange = computed<{ from: number; to: number } | null>(() => {
    if (!this.hasPeriodFilter()) return null;
    
    const periodType = this.periodType();
    
    if (periodType === 'quarter') {
      const q = Number(this.quarterFilter().replace('Q', ''));
      if (q < 1 || q > 4) return null;
      return { from: (q - 1) * 3 + 1, to: q * 3 };
    }
    
    if (periodType === 'year') {
      // For year filter, show all months (1-12)
      return { from: 1, to: 12 };
    }
    
    if (periodType === 'ytd') {
      // YTD: from fiscal year start (month 1) to current fiscal month
      const currentFiscalMonth = this.currentFiscalMonth();
      if (currentFiscalMonth <= 0) return { from: 1, to: 12 };
      return { from: 1, to: currentFiscalMonth };
    }
    
    // Month range filter: from/to are calendar months; normalize to fiscal months.
    const from = this.fiscalMonthFrom();
    const to = this.fiscalMonthTo();
    if (from === null && to === null) return null;
    return { from: from ?? 1, to: to ?? from ?? 12 };
  });

  /** Current fiscal month (1-12) based on today's date and fiscal year start. */
  readonly currentFiscalMonth = computed(() => {
    const fy = this.selectedFiscalYear();
    if (!fy?.startDate) return 12;
    
    const now = new Date();
    const startDate = new Date(fy.startDate);
    const endDate = new Date(fy.endDate);
    
    if (now < startDate) return 0;
    if (now > endDate) return 12;
    
    const startMonth = startDate.getMonth() + 1; // 1-12
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const startYear = startDate.getFullYear();
    
    let fiscalMonth: number;
    if (currentYear === startYear) {
      fiscalMonth = ((currentMonth - startMonth + 12) % 12) + 1;
    } else {
      fiscalMonth = 12 + ((currentMonth - startMonth + 12) % 12) + 1;
    }
    
    return Math.min(fiscalMonth, 12);
  });

  /** Selects a snapshot entry by writing nothing when it falls outside the active period range. */
  private inPeriod(entry: ScoreSnapshotEntry): boolean {
    const range = this.periodMonthRange();
    if (!range) return true;
    return entry.fiscalMonth >= range.from && entry.fiscalMonth <= range.to;
  }

  /** Maps an `<input type="month">` value ("YYYY-MM") to its fiscal month (1-12). */
  private monthToFiscalMonth(startDate: string | undefined, value: string): number | null {
    if (!value) return null;
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (!match) return null;
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    return fiscalMonthForDate(startDate, new Date(Number(match[1]), month - 1, 15));
  }

  /**
   * Normalizes a raw month-filter value to a fiscal month (1-12). Accepts both
   * the layout's `<input type="month">` form ("YYYY-MM", a calendar month) and
   * the score-plann dropdown form ("1"-"12", a calendar month index). Returns
   * null when the value is empty or unparseable.
   */
  private monthValueToFiscalMonth(value: string): number | null {
    if (!value) return null;
    const startDate = this.selectedFiscalYear()?.startDate;
    const match = /^(\d{4})-(\d{1,2})$/.exec(value.trim());
    if (match) {
      return this.monthToFiscalMonth(startDate, value);
    }
    const month = Number(value);
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      return fiscalMonthForDate(startDate, new Date(2000, month - 1, 15));
    }
    return null;
  }

  readonly goals = computed(() => this.workspace().goals);
  readonly kras = computed(() => this.workspace().kras);
  /**
   * Corporate KPIs only; division-owned KPIs are reported by division planning. An entry-scope
   * account holds the whole fiscal year's board in one read, so its list narrows to the scorecard
   * selected in the picker.
   */
  readonly kpis = computed(() => {
    const scorecardId = this.usesEntryScope() ? this.scorecardId() : null;
    return this.workspace().kpis.filter(
      (kpi) => !kpi.divisionGoalId && (!scorecardId || kpi.scorecardId === scorecardId)
    );
  });
  readonly snapshot = computed(() => this.workspace().snapshot);
  readonly locks = computed(() => this.workspace().locks);
  readonly kpiTargets = computed(() => this.workspace().kpiTargets);

  /** Goals of the selected scorecard, sorted by name. */
  readonly scorecardGoals = computed(() =>
    [...this.workspace().goals]
      .filter((g) => g.scorecardId === this.scorecardId())
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  /** KRAs grouped under their goal. */
  readonly krasByGoal = computed(() => {
    const map = new Map<string, KRA[]>();
    for (const kra of this.workspace().kras) {
      const list = map.get(kra.goalId) ?? [];
      list.push(kra);
      map.set(kra.goalId, list);
    }
    return map;
  });

  /** KPIs grouped by KRA. */
  readonly kpisByKra = computed(() => {
    const map = new Map<string, KPI[]>();
    for (const kpi of this.kpis()) {
      if (!kpi.kraId) continue;
      const list = map.get(kpi.kraId) ?? [];
      list.push(kpi);
      map.set(kpi.kraId, list);
    }
    return map;
  });

  /** Corporate KPIs with no parent (attached directly to a goal / scorecard). */
  readonly unassignedKpis = computed(() =>
    this.kpis().filter((kpi) => !kpi.kraId)
  );

  /** Latest overall scorecard snapshot score, preferring the aggregated period entry. */
  readonly overallScore = computed(() => {
    const entries = scorecardEntries(this.workspace().snapshot).filter((e) => this.inPeriod(e));
    const agg = entries.find((e) => e.isPeriodAggregate);
    if (agg) return agg.score ?? null;
    const latest = latestEntry(entries);
    return latest?.score ?? null;
  });

  /** Delta between the two most recent monthly entries (excluding aggregated entries). */
  readonly overallDelta = computed(() => {
    const entries = scorecardEntries(this.workspace().snapshot)
      .filter((e) => this.inPeriod(e) && !e.isPeriodAggregate)
      .sort((a, b) => a.fiscalMonth - b.fiscalMonth);
    if (entries.length < 2) return null;
    const prior = entries[entries.length - 2].score ?? null;
    const latest = entries[entries.length - 1].score ?? null;
    if (prior === null || latest === null) return null;
    return latest - prior;
  });

  /** Monthly trend entries (score per fiscal month) for the scorecard, excluding aggregated entries. */
  readonly scorecardTrend = computed(() =>
    scorecardEntries(this.workspace().snapshot)
      .filter((e) => this.inPeriod(e) && !e.isPeriodAggregate)
      .sort((a, b) => a.fiscalMonth - b.fiscalMonth)
  );

  /** Per-goal snapshot score, preferring aggregated period entry. */
  readonly goalScores = computed(() => {
    const snap = this.workspace().snapshot;
    const entries = snap?.goalSnapshots ?? [];
    const result = new Map<string, ScoreSnapshotEntry>();
    const byEntity = new Map<string, ScoreSnapshotEntry[]>();
    for (const entry of entries) {
      if (!this.inPeriod(entry)) continue;
      const list = byEntity.get(entry.entityId) ?? [];
      list.push(entry);
      byEntity.set(entry.entityId, list);
    }
    for (const [id, list] of byEntity) {
      const agg = list.find((e) => e.isPeriodAggregate);
      if (agg) { result.set(id, agg); continue; }
      const latest = latestEntry(list);
      if (latest) result.set(id, latest);
    }
    return result;
  });

  /** Latest snapshot entry per KPI id, preferring aggregated period entry. */
  readonly kpiSnapshots = computed(() => {
    const map = new Map<string, ScoreSnapshotEntry>();
    const byEntity = new Map<string, ScoreSnapshotEntry[]>();
    for (const entry of kpiEntries(this.workspace().snapshot)) {
      if (!this.inPeriod(entry)) continue;
      const list = byEntity.get(entry.entityId) ?? [];
      list.push(entry);
      byEntity.set(entry.entityId, list);
    }
    for (const [id, list] of byEntity) {
      const agg = list.find((e) => e.isPeriodAggregate);
      if (agg) { map.set(id, agg); continue; }
      const latest = latestEntry(list);
      if (latest) map.set(id, latest);
    }
    return map;
  });

  /** Latest snapshot entry per KRA id, preferring aggregated period entry. */
  readonly kraSnapshots = computed(() => {
    const map = new Map<string, ScoreSnapshotEntry>();
    const byEntity = new Map<string, ScoreSnapshotEntry[]>();
    for (const entry of kraEntries(this.workspace().snapshot)) {
      if (!this.inPeriod(entry)) continue;
      const list = byEntity.get(entry.entityId) ?? [];
      list.push(entry);
      byEntity.set(entry.entityId, list);
    }
    for (const [id, list] of byEntity) {
      const agg = list.find((e) => e.isPeriodAggregate);
      if (agg) { map.set(id, agg); continue; }
      const latest = latestEntry(list);
      if (latest) map.set(id, latest);
    }
    return map;
  });

  /** Trend per KPI id comparing the last two monthly snapshots (excluding aggregated entries). */
  readonly kpiTrends = computed(() => {
    const all = kpiEntries(this.workspace().snapshot).filter((e) => this.inPeriod(e) && !e.isPeriodAggregate);
    const byKpi = new Map<string, ScoreSnapshotEntry[]>();
    for (const entry of all) {
      const list = byKpi.get(entry.entityId) ?? [];
      list.push(entry);
      byKpi.set(entry.entityId, list);
    }
    const map = new Map<string, 'up' | 'down' | 'stable'>();
    for (const [id, list] of byKpi) {
      const sorted = list.sort((a, b) => a.fiscalMonth - b.fiscalMonth);
      const last = sorted[sorted.length - 1];
      const prev = sorted.length > 1 ? sorted[sorted.length - 2] : undefined;
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (
        last.score !== null && last.score !== undefined &&
        prev?.score !== null && prev?.score !== undefined
      ) {
        trend = last.score > prev.score ? 'up' : last.score < prev.score ? 'down' : 'stable';
      }
      map.set(id, trend);
    }
    return map;
  });

  /** Trend per KRA id comparing the last two monthly snapshots (excluding aggregated entries). */
  readonly kraTrends = computed(() => {
    const all = kraEntries(this.workspace().snapshot).filter((e) => this.inPeriod(e) && !e.isPeriodAggregate);
    const byKra = new Map<string, ScoreSnapshotEntry[]>();
    for (const entry of all) {
      const list = byKra.get(entry.entityId) ?? [];
      list.push(entry);
      byKra.set(entry.entityId, list);
    }
    const map = new Map<string, 'up' | 'down' | 'stable'>();
    for (const [id, list] of byKra) {
      const sorted = list.sort((a, b) => a.fiscalMonth - b.fiscalMonth);
      const last = sorted[sorted.length - 1];
      const prev = sorted.length > 1 ? sorted[sorted.length - 2] : undefined;
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (
        last.score !== null && last.score !== undefined &&
        prev?.score !== null && prev?.score !== undefined
      ) {
        trend = last.score > prev.score ? 'up' : last.score < prev.score ? 'down' : 'stable';
      }
      map.set(id, trend);
    }
    return map;
  });

  readonly monthState = computed(() => {
    const locks = this.workspace().locks;
    const map = new Map<number, PeriodLockStatusItem>();
    if (locks) {
      for (const period of locks.periods) {
        map.set(period.fiscalMonth, period);
      }
    }
    return map;
  });

  loadFiscalYearsAndScorecards(preferredScorecardId?: string): void {
    if (this.usesEntryScope()) {
      this.loadEntryFiscalYears(preferredScorecardId);
      return;
    }

    forkJoin({
      fiscalYears: this.scorecardService.getFiscalYears(),
      scorecards: this.scorecardService.getAll(),
    }).subscribe({
      next: ({ fiscalYears, scorecards }) => {
        this.fiscalYears.set(fiscalYears);
        this.scorecards.set(scorecards);
        const requested = preferredScorecardId
          ? scorecards.find((sc) => sc.id === preferredScorecardId) ?? null
          : null;
        const requestedFiscalYearId = requested?.fiscalYearId
          ?? (!this.fiscalYearId()
            ? (fiscalYears.find((fy) => fy.status.toLowerCase() === 'active' || this.isCurrentYear(fy))
                ?? fiscalYears[0])?.id ?? null
            : null);
        if (requestedFiscalYearId) this.fiscalYearId.set(requestedFiscalYearId);
        if (this.fiscalYearId()) {
          if (requested) {
            this.scorecardId.set(requested.id);
            this.loadWorkspace(requested.id);
          } else if (!this.scorecardId() && scorecards.length) {
            const preferred =
              scorecards
                .filter((sc) => sc.scorecardStatus === 'Active')
                .find((sc) => sc.fiscalYearId === this.fiscalYearId()) ?? scorecards[0];
            if (preferred) {
              this.scorecardId.set(preferred.id);
              this.loadWorkspace(preferred.id);
            }
          } else if (this.scorecardId() && !this.loading() && this.workspaceIsEmpty()) {
            // The selection is shared between pages but the rows are not: a page opened after
            // another one left only a selection behind still has to read its own catalog.
            this.loadWorkspace(this.scorecardId()!);
          }
        }
      },
      error: (err) => this.error.set(err?.message ?? 'Failed to load fiscal years and scorecards.'),
    });
  }

  private isCurrentYear(fy: FiscalYear): boolean {
    const now = new Date();
    const start = new Date(fy.startDate);
    const end = new Date(fy.endDate);
    return now >= start && now <= end;
  }

  private workspaceIsEmpty(): boolean {
    const workspace = this.workspace();
    return !workspace.goals.length && !workspace.kpis.length;
  }

  /** Entry boot: only the fiscal-year dimension, because the scorecard catalog needs a corporate read. */
  private loadEntryFiscalYears(preferredScorecardId?: string): void {
    this.scorecardService.getFiscalYears().subscribe({
      next: (fiscalYears) => {
        this.fiscalYears.set(fiscalYears);
        const current = this.fiscalYearId();
        const selected =
          (current && fiscalYears.some((fy) => fy.id === current)
            ? current
            : (fiscalYears.find((fy) => fy.status.toLowerCase() === 'active' || this.isCurrentYear(fy)) ??
                fiscalYears[0])?.id) ?? null;
        if (!selected) return;
        this.fiscalYearId.set(selected);
        this.loadEntryBoard(selected, preferredScorecardId);
      },
      error: (err) => this.error.set(err?.message ?? 'Failed to load fiscal years.'),
    });
  }

  /**
   * Loads the board an entry account works from — the KPIs they report on with their monthly
   * targets and recorded actuals in one request — and the scorecards holding them. The picker
   * keeps the same scorecard across refreshes, so a save cannot jump the page to another one.
   */
  loadEntryBoard(fiscalYearId: string, preferredScorecardId?: string): void {
    const request = ++this.boardRequest;
    const keepScorecardId = preferredScorecardId ?? this.scorecardId();
    this.loading.set(true);
    this.error.set(null);
    this.selectedKpiId.set(null);

    this.kpiService.getEntryBoard(fiscalYearId).subscribe({
      next: (board: EntryBoard) => {
        if (request !== this.boardRequest || fiscalYearId !== this.fiscalYearId()) return;

        const scorecards = board.scorecards.map(entryScorecard);
        this.scorecards.set(scorecards);

        const kpiTargets = new Map<string, KpiTargetValue[]>();
        for (const bundle of board.targets) kpiTargets.set(bundle.kpiId, bundle.targets);
        const actuals = new Map<string, KpiActualValue[]>();
        for (const bundle of board.actuals) actuals.set(bundle.kpiId, bundle.values);

        this.entryActuals.set(actuals);
        this.workspace.set({
          goals: [],
          kras: [],
          kpis: board.kpis,
          snapshot: null,
          locks: null,
          kpiTargets,
        });

        const wanted =
          keepScorecardId && scorecards.some((sc) => sc.id === keepScorecardId)
            ? keepScorecardId
            : (scorecards.find((sc) => sc.scorecardStatus === 'Active') ?? scorecards[0])?.id ?? null;
        this.scorecardId.set(wanted);
        this.loading.set(false);
        if (wanted) this.reloadLocks();
      },
      error: (err) => {
        if (request !== this.boardRequest) return;
        this.loading.set(false);
        this.error.set(err?.message ?? 'Failed to load the data entry board.');
        // Re-emitting the values lets a grid built from the board finish loading instead of
        // spinning on a read that will not return.
        this.entryActuals.set(new Map(this.entryActuals()));
      },
    });
  }

  /** Re-reads the board after a write so the grid reflects the stored values. */
  reloadEntryBoard(): void {
    const fiscalYearId = this.fiscalYearId();
    if (!fiscalYearId) return;
    this.loadEntryBoard(fiscalYearId);
  }

  selectFiscalYear(id: string): void {
    this.fiscalYearId.set(id);
    if (this.usesEntryScope()) {
      this.loadEntryBoard(id);
      return;
    }
    const candidates = this.scorecards().filter((sc) => sc.fiscalYearId === id);
    const preferred = candidates.find((sc) => sc.scorecardStatus === 'Active') ?? candidates[0];
    if (preferred) {
      this.scorecardId.set(preferred.id);
      this.loadWorkspace(preferred.id);
    } else {
      this.scorecardId.set(null);
      this.workspace.set({ goals: [], kras: [], kpis: [], snapshot: null, locks: null, kpiTargets: new Map() });
    }
  }

  selectScorecard(id: string): void {
    this.scorecardId.set(id);
    const scorecard = this.scorecards().find((sc) => sc.id === id);
    if (scorecard) this.fiscalYearId.set(scorecard.fiscalYearId);
    if (this.usesEntryScope()) {
      // The board already carries every KPI of the fiscal year, so only the period windows
      // belong to the scorecard and have to be re-read.
      this.reloadLocks();
      return;
    }
    this.loadWorkspace(id);
  }

  reloadScores(): void {
    // The entry board is the entry account's only score read; it is refreshed with the values.
    if (this.usesEntryScope()) return;
    const scorecardId = this.scorecardId();
    const fiscalYearId = this.fiscalYearId();
    const periodFilter = this.periodFilterParams();
    if (!scorecardId || !fiscalYearId) return;
    this.kpiService.getScoreSnapshots(scorecardId, fiscalYearId, periodFilter ?? undefined).subscribe({
      next: (snapshot) => {
        if (scorecardId !== this.scorecardId()) return;
        this.workspace.update((w) => ({ ...w, snapshot }));
      },
      error: () => undefined,
    });
  }

  /** Fetches the latest lock status for the selected scorecard/year and stores it. */
  reloadLocks(): void {
    const scorecardId = this.scorecardId();
    const fiscalYearId = this.fiscalYearId();
    if (!scorecardId || !fiscalYearId) return;
    this.kpiService.getLockStatus(scorecardId, fiscalYearId).subscribe({
      next: (locks) => {
        if (scorecardId !== this.scorecardId()) return;
        this.workspace.update((w) => ({ ...w, locks }));
      },
      error: () => undefined,
    });
  }

  /** Replaces a single period's lock status returned after a config update. */
  updateLockStatus(item: PeriodLockStatusItem): void {
    this.workspace.update((w) => {
      if (!w.locks) return w;
      return {
        ...w,
        locks: {
          ...w.locks,
          periods: w.locks.periods.map((p) =>
            p.fiscalPeriodId === item.fiscalPeriodId ? item : p
          ),
        },
      };
    });
  }

  private loadWorkspace(scorecardId: string): void {
    const request = ++this.loadRequest;
    this.loading.set(true);
    this.error.set(null);
    this.selectedKpiId.set(null);

    const fiscalYearId = this.fiscalYearId();
    if (!fiscalYearId) {
      if (request === this.loadRequest) this.loading.set(false);
      return;
    }

    const periodFilter = this.periodFilterParams();

    forkJoin({
      goals: this.goalService.getByScorecard(scorecardId),
      kras: this.kraService.getByScorecard(scorecardId),
      kpis: this.kpiService.getByScorecard(scorecardId),
      snapshot: this.safeGet(this.kpiService.getScoreSnapshots(scorecardId, fiscalYearId, periodFilter ?? undefined)),
      locks: this.safeGet(this.kpiService.getLockStatus(scorecardId, fiscalYearId)),
    }).subscribe({
      next: ({ goals, kras, kpis, snapshot, locks }) => {
        if (request !== this.loadRequest || scorecardId !== this.scorecardId()) return;

        // Division KPIs share the corporate scorecard id but belong to a division goal, so
        // they must never appear as corporate (unassigned) KPIs or in the RAG spread.
        const corporateKpis = kpis.filter((kpi) => !kpi.divisionGoalId);

        // Fetch targets for all corporate KPIs
        const kpiTargets = new Map<string, KpiTargetValue[]>();
        if (corporateKpis.length > 0) {
          // Load targets in parallel for all KPIs
          const targetObservables = corporateKpis.map(kpi => 
            this.kpiService.getTargets(kpi.id, fiscalYearId).pipe(
              map(targets => ({ kpiId: kpi.id, targets }))
            )
          );
          forkJoin(targetObservables).subscribe({
            next: (results) => {
              if (request !== this.loadRequest || scorecardId !== this.scorecardId()) return;
              for (const { kpiId, targets } of results) {
                kpiTargets.set(kpiId, targets);
              }
              this.workspace.set({
                goals: goals.sort((a, b) => a.name.localeCompare(b.name)),
                kras,
                kpis: corporateKpis,
                snapshot,
                locks,
                kpiTargets,
              });
              this.loading.set(false);
            },
            error: (err) => {
              if (request !== this.loadRequest) return;
              this.error.set(err?.message ?? 'Failed to load KPI targets.');
              this.loading.set(false);
            },
          });
        } else {
          this.workspace.set({
            goals: goals.sort((a, b) => a.name.localeCompare(b.name)),
            kras,
            kpis: corporateKpis,
            snapshot,
            locks,
            kpiTargets,
          });
          this.loading.set(false);
        }
      },
      error: (err) => {
        if (request !== this.loadRequest) return;
        this.error.set(err?.message ?? 'Failed to load scorecard data.');
        this.loading.set(false);
      },
    });
  }

  private safeGet<T>(obs: Observable<T>): Observable<T | null> {
    return obs.pipe(map((value) => value ?? null));
  }
}

export function latestEntry(entries: ScoreSnapshotEntry[]): ScoreSnapshotEntry | undefined {
  if (!entries.length) return undefined;
  return entries.reduce((a, b) => (b.fiscalMonth > a.fiscalMonth ? b : a));
}

/**
 * Maps a board scorecard onto the picker model. The entry read carries only the fields the
 * Data Entry selectors show, so the scorecard catalog itself stays behind its own read right.
 */
function entryScorecard(entry: EntryScorecard): Scorecard {
  return {
    id: entry.id,
    fiscalYearId: entry.fiscalYearId,
    name: entry.name,
    scope: titleCaseEnumName(entry.scope) as Scorecard['scope'],
    scorecardStatus: titleCaseEnumName(entry.scorecardStatus) as Scorecard['scorecardStatus'],
  };
}

export function scorecardEntries(snap: ScoreSnapshotDto | null | undefined): ScoreSnapshotEntry[] {
  if (!snap) return [];
  return [...(snap.scorecardSnapshots ?? [])];
}

export function goalEntries(snap: ScoreSnapshotDto | null | undefined): ScoreSnapshotEntry[] {
  if (!snap) return [];
  return [...(snap.goalSnapshots ?? [])];
}

export function kraEntries(snap: ScoreSnapshotDto | null | undefined): ScoreSnapshotEntry[] {
  if (!snap) return [];
  return [...(snap.kraSnapshots ?? [])];
}

export function kpiEntries(snap: ScoreSnapshotDto | null | undefined): ScoreSnapshotEntry[] {
  if (!snap) return [];
  return [...(snap.kpiSnapshots ?? [])];
}

export function ragFromScore(
  score: number | null | undefined,
  bands: RagBands = DEFAULT_RAG_BANDS,
): RagBand {
  return ragBandFromScore(score, bands);
}

export function scoreColor(score: number | null | undefined, bands: RagBands = DEFAULT_RAG_BANDS): string {
  return RAG_DISPLAY_COLORS[ragFromScore(score, bands)];
}

const GREGORIAN_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December',
] as const;

const GREGORIAN_MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

function yearStartMonth(startDate: string | null | undefined): number {
  if (!startDate) return 1;
  const parsed = Number(startDate.slice(5, 7));
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : 1;
}

/** Gregorian month (1-12) that a given fiscal month falls on for this fiscal year. */
export function gregorianMonthOfFiscalMonth(
  startDate: string | null | undefined,
  fiscalMonth: number
): number {
  const start = yearStartMonth(startDate);
  return ((start - 1 + ((fiscalMonth - 1 + 12) % 12)) % 12) + 1;
}

/** The current fiscal month (1-12) for a date within a fiscal year starting on `startDate`. */
export function fiscalMonthForDate(
  startDate: string | null | undefined,
  date: Date = new Date()
): number {
  const start = yearStartMonth(startDate);
  const gregorian = date.getMonth() + 1;
  return ((gregorian - start + 12) % 12) + 1;
}

/** Short ('Jul') or long ('July') label for a fiscal month, honoring the fiscal-year start. */
export function fiscalMonthLabel(
  startDate: string | null | undefined,
  fiscalMonth: number,
  long = false
): string {
  const gregorian = gregorianMonthOfFiscalMonth(startDate, fiscalMonth);
  const names = long ? GREGORIAN_MONTH_NAMES : GREGORIAN_MONTH_ABBR;
  return names[gregorian - 1] ?? `Month ${fiscalMonth}`;
}

// ── FR-703 closure timing ────────────────────────────────────────────────
// The backend treats a fiscal year as closed once its end date has passed in ECX
// business time (East Africa Time), even before the nightly closure job flips its
// status. These helpers reproduce that rule for the UI so an ended year cannot look
// editable during the overnight window.

/** ECX operates in East Africa Time (EAT), a fixed UTC+3 offset; Ethiopia has no DST. */
export const BUSINESS_UTC_OFFSET_HOURS = 3;

/** A calendar day, independent of any timezone. */
export interface CalendarDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

/** Today's calendar date in ECX business time, independent of the browser's timezone. */
export function businessDate(now: Date = new Date()): CalendarDate {
  // Shift the instant by the EAT offset, then read its UTC parts: this yields the EAT
  // wall-clock date without ever consulting the browser's local timezone.
  const shifted = new Date(now.getTime() + BUSINESS_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * Calendar date parsed from the `YYYY-MM-DD` prefix of an API value. The API sends
 * datetimes (e.g. "2026-06-30T00:00:00"), so only the date part is read. Parsing the
 * whole string with `new Date()` would treat it as browser-local time and, in a zone
 * behind UTC, report the previous day.
 */
export function calendarDateParts(value: string | null | undefined): CalendarDate | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year: Number(match[1]), month, day };
}

function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

function addCalendarDays(parts: CalendarDate, days: number): CalendarDate {
  // UTC math keeps the month/year rollover exact (e.g. 2027-08-31 + 7 = 2027-09-07).
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * Confirmed business rule (final-month grace): the fiscal year's configured end date
 * stays fixed, and the last reporting month accepts actual entry for seven calendar
 * days after it, inclusive. This returns the grace deadline (end date + 7 days), or
 * null when no end date is available.
 */
export function finalMonthGraceDeadlineOn(
  endDate: string | null | undefined
): CalendarDate | null {
  const end = calendarDateParts(endDate);
  return end === null ? null : addCalendarDays(end, 7);
}

/**
 * Mirrors the backend `ScorecardClosureGuard.YearHasEnded` — the fiscal year closes
 * once its final-month grace period has expired, i.e. the EAT business date is strictly
 * after the end date + 7 calendar days. For a year ending 2027-08-31 the deadline is
 * 2027-09-07 (entry still open on that day) and the year becomes read-only on 2027-09-08.
 */
export function finalMonthGracePeriodExpiredOn(
  endDate: string | null | undefined,
  businessDay: CalendarDate
): boolean {
  const deadline = finalMonthGraceDeadlineOn(endDate);
  return deadline !== null && compareCalendarDates(businessDay, deadline) > 0;
}

/** {@link finalMonthGracePeriodExpiredOn} using the current (or supplied) instant. */
export function finalMonthGracePeriodExpired(
  endDate: string | null | undefined,
  now: Date = new Date()
): boolean {
  return finalMonthGracePeriodExpiredOn(endDate, businessDate(now));
}

/**
 * Mirrors the backend `ScorecardClosureGuard.YearHasEnded` (fiscal-calendar bookkeeping:
 * a year whose end date is behind the EAT business date is treated as complete). Used for
 * fiscal-year metadata management only — scorecard read-only state is governed by
 * {@link isFiscalYearClosedOn}, which adds the final-month grace window.
 */
export function fiscalYearHasEndedOn(
  endDate: string | null | undefined,
  businessDay: CalendarDate
): boolean {
  const end = calendarDateParts(endDate);
  return end !== null && compareCalendarDates(end, businessDay) < 0;
}

/** {@link fiscalYearHasEndedOn} using the current (or supplied) instant. */
export function fiscalYearHasEnded(
  endDate: string | null | undefined,
  now: Date = new Date()
): boolean {
  return fiscalYearHasEndedOn(endDate, businessDate(now));
}

/**
 * FR-703: a fiscal year is read-only when its status is Closed/Archived, or when its
 * final-month grace period has expired in ECX business time — the end date plus seven
 * calendar days stays open for final-month actual entry, inclusive, and the year locks
 * from the day after the deadline. Takes the business date explicitly so callers can
 * drive it from a reactive source. Keeps Angular aligned with backend closure enforcement.
 */
export function isFiscalYearClosedOn(
  fiscalYear: Pick<FiscalYear, 'status' | 'endDate'> | null | undefined,
  businessDay: CalendarDate
): boolean {
  if (!fiscalYear) return false;
  const status = (fiscalYear.status ?? '').toLowerCase();
  if (status === 'closed' || status === 'archived') return true;
  return finalMonthGracePeriodExpiredOn(fiscalYear.endDate, businessDay);
}

/** {@link isFiscalYearClosedOn} using the current (or supplied) instant. */
export function isFiscalYearClosed(
  fiscalYear: Pick<FiscalYear, 'status' | 'endDate'> | null | undefined,
  now: Date = new Date()
): boolean {
  return isFiscalYearClosedOn(fiscalYear, businessDate(now));
}

/**
 * Milliseconds until the next EAT midnight — the next business-date rollover. EAT is a
 * fixed UTC+3 offset, so this is exact and needs no DST handling.
 */
export function msUntilNextEatMidnight(now: Date = new Date()): number {
  const millisPerDay = 24 * 60 * 60 * 1000;
  const shifted = now.getTime() + BUSINESS_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const nextDayStart = Math.floor(shifted / millisPerDay) * millisPerDay + millisPerDay;
  return nextDayStart - shifted;
}