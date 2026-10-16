import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators, ValidatorFn } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { toApiError } from '../../core/model/api-error';
import {
  InitiativeListItem,
  InitiativeSummary,
  CreateInitiativeRequest,
  UpdateInitiativeRequest,
  ragSlug,
} from '../../features/initiative/initiative.model';
import { InitiativeService } from '../../features/initiative/initiative.service';
import { NotificationService } from '../../core/service/notification.service';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import { AdminUserService } from '../admin-users/admin-users.service';
import { AppUser } from '../admin-users/admin-users.model';
import { KraService } from '../kra/kra.service';
import { Kra } from '../kra/kra.model';
import { KpiService } from '../kpi/kpi.service';
import { Kpi } from '../kpi/kpi.model';
import { GoalService } from '../../core/service/goal.service';
import { Goal } from '../../core/model/goal.model';
import { UserStore } from '../../core/service/user-store.service';

@Component({
  selector: 'app-initiative',
  imports: [CommonModule, ReactiveFormsModule, LucideDynamicIcon],
  templateUrl: './initiative.html',
  styleUrl: './initiative.scss',
})
export class InitiativePage {
  private readonly initiativeService = inject(InitiativeService);
  private readonly notifications = inject(NotificationService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly router = inject(Router);
  private readonly adminUserService = inject(AdminUserService);
  private readonly kraService = inject(KraService);
  private readonly kpiService = inject(KpiService);
  private readonly goalService = inject(GoalService);
  private readonly userStore = inject(UserStore);

  readonly rows = signal<InitiativeListItem[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  // FR-403/FR-404: every figure below is calculated by the backend.
  readonly summary = signal<InitiativeSummary | null>(null);

  // Users available to assign as initiative owner (ownerId is a user GUID in the API).
  readonly userOptions = signal<AppUser[]>([]);
  readonly loadingUsers = signal(false);

  // Goals / KRAs / KPIs available to link an initiative to (Goal → KRA → KPI hierarchy, all optional).
  readonly goalOptions = signal<Goal[]>([]);
  readonly kraOptions = signal<Kra[]>([]);
  readonly kpiOptions = signal<Kpi[]>([]);
  readonly loadingGoals = signal(false);
  readonly loadingKras = signal(false);
  readonly loadingKpis = signal(false);

  // Owner currently loaded in the form (so an existing owner not in userOptions still renders).
  readonly currentOwnerId = signal<string | null>(null);

  readonly showForm = signal(false);
  readonly submitting = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly openMenuId = signal<string | null>(null);

  readonly search = signal('');
  readonly statusFilter = signal<string>('all');
  readonly ownerFilter = signal<string>('all');
  readonly includeClosed = signal(true);

  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly totalCount = signal(0);
  readonly totalPages = signal(0);

  readonly canCreate = computed(() => this.userStore.hasPermission('initiatives:create'));
  readonly canEdit = computed(() => this.userStore.hasPermission('initiatives:edit'));
  readonly canDelete = computed(() => this.userStore.hasPermission('initiatives:delete'));
  readonly canClose = computed(() => this.userStore.hasPermission('initiatives:close'));

  /** Unique owners across the visible initiatives as {value, label} pairs for the filter dropdown. */
  readonly ownerFilterOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const row of this.rows()) {
      if (!row.ownerId) continue;
      seen.set(row.ownerId, row.ownerName || this.ownerName(row.ownerId));
    }
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  });

  /** Options for the owner <select> in the form: all users, plus the current owner if it isn't one. */
  readonly ownerFormOptions = computed(() => {
    const options = this.userOptions().map((user) => ({
      id: user.id,
      label: user.fullName || user.username,
    }));
    const current = this.currentOwnerId();
    if (current && !options.some((o) => o.id === current)) {
      options.unshift({ id: current, label: current });
    }
    return options;
  });

  /** The page slice is rendered as-is: filtering and paging happen on the server. */
  readonly filteredRows = computed(() => this.rows());

  readonly stats = computed(() => {
    const s = this.summary();
    if (s) {
      return {
        total: s.totalInitiatives,
        inProgress: s.inProgress,
        completed: s.completed,
        overdue: s.overdueInitiatives,
        budgetUtilization: s.budgetUtilizationPercent ?? 0,
        averageProgress: s.averageProgressPercentage,
      };
    }

    const rows = this.rows();
    const plannedTotal = rows.reduce((sum, r) => sum + (r.budgetPosition?.plannedBudget || 0), 0);
    const actualTotal = rows.reduce((sum, r) => sum + (r.actualExpenditure || 0), 0);
    return {
      total: this.totalCount(),
      inProgress: rows.filter((r) => r.status === 'InProgress').length,
      completed: rows.filter((r) => r.status === 'Completed').length,
      overdue: rows.filter((r) => r.isOverdue).length,
      budgetUtilization: plannedTotal > 0 ? Math.round((actualTotal / plannedTotal) * 100) : 0,
      averageProgress: 0,
    };
  });

  /** Local calendar date (yyyy-MM-dd) used to reject backdated start dates, mirroring the backend. */
  readonly todayIso = (() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  })();

  /**
   * The start date an initiative had when it was opened for editing. The no-backdating rule (FR-401)
   * only fires when the user moves the start date, so an overdue initiative whose historical start
   * date is unchanged stays editable. Null while creating.
   */
  private originalStartDateIso: string | null = null;

  /**
   * FR-401 no-backdating rule: a new or rescheduled start date may not be before today. Mirrors
   * InitiativeGuard.ValidateStartDate; the backend is authoritative, this only gives inline feedback
   * and keeps the submit button disabled. An unchanged historical start date is never rejected.
   */
  private startDateValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const value: string = control.value?.slice(0, 10);
    if (!value) return null;
    if (this.editingId() && value === this.originalStartDateIso) return null;
    return value < this.todayIso ? { pastStartDate: true } : null;
  };

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(2000)],
    }),
    ownerId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    goalId: new FormControl('', { nonNullable: true }),
    kraId: new FormControl('', { nonNullable: true }),
    kpiId: new FormControl('', { nonNullable: true }),
    priority: new FormControl<InitiativeListItem['priority']>('Medium'),
    status: new FormControl<InitiativeListItem['status']>('NotStarted'),
    startDate: new FormControl<string | null>(null, {
      validators: [Validators.required, this.startDateValidator],
    }),
    endDate: new FormControl<string | null>(null, { validators: [Validators.required] }),
    budget: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
    resources: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.loadInitiatives();
    this.loadSummary();
    this.loadUsers();
    this.loadGoals();
    this.loadKras();
    this.loadKpis();
  }

  loadUsers(): void {
    this.loadingUsers.set(true);
    this.adminUserService.getAll().subscribe({
      next: (users) => {
        this.userOptions.set(users);
        this.loadingUsers.set(false);
      },
      error: () => {
        this.userOptions.set([]);
        this.loadingUsers.set(false);
      },
    });
  }

  loadGoals(): void {
    this.loadingGoals.set(true);
    this.goalService.getAll().subscribe({
      next: (goals) => {
        this.goalOptions.set(goals);
        this.loadingGoals.set(false);
      },
      error: () => {
        this.goalOptions.set([]);
        this.loadingGoals.set(false);
      },
    });
  }

  /** KRAs to offer, narrowed to a chosen Goal (goalId) or the whole hierarchy when none is picked. */
  loadKras(goalId?: string): void {
    this.loadingKras.set(true);
    this.kraService.getAll(undefined, goalId).subscribe({
      next: (kras) => {
        this.kraOptions.set(kras);
        this.loadingKras.set(false);
      },
      error: () => {
        this.kraOptions.set([]);
        this.loadingKras.set(false);
      },
    });
  }

  /** KPIs to offer, narrowed to a chosen KRA (kraId) or the whole hierarchy when none is picked. */
  loadKpis(kraId?: string): void {
    this.loadingKpis.set(true);
    this.kpiService.getAll(kraId ? { kraId } : undefined).subscribe({
      next: (kpis) => {
        this.kpiOptions.set(kpis);
        this.loadingKpis.set(false);
      },
      error: () => {
        this.kpiOptions.set([]);
        this.loadingKpis.set(false);
      },
    });
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.openMenuId.set(null);
  }

  toggleMenu(id: string, event: MouseEvent): void {
    event.stopPropagation();
    this.openMenuId.set(this.openMenuId() === id ? null : id);
  }

  /**
   * Strategic link cascade (Goal → KRA → KPI): picking a Goal narrows the KRAs to that Goal and
   * clears any child selections that no longer fit; picking a KRA narrows the KPIs to it. Clearing
   * a select falls back to the wider list rather than to an empty one.
   */
  onGoalChange(goalId: string): void {
    this.form.patchValue({ kraId: '', kpiId: '' });
    this.loadKras(goalId || undefined);
    this.loadKpis();
  }

  onKraChange(kraId: string): void {
    this.form.patchValue({ kpiId: '' });
    this.loadKpis(kraId || undefined);
  }

  /** Explicit user action that removes every strategic link at once. Links are never auto-cleared. */
  clearLinks(): void {
    this.form.patchValue({ goalId: '', kraId: '', kpiId: '' });
    this.loadKras();
    this.loadKpis();
  }

  loadSummary(): void {
    this.initiativeService.getSummary().subscribe({
      next: (summary) => this.summary.set(summary),
      // A missing summary must not break the grid; the cards fall back to the page slice.
      error: () => this.summary.set(null),
    });
  }

  loadInitiatives(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.initiativeService
      .getAll({
        search: this.search().trim() || undefined,
        status: this.statusFilter() === 'all' ? undefined : (this.statusFilter() as InitiativeListItem['status']),
        ownerId: this.ownerFilter() === 'all' ? undefined : this.ownerFilter(),
        includeClosed: this.includeClosed(),
        page: this.page(),
        pageSize: this.pageSize(),
      })
      .subscribe({
        next: (result) => {
          this.rows.set(result.items ?? []);
          this.totalCount.set(result.totalCount ?? 0);
          this.totalPages.set(result.totalPages ?? 0);
          this.loading.set(false);
        },
        error: (error) => {
          this.loadError.set(toApiError(error).message);
          this.rows.set([]);
          this.loading.set(false);
        },
      });
  }

  onSearchChange(value: string): void {
    this.search.set(value);
    this.page.set(1);
    this.loadInitiatives();
  }

  onStatusFilterChange(value: string): void {
    this.statusFilter.set(value);
    this.page.set(1);
    this.loadInitiatives();
  }

  onOwnerFilterChange(value: string): void {
    this.ownerFilter.set(value);
    this.page.set(1);
    this.loadInitiatives();
  }

  onIncludeClosedChange(value: boolean): void {
    this.includeClosed.set(value);
    this.page.set(1);
    this.loadInitiatives();
  }

  goToPage(page: number): void {
    if (page < 1 || (this.totalPages() && page > this.totalPages())) return;
    this.page.set(page);
    this.loadInitiatives();
  }

  progressFor(initiative: InitiativeListItem): number {
    return Math.round(initiative.progressPercentage ?? 0);
  }

  ragClassFor(initiative: InitiativeListItem): string {
    return `rag-${ragSlug(initiative.progressRagStatus ?? 'NoData')}`;
  }

  budgetVariance(initiative: InitiativeListItem): number | null {
    return initiative.budgetPosition?.budgetVariance ?? null;
  }

  budgetUtilization(initiative: InitiativeListItem): number | null {
    return initiative.budgetPosition?.budgetUtilizationPercent ?? null;
  }

  isOverBudget(initiative: InitiativeListItem): boolean {
    return initiative.budgetPosition?.isOverBudget ?? false;
  }

  weightsAreValid(initiative: InitiativeListItem): boolean {
    return initiative.milestoneWeightsAreValid;
  }

  /** Display name for a user id (falls back to the raw id when unknown/deleted). */
  ownerName(id: string): string {
    if (!id) return '—';
    const user = this.userOptions().find((u) => u.id === id);
    return user?.fullName || user?.username || id;
  }

  statusLabel(status: InitiativeListItem['status']): string {
    switch (status) {
      case 'InProgress':
        return 'In progress';
      case 'OnHold':
        return 'On hold';
      case 'NotStarted':
        return 'Not started';
      default:
        return status;
    }
  }

  statusClass(status: InitiativeListItem['status']): string {
    switch (status) {
      case 'InProgress':
        return 'badge-info';
      case 'OnHold':
        return 'badge-warning';
      case 'Completed':
        return 'badge-success';
      case 'Cancelled':
        return 'badge-danger';
      default:
        return 'badge-neutral';
    }
  }

  openAddModal(): void {
    this.editingId.set(null);
    this.currentOwnerId.set(null);
    this.originalStartDateIso = null;
    this.form.reset({
      name: '', description: '', ownerId: '', goalId: '', kraId: '', kpiId: '', priority: 'Medium', status: 'NotStarted',
      startDate: null, endDate: null, budget: 0, resources: '',
    });
    // A fresh form starts from the full hierarchy, not from the previous edit's cascade.
    this.loadGoals();
    this.loadKras();
    this.loadKpis();
    this.showForm.set(true);
  }

  onEdit(initiative: InitiativeListItem): void {
    this.openMenuId.set(null);
    // The grid projection has no resources/strategic links, so load the detail
    // before populating the form instead of inventing values.
    this.initiativeService.getById(initiative.id).subscribe({
      next: (detail) => {
        this.editingId.set(detail.id);
        this.currentOwnerId.set(detail.ownerId || null);
        this.originalStartDateIso = detail.startDate?.slice(0, 10) ?? null;
        this.form.setValue({
          name: detail.name,
          description: detail.description ?? '',
          ownerId: detail.ownerId ?? '',
          goalId: detail.goalId ?? '',
          kraId: detail.kraId ?? '',
          kpiId: detail.kpiId ?? '',
          priority: detail.priority,
          status: detail.status,
          startDate: detail.startDate ?? null,
          endDate: detail.endDate ?? null,
          budget: detail.budget,
          resources: detail.resources ?? '',
        });
        // Preserve the existing links: narrow the option lists to the links actually in use.
        this.loadGoals();
        this.loadKras(detail.goalId || undefined);
        this.loadKpis(detail.kraId || undefined);
        this.showForm.set(true);
      },
      error: (error) => this.notifications.error(toApiError(error).message),
    });
  }

  onCancelEdit(): void {
    this.editingId.set(null);
    this.currentOwnerId.set(null);
    this.originalStartDateIso = null;
    this.form.reset({
      name: '', description: '', ownerId: '', goalId: '', kraId: '', kpiId: '', priority: 'Medium', status: 'NotStarted',
      startDate: null, endDate: null, budget: 0, resources: '',
    });
    this.showForm.set(false);
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);

    const v = this.form.value;
    const request: CreateInitiativeRequest = {
      name: v.name!,
      description: v.description || undefined,
      goalId: v.goalId || undefined,
      kraId: v.kraId || undefined,
      kpiId: v.kpiId || undefined,
      ownerId: v.ownerId ?? '',
      priority: v.priority as CreateInitiativeRequest['priority'],
      status: v.status as CreateInitiativeRequest['status'],
      startDate: v.startDate || undefined,
      endDate: v.endDate || undefined,
      budget: v.budget ?? 0,
      resources: v.resources || undefined,
    };

    this.initiativeService.create(request).subscribe({
      next: (created) => {
        this.notifications.success(`Initiative "${created.name}" created successfully.`);
        this.onCancelEdit();
        // The grid is server-ordered newest-first, so clearing any active filter and
        // returning to the first page guarantees the new card is visible immediately
        // instead of being hidden behind a search term, status filter or later page.
        this.search.set('');
        this.statusFilter.set('all');
        this.ownerFilter.set('all');
        this.includeClosed.set(true);
        this.page.set(1);
        this.loadInitiatives();
        this.loadSummary();
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

    const v = this.form.value;
    const request: UpdateInitiativeRequest = {
      name: v.name!,
      description: v.description || undefined,
      // All three selects are rendered, so the links are submitted as an authoritative snapshot:
      // an emptied select clears that link while the others are sent unchanged. Links are never
      // auto-cleared behind the user's back.
      strategicLinksSpecified: true,
      goalId: v.goalId || undefined,
      kraId: v.kraId || undefined,
      kpiId: v.kpiId || undefined,
      ownerId: v.ownerId || undefined,
      priority: v.priority as UpdateInitiativeRequest['priority'],
      startDate: v.startDate || undefined,
      endDate: v.endDate || undefined,
      budget: v.budget ?? 0,
      resources: v.resources || undefined,
    };

    this.initiativeService.update(id, request).subscribe({
      next: () => {
        this.notifications.success('Initiative updated successfully.');
        this.onCancelEdit();
        this.loadInitiatives();
      },
      error: (error) => {
        this.notifications.error(toApiError(error).message);
        this.submitting.set(false);
      },
      complete: () => this.submitting.set(false),
    });
  }

  async onDelete(id: string): Promise<void> {
    this.openMenuId.set(null);
    const ok = await this.dialog.confirm(
      'Delete Initiative',
      'The initiative will be deleted and hidden from every page and report. Its milestones, dependencies and history are kept in the database.',
      { confirmText: 'Delete', variant: 'danger' }
    );
    if (!ok) return;

    this.initiativeService.delete(id).subscribe({
      next: () => {
        this.notifications.success('Initiative deleted.');
        if (this.editingId() === id) {
          this.onCancelEdit();
        }
        this.loadInitiatives();
        this.loadSummary();
      },
      error: (error) => this.notifications.error(toApiError(error).message),
    });
  }

  onView(initiative: InitiativeListItem): void {
    this.openMenuId.set(null);
    this.router.navigate(['/initiatives', initiative.id]);
  }
}