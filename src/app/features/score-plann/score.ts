import { Component, computed, inject, signal, HostListener, OnInit } from '@angular/core';
import { DecimalPipe, LowerCasePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { KpiDetailsDrawer } from '../strategic-scorecard/kpi-details/kpi-details';
import {
  ragFromScore,
  ScorecardWorkspaceState,
} from '../strategic-scorecard/workspace-state.service';
import { GoalService } from '../../core/service/goal.service';
import { KRAService } from '../../core/service/kra.service';
import { KPIService } from '../../core/service/kpi.service';
import { KpiTargetValue } from '../../core/service/kpi.service';
import { NotificationService } from '../../core/service/notification.service';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import {
  CreateGoalRequest,
  CreateKpiRequest,
  CreateKraRequest,
  Goal,
  KPI,
  KRA,
  UpdateGoalRequest,
  UpdateKpiRequest,
  UpdateKraRequest,
} from '../../core/model/goal.model';
import {
  CreateScorecardRequest,
  Scorecard,
  UpdateScorecardRequest,
} from '../scorecard/scorecard.model';
import { ScorecardService } from '../scorecard/scorecard.service';
import { ActivatedRoute, Router } from '@angular/router';
import { DivisionService } from '../division/division.service';
import { Division } from '../division/division.model';

import { LucideDynamicIcon } from '@lucide/angular';
type CrudKind = 'goal' | 'kra' | 'kpi';

const round1 = (n: number): number => Math.round(n * 10) / 10;

@Component({
  selector: 'app-hierarchy',
  imports: [DecimalPipe, ReactiveFormsModule, FormsModule, KpiDetailsDrawer, LucideDynamicIcon],
  templateUrl: './score.html',
  styleUrl: './score.scss',
})
export class score implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly scorecardListService = inject(ScorecardService);
  readonly state = inject(ScorecardWorkspaceState);
  private readonly goalService = inject(GoalService);
  private readonly kraService = inject(KRAService);
  private readonly kpiService = inject(KPIService);
  private readonly divisionService = inject(DivisionService);
  private readonly notifications = inject(NotificationService);
  private readonly dialog = inject(ConfirmDialogService);

  readonly siblingScorecards = signal<Scorecard[]>([]);
  readonly siblingLoading = signal(false);

  readonly fiscalYears = this.state.fiscalYears;
  readonly fiscalYearId = this.state.fiscalYearId;
  readonly selectedFiscalYear = this.state.selectedFiscalYear;

  /** Sibling scorecards restricted to the currently selected fiscal year. */
  readonly siblingsForFy = computed(() => {
    const fyId = this.state.fiscalYearId();
    const all = this.siblingScorecards();
    if (!fyId) return all;
    const filtered = all.filter((sc) => sc.fiscalYearId === fyId);
    return filtered.length ? filtered : all;
  });

  readonly showNewMenu = signal(false);
  toggleNewMenu(): void {
    this.showNewMenu.update((v) => !v);
  }
  closeNewMenu(): void {
    this.showNewMenu.set(false);
  }

  // ── Remaining weight hints shown under each modal's weight input ──────────

  /** 100 - (sum of the other goals' weights) - weight typed in the form. */
  goalWeightRemaining(): number {
    const others = this.goals()
      .filter((g) => g.id !== this.crudEditingId())
      .reduce((sum, g) => sum + (g.weight ?? 0), 0);
    const entered = Number(this.goalForm.value.weight ?? 0);
    return round1(100 - others - entered);
  }

  kraWeightRemaining(): number {
    const goalId = this.crudParentId();
    if (!goalId) return 0;
    const others = (this.krasByGoal().get(goalId) ?? [])
      .filter((k) => k.id !== this.crudEditingId())
      .reduce((sum, k) => sum + (k.weight ?? 0), 0);
    const entered = Number(this.kraForm.value.weight ?? 0);
    return round1(100 - others - entered);
  }

  kpiWeightRemaining(): number {
    const kraId = this.crudParentId();
    if (!kraId) return 0;
    const others = (this.kpisByKra().get(kraId) ?? [])
      .filter((k) => k.id !== this.crudEditingId())
      .reduce((sum, k) => sum + (k.weight ?? 0), 0);
    const entered = Number(this.kpiForm.value.weight ?? 0);
    return round1(100 - others - entered);
  }

  readonly goals = this.state.scorecardGoals;
  readonly krasByGoal = this.state.krasByGoal;
  readonly kpisByKra = this.state.kpisByKra;
  readonly unassignedKpis = this.state.unassignedKpis;
  readonly selectedScorecard = this.state.selectedScorecard;
  readonly isReadOnly = this.state.isReadOnly;
  readonly scorecardClosed = this.state.scorecardClosed;
  readonly fiscalYearClosed = this.state.fiscalYearClosed;
  readonly kpiSnapshots = this.state.kpiSnapshots;
  readonly kraSnapshots = this.state.kraSnapshots;
  readonly goalScores = this.state.goalScores;
  readonly kpiTrends = this.state.kpiTrends;
  readonly loading = this.state.loading;
  readonly kpiTargets = this.state.kpiTargets;

  readonly collapsed = signal<Set<string>>(new Set());
  readonly search = signal('');
  readonly openMenu = signal<string | null>(null);
  /** KPIs whose dropdown should open upward because it would overflow the viewport. */
  readonly openUpMenuIds = signal<Set<string>>(new Set());

  readonly drawerOpen = signal(false);

  readonly periodFilterOpen = this.state.periodFilterOpen;
  readonly periodType = this.state.periodType;
  readonly quarterFilter = this.state.quarterFilter;
  readonly monthFrom = this.state.monthFrom;
  readonly monthTo = this.state.monthTo;
  readonly yearFilter = this.state.yearFilter;
  readonly hasPeriodFilter = this.state.hasPeriodFilter;

  // NEW: Filter type (YTD, Month, Quarter, Year)
  readonly filterType = signal<'ytd' | 'month' | 'quarter' | 'year'>('ytd');

  /** Quarter options labelled with month ranges from the selected fiscal year start, e.g. "Q1 · Jul–Sep 2026". */
  readonly periodOptions = computed(() => {
    const fy = this.state.selectedFiscalYear();
    const quarterLabel = (q: number): string => {
      const short = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      const startMonth = fy?.startDate ? Number(fy.startDate.slice(5, 7)) - 1 : -1;
      if (!fy?.startDate || Number.isNaN(startMonth) || startMonth < 0) return `Q${q}`;
      const startYear = Number(fy.startDate.slice(0, 4));
      const from = (startMonth + (q - 1) * 3) % 12;
      const to = (startMonth + q * 3 - 1) % 12;
      const toYear = to < from ? startYear + 1 : startYear;
      return `Q${q} · ${short[from]}–${short[to]} ${to < from ? toYear : startYear}`;
    };
    return [1, 2, 3, 4].map((q) => ({ value: `Q${q}`, label: quarterLabel(q) }));
  });

  /** Year options from available fiscal years. */
  readonly yearOptions = computed(() => 
    this.state.fiscalYears().map(fy => ({ value: fy.id, label: fy.label }))
  );

  /** Validation: From month should not be after To month. */
  readonly monthRangeValid = computed(() => {
    const from = this.state.monthFrom();
    const to = this.state.monthTo();
    if (!from || !to) return true;
    return Number(from) <= Number(to);
  });

  /** Month options for From/To dropdowns (1-12). */
  readonly monthOptions = [
    { value: '1', label: 'January' },
    { value: '2', label: 'February' },
    { value: '3', label: 'March' },
    { value: '4', label: 'April' },
    { value: '5', label: 'May' },
    { value: '6', label: 'June' },
    { value: '7', label: 'July' },
    { value: '8', label: 'August' },
    { value: '9', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];

  readonly userInitials = signal('AD');

  readonly showScorecardModal = signal(false);
  readonly scorecardMetaSubmitting = signal(false);
  readonly scorecardMetaEditingId = signal<string | null>(null);

  // CRUD modal state
  readonly showCrudModal = signal(false);
  readonly crudKind = signal<CrudKind>('goal');
  readonly crudEditingId = signal<string | null>(null);
  readonly crudSubmitting = signal(false);
  readonly crudParentId = signal<string | null>(null);
  readonly kpiDetailLoading = signal(false);

  // Owner list for KPI assignment (divisions, e.g. IT, Trade Operation)
  readonly divisions = signal<Division[]>([]);
  readonly divisionsLoading = signal(false);
  readonly crudParentGoal = computed(() => {
    const id = this.crudParentId();
    return this.goals().find((g) => g.id === id) ?? null;
  });
  readonly crudParentKra = computed(() => {
    const id = this.crudParentId();
    return this.state.kras().find((k) => k.id === id) ?? null;
  });

  // Goal form
  readonly goalForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
    weight: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.min(0), Validators.max(100)],
    }),
  });

  // KRA form
  readonly kraForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
    weight: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.min(0), Validators.max(100)],
    }),
  });

  // KPI form
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
      validators: [Validators.min(0), Validators.max(100)],
    }),
    optimizationType: new FormControl<'Maximize' | 'Minimize' | 'ExactHit' | 'Binary'>('Maximize', {
      nonNullable: true,
    }),
    kpiType: new FormControl<'Leading' | 'Lagging'>('Lagging', { nonNullable: true }),
    dataSource: new FormControl<'Manual' | 'Automated' | 'Calculated'>('Manual', {
      nonNullable: true,
    }),
    divisionOwnerId: new FormControl('', { nonNullable: true }),
    isCumulative: new FormControl(true, { nonNullable: true }),
    baseline: new FormControl<number | null>(null, { nonNullable: true }),
    minValue: new FormControl<number | null>(null, { nonNullable: true }),
    maxValue: new FormControl<number | null>(null, { nonNullable: true }),
  });

  readonly scorecardMetaForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
    scope: new FormControl<Scorecard['scope']>('Corporate', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      // Direct navigation (e.g. coming from a scorecard card): the workspace
      // state may be empty, so load fiscal years + scorecards and select the
      // requested scorecard in one go. Falls back to the current FY/scorecard
      // when the id is absent/unknown.
      this.state.loadFiscalYearsAndScorecards(id);
    } else {
      this.state.loadFiscalYearsAndScorecards();
    }
    this.loadSiblingScorecards();
    this.loadDivisions();
  }

  loadDivisions(): void {
    this.divisionsLoading.set(true);
    this.divisionService.getAll().subscribe({
      next: (divisions) => {
        this.divisions.set(divisions);
        this.divisionsLoading.set(false);
      },
      error: () => {
        this.divisionsLoading.set(false);
      },
    });
  }
  loadSiblingScorecards(): void {
    this.siblingLoading.set(true);
    this.scorecardListService.getAll().subscribe({
      next: (list) => {
        this.siblingScorecards.set(list);
        this.siblingLoading.set(false);
      },
      error: (e) => {
        this.notifications.error(e?.message ?? 'Failed to load scorecards.');
        this.siblingLoading.set(false);
      },
    });
  }

  onSwitchScorecard(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.navigateToScorecard(id);
  }

  onSwitchFiscalYear(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (!id) return;
    this.state.selectFiscalYear(id);
    const next = this.state.scorecardId();
    if (next) this.navigateToScorecard(next);
  }

  onScopeChange(event: Event): void {
    if (this.isReadOnly()) {
      this.notifications.error('This scorecard is closed and cannot be modified.');
      return;
    }
    const scope = (event.target as HTMLSelectElement).value as Scorecard['scope'];
    const sc = this.selectedScorecard();
    if (!sc || sc.scope === scope) return;
    this.scorecardListService.update(sc.id, { scope }).subscribe({
      next: () => {
        this.notifications.success(`Scope changed to ${scope}.`);
        this.loadSiblingScorecards();
        this.state.loadFiscalYearsAndScorecards(sc.id);
      },
      error: (e) => {
        this.notifications.error(e?.message ?? 'Failed to update scope.');
        this.state.loadFiscalYearsAndScorecards(sc.id);
      },
    });
  }

  onSwitchScorecardRow(sc: Scorecard): void {
    if (sc.id === this.selectedScorecard()?.id) return;
    this.navigateToScorecard(sc.id);
  }

  private navigateToScorecard(id: string): void {
    // Same navigation the scorecard cards page uses when a card is clicked.
    this.state.selectScorecard(id);
    // If your router config keys this page by :id, also update the URL:
    this.router.navigate(['/scorecards', id]);
  }

  togglePeriodFilter(): void {
    this.state.periodFilterOpen.update((open) => !open);
  }

  setPeriodType(type: 'ytd' | 'quarter' | 'month' | 'year'): void {
    this.filterType.set(type);
    this.onFilter();
  }

  clearPeriodFilter(): void {
    this.filterType.set('ytd');
    this.onFilter();
  }

  // NEW: Filter type change handlers
  onFilterTypeChange(type: 'ytd' | 'month' | 'quarter' | 'year'): void {
    this.filterType.set(type);
    this.onFilter();
  }

  onMonthFromChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.state.monthFrom.set(value ? `${parseInt(value, 10)}` : '');
    this.onFilter();
  }

  onMonthToChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.state.monthTo.set(value ? `${parseInt(value, 10)}` : '');
    this.onFilter();
  }

  onYearFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.state.yearFilter.set(value ? value : null);
    this.onFilter();
  }

  onQuarterFilterChange(event: Event): void {
    this.state.quarterFilter.set((event.target as HTMLSelectElement).value);
    this.onFilter();
  }

  onFilter(): void {
    // Set the period type - this will trigger re-computation of
    // periodMonthRange, hasPeriodFilter, and subsequently kpiSnapshots,
    // goalScores, and overallScore through the signal dependency chain.
    this.state.periodType.set(this.filterType());
    
    // Reset other filter values when switching types
    if (this.filterType() !== 'quarter') {
      this.state.quarterFilter.set('');
    }
    if (this.filterType() !== 'month') {
      this.state.monthFrom.set('');
      this.state.monthTo.set('');
    }
    if (this.filterType() !== 'year') {
      this.state.yearFilter.set(null);
    }
    
    // Log filter state for debugging
    console.log('Filter applied:', {
      type: this.filterType(),
      quarter: this.state.quarterFilter(),
      monthFrom: this.state.monthFrom(),
      monthTo: this.state.monthTo(),
      year: this.state.yearFilter(),
    });
  }

  onExport(): void {
    // TODO: hook up to your export endpoint.
    this.notifications.success('Export started.');
  }

  // ── Sibling scorecard row actions ──────────────────────────────────────────

  // onCloneScorecard(sc: Scorecard): void {
  //   const req: CreateScorecardRequest = {
  //     fiscalYearId: sc.fiscalYearId,
  //     name: `${sc.name} (Copy)`,
  //     description: sc.description,
  //     scope: sc.scope,
  //   };
  //   this.scorecardListService.create(req).subscribe({
  //     next: () => { this.notifications.success('Scorecard cloned.'); this.loadSiblingScorecards(); },
  //     error: (e) => this.notifications.error(e?.message ?? 'Clone failed.'),
  //   });
  // }

  onEditScorecardMeta(sc: Scorecard): void {
    this.scorecardMetaEditingId.set(sc.id);
    this.scorecardMetaForm.setValue({
      name: sc.name,
      description: sc.description ?? '',
      scope: sc.scope,
    });
    this.showScorecardModal.set(true);
  }

  closeScorecardModal(): void {
    this.showScorecardModal.set(false);
    this.scorecardMetaEditingId.set(null);
  }

  onSubmitScorecardMeta(): void {
    if (this.isReadOnly()) {
      this.notifications.error('This scorecard is closed and cannot be modified.');
      return;
    }
    const id = this.scorecardMetaEditingId();
    if (!id || this.scorecardMetaForm.invalid || this.scorecardMetaSubmitting()) return;

    this.scorecardMetaSubmitting.set(true);
    const req: UpdateScorecardRequest = this.scorecardMetaForm.getRawValue();

    this.scorecardListService.update(id, req).subscribe({
      next: () => {
        this.notifications.success('Scorecard updated.');
        this.closeScorecardModal();
        this.loadSiblingScorecards();
        this.scorecardMetaSubmitting.set(false);
      },
      error: (e) => {
        this.notifications.error(e?.message ?? 'Update failed.');
        this.scorecardMetaSubmitting.set(false);
      },
    });
  }

  async onDeleteScorecardMeta(sc: Scorecard): Promise<void> {
    if (this.isReadOnly()) {
      this.notifications.error('This scorecard is closed and cannot be deleted.');
      return;
    }
    const ok = await this.dialog.confirm(
      'Delete Scorecard',
      `Are you sure you want to delete "${sc.name}"? This cannot be undone.`,
      { confirmText: 'Delete', variant: 'danger' },
    );
    if (!ok) return;

    this.scorecardListService.delete(sc.id).subscribe({
      next: () => {
        this.notifications.success('Scorecard deleted.');
        this.loadSiblingScorecards();
        if (sc.id === this.selectedScorecard()?.id) this.reloadWorkspace();
      },
      error: (e) => this.notifications.error(e?.message ?? 'Delete failed.'),
    });
  }

  readonly filteredKpis = computed(() => {
    const all = this.state.kpis();
    const q = this.search().trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (kpi) =>
        kpi.name.toLowerCase().includes(q) ||
        (kpi.ownerName ?? '').toLowerCase().includes(q) ||
        (kpi.code ?? '').toLowerCase().includes(q),
    );
  });

  // Weight validation
  readonly goalWeightTotal = computed(() => {
    return this.goals().reduce((sum, g) => sum + (g.weight ?? 0), 0);
  });

  readonly goalWeightValid = computed(() => {
    return this.goals().length === 0 || Math.abs(this.goalWeightTotal() - 100) < 0.01;
  });

  kraWeightTotal = (goalId: string): number => {
    return (this.krasByGoal().get(goalId) ?? []).reduce((sum, k) => sum + (k.weight ?? 0), 0);
  };

  kraWeightValid = (goalId: string): boolean => {
    const kras = this.krasByGoal().get(goalId) ?? [];
    return kras.length === 0 || Math.abs(this.kraWeightTotal(goalId) - 100) < 0.01;
  };

  kpiWeightTotal = (kraId: string): number => {
    return (this.kpisByKra().get(kraId) ?? []).reduce((sum, k) => sum + (k.weight ?? 0), 0);
  };

  kpiWeightValid = (kraId: string): boolean => {
    const kpis = this.kpisByKra().get(kraId) ?? [];
    return kpis.length === 0 || Math.abs(this.kpiWeightTotal(kraId) - 100) < 0.01;
  };

  krasForGoal(goalId: string): KRA[] {
    return (this.krasByGoal().get(goalId) ?? []).sort((a, b) => a.weight - b.weight);
  }

  kpisForKra(kraId: string): KPI[] {
    return this.kpisByKra().get(kraId) ?? [];
  }

  goalKpiCount(goalId: string): number {
    let count = 0;
    for (const kra of this.krasByGoal().get(goalId) ?? []) {
      count += (this.kpisByKra().get(kra.id) ?? []).length;
    }
    count += this.unassignedKpis().filter((kpi) => kpi.goalId === goalId).length;
    return count;
  }

  isExpanded(id: string): boolean {
    return !this.collapsed().has(id);
  }

  toggle(id: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  expandAll(): void {
    this.collapsed.set(new Set());
  }

  collapseAll(): void {
    this.collapsed.set(new Set(this.goals().map((g) => g.id)));
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  toggleMenu(entityId: string, event: MouseEvent): void {
    event.stopPropagation();
    const opening = this.openMenu() !== entityId;
    this.openMenu.update((current) => (current === entityId ? null : entityId));
    if (opening) {
      // Decide the opening direction only after the menu has rendered.
      requestAnimationFrame(() => {
        const button = (event.target as HTMLElement).closest('.actions-menu-btn');
        const menu = button
          ?.closest('.actions-dropdown')
          ?.querySelector('.actions-dropdown-menu') as HTMLElement | null;
        if (!menu) return;
        const openUp = menu.getBoundingClientRect().bottom > window.innerHeight - 8;
        this.openUpMenuIds.update((set) => {
          const next = new Set(set);
          if (openUp) next.add(entityId);
          else next.delete(entityId);
          return next;
        });
      });
    }
  }

  closeMenu(): void {
    this.openMenu.set(null);
  }

  isMenuOpen(entityId: string): boolean {
    return this.openMenu() === entityId;
  }

  /** Get the target value for a KPI based on the active period filter.
   * Prefers the backend-derived period target from the snapshot entry. */
  getKpiTarget(kpi: KPI): number | null {
    // Priority 1: backend-derived period target from the (aggregated) snapshot entry
    const snap = this.kpiSnapshots().get(kpi.id);
    if (snap?.targetValue !== null && snap?.targetValue !== undefined) {
      return snap.targetValue;
    }

    // Priority 2: fall back to kpi targets map with appropriate granularity
    const periodType = this.periodType();
    const hasActiveFilter = this.hasPeriodFilter();
    const targets = this.kpiTargets().get(kpi.id);
    if (targets?.length && hasActiveFilter) {
      if (periodType === 'quarter') {
        const quarter = Number(this.quarterFilter().replace('Q', ''));
        if (quarter >= 1 && quarter <= 4) {
          const quarterlyTarget = targets.find(t => t.granularity === 'Quarterly' && t.quarter === quarter);
          if (quarterlyTarget) return quarterlyTarget.targetValue;
        }
      } else if (periodType === 'month') {
        const fromMonth = this.state.fiscalMonthFrom();
        const toMonth = this.state.fiscalMonthTo();
        if (fromMonth !== null) {
          const targetMonth = toMonth !== null && toMonth > fromMonth ? toMonth : fromMonth;
          const monthlyTarget = targets.find(t => t.granularity === 'Monthly' && t.fiscalMonth === targetMonth);
          if (monthlyTarget) return monthlyTarget.targetValue;
        }
      }
      const annualTarget = targets.find(t => t.granularity === 'Annual');
      if (annualTarget) return annualTarget.targetValue;
    }

    return kpi.targetAnnual ?? null;
  }

  /** Get the actual value for a KPI based on the active period filter.
   * Prefers the backend-derived period actual from the snapshot entry. */
  getKpiActual(kpi: KPI): number | null {
    // Priority 1: backend-derived period actual from the (aggregated) snapshot entry
    const snap = this.kpiSnapshots().get(kpi.id);
    if (snap?.actualValue !== null && snap?.actualValue !== undefined) {
      return snap.actualValue;
    }

    // Priority 2: no filter → use KPI's own actualYTD
    if (!this.hasPeriodFilter()) {
      return kpi.actualYTD ?? null;
    }

    // Priority 3: compute from per-month snapshots using periodMonthRange
    const range = this.state.periodMonthRange();
    if (!range) return null;

    const allSnapshots = Array.from(this.kpiSnapshots().values())
      .filter(s => s.entityId === kpi.id && !s.isPeriodAggregate && s.fiscalMonth >= range.from && s.fiscalMonth <= range.to);

    if (allSnapshots.length === 0) return null;

    const periodType = this.periodType();
    if (periodType === 'month' && range.from === range.to) {
      // Single month: return that month's actual
      const entry = allSnapshots[0];
      return entry.actualValue ?? null;
    }

    // Quarter / YTD / Year / multi-month range: sum actuals across the range
    const sum = allSnapshots.reduce((acc, s) => acc + (s.actualValue ?? 0), 0);
    return sum > 0 ? sum : null;
  }

  openDetails(kpi: KPI): void {
    this.state.selectedKpiId.set(kpi.id);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  openTargets(kpi: KPI, event: MouseEvent): void {
    event.stopPropagation();
    this.closeMenu();
    // Opens the single-KPI target page, which is kept for this purpose.
    this.router.navigate(['/target-config'], {
      queryParams: {
        kpiId: kpi.id,
        scorecardId: this.selectedScorecard()?.id ?? '',
        fiscalYearId: this.state.fiscalYearId() ?? '',
      },
    });
  }

  ragOfScore(score: number | null): 'Green' | 'Amber' | 'Red' {
    return ragFromScore(score);
  }

  scoreOf(entityId: string, map: Map<string, { score?: number }>): number | null {
    const entry = map.get(entityId);
    return entry?.score ?? null;
  }

  scoreTone(score: number | null): string {
    if (score === null || score === undefined) return 'var(--color-text-subtle)';
    return ragFromScore(score) === 'Green'
      ? '#16a34a'
      : ragFromScore(score) === 'Amber'
        ? '#d97706'
        : '#dc2626';
  }

  progressWidth(score: number | null): number {
    if (score === null || score === undefined) return 0;
    return Math.min(100, Math.max(0, score));
  }

  progressClass(score: number | null): string {
    if (score === null || score === undefined) return '';
    const rag = ragFromScore(score);
    return rag === 'Green' ? 'progress-green' : rag === 'Amber' ? 'progress-amber' : 'progress-red';
  }

  trendArrow(trend: 'up' | 'down' | 'stable'): string {
    return trend === 'up' ? '\u25B2' : trend === 'down' ? '\u25BC' : '\u25A0';
  }

  // ── Stat row + score-badge helpers (new) ──────────────────────────────────

  readonly totalKras = computed(() => {
    let count = 0;
    for (const kras of this.krasByGoal().values()) count += kras.length;
    return count;
  });

  readonly totalKpis = computed(() => {
    let count = 0;
    for (const kpis of this.kpisByKra().values()) count += kpis.length;
    return count + this.unassignedKpis().length;
  });

  readonly scorecardScore = computed(() => {
    const goals = this.goals();
    const scores = this.goalScores();
    let weightedSum = 0;
    let weightTotal = 0;
    for (const goal of goals) {
      const score = this.scoreOf(goal.id, scores);
      if (score === null) continue;
      weightedSum += score * goal.weight;
      weightTotal += goal.weight;
    }
    return weightTotal > 0 ? weightedSum / weightTotal : 0;
  });

  readonly ragSpread = computed(() => {
    let green = 0,
      amber = 0,
      red = 0;
    for (const snapshot of this.kpiSnapshots().values()) {
      const score = snapshot?.score ?? null;
      if (score === null) continue;
      const rag = ragFromScore(score);
      if (rag === 'Green') green++;
      else if (rag === 'Amber') amber++;
      else red++;
    }
    return { green, amber, red };
  });

  ragBadgeClass(score: number | null): string {
    if (score === null || score === undefined) return 'rag-badge-gray';
    const rag = ragFromScore(score);
    return rag === 'Green'
      ? 'rag-badge-green'
      : rag === 'Amber'
        ? 'rag-badge-amber'
        : 'rag-badge-red';
  }

  goalKraCount(goalId: string): number {
    return this.krasForGoal(goalId).length;
  }

  // ── CRUD Operations ──────────────────────────────────────────────────────

  openAddGoal(): void {
    this.crudKind.set('goal');
    this.crudEditingId.set(null);
    this.crudParentId.set(null);
    this.goalForm.reset({
      name: '',
      description: '',
      weight: 0,
    });
    this.showCrudModal.set(true);
  }

  openEditGoal(goal: Goal, event: MouseEvent): void {
    event.stopPropagation();
    this.crudKind.set('goal');
    this.crudEditingId.set(goal.id);
    this.crudParentId.set(null);
    this.goalForm.setValue({
      name: goal.name,
      description: goal.description ?? '',
      weight: goal.weight,
    });
    this.showCrudModal.set(true);
  }

  openAddKra(goalId: string): void {
    this.crudKind.set('kra');
    this.crudEditingId.set(null);
    this.crudParentId.set(goalId);
    this.kraForm.reset({ name: '', description: '', weight: 0 });
    this.showCrudModal.set(true);
    if (!this.isExpanded(goalId)) this.toggle(goalId);
  }

  openEditKra(kra: KRA, event: MouseEvent): void {
    event.stopPropagation();
    this.crudKind.set('kra');
    this.crudEditingId.set(kra.id);
    this.crudParentId.set(kra.goalId);
    this.kraForm.setValue({
      name: kra.name,
      description: kra.description ?? '',
      weight: kra.weight,
    });
    this.showCrudModal.set(true);
  }

  openAddKpi(kraId: string, goalId: string): void {
    this.crudKind.set('kpi');
    this.crudEditingId.set(null);
    this.crudParentId.set(kraId);
    this.kpiForm.reset({
      name: '',
      description: '',
      unit: '',
      weight: 0,
      optimizationType: 'Maximize',
      kpiType: 'Lagging',
      dataSource: 'Manual',
      divisionOwnerId: '',
      isCumulative: true,
      baseline: null,
      minValue: null,
      maxValue: null,
    });
    this.showCrudModal.set(true);
    if (!this.isExpanded(kraId)) this.toggle(kraId);
  }

  openEditKpi(kpi: KPI, event: MouseEvent): void {
    event?.stopPropagation();
    this.closeMenu();
    // The hierarchy list only carries summary fields; fetch full details so
    // baseline/min/max/owner can be edited too.
    this.kpiDetailLoading.set(true);
    this.kpiService.getById(kpi.id).subscribe({
      next: (full) => {
        this.kpiDetailLoading.set(false);
        this.crudKind.set('kpi');
        this.crudEditingId.set(kpi.id);
        this.crudParentId.set(full.kraId ?? null);
        this.kpiForm.patchValue({
          name: full.name,
          description: full.description ?? '',
          unit: full.unit ?? '',
          weight: full.weight,
          optimizationType: full.optimizationType,
          kpiType: full.kpiType,
          dataSource: full.dataSource,
          divisionOwnerId: full.divisionOwnerId ?? '',
          isCumulative: full.isCumulative,
          baseline: full.baseline ?? null,
          minValue: full.minValue ?? null,
          maxValue: full.maxValue ?? null,
        });
        this.showCrudModal.set(true);
      },
      error: (e) => {
        this.kpiDetailLoading.set(false);
        this.notifications.error(e?.message ?? 'Failed to load KPI details.');
      },
    });
  }

  closeCrudModal(): void {
    this.showCrudModal.set(false);
    this.crudEditingId.set(null);
    this.crudParentId.set(null);
  }

  get crudTitle(): string {
    const kind = this.crudKind();
    const editing = this.crudEditingId();
    const prefix = editing ? 'Edit' : 'Add';
    return `${prefix} ${kind.toUpperCase()}`;
  }

  get activeForm(): FormGroup {
    switch (this.crudKind()) {
      case 'goal':
        return this.goalForm;
      case 'kra':
        return this.kraForm;
      case 'kpi':
        return this.kpiForm;
    }
  }

  onSubmitCrud(): void {
    if (this.isReadOnly()) {
      this.notifications.error('This scorecard is closed and cannot be modified.');
      return;
    }
    if (this.crudSubmitting()) return;
    const form = this.activeForm;
    if (form.invalid) return;

    this.crudSubmitting.set(true);
    const kind = this.crudKind();
    const editingId = this.crudEditingId();
    const scorecardId = this.state.scorecardId();

    if (!scorecardId) {
      this.crudSubmitting.set(false);
      return;
    }

    if (kind === 'goal') {
      if (editingId) {
        const req: UpdateGoalRequest = {
          name: this.goalForm.controls.name.value,
          description: this.goalForm.controls.description.value || undefined,
          weight: this.goalForm.controls.weight.value,
        };
        this.goalService.update(editingId, req).subscribe({
          next: () => {
            this.notifications.success('Goal updated.');
            this.closeCrudModal();
            this.reloadWorkspace();
          },
          error: (e) => {
            this.notifications.error(e?.message ?? 'Update failed.');
            this.crudSubmitting.set(false);
          },
          complete: () => this.crudSubmitting.set(false),
        });
      } else {
        const req: CreateGoalRequest = {
          scorecardId,
          name: this.goalForm.controls.name.value,
          description: this.goalForm.controls.description.value || undefined,
          weight: this.goalForm.controls.weight.value,
        };
        this.goalService.create(req).subscribe({
          next: () => {
            this.notifications.success('Goal created.');
            this.closeCrudModal();
            this.reloadWorkspace();
          },
          error: (e) => {
            this.notifications.error(e?.message ?? 'Create failed.');
            this.crudSubmitting.set(false);
          },
          complete: () => this.crudSubmitting.set(false),
        });
      }
    } else if (kind === 'kra') {
      const goalId = this.crudParentId();
      if (!goalId) {
        this.crudSubmitting.set(false);
        return;
      }

      if (editingId) {
        const req: UpdateKraRequest = {
          name: this.kraForm.controls.name.value,
          description: this.kraForm.controls.description.value || undefined,
          weight: this.kraForm.controls.weight.value,
        };
        this.kraService.update(editingId, req).subscribe({
          next: () => {
            this.notifications.success('KRA updated.');
            this.closeCrudModal();
            this.reloadWorkspace();
          },
          error: (e) => {
            this.notifications.error(e?.message ?? 'Update failed.');
            this.crudSubmitting.set(false);
          },
          complete: () => this.crudSubmitting.set(false),
        });
      } else {
        const req: CreateKraRequest = {
          goalId,
          scorecardId,
          name: this.kraForm.controls.name.value,
          description: this.kraForm.controls.description.value || undefined,
          weight: this.kraForm.controls.weight.value,
        };
        this.kraService.create(req).subscribe({
          next: () => {
            this.notifications.success('KRA created.');
            this.closeCrudModal();
            this.reloadWorkspace();
          },
          error: (e) => {
            this.notifications.error(e?.message ?? 'Create failed.');
            this.crudSubmitting.set(false);
          },
          complete: () => this.crudSubmitting.set(false),
        });
      }
    } else if (kind === 'kpi') {
      const kraId = this.crudParentId();
      if (!kraId) {
        this.crudSubmitting.set(false);
        return;
      }

      if (editingId) {
        const req: UpdateKpiRequest = {
          name: this.kpiForm.controls.name.value,
          description: this.kpiForm.controls.description.value || undefined,
          unit: this.kpiForm.controls.unit.value || undefined,
          weight: this.kpiForm.controls.weight.value,
          optimizationType: this.kpiForm.controls.optimizationType.value,
          kpiType: this.kpiForm.controls.kpiType.value,
          dataSource: this.kpiForm.controls.dataSource.value,
          divisionOwnerId: this.kpiForm.controls.divisionOwnerId.value || undefined,
          isCumulative: this.kpiForm.controls.isCumulative.value,
          baseline: this.kpiForm.controls.baseline.value ?? undefined,
          minValue: this.kpiForm.controls.minValue.value ?? undefined,
          maxValue: this.kpiForm.controls.maxValue.value ?? undefined,
        };
        this.kpiService.update(editingId, req).subscribe({
          next: () => {
            this.notifications.success('KPI updated.');
            this.closeCrudModal();
            this.reloadWorkspace();
          },
          error: (e) => {
            this.notifications.error(e?.message ?? 'Update failed.');
            this.crudSubmitting.set(false);
          },
          complete: () => this.crudSubmitting.set(false),
        });
      } else {
        const req: CreateKpiRequest = {
          scorecardId,
          kraId,
          name: this.kpiForm.controls.name.value,
          description: this.kpiForm.controls.description.value || undefined,
          unit: this.kpiForm.controls.unit.value || undefined,
          weight: this.kpiForm.controls.weight.value,
          optimizationType: this.kpiForm.controls.optimizationType.value,
          kpiType: this.kpiForm.controls.kpiType.value,
          dataSource: this.kpiForm.controls.dataSource.value,
          divisionOwnerId: this.kpiForm.controls.divisionOwnerId.value || undefined,
          isCumulative: this.kpiForm.controls.isCumulative.value,
          baseline: this.kpiForm.controls.baseline.value ?? undefined,
          minValue: this.kpiForm.controls.minValue.value ?? undefined,
          maxValue: this.kpiForm.controls.maxValue.value ?? undefined,
        };
        this.kpiService.create(req).subscribe({
          next: () => {
            this.notifications.success('KPI created.');
            this.closeCrudModal();
            this.reloadWorkspace();
          },
          error: (e) => {
            this.notifications.error(e?.message ?? 'Create failed.');
            this.crudSubmitting.set(false);
          },
          complete: () => this.crudSubmitting.set(false),
        });
      }
    }
  }

  async onDeleteGoal(goal: Goal, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (this.isReadOnly()) {
      this.notifications.error('This scorecard is closed and cannot be modified.');
      return;
    }
    const ok = await this.dialog.confirm(
      'Delete Goal',
      `Delete "${goal.name}"? This cannot be undone.`,
      { confirmText: 'Delete', variant: 'danger' },
    );
    if (!ok) return;
    this.goalService.delete(goal.id).subscribe({
      next: () => {
        this.notifications.success('Goal deleted.');
        this.reloadWorkspace();
      },
      error: (e) => this.notifications.error(e?.message ?? 'Delete failed.'),
    });
  }

  async onDeleteKra(kra: KRA, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (this.isReadOnly()) {
      this.notifications.error('This scorecard is closed and cannot be modified.');
      return;
    }
    const ok = await this.dialog.confirm(
      'Delete KRA',
      `Delete "${kra.name}"? This cannot be undone.`,
      { confirmText: 'Delete', variant: 'danger' },
    );
    if (!ok) return;
    this.kraService.delete(kra.id).subscribe({
      next: () => {
        this.notifications.success('KRA deleted.');
        this.reloadWorkspace();
      },
      error: (e) => this.notifications.error(e?.message ?? 'Delete failed.'),
    });
  }

  async onDeleteKpi(kpi: KPI, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (this.isReadOnly()) {
      this.notifications.error('This scorecard is closed and cannot be modified.');
      return;
    }
    const ok = await this.dialog.confirm(
      'Delete KPI',
      `Delete "${kpi.name}"? This cannot be undone.`,
      { confirmText: 'Delete', variant: 'danger' },
    );
    if (!ok) return;
    this.kpiService.delete(kpi.id).subscribe({
      next: () => {
        this.notifications.success('KPI deleted.');
        this.reloadWorkspace();
      },
      error: (e) => this.notifications.error(e?.message ?? 'Delete failed.'),
    });
  }

  private reloadWorkspace(): void {
    const scorecardId = this.state.scorecardId();
    if (scorecardId) {
      this.state.selectScorecard(scorecardId);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!(event.target as HTMLElement).closest('.hp-period-filter')) {
      this.state.periodFilterOpen.set(false);
    }
    if (!(event.target as HTMLElement).closest('.actions-dropdown')) {
      this.closeMenu();
    }
  }
}
