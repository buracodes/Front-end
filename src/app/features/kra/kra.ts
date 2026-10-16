import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ColDef } from 'ag-grid-community';
import { toApiError } from '../../core/model/api-error';
import { NotificationService } from '../../core/service/notification.service';
import { GridTable } from '../../shared/reusableComponent/grid-table/grid-table';
import { actionsColumn } from '../../shared/reusableComponent/grid-table/grid-table-actions';
import { PlanFilterBar } from '../../shared/reusableComponent/plan-filter-bar/plan-filter-bar';
import { PlanFilterService } from '../../core/service/plan-filter.service';
import { CreateKraRequest, Kra, UpdateKraRequest } from './kra.model';
import { KraService } from './kra.service';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import { Scorecard } from '../../core/model/scorecard.model';
import { Goal } from '../../core/model/goal.model';
import { ScorecardService } from '../../core/service/scorecard.service';
import { GoalService } from '../../core/service/goal.service';

import { LucideDynamicIcon } from '@lucide/angular';
@Component({
  selector: 'app-kra',
  imports: [GridTable, PlanFilterBar, ReactiveFormsModule, LucideDynamicIcon],
  templateUrl: './kra.html',
  styleUrl: './kra.scss',
})
export class KraPage {
  private readonly kraService = inject(KraService);
  private readonly scorecardService = inject(ScorecardService);
  private readonly goalService = inject(GoalService);
  private readonly notifications = inject(NotificationService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly route = inject(ActivatedRoute);
  readonly planFilters = inject(PlanFilterService);

  readonly rows = signal<Kra[]>([]);
  readonly scorecards = signal<Scorecard[]>([]);
  readonly formGoals = signal<Goal[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly submitting = signal(false);
  readonly editingId = signal<string | null>(null);

  private pendingCreateScorecardId = '';

  readonly form = new FormGroup({
    goalId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    scorecardId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    weight: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(100)],
    }),
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
    { field: 'description', headerName: 'Description' },
    { field: 'weight', headerName: 'Weight', type: 'rightAligned', sortable: true },
    { field: 'kpiCount', headerName: 'KPIs', type: 'rightAligned' },
    {
      field: 'isActive',
      headerName: 'Active',
      sortable: true,
      filter: true,
      cellRenderer: (params: { value?: boolean }): string => (params.value ? 'Yes' : 'No'),
    },
    actionsColumn<Kra>((key, row) => {
      if (key === 'edit') this.onEdit(row);
      if (key === 'delete') this.onDelete(row.id);
    }),
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

    this.planFilters.applies.subscribe(() => this.loadKras());

    this.loadKras();
    this.loadScorecards();
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

  /** Scorecards offered by the create/edit form, narrowed to the filtered fiscal year. */
  formScorecards(): Scorecard[] {
    const fiscalYearId = this.planFilters.fiscalYearId();
    const all = this.scorecards();
    return fiscalYearId ? all.filter((sc) => sc.fiscalYearId === fiscalYearId) : all;
  }

  scorecardLabel(kra: Kra): string {
    if (kra.scorecardName) {
      const fiscalYearName = this.scorecards().find((sc) => sc.id === kra.scorecardId)?.fiscalYearName;
      return fiscalYearName ? `${kra.scorecardName} · ${fiscalYearName}` : kra.scorecardName;
    }
    return this.planFilters.scorecardLabel(kra.scorecardId);
  }

  goalLabel(kra: Kra): string {
    if (kra.goalName) return kra.goalName;
    return this.planFilters.goals().find((goal) => goal.id === kra.goalId)?.name ?? '—';
  }

  loadKras(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.kraService
      .getAll(
        this.planFilters.scorecardId() || undefined,
        this.planFilters.goalId() || undefined,
        this.planFilters.fiscalYearId() || undefined,
      )
      .subscribe({
        next: (kras) => this.rows.set(kras),
        error: (error) => {
          this.loadError.set(toApiError(error).message);
          this.loading.set(false);
        },
        complete: () => this.loading.set(false),
      });
  }

  onFormScorecardChange(value: string): void {
    this.form.controls.scorecardId.setValue(value, { emitEvent: false });
    this.form.controls.goalId.setValue('', { emitEvent: false });
    this.formGoals.set([]);
    if (value) {
      this.goalService.getByScorecard(value).subscribe({
        next: (goals) => this.formGoals.set(goals),
        error: () => this.formGoals.set([]),
      });
    }
  }

  openAddModal(): void {
    this.editingId.set(null);
    this.formGoals.set([]);
    this.form.reset({ goalId: '', scorecardId: '', name: '', description: '', weight: 0 });
    this.showForm.set(true);
  }

  onEdit(kra: Kra): void {
    this.editingId.set(kra.id);
    this.form.patchValue({
      scorecardId: kra.scorecardId,
      name: kra.name,
      description: kra.description ?? '',
      weight: kra.weight,
    });
    this.formGoals.set([]);
    this.goalService.getByScorecard(kra.scorecardId).subscribe({
      next: (goals) => {
        this.formGoals.set(goals);
        this.form.controls.goalId.setValue(kra.goalId, { emitEvent: false });
      },
      error: () => this.form.controls.goalId.setValue(''),
    });
    this.showForm.set(true);
  }

  onCancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({ goalId: '', scorecardId: '', name: '', description: '', weight: 0 });
    this.showForm.set(false);
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);

    const request: CreateKraRequest = {
      goalId: this.form.controls.goalId.value.trim(),
      scorecardId: this.form.controls.scorecardId.value.trim(),
      name: this.form.controls.name.value,
      description: this.form.controls.description.value || undefined,
      weight: this.form.controls.weight.value,
    };

    this.kraService.create(request).subscribe({
      next: () => {
        this.notifications.success('KRA created successfully.');
        this.onCancelEdit();
        this.loadKras();
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

    const request: UpdateKraRequest = {
      name: this.form.controls.name.value,
      description: this.form.controls.description.value || undefined,
      weight: this.form.controls.weight.value,
    };

    this.kraService.update(id, request).subscribe({
      next: () => {
        this.notifications.success('KRA updated successfully.');
        this.onCancelEdit();
        this.loadKras();
      },
      error: (error) => {
        this.notifications.error(toApiError(error).message);
        this.submitting.set(false);
      },
      complete: () => this.submitting.set(false),
    });
  }

  async onDelete(id: string): Promise<void> {
    const ok = await this.dialog.confirm('Delete KRA', 'Are you sure you want to delete this KRA? This cannot be undone.', { confirmText: 'Delete', variant: 'danger' });
    if (!ok) return;

    this.kraService.delete(id).subscribe({
      next: () => {
        this.notifications.success('KRA deleted successfully.');
        if (this.editingId() === id) {
          this.onCancelEdit();
        }
        this.loadKras();
      },
      error: (error) => this.notifications.error(toApiError(error).message),
    });
  }
}
