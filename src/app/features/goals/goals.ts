import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ColDef } from 'ag-grid-community';
import { toApiError } from '../../core/model/api-error';
import { Goal, CreateGoalRequest, UpdateGoalRequest } from '../../core/model/goal.model';
import { Scorecard } from '../../core/model/scorecard.model';
import { GoalService } from '../../core/service/goal.service';
import { ScorecardService } from '../../core/service/scorecard.service';
import { NotificationService } from '../../core/service/notification.service';
import { PlanFilterService } from '../../core/service/plan-filter.service';
import { GridTable } from '../../shared/reusableComponent/grid-table/grid-table';
import { PlanFilterBar } from '../../shared/reusableComponent/plan-filter-bar/plan-filter-bar';
import { actionsColumn } from '../../shared/reusableComponent/grid-table/grid-table-actions';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';

import { LucideDynamicIcon } from '@lucide/angular';
@Component({
  selector: 'app-goals',
  imports: [GridTable, PlanFilterBar, ReactiveFormsModule, LucideDynamicIcon],
  templateUrl: './goals.html',
  styleUrl: './goals.scss',
})
export class GoalsPage {
  private readonly goalService = inject(GoalService);
  private readonly scorecardService = inject(ScorecardService);
  private readonly notifications = inject(NotificationService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly route = inject(ActivatedRoute);
  readonly planFilters = inject(PlanFilterService);

  readonly rows = signal<Goal[]>([]);
  readonly scorecards = signal<Scorecard[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly submitting = signal(false);
  readonly editingId = signal<string | null>(null);

  private pendingCreateScorecardId = '';

  readonly form = new FormGroup({
    scorecardId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    weight: new FormControl(0, { nonNullable: true, validators: [Validators.min(0), Validators.max(100)] }),
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
    { field: 'description', headerName: 'Description', flex: 1 },
    { field: 'weight', headerName: 'Weight %', type: 'rightAligned', sortable: true },
    actionsColumn<Goal>((key, row) => {
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

    this.planFilters.applies.subscribe(() => this.loadGoals());

    this.loadGoals();
    this.loadScorecards();
  }

  loadGoals(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.goalService
      .getAll(this.planFilters.scorecardId() || undefined, { fiscalYearId: this.planFilters.fiscalYearId() || undefined })
      .subscribe({
        next: (goals) => this.rows.set(goals),
        error: (error) => {
          this.loadError.set(toApiError(error).message);
          this.loading.set(false);
        },
        complete: () => this.loading.set(false),
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
    this.form.controls.scorecardId.setValue(id, { emitEvent: false });
  }

  /** Scorecards offered by the create/edit form, narrowed to the filtered fiscal year. */
  formScorecards(): Scorecard[] {
    const fiscalYearId = this.planFilters.fiscalYearId();
    const all = this.scorecards();
    return fiscalYearId ? all.filter((sc) => sc.fiscalYearId === fiscalYearId) : all;
  }

  scorecardLabel(goal: Goal): string {
    if (goal.scorecardName) {
      const fiscalYearName = goal.fiscalYearName || this.scorecards().find((sc) => sc.id === goal.scorecardId)?.fiscalYearName;
      return fiscalYearName ? `${goal.scorecardName} · ${fiscalYearName}` : goal.scorecardName;
    }
    return this.planFilters.scorecardLabel(goal.scorecardId);
  }

  openAddModal(): void {
    this.editingId.set(null);
    this.form.reset({ scorecardId: '', name: '', description: '', weight: 0 });
    this.showForm.set(true);
  }

  onEdit(goal: Goal): void {
    this.editingId.set(goal.id);
    this.form.setValue({
      scorecardId: goal.scorecardId,
      name: goal.name,
      description: goal.description ?? '',
      weight: goal.weight,
    });
    this.showForm.set(true);
  }

  onCancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({ scorecardId: '', name: '', description: '', weight: 0 });
    this.showForm.set(false);
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);

    const scorecardId = this.form.controls.scorecardId.value;
    const newWeight = this.form.controls.weight.value;

    // Validate total weight doesn't exceed 100%
    this.goalService.getAll(scorecardId).subscribe({
      next: (existingGoals) => {
        const totalWeight = existingGoals.reduce((sum, g) => sum + (g.weight || 0), 0);
        if (totalWeight + newWeight > 100) {
          this.notifications.error(`Cannot create goal: total weight would exceed 100% (current: ${totalWeight}%, adding: ${newWeight}%).`);
          this.submitting.set(false);
          return;
        }

        const request: CreateGoalRequest = {
          scorecardId,
          name: this.form.controls.name.value,
          description: this.form.controls.description.value || undefined,
          weight: newWeight,
        };

        this.goalService.create(request).subscribe({
          next: () => {
            this.notifications.success('Goal created successfully.');
            this.onCancelEdit();
            this.loadGoals();
          },
          error: (error) => {
            this.notifications.error(toApiError(error).message);
            this.submitting.set(false);
          },
          complete: () => this.submitting.set(false),
        });
      },
      error: (error) => {
        this.notifications.error(toApiError(error).message);
        this.submitting.set(false);
      },
    });
  }

  onUpdate(): void {
    const id = this.editingId();
    if (!id || this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);

    const scorecardId = this.form.controls.scorecardId.value;
    const newWeight = this.form.controls.weight.value;

    // Validate total weight doesn't exceed 100% (excluding the goal being updated)
    this.goalService.getAll(scorecardId).subscribe({
      next: (existingGoals) => {
        const otherGoalsWeight = existingGoals
          .filter((g) => g.id !== id)
          .reduce((sum, g) => sum + (g.weight || 0), 0);
        if (otherGoalsWeight + newWeight > 100) {
          this.notifications.error(`Cannot update goal: total weight would exceed 100% (other goals: ${otherGoalsWeight}%, new weight: ${newWeight}%).`);
          this.submitting.set(false);
          return;
        }

        const request: UpdateGoalRequest = {
          name: this.form.controls.name.value,
          description: this.form.controls.description.value || undefined,
          weight: newWeight,
        };

        this.goalService.update(id, request).subscribe({
          next: () => {
            this.notifications.success('Goal updated successfully.');
            this.onCancelEdit();
            this.loadGoals();
          },
          error: (error) => {
            this.notifications.error(toApiError(error).message);
            this.submitting.set(false);
          },
          complete: () => this.submitting.set(false),
        });
      },
      error: (error) => {
        this.notifications.error(toApiError(error).message);
        this.submitting.set(false);
      },
    });
  }

  async onDelete(id: string): Promise<void> {
    const ok = await this.dialog.confirm('Delete Goal', 'Are you sure you want to delete this goal? This cannot be undone.', { confirmText: 'Delete', variant: 'danger' });
    if (!ok) return;

    this.goalService.delete(id).subscribe({
      next: () => {
        this.notifications.success('Goal deleted successfully.');
        if (this.editingId() === id) {
          this.onCancelEdit();
        }
        this.loadGoals();
      },
      error: (error) => this.notifications.error(toApiError(error).message),
    });
  }
}
