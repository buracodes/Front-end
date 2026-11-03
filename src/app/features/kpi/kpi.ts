import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ColDef } from 'ag-grid-community';
import { forkJoin } from 'rxjs';
import { toApiError } from '../../core/model/api-error';
import { NotificationService } from '../../core/service/notification.service';
import { GridTable } from '../../shared/reusableComponent/grid-table/grid-table';
import { actionsColumn } from '../../shared/reusableComponent/grid-table/grid-table-actions';
import { PlanFilterBar } from '../../shared/reusableComponent/plan-filter-bar/plan-filter-bar';
import { PlanFilterService } from '../../core/service/plan-filter.service';
import { CreateKpiRequest, Kpi, KpiOwnerOption, KpiOwnerType, UpdateKpiRequest } from './kpi.model';
import { KpiService } from './kpi.service';
import { ScoreSnapshotEntry, KPIService as ScoreSnapshotService } from '../../core/service/kpi.service';
import { scoreColor } from '../strategic-scorecard/workspace-state.service';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import { Scorecard } from '../../core/model/scorecard.model';
import { ScorecardService } from '../../core/service/scorecard.service';
import { KraService } from '../kra/kra.service';
import { Kra } from '../kra/kra.model';
import { DivisionService } from '../division/division.service';
import { Division } from '../division/division.model';

