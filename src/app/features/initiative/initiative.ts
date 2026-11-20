import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators, ValidatorFn } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { toApiError } from '../../core/model/api-error';
import {
  InitiativeListItem,
  InitiativeSummary,
  InitiativeOwnerType,
  CreateInitiativeRequest,
  UpdateInitiativeRequest,
  ragSlug,
} from '../../features/initiative/initiative.model';
import { InitiativeService } from '../../features/initiative/initiative.service';
import { NotificationService } from '../../core/service/notification.service';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import { KraService } from '../kra/kra.service';
import { Kra } from '../kra/kra.model';
import { KpiService } from '../kpi/kpi.service';
import { Kpi } from '../kpi/kpi.model';
import { GoalService } from '../../core/service/goal.service';
import { Goal, KpiOwnerOption } from '../../core/model/goal.model';
import { UserStore } from '../../core/service/user-store.service';
import { DivisionService } from '../division/division.service';
import { Division } from '../division/division.model';

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
  private readonly kraService = inject(KraService);
  private readonly kpiService = inject(KpiService);
  private readonly goalService = inject(GoalService);
  private readonly divisionService = inject(DivisionService);
  private readonly userStore = inject(UserStore);

  readonly rows = signal<InitiativeListItem[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  // FR-403/FR-404: every figure below is calculated by the backend.
  readonly summary = signal<InitiativeSummary | null>(null);

  // Active HR employees available to own an initiative individually. ownerId is the employee's
  // stable user GUID in the API; the list comes from the HR lookup, not the local user directory.
  readonly employeeOwners = signal<KpiOwnerOption[]>([]);
  readonly loadingEmployees = signal(false);

  // Divisions available to own an initiative instead of an individual user.
  readonly divisions = signal<Division[]>([]);
  readonly loadingDivisions = signal(false);

  // Goals / KRAs / KPIs available to link an initiative to (Goal → KRA → KPI hierarchy, all optional).
  readonly goalOptions = signal<Goal[]>([]);
  readonly kraOptions = signal<Kra[]>([]);
  readonly kpiOptions = signal<Kpi[]>([]);
  readonly loadingGoals = signal(false);
  readonly loadingKras = signal(false);
  readonly loadingKpis = signal(false);

  // Owner currently loaded in the form (so an existing owner not in userOptions still renders).
  readonly currentOwnerId = signal<string | null>(null);
  readonly currentDivisionOwnerId = signal<string | null>(null);

  readonly showForm = signal(false);
  readonly submitting = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly openMenuId = signal<string | null>(null);

  readonly search = signal('');
  readonly statusFilter = signal<string>('all');
  readonly ownerFilter = signal<string>('all');
  readonly ownerFilterSearch = signal('');
  readonly ownerFilterPickerOpen = signal(false);
  readonly includeClosed = signal(true);

  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly totalCount = signal(0);
  readonly totalPages = signal(0);

  readonly canCreate = computed(() => this.userStore.hasPermission('initiatives:create'));
  readonly canEdit = computed(() => this.userStore.hasPermission('initiatives:edit'));
  readonly canDelete = computed(() => this.userStore.hasPermission('initiatives:delete'));
  readonly canClose = computed(() => this.userStore.hasPermission('initiatives:close'));

  /**
   * Data Input, View Only and Executive accounts already receive an owner-scoped portfolio from
   * the backend, so a cross-owner dropdown would be misleading. Role names are normalized so both
   * the canonical "Data Input User" and the compact "DataInputUser" form resolve to the same role.
   */
  private static readonly scopedRoleKeys = new Set(['datainputuser', 'viewonly', 'executive']);

  readonly hasScopedOwner = computed(() =>
    this.userStore
      .roles()
      .some((role) => InitiativePage.scopedRoleKeys.has(role.toLowerCase().replace(/[\s_-]/g, '')))
  );

  /** The one owner scope shown to scoped roles: their division(s), or their own name. */
  readonly scopedOwnerLabel = computed(() => {
    const divisionNames = this.userStore
      .divisionIds()
      .map((id) => this.divisions().find((division) => division.id === id)?.name ?? id);
    if (divisionNames.length) return divisionNames.join(', ');
    const user = this.userStore.user();
    return user?.fullName || user?.username || '—';
  });

  /**
   * Unique owners across the visible initiatives as {value, label} pairs for the filter dropdown.
   * Individual owner ids are sent as-is for backward compatibility; division owners are prefixed
   * with "division:" so the two id spaces stay distinct.
   */
  readonly ownerFilterOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const row of this.rows()) {
      if (row.ownerId) {
        seen.set(row.ownerId, row.ownerName || this.ownerName(row.ownerId));
      }
      if (row.divisionOwnerId) {
        seen.set(
          `division:${row.divisionOwnerId}`,
          row.divisionOwnerName || this.divisionName(row.divisionOwnerId)
        );
      }
    }
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  });

  /** Label shown by the elevated-role owner filter trigger. */
  readonly selectedOwnerFilterLabel = computed(() => {
    const value = this.ownerFilter();
    if (value === 'all') return 'All owners';
    return this.ownerFilterOptions().find((owner) => owner.value === value)?.label ?? value;
  });

  readonly filteredOwnerFilterOptions = computed(() => {
    const term = this.ownerFilterSearch().trim().toLowerCase();
    const options = this.ownerFilterOptions();
    return term ? options.filter((owner) => owner.label.toLowerCase().includes(term)) : options;
  });

  /** Active divisions offered as an initiative owner, plus the current one when it is not listed. */
  readonly divisionOptions = computed(() => {
    const options = this.divisions()
      .filter((division) => division.isActive !== false)
      .map((division) => ({
        id: division.id,
        label: division.code ? `${division.name} (${division.code})` : division.name,
      }));
    const current = this.currentDivisionOwnerId();
    if (current && !options.some((option) => option.id === current)) {
      options.unshift({ id: current, label: current });
    }
    return options;
  });

  /** HR stores father in MiddleName and grandfather in LastName; show the complete name in the picker. */
  private static employeeFullName(employee: KpiOwnerOption): string {
    const parts = [employee.firstName, employee.fatherName, employee.grandfatherName].filter(Boolean);
    return parts.length ? parts.join(' ') : employee.fullName;
  }

  /** Options for the individual-owner picker: active HR employees, plus the current owner if missing. */
  readonly ownerFormOptions = computed(() => {
    const options = this.employeeOwners().map((employee) => {
      const label = InitiativePage.employeeFullName(employee);
      const meta = [employee.divisionName, employee.departmentName, employee.positionName]
        .filter(Boolean)
        .join(' · ');
      return {
        id: employee.id,
        label,
        meta,
        // Search the complete name (first + father + grandfather) plus the HR short name,
        // id and department/role so any visible part of the option finds the employee.
        searchText: [
          label,
          employee.fullName,
          employee.firstName,
          employee.fatherName,
          employee.grandfatherName,
          employee.employeeCode,
          employee.email,
          meta,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      };
    });
    const current = this.currentOwnerId();
    if (current && !options.some((o) => o.id === current)) {
      options.unshift({ id: current, label: current, meta: '', searchText: current.toLowerCase() });
    }
    return options;
  });

  // ── Searchable owner pickers (same behaviour/style as Division Planning's division picker) ──

  readonly divisionOwnerSearch = signal('');
  readonly divisionOwnerPickerOpen = signal(false);
  readonly employeeOwnerSearch = signal('');
  readonly employeeOwnerPickerOpen = signal(false);
  /** Toolbar filter panel anchor (it is not inside the scrolling modal). */
  readonly ownerPickerPosition = signal({ top: 0, left: 0, width: 0 });
  /** Modal panels are absolute children of the trigger wrapper, bounded by the modal body. */
  readonly ownerPickerPlacement = signal({ maxHeight: 260, dropUp: false });

  readonly filteredDivisionOwnerOptions = computed(() => {
    const term = this.divisionOwnerSearch().trim().toLowerCase();
    const options = this.divisionOptions();
    return term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;
  });

  readonly filteredEmployeeOwnerOptions = computed(() => {
    const words = this.employeeOwnerSearch().trim().toLowerCase().split(/\s+/).filter(Boolean);
    const options = this.ownerFormOptions();
    if (!words.length) return options;
    return options.filter((o) => words.every((word) => o.searchText.includes(word)));
  });

  /** Selected owner label shown by the closed trigger; driven by form-value signals above. */
  readonly selectedDivisionOwnerLabel = computed(
    () => this.divisionOptions().find((o) => o.id === this.divisionOwnerIdValue())?.label ?? ''
  );

  readonly selectedEmployeeOwnerLabel = computed(
    () => this.ownerFormOptions().find((o) => o.id === this.ownerIdValue())?.label ?? ''
  );

  /** Toolbar filter panel: fixed to the viewport trigger, clamped inside the window. */
  private positionToolbarOwnerPicker(trigger: HTMLElement): void {
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width, 260);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const panelHeight = 340;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const top =
      spaceBelow >= panelHeight || spaceBelow >= rect.top - 12
        ? rect.bottom + 4
        : Math.max(12, rect.top - panelHeight - 4);
    this.ownerPickerPosition.set({ top, left, width });
  }

  /**
   * Modal pickers are absolute children of the trigger wrapper so they stay aligned with the
   * control and scroll with the modal. Bound their height to the space available in .modal-body,
   * flipping above the trigger when the control has been scrolled near the bottom of the dialog.
   */
  private prepareModalOwnerPicker(trigger: HTMLElement): void {
    const rect = trigger.getBoundingClientRect();
    const modalBody = trigger.closest<HTMLElement>('.modal-body');
    const bodyRect = modalBody?.getBoundingClientRect();
    const spaceBelow = (bodyRect?.bottom ?? window.innerHeight) - rect.bottom - 12;
    const spaceAbove = rect.top - (bodyRect?.top ?? 0) - 12;
    const dropUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    // Search row, padding and border occupy roughly 64px; the list gets the rest, capped at 260px.
    const maxHeight = Math.max(96, Math.min(260, (dropUp ? spaceAbove : spaceBelow) - 64));
    this.ownerPickerPlacement.set({ maxHeight, dropUp });
  }

  toggleDivisionOwnerPicker(event: MouseEvent): void {
    event.stopPropagation();
    if (this.divisionOwnerPickerOpen()) {
      this.closeOwnerPickers();
      return;
    }
    this.prepareModalOwnerPicker(event.currentTarget as HTMLElement);
    this.divisionOwnerSearch.set('');
    this.employeeOwnerPickerOpen.set(false);
    this.divisionOwnerPickerOpen.set(true);
  }

  toggleEmployeeOwnerPicker(event: MouseEvent): void {
    event.stopPropagation();
    if (this.employeeOwnerPickerOpen()) {
      this.closeOwnerPickers();
      return;
    }
    this.prepareModalOwnerPicker(event.currentTarget as HTMLElement);
    this.employeeOwnerSearch.set('');
    this.divisionOwnerPickerOpen.set(false);
    this.employeeOwnerPickerOpen.set(true);
  }

  closeOwnerPickers(): void {
    this.divisionOwnerPickerOpen.set(false);
    this.employeeOwnerPickerOpen.set(false);
    this.ownerFilterPickerOpen.set(false);
  }

  toggleOwnerFilterPicker(event: MouseEvent): void {
    event.stopPropagation();
    if (this.ownerFilterPickerOpen()) {
      this.closeOwnerPickers();
      return;
    }
    this.positionToolbarOwnerPicker(event.currentTarget as HTMLElement);
    this.ownerFilterSearch.set('');
    this.ownerFilterPickerOpen.set(true);
  }

  selectOwnerFilter(value: string): void {
    this.onOwnerFilterChange(value);
    this.closeOwnerPickers();
  }

  onOwnerPickerBackdropClick(event: MouseEvent): void {
    event.stopPropagation();
    this.closeOwnerPickers();
  }

  /** True while one of the modal owner pickers is open. */
  private isModalOwnerPickerOpen(): boolean {
    return this.divisionOwnerPickerOpen() || this.employeeOwnerPickerOpen();
  }

  /**
   * A backdrop click dismisses an open owner picker first; only a click with no picker open
   * closes the whole modal. Without this, opening a picker then clicking outside would lose
   * the in-progress form.
   */
  onModalBackdropClick(event: MouseEvent): void {
    event.stopPropagation();
    if (this.isModalOwnerPickerOpen()) {
      this.closeOwnerPickers();
      return;
    }
    this.onCancelEdit();
  }

  /**
   * Clicks elsewhere inside the dialog bubble here (the picker trigger and panel stop
   * propagation before this point), so this closes a stuck-open picker without touching
   * the modal itself.
   */
  onModalDialogClick(event: MouseEvent): void {
    event.stopPropagation();
    this.closeOwnerPickers();
  }

  selectDivisionOwner(id: string): void {
    const control = this.form.controls.divisionOwnerId;
    // Re-selecting the current division toggles it off, giving a clear way to unselect.
    control.setValue(control.value === id ? '' : id);
    control.markAsTouched();
    this.form.updateValueAndValidity();
    this.closeOwnerPickers();
  }

  selectEmployeeOwner(id: string): void {
    const control = this.form.controls.ownerId;
    // Re-selecting the current employee toggles it off, giving a clear way to unselect.
    control.setValue(control.value === id ? '' : id);
    control.markAsTouched();
    this.form.updateValueAndValidity();
    this.closeOwnerPickers();
  }

  /** Explicit clear buttons on the picker triggers. */
  clearDivisionOwner(event?: MouseEvent): void {
    event?.stopPropagation();
    this.form.controls.divisionOwnerId.setValue('');
    this.form.controls.divisionOwnerId.markAsTouched();
    this.form.updateValueAndValidity();
    this.closeOwnerPickers();
  }

  clearEmployeeOwner(event?: MouseEvent): void {
    event?.stopPropagation();
    this.form.controls.ownerId.setValue('');
    this.form.controls.ownerId.markAsTouched();
    this.form.updateValueAndValidity();
    this.closeOwnerPickers();
  }

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

  /**
   * An initiative has exactly one owner. Which picker supplies it depends on Owner Type, so the
   * required rule lives on the group instead of on a single control.
   */
  private ownerRequiredValidator = (group: AbstractControl): ValidationErrors | null => {
    const type = group.get('ownerType')?.value as InitiativeOwnerType;
    const id = type === 'Division'
      ? group.get('divisionOwnerId')?.value
      : group.get('ownerId')?.value;
    return id ? null : { ownerRequired: true };
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
    ownerType: new FormControl<InitiativeOwnerType>('Individual', { nonNullable: true }),
    ownerId: new FormControl('', { nonNullable: true }),
    divisionOwnerId: new FormControl('', { nonNullable: true }),
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
  }, { validators: [this.ownerRequiredValidator] });

  /**
   * Bridge the reactive-form owner values into signals. A plain FormControl read inside a
   * computed signal is not tracked, so without this the trigger label would stay stale after a
   * selection. Every setValue/patchValue/reset emits valueChanges and refreshes these signals.
   */
  private readonly ownerIdValue = toSignal(this.form.controls.ownerId.valueChanges, { initialValue: '' });
  private readonly divisionOwnerIdValue = toSignal(this.form.controls.divisionOwnerId.valueChanges, { initialValue: '' });

  constructor() {
    this.loadInitiatives();
    this.loadSummary();
    this.loadEmployeeOwners();
    this.loadDivisions();
    this.loadGoals();
    this.loadKras();
    this.loadKpis();
  }

  /** Active HR employees (EmpId = the local user id) that may own an initiative individually. */
  loadEmployeeOwners(): void {
    this.loadingEmployees.set(true);
    this.kpiService.getOwnerOptions(undefined, 200).subscribe({
      next: (employees) => {
        this.employeeOwners.set(employees);
        this.loadingEmployees.set(false);
      },
      error: () => {
        this.employeeOwners.set([]);
        this.loadingEmployees.set(false);
      },
    });
  }

  loadDivisions(): void {
    this.loadingDivisions.set(true);
    this.divisionService.getAll().subscribe({
      next: (divisions) => {
        this.divisions.set(divisions);
        this.loadingDivisions.set(false);
      },
      error: () => {
        this.divisions.set([]);
        this.loadingDivisions.set(false);
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
    this.closeOwnerPickers();
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

  /**
   * Switching Owner Type keeps exactly one owner value in the form: the inactive picker is cleared
   * so the other id can never be submitted alongside it.
   */
  onOwnerTypeChange(type: InitiativeOwnerType): void {
    this.closeOwnerPickers();
    if (type === 'Division') {
      this.form.controls.ownerId.setValue('');
    } else {
      this.form.controls.divisionOwnerId.setValue('');
    }
    this.form.updateValueAndValidity();
  }

  /** Exactly one owner id is submitted: the picker selected by Owner Type. */
  private ownerPayload(): { ownerId?: string; divisionOwnerId?: string } {
    const v = this.form.value;
    return v.ownerType === 'Division'
      ? { divisionOwnerId: v.divisionOwnerId || undefined }
      : { ownerId: v.ownerId || undefined };
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

    // Individual owners are filtered by their plain id (backward compatible); division owners are
    // encoded as "division:<id>" in the dropdown and split back into the dedicated query parameter.
    const ownerFilter = this.ownerFilter();
    const divisionOwnerId = ownerFilter.startsWith('division:')
      ? ownerFilter.slice('division:'.length)
      : undefined;
    const ownerId = ownerFilter === 'all' || divisionOwnerId ? undefined : ownerFilter;

    this.initiativeService
      .getAll({
        search: this.search().trim() || undefined,
        status: this.statusFilter() === 'all' ? undefined : (this.statusFilter() as InitiativeListItem['status']),
        ownerId,
        divisionOwnerId,
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

  /** Display name for an employee id (falls back to the raw id when unknown/no longer active). */
  ownerName(id: string): string {
    if (!id) return '—';
    const employee = this.employeeOwners().find((e) => e.id === id);
    return employee?.fullName || id;
  }

  /** Display name for a division id (falls back to the raw id when unknown/deleted). */
  divisionName(id: string): string {
    if (!id) return '—';
    const division = this.divisions().find((d) => d.id === id);
    return division ? (division.code ? `${division.name} (${division.code})` : division.name) : id;
  }

  /** Owner label for a row: an individual user or a division, whichever the initiative holds. */
  ownerLabel(initiative: InitiativeListItem): string {
    if (initiative.ownerId) {
      return initiative.ownerName || this.ownerName(initiative.ownerId);
    }
    if (initiative.divisionOwnerId) {
      return initiative.divisionOwnerName || this.divisionName(initiative.divisionOwnerId);
    }
    return '—';
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
    this.closeOwnerPickers();
    this.editingId.set(null);
    this.currentOwnerId.set(null);
    this.originalStartDateIso = null;
    this.currentDivisionOwnerId.set(null);
    this.form.reset({
      name: '', description: '', ownerType: 'Individual', ownerId: '', divisionOwnerId: '',
      goalId: '', kraId: '', kpiId: '', priority: 'Medium', status: 'NotStarted',
      startDate: null, endDate: null, budget: 0, resources: '',
    });
    // A fresh form starts from the full hierarchy, not from the previous edit's cascade.
    this.loadGoals();
    this.loadKras();
    this.loadKpis();
    this.showForm.set(true);
  }

  onEdit(initiative: InitiativeListItem): void {
    this.closeOwnerPickers();
    this.openMenuId.set(null);
    // The grid projection has no resources/strategic links, so load the detail
    // before populating the form instead of inventing values.
    this.initiativeService.getById(initiative.id).subscribe({
      next: (detail) => {
        this.editingId.set(detail.id);
        this.currentOwnerId.set(detail.ownerId || null);
        this.currentDivisionOwnerId.set(detail.divisionOwnerId || null);
        this.originalStartDateIso = detail.startDate?.slice(0, 10) ?? null;
        this.form.setValue({
          name: detail.name,
          description: detail.description ?? '',
          ownerType: detail.divisionOwnerId ? 'Division' : 'Individual',
          ownerId: detail.ownerId ?? '',
          divisionOwnerId: detail.divisionOwnerId ?? '',
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
    this.closeOwnerPickers();
    this.editingId.set(null);
    this.currentOwnerId.set(null);
    this.currentDivisionOwnerId.set(null);
    this.originalStartDateIso = null;
    this.form.reset({
      name: '', description: '', ownerType: 'Individual', ownerId: '', divisionOwnerId: '',
      goalId: '', kraId: '', kpiId: '', priority: 'Medium', status: 'NotStarted',
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
      ...this.ownerPayload(),
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
      ...this.ownerPayload(),
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