import { Component, effect, inject, signal } from '@angular/core';
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
import { CreateKpiRequest, Kpi, UpdateKpiRequest } from './kpi.model';
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
export class KpiPage {
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
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly submitting = signal(false);
  readonly editingId = signal<string | null>(null);
  /** Latest score snapshot per KPI for the scorecards currently listed (Target / Actual / Score). */
  readonly kpiSnapshots = signal(new Map<string, ScoreSnapshotEntry>());
  private snapshotRequest = 0;

  private pendingCreateScorecardId = '';

  readonly optimizationTypes = ['Maximize', 'Minimize', 'ExactHit', 'Binary'] as const;
  readonly dataSources = ['Manual', 'Automated', 'Calculated'] as const;
  readonly kpiTypes = ['Leading', 'Lagging'] as const;

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
    this.divisionService.getAll().subscribe({
      next: (divisions) => this.divisions.set(divisions),
      error: () => this.divisions.set([]),
    });
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

  onFormScorecardChange(value: string): void {
    this.form.controls.scorecardId.setValue(value, { emitEvent: false });
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
    this.form.reset({
      scorecardId: '', kraId: '', name: '', description: '', unit: '', weight: 0,
      optimizationType: 'Maximize', dataSource: 'Manual', kpiType: 'Lagging',
      isCumulative: false, divisionOwnerId: '', baseline: null, minValue: null, maxValue: null,
    });
    this.showForm.set(true);
  }

  onEdit(kpi: Kpi): void {
    this.editingId.set(kpi.id);
    this.form.patchValue({
      name: kpi.name,
      description: kpi.description ?? '',
      unit: kpi.unit ?? '',
      weight: kpi.weight,
      optimizationType: kpi.optimizationType,
      dataSource: kpi.dataSource,
      kpiType: kpi.kpiType,
      isCumulative: kpi.isCumulative,
      divisionOwnerId: kpi.divisionOwnerId ?? '',
      baseline: kpi.baseline ?? null,
      minValue: kpi.minValue ?? null,
      maxValue: kpi.maxValue ?? null,
    });
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
    this.form.reset({
      scorecardId: '', kraId: '', name: '', description: '', unit: '', weight: 0,
      optimizationType: 'Maximize', dataSource: 'Manual', kpiType: 'Lagging',
      isCumulative: false, divisionOwnerId: '', baseline: null, minValue: null, maxValue: null,
    });
    this.showForm.set(false);
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
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
      divisionOwnerId: this.form.controls.divisionOwnerId.value || undefined,
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

    this.submitting.set(true);

    const request: UpdateKpiRequest = {
      name: this.form.controls.name.value,
      description: this.form.controls.description.value || undefined,
      unit: this.form.controls.unit.value || undefined,
      weight: this.form.controls.weight.value,
      optimizationType: this.form.controls.optimizationType.value,
      kpiType: this.form.controls.kpiType.value,
      divisionOwnerId: this.form.controls.divisionOwnerId.value || undefined,
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
