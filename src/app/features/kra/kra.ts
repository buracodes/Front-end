import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
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
import { OrgProfileService } from '../../core/service/org-profile.service';
import { StrategicTheme } from '../../core/model/org-profile.model';

import { LucideDynamicIcon } from '@lucide/angular';

/**
 * FR-302 weight range: strictly greater than 0 and at most 100 (mirrors the goal
 * weight validator; the goal TOTAL cap sum <= 100 is re-checked on submit and
 * authoritatively by the backend).
 */
export const kraWeightValidator = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value;
  if (value === null || value === undefined || typeof value === 'number' && !Number.isFinite(value)) {
    return { required: true };
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return { required: true };
  }
  if (value <= 0) {
    return { min: { min: 0, actual: value } };
  }
  if (value > 100) {
    return { max: { max: 100, actual: value } };
  }
  return null;
};

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
  private readonly orgProfile = inject(OrgProfileService);
  private readonly notifications = inject(NotificationService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly route = inject(ActivatedRoute);
  readonly planFilters = inject(PlanFilterService);

  readonly rows = signal<Kra[]>([]);
  readonly scorecards = signal<Scorecard[]>([]);
  readonly formGoals = signal<Goal[]>([]);
  readonly strategicThemes = signal<StrategicTheme[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly submitting = signal(false);
  readonly editingId = signal<string | null>(null);

  private pendingCreateScorecardId = '';

  /** Sum of all loaded KRAs' assigned weights (the filtered set), for the total display. */
  readonly totalAssignedWeight = computed(() =>
    this.rows().reduce((sum, k) => sum + (k.weight ?? 0), 0),
  );

  readonly form = new FormGroup({
    goalId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    scorecardId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    icon: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(50)] }),
    strategicThemeId: new FormControl('', { nonNullable: true }),
    unitMeasure: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(50)] }),
    weight: new FormControl(0, { nonNullable: true, validators: [kraWeightValidator] }),
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
    this.loadStrategicThemes();

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

  /** Strategic Priority/Theme dropdown source (FR-201 organization settings). */
  loadStrategicThemes(): void {
    this.orgProfile.getProfile().subscribe({
      next: (profile) => this.strategicThemes.set(profile.strategicThemes ?? []),
      error: () => this.strategicThemes.set([]),
    });
  }

  loadScorecards(): void {    this.scorecardService.getAll().subscribe({
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
    this.form.controls.strategicThemeId.setValue('');
    if (value) {
      this.goalService.getByScorecard(value).subscribe({
        next: (goals) => this.formGoals.set(goals),
        error: () => this.formGoals.set([]),
      });
    }
  }

  /**
   * Sum of the KRA weights already assigned within the goal the form is pointing
   * at (excluding the KRA being edited). Shown as "X% of 100%" in the modal so
   * users can plan incrementally - totals below 100% are allowed.
   */
  formKraBudgetTotal(): number {
    const goalId = this.form.controls.goalId.value;
    const editingId = this.editingId();
    return this.rows()
      .filter((k) => k.goalId === goalId && k.id !== editingId)
      .reduce((sum, k) => sum + (k.weight ?? 0), 0);
  }

  openAddModal(): void {
    this.editingId.set(null);
    this.formGoals.set([]);
    this.form.reset({ goalId: '', scorecardId: '', name: '', description: '', icon: '', strategicThemeId: '', unitMeasure: '', weight: 0 });
    this.showForm.set(true);
  }

  onEdit(kra: Kra): void {
    this.editingId.set(kra.id);
    this.form.patchValue({
      scorecardId: kra.scorecardId,
      name: kra.name,
      description: kra.description ?? '',
      icon: kra.icon ?? '',
      strategicThemeId: kra.strategicThemeId ?? '',
      unitMeasure: kra.unitMeasure ?? '',
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
    this.form.reset({ goalId: '', scorecardId: '', name: '', description: '', icon: '', strategicThemeId: '', unitMeasure: '', weight: 0 });
    this.showForm.set(false);
  }

  /**
   * FR-302 submissions with an out-of-range weight (0 / negative / above 100) are
   * rejected with an explicit toast instead of being silently blocked by the
   * disabled submit button.
   */
  private rejectInvalidWeight(): boolean {
    const weight = this.form.controls.weight;
    const errors = weight.errors;
    if (!errors) {
      return false;
    }
    if (errors['required']) {
      this.notifications.error('KRA weight is required and must be greater than 0.');
    } else if (errors['min']) {
      this.notifications.error(`KRA weight must be greater than 0. (entered: ${weight.value}%)`);
    } else if (errors['max']) {
      this.notifications.error(`KRA weight cannot exceed 100. (entered: ${weight.value}%)`);
    }
    return true;
  }

  onSubmit(): void {
    if (this.submitting() || this.rejectInvalidWeight()) {
      return;
    }
    if (this.form.invalid) {
      return;
    }

    this.submitting.set(true);

    const newWeight = this.form.controls.weight.value;

    // Validate the goal's total KRA weight stays within 100%.
    const currentTotal = this.formKraBudgetTotal();
    if (currentTotal + newWeight > 100) {
      this.notifications.error(`Cannot create KRA: total weight would exceed 100% (current: ${currentTotal}%, adding: ${newWeight}%).`);
      this.submitting.set(false);
      return;
    }

    const request: CreateKraRequest = {
      goalId: this.form.controls.goalId.value.trim(),
      scorecardId: this.form.controls.scorecardId.value.trim(),
      name: this.form.controls.name.value,
      description: this.form.controls.description.value || undefined,
      icon: this.form.controls.icon.value || undefined,
      strategicThemeId: this.form.controls.strategicThemeId.value || undefined,
      unitMeasure: this.form.controls.unitMeasure.value || undefined,
      weight: newWeight,
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
    if (!id || this.submitting() || this.rejectInvalidWeight()) {
      return;
    }
    if (this.form.invalid) {
      return;
    }

    this.submitting.set(true);

    const newWeight = this.form.controls.weight.value;

    // Budget excluding the KRA being edited, so an unchanged total stays valid.
    const otherTotal = this.formKraBudgetTotal();
    if (otherTotal + newWeight > 100) {
      this.notifications.error(`Cannot update KRA: total weight would exceed 100% (other KRAs under this goal: ${otherTotal}%, new weight: ${newWeight}%).`);
      this.submitting.set(false);
      return;
    }

    const request: UpdateKraRequest = {
      name: this.form.controls.name.value,
      description: this.form.controls.description.value || undefined,
      icon: this.form.controls.icon.value || undefined,
      strategicThemeId: this.form.controls.strategicThemeId.value || undefined,
      unitMeasure: this.form.controls.unitMeasure.value || undefined,
      weight: newWeight,
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
    const kra = this.rows().find((k) => k.id === id);
    const hasKpis = (kra?.kpiCount ?? 0) > 0;
    const message = hasKpis
      ? 'This KRA has KPIs (including any soft-deleted ones), so it cannot be deleted. Remove its KPIs first.'
      : 'Are you sure you want to delete this KRA? The record is kept for audit history but it no longer counts or shows anywhere.';

    const ok = await this.dialog.confirm('Delete KRA', message, { confirmText: 'Delete', variant: 'danger' });
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