import { LucideDynamicIcon } from '@lucide/angular';
@Component({
  selector: 'app-kpi',
  imports: [GridTable, PlanFilterBar, ReactiveFormsModule, LucideDynamicIcon],
  templateUrl: './kpi.html',
  styleUrl: './kpi.scss',
})
export class KpiPage implements OnDestroy {
  private readonly kpiService = inject(KpiService);
  private readonly scorecardService = inject(ScorecardService);
  private readonly kraService = inject(KraService);
  private readonly divisionService = inject(DivisionService);
  private readonly scoreSnapshotService = inject(ScoreSnapshotService);
  private readonly notifications = inject(NotificationService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly planFilters = inject(PlanFilterService);

  readonly rows = signal<Kpi[]>([]);
  readonly scorecards = signal<Scorecard[]>([]);
  readonly allKras = signal<Kra[]>([]);
  readonly formKras = signal<Kra[]>([]);
  readonly divisions = signal<Division[]>([]);
  readonly divisionsLoading = signal(false);
  readonly divisionLoadError = signal<string | null>(null);
  readonly divisionSearch = signal('');
  readonly selectedDivision = signal<Division | null>(null);
  readonly ownerOptions = signal<KpiOwnerOption[]>([]);
  readonly ownerSearch = signal('');
  readonly ownerSearching = signal(false);
  readonly ownerSearchError = signal<string | null>(null);
  readonly selectedOwner = signal<KpiOwnerOption | null>(null);
  readonly ownerError = signal<string | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly submitting = signal(false);
  readonly editingId = signal<string | null>(null);
  private ownerSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private ownerSearchRequest = 0;
  /** Latest score snapshot per KPI for the scorecards currently listed (Target / Actual / Score). */
  readonly kpiSnapshots = signal(new Map<string, ScoreSnapshotEntry>());
  private snapshotRequest = 0;

  private pendingCreateScorecardId = '';

  readonly optimizationTypes = ['Maximize', 'Minimize', 'ExactHit', 'Binary'] as const;
  readonly dataSources = ['Manual', 'Automated', 'Calculated'] as const;
  readonly kpiTypes = ['Leading', 'Lagging'] as const;

  /** Local SPMS divisions, narrowed by the selector search (name or code). */
  readonly divisionResults = computed(() => {
    const term = this.divisionSearch().trim().toLowerCase();
    return this.divisions()
      .filter((division) => division.isActive !== false)
      .filter(
        (division) =>
          !term ||
          division.name.toLowerCase().includes(term) ||
          (division.code ?? '').toLowerCase().includes(term),
      );
  });

  readonly form = new FormGroup({
    scorecardId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    kraId: new FormControl('', { nonNullable: true }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    unit: new FormControl('', { nonNullable: true }),
    weight: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(100)],
    }),
    optimizationType: new FormControl<Kpi['optimizationType']>('Maximize', { nonNullable: true }),
    dataSource: new FormControl<Kpi['dataSource']>('Manual', { nonNullable: true }),
    kpiType: new FormControl<Kpi['kpiType']>('Lagging', { nonNullable: true }),
    isCumulative: new FormControl(false, { nonNullable: true }),
    ownerType: new FormControl<KpiOwnerType | ''>('', { nonNullable: true }),
    ownerId: new FormControl('', { nonNullable: true }),
    divisionOwnerId: new FormControl('', { nonNullable: true }),
    baseline: new FormControl<number | null>(null),
    minValue: new FormControl<number | null>(null),
    maxValue: new FormControl<number | null>(null),
  });

  readonly columnDefs: ColDef[] = [
    { field: 'name', headerName: 'Name', sortable: true, filter: true, flex: 1 },
    {
      field: 'scorecardName',
      headerName: 'Scorecard',
      sortable: true,
      filter: true,
      flex: 1,
      valueGetter: (params) => (params.data ? this.scorecardLabel(params.data) : ''),
    },
    {
      field: 'goalName',
      headerName: 'Goal',
      sortable: true,
      filter: true,
      flex: 1,
      valueGetter: (params) => (params.data ? this.goalLabel(params.data) : ''),
    },
    {
      field: 'kraName',
      headerName: 'KRA',
      sortable: true,
      filter: true,
      flex: 1,
      valueGetter: (params) => (params.data ? this.kraLabel(params.data) : ''),
    },
    { field: 'unit', headerName: 'Unit', sortable: true, filter: true, valueFormatter: (params) => (params.value ? params.value : '—') },
    {
      headerName: 'Owner',
      sortable: true,
      filter: true,
      flex: 1,
      valueGetter: (params) => (params.data ? this.ownerLabel(params.data) : ''),
    },
    { field: 'weight', headerName: 'Weight', type: 'rightAligned', sortable: true },
    { field: 'kpiType', headerName: 'KPI Type', sortable: true, filter: true },
    { field: 'optimizationType', headerName: 'Optimization', sortable: true, filter: true },
    { field: 'dataSource', headerName: 'Data Source', sortable: true, filter: true },
    {
      field: 'isActive',
      headerName: 'Active',
      sortable: true,
      filter: true,
      cellRenderer: (params: { value?: boolean }): string => (params.value ? 'Yes' : 'No'),
    },
    { field: 'childKpiCount', headerName: 'Child KPIs', type: 'rightAligned' },
    {
      headerName: 'Target',
      type: 'rightAligned',
      sortable: true,
      valueGetter: (params) => this.snapshotOf(params.data?.id)?.targetValue ?? null,
      valueFormatter: (params) => (params.value == null ? '—' : `${Number(params.value).toLocaleString()}`),
    },
    {
      headerName: 'Actual',
      type: 'rightAligned',
      sortable: true,
      valueGetter: (params) => this.snapshotOf(params.data?.id)?.actualValue ?? null,
      valueFormatter: (params) => (params.value == null ? '—' : `${Number(params.value).toLocaleString()}`),
    },
    {
      headerName: 'Score',
      type: 'rightAligned',
      sortable: true,
      valueGetter: (params) => this.snapshotOf(params.data?.id)?.score ?? null,
      cellRenderer: (params: { value?: number | null }): string => {
        if (params.value == null) return '<span class="text-subtle">—</span>';
        return `<span style="color:${scoreColor(params.value)};font-weight:600">${params.value}</span>`;
      },
    },
    actionsColumn<Kpi>(
      (key, row) => {
        if (key === 'edit') this.onEdit(row);
        if (key === 'configure') this.configureTarget(row);
        if (key === 'delete') this.onDelete(row.id);
      },
      [
        { key: 'edit', label: 'Edit' },
        { key: 'configure', label: 'Configure Target' },
        { key: 'delete', label: 'Delete', danger: true, separated: true },
      ],
    ),
  ];

  constructor() {
    this.planFilters.loadOptions();

    const scorecardId = this.route.snapshot.queryParamMap.get('scorecardId')?.trim();
    if (scorecardId) {
      this.planFilters.applyScorecard(scorecardId);
      if (this.route.snapshot.queryParamMap.get('create') === '1') {
        this.pendingCreateScorecardId = scorecardId;
      }
    }

    this.planFilters.applies.subscribe(() => this.loadKpis());

    this.loadKpis();
    this.loadScorecards();
    this.loadAllKras();
    this.loadDivisions();

    effect(() => {
      this.rows();
      this.scorecards();
      this.loadSnapshots();
    });
  }

  ngOnDestroy(): void {
    if (this.ownerSearchTimer) {
      clearTimeout(this.ownerSearchTimer);
    }
  }

  loadScorecards(): void {
    this.scorecardService.getAll().subscribe({
      next: (scorecards) => {
        this.scorecards.set(scorecards);
        this.applyPendingCreate();
      },
      error: () => {
        this.scorecards.set([]);
        this.applyPendingCreate();
      },
    });
  }

  private applyPendingCreate(): void {
    if (!this.pendingCreateScorecardId) {
      return;
    }
    const id = this.pendingCreateScorecardId;
    this.pendingCreateScorecardId = '';
    this.openAddModal();
    this.onFormScorecardChange(id);
  }

  loadAllKras(): void {
    this.kraService.getAll().subscribe({
      next: (kras) => this.allKras.set(kras),
      error: () => this.allKras.set([]),
    });
  }

  loadDivisions(): void {
    this.divisionsLoading.set(true);
    this.divisionLoadError.set(null);
    this.divisionService.getAll().subscribe({
      next: (divisions) => {
        this.divisions.set(divisions);
        const selected = this.selectedDivision();
        if (selected) {
          this.selectedDivision.set(divisions.find((division) => division.id === selected.id) ?? selected);
        }
      },
      error: (error) => {
        this.divisions.set([]);
        this.divisionLoadError.set(toApiError(error).message);
        this.divisionsLoading.set(false);
      },
      complete: () => this.divisionsLoading.set(false),
    });
  }

  /** Loads the first page of active HR employees, or the matches for a server-side search. */
  loadOwnerOptions(search = ''): void {
    const request = ++this.ownerSearchRequest;
    this.ownerSearching.set(true);
    this.ownerSearchError.set(null);
    this.kpiService.getOwnerOptions(search).subscribe({
      next: (owners) => {
        if (request !== this.ownerSearchRequest) return;
        this.ownerOptions.set(owners);
        const selected = this.selectedOwner();
        if (selected) {
          const match = owners.find((owner) => owner.id === selected.id);
          if (match) this.selectedOwner.set(match);
        }
      },
      error: (error) => {
        if (request !== this.ownerSearchRequest) return;
        this.ownerOptions.set([]);
        this.ownerSearchError.set(toApiError(error).message);
        this.ownerSearching.set(false);
      },
      complete: () => {
        if (request === this.ownerSearchRequest) this.ownerSearching.set(false);
      },
    });
  }

  onOwnerTypeChange(): void {
    this.form.controls.ownerId.setValue('');
    this.form.controls.divisionOwnerId.setValue('');
    this.selectedOwner.set(null);
    this.selectedDivision.set(null);
    this.ownerSearch.set('');
    this.divisionSearch.set('');
    this.ownerOptions.set([]);
    this.ownerError.set(null);

    const ownerType = this.form.controls.ownerType.value;
    if (ownerType === 'Individual') {
      this.loadOwnerOptions();
    } else if (ownerType === 'Division' && this.divisions().length === 0 && !this.divisionsLoading()) {
      this.loadDivisions();
    }
  }

  onOwnerSearchInput(value: string): void {
    this.ownerSearch.set(value);
    if (this.ownerSearchTimer) {
      clearTimeout(this.ownerSearchTimer);
    }
    this.ownerSearchTimer = setTimeout(() => {
      this.ownerSearchTimer = null;
      this.loadOwnerOptions(this.ownerSearch());
    }, 300);
  }

  selectOwner(owner: KpiOwnerOption): void {
    this.form.controls.ownerId.setValue(owner.id);
    this.form.controls.divisionOwnerId.setValue('');
    this.selectedOwner.set(owner);
    this.ownerSearch.set('');
    this.ownerOptions.set([]);
    this.ownerError.set(null);
  }

  clearOwnerSelection(): void {
    this.form.controls.ownerId.setValue('');
    this.selectedOwner.set(null);
    this.loadOwnerOptions(this.ownerSearch());
  }

  onDivisionSearchInput(value: string): void {
    this.divisionSearch.set(value);
  }

  selectDivision(division: Division): void {
    this.form.controls.divisionOwnerId.setValue(division.id);
    this.form.controls.ownerId.setValue('');
    this.selectedDivision.set(division);
    this.divisionSearch.set('');
    this.ownerError.set(null);
  }

  clearDivisionSelection(): void {
    this.form.controls.divisionOwnerId.setValue('');
    this.selectedDivision.set(null);
  }

  ownerLabel(kpi: Kpi): string {
    if (kpi.ownerName) return kpi.ownerName;
    if (kpi.divisionOwnerName) return `${kpi.divisionOwnerName} (division)`;
    return 'Unassigned';
  }

  /** Latest snapshot entry (per KPI) from the selected scorecard's snapshots. */
  private snapshotOf(kpiId: string | undefined): ScoreSnapshotEntry | undefined {
    return kpiId ? this.kpiSnapshots().get(kpiId) : undefined;
  }

  /** Scorecards represented by the current rows, so Target/Actual/Score follow the filter. */
  private visibleScorecards(): Scorecard[] {
    const fiscalYearId = this.planFilters.fiscalYearId();
    const scorecardId = this.planFilters.scorecardId();
    return this.scorecards().filter((sc) => {
      if (scorecardId) return sc.id === scorecardId;
      if (fiscalYearId) return sc.fiscalYearId === fiscalYearId;
      return this.rows().some((row) => row.scorecardId === sc.id);
    });
  }

  private loadSnapshots(): void {
    const scorecards = this.visibleScorecards()
      .filter((sc) => !!sc.fiscalYearId)
      .map((sc) => ({ scorecardId: sc.id, fiscalYearId: sc.fiscalYearId as string }));

    if (scorecards.length === 0) {
      this.kpiSnapshots.set(new Map());
      return;
    }

    const request = ++this.snapshotRequest;
    forkJoin(scorecards.map((sc) => this.scoreSnapshotService.getScoreSnapshots(sc.scorecardId, sc.fiscalYearId))).subscribe({
      next: (results) => {
        if (request !== this.snapshotRequest) return;
        const map = new Map<string, ScoreSnapshotEntry>();
        for (const snapshot of results) {
          for (const entry of snapshot.kpiSnapshots ?? []) {
            const current = map.get(entry.entityId);
            if (!current || entry.fiscalMonth > current.fiscalMonth) map.set(entry.entityId, entry);
          }
        }
        this.kpiSnapshots.set(map);
      },
      error: () => {
        if (request === this.snapshotRequest) this.kpiSnapshots.set(new Map());
      },
    });
  }

  /** Scorecards offered by the create/edit form, narrowed to the filtered fiscal year. */
  formScorecards(): Scorecard[] {
    const fiscalYearId = this.planFilters.fiscalYearId();
    const all = this.scorecards();
    return fiscalYearId ? all.filter((sc) => sc.fiscalYearId === fiscalYearId) : all;
  }

  scorecardLabel(kpi: Kpi): string {
    if (kpi.scorecardName) {
      return this.scorecards().find((sc) => sc.id === kpi.scorecardId)?.fiscalYearName
        ? `${kpi.scorecardName} · ${this.scorecards().find((sc) => sc.id === kpi.scorecardId)!.fiscalYearName}`
        : kpi.scorecardName;
    }
    return this.planFilters.scorecardLabel(kpi.scorecardId);
  }

  goalLabel(kpi: Kpi): string {
    if (kpi.goalName) return kpi.goalName;
    return this.planFilters.goals().find((goal) => goal.id === kpi.goalId)?.name ?? '—';
  }

  kraLabel(kpi: Kpi): string {
    if (!kpi.kraId) return '—';
    if (kpi.kraName) return kpi.kraName;
    return this.allKras().find((kra) => kra.id === kpi.kraId)?.name ?? this.planFilters.kras().find((kra) => kra.id === kpi.kraId)?.name ?? '—';
  }

  loadKpis(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.kpiService
      .getAll({
        scorecardId: this.planFilters.scorecardId() || undefined,
        kraId: this.planFilters.kraId() || undefined,
        goalId: this.planFilters.goalId() || undefined,
        fiscalYearId: this.planFilters.fiscalYearId() || undefined,
      })
      .subscribe({
        next: (kpis) => this.rows.set(kpis),
        error: (error) => {
          this.loadError.set(toApiError(error).message);
          this.loading.set(false);
        },
        complete: () => this.loading.set(false),
      });
  }

  /** Client-side echo of the server-side weight rules (FR-301): the weight must sit in
   *  (0, 100] and, when the KPI hangs under a KRA, the sibling budget stays within 100%. */
  private submitWeightAllowed(): boolean {
    const weight = Number(this.form.controls.weight.value ?? 0);
    if (!(weight > 0) || weight > 100) {
      this.notifications.error('Weight must be greater than 0 and at most 100.');
      return false;
    }

    const kraId = this.form.controls.kraId.value.trim() || (this.editingId() ? this.rows().find((r) => r.id === this.editingId())?.kraId : undefined);
    const scorecardId = this.form.controls.scorecardId.value.trim();
    if (!kraId || !scorecardId) {
      return true;
    }

    const editingId = this.editingId();
    const siblingWeight = this.rows()
      .filter((row) => row.kraId === kraId && row.id !== editingId)
      .reduce((sum, row) => sum + (row.weight ?? 0), 0);
    if (siblingWeight + weight > 100.001) {
      this.notifications.error(
        `Weight budget exceeded — only ${Math.max(0, 100 - siblingWeight).toFixed(1)}% remains under this KRA.`,
      );
      return false;
    }
    return true;
  }

  onFormScorecardChange(value: string): void {    this.form.controls.scorecardId.setValue(value, { emitEvent: false });
    this.form.controls.kraId.setValue('', { emitEvent: false });
    this.formKras.set([]);
    if (value) {
      this.kraService.getAll(value).subscribe({
        next: (kras) => this.formKras.set(kras),
        error: () => this.formKras.set([]),
      });
    }
  }

  openAddModal(): void {
    this.editingId.set(null);
    this.formKras.set([]);
    this.resetOwnerPicker();
    this.form.reset({
      scorecardId: '', kraId: '', name: '', description: '', unit: '', weight: 0,
      optimizationType: 'Maximize', dataSource: 'Manual', kpiType: 'Lagging',
      isCumulative: false, ownerType: '', ownerId: '', divisionOwnerId: '',
      baseline: null, minValue: null, maxValue: null,
    });
    this.showForm.set(true);
  }

  onEdit(kpi: Kpi): void {
    this.editingId.set(kpi.id);
    this.resetOwnerPicker();
    // A legacy row could carry both ids; keep only the one matching the selected type so the
    // form can never submit an inconsistent ownership.
    const ownerType: KpiOwnerType | '' = kpi.ownerId ? 'Individual' : kpi.divisionOwnerId ? 'Division' : '';
    this.form.patchValue({
      name: kpi.name,
      description: kpi.description ?? '',
      unit: kpi.unit ?? '',
      weight: kpi.weight,
      optimizationType: kpi.optimizationType,
      dataSource: kpi.dataSource,
      kpiType: kpi.kpiType,
      isCumulative: kpi.isCumulative,
      ownerType,
      ownerId: ownerType === 'Individual' ? kpi.ownerId ?? '' : '',
      divisionOwnerId: ownerType === 'Division' ? kpi.divisionOwnerId ?? '' : '',
      baseline: kpi.baseline ?? null,
      minValue: kpi.minValue ?? null,
      maxValue: kpi.maxValue ?? null,
    });

    if (ownerType === 'Individual') {
      this.selectedOwner.set({ id: kpi.ownerId!, fullName: kpi.ownerName ?? 'Selected employee' });
      this.loadOwnerOptions(kpi.ownerName ?? '');
    } else if (ownerType === 'Division') {
      this.selectedDivision.set(
        this.divisions().find((division) => division.id === kpi.divisionOwnerId) ?? {
          id: kpi.divisionOwnerId!,
          name: kpi.divisionOwnerName ?? 'Selected division',
        },
      );
      if (this.divisions().length === 0) {
        this.loadDivisions();
      }
    }

    this.formKras.set([]);
    this.kraService.getAll(kpi.scorecardId).subscribe({
      next: (kras) => {
        this.formKras.set(kras);
        this.form.controls.scorecardId.setValue(kpi.scorecardId, { emitEvent: false });
        this.form.controls.kraId.setValue(kpi.kraId ?? '', { emitEvent: false });
      },
      error: () => {
        this.form.controls.scorecardId.setValue(kpi.scorecardId, { emitEvent: false });
        this.form.controls.kraId.setValue('', { emitEvent: false });
      },
    });
    this.showForm.set(true);
  }

  onCancelEdit(): void {
    this.editingId.set(null);
    this.resetOwnerPicker();
    this.form.reset({
      scorecardId: '', kraId: '', name: '', description: '', unit: '', weight: 0,
      optimizationType: 'Maximize', dataSource: 'Manual', kpiType: 'Lagging',
      isCumulative: false, ownerType: '', ownerId: '', divisionOwnerId: '',
      baseline: null, minValue: null, maxValue: null,
    });
    this.showForm.set(false);
  }

  private resetOwnerPicker(): void {
    if (this.ownerSearchTimer) {
      clearTimeout(this.ownerSearchTimer);
      this.ownerSearchTimer = null;
    }
    this.ownerSearchRequest++;
    this.ownerSearch.set('');
    this.divisionSearch.set('');
    this.ownerOptions.set([]);
    this.selectedOwner.set(null);
    this.selectedDivision.set(null);
    this.ownerSearching.set(false);
    this.ownerSearchError.set(null);
    this.ownerError.set(null);
  }

  /**
   * The form must state an explicit owner type and exactly one matching owner. The stale
   * field of the other type is always cleared so a KPI can never be sent with both.
   */
  private ownerSelection(): { ownerId?: string; divisionOwnerId?: string } | null {
    const ownerType = this.form.controls.ownerType.value;
    const ownerId = this.form.controls.ownerId.value.trim();
    const divisionOwnerId = this.form.controls.divisionOwnerId.value.trim();

    if (ownerType === 'Individual' && ownerId && !divisionOwnerId) {
      this.ownerError.set(null);
      return { ownerId };
    }
    if (ownerType === 'Division' && divisionOwnerId && !ownerId) {
      this.ownerError.set(null);
      return { divisionOwnerId };
    }

    this.ownerError.set(
      !ownerType
        ? 'Choose whether the owner is an individual or a division.'
        : ownerType === 'Individual'
          ? 'Select an active HR employee to own this KPI.'
          : 'Select an active division to own this KPI.',
    );
    return null;
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    if (!this.submitWeightAllowed()) {
      return;
    }
    const ownership = this.ownerSelection();
    if (!ownership) {
      return;
    }

    this.submitting.set(true);

    const request: CreateKpiRequest = {
      scorecardId: this.form.controls.scorecardId.value.trim(),
      kraId: this.form.controls.kraId.value.trim() || undefined,
      name: this.form.controls.name.value,
      description: this.form.controls.description.value || undefined,
      unit: this.form.controls.unit.value || undefined,
      weight: this.form.controls.weight.value,
      optimizationType: this.form.controls.optimizationType.value,
      dataSource: this.form.controls.dataSource.value,
      kpiType: this.form.controls.kpiType.value,
      isCumulative: this.form.controls.isCumulative.value,
      ...ownership,
      baseline: this.form.controls.baseline.value ?? undefined,
      minValue: this.form.controls.minValue.value ?? undefined,
      maxValue: this.form.controls.maxValue.value ?? undefined,
    };

    this.kpiService.create(request).subscribe({
      next: () => {
        this.notifications.success('KPI created successfully.');
        this.onCancelEdit();
        this.loadKpis();
      },
      error: (error) => {
        this.notifications.error(toApiError(error).message);
        this.submitting.set(false);
      },
      complete: () => this.submitting.set(false),
    });
  }

  onUpdate(): void {
    const id = this.editingId();
    if (!id || this.form.invalid || this.submitting()) {
      return;
    }
    if (!this.submitWeightAllowed()) {
      return;
    }
    const ownership = this.ownerSelection();
    if (!ownership) {
      return;
    }

    this.submitting.set(true);

    const request: UpdateKpiRequest = {
      name: this.form.controls.name.value,
      description: this.form.controls.description.value || undefined,
      unit: this.form.controls.unit.value || undefined,
      weight: this.form.controls.weight.value,
      optimizationType: this.form.controls.optimizationType.value,
      kpiType: this.form.controls.kpiType.value,
      dataSource: this.form.controls.dataSource.value,
      isCumulative: this.form.controls.isCumulative.value,
      baseline: this.form.controls.baseline.value ?? undefined,
      minValue: this.form.controls.minValue.value ?? undefined,
      maxValue: this.form.controls.maxValue.value ?? undefined,
      ...ownership,
      isActive: this.rows().find((row) => row.id === id)?.isActive ?? true,
    };

    this.kpiService.update(id, request).subscribe({
      next: () => {
        this.notifications.success('KPI updated successfully.');
        this.onCancelEdit();
        this.loadKpis();
      },
      error: (error) => {
        this.notifications.error(toApiError(error).message);
        this.submitting.set(false);
      },
      complete: () => this.submitting.set(false),
    });
  }

  async onDelete(id: string): Promise<void> {
    const ok = await this.dialog.confirm('Delete KPI', 'Are you sure you want to delete this KPI? This cannot be undone.', { confirmText: 'Delete', variant: 'danger' });
    if (!ok) return;

    this.kpiService.delete(id).subscribe({
      next: () => {
        this.notifications.success('KPI deleted successfully.');
        if (this.editingId() === id) {
          this.onCancelEdit();
        }
        this.loadKpis();
      },
      error: (error) => this.notifications.error(toApiError(error).message),
    });
  }

  configureTarget(kpi: Kpi): void {
    const fiscalYearId =
      this.planFilters.fiscalYearId() || this.scorecards().find((sc) => sc.id === kpi.scorecardId)?.fiscalYearId;

    // The row action opens the single-KPI target page, which is kept for this purpose.
    this.router.navigate(['/target-config'], {
      queryParams: { kpiId: kpi.id, scorecardId: kpi.scorecardId, fiscalYearId: fiscalYearId || undefined },
    });
  }
}
