import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { toApiError } from '../../core/model/api-error';
import {
  Initiative,
  InitiativeListItem,
  InitiativeHistoryEntry,
  InitiativeRagLabel,
  Milestone,
  MilestoneStatus,
  UpdateInitiativeRequest,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
  UpdateMilestoneProgressRequest,
  CloseInitiativeRequest,
  ragLabel,
  ragSlug,
} from '../../features/initiative/initiative.model';
import { InitiativeService } from '../../features/initiative/initiative.service';
import { NotificationService } from '../../core/service/notification.service';
import { ConfirmDialogService } from '../../shared/service/confirm-dialog.service';
import { UserStore } from '../../core/service/user-store.service';
import { AdminUserService } from '../admin-users/admin-users.service';
import { AppUser } from '../admin-users/admin-users.model';

import { LucideDynamicIcon } from '@lucide/angular';
type DetailTab = 'milestones' | 'budget' | 'progress' | 'dependencies' | 'closure';

/**
 * Renders the progress history as RFC 4180 CSV so it opens directly in Excel. Values containing
 * commas, quotes or newlines are quoted; embedded quotes are doubled.
 */
export function historyToCsv(
  entries: InitiativeHistoryEntry[],
  typeLabel: (changeType: string) => string,
  userLabel: (userId?: string) => string
): string {
  const escape = (value: unknown): string => {
    const text = value == null ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const header = ['Recorded at', 'Type', 'Milestone', 'Previous value', 'New value', 'Details', 'Recorded by'];
  const cells = (entry: InitiativeHistoryEntry): string[] => [
    new Date(entry.recordedAtUtc).toLocaleString(),
    typeLabel(entry.changeType),
    entry.milestoneName ?? '',
    (entry.previousValue ?? '').replace(/\s+/g, ' ').trim(),
    (entry.newValue ?? '').replace(/\s+/g, ' ').trim(),
    (entry.details ?? '').replace(/\s+/g, ' ').trim(),
    userLabel(entry.recordedByUserId),
  ];

  return [header, ...entries.map(cells)].map((row) => row.map(escape).join(',')).join('\r\n');
}

@Component({
  selector: 'app-initiative-detail',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LucideDynamicIcon],
  templateUrl: './initiative-detail.html',
  styleUrl: './initiative-detail.scss',
})
export class InitiativeDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly initiativeService = inject(InitiativeService);
  private readonly notifications = inject(NotificationService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly adminUserService = inject(AdminUserService);
  private readonly userStore = inject(UserStore);

  readonly initiative = signal<Initiative | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly milestones = signal<Milestone[]>([]);
  readonly loadingMilestones = signal(false);
  readonly history = signal<InitiativeHistoryEntry[]>([]);
  readonly loadingHistory = signal(false);
  readonly dependencyCandidates = signal<InitiativeListItem[]>([]);

  readonly activeTab = signal<DetailTab>('milestones');
  readonly milestoneMenuId = signal<string | null>(null);

  readonly showMilestoneForm = signal(false);
  readonly editingMilestoneId = signal<string | null>(null);
  readonly milestoneSubmitting = signal(false);
  readonly progressTarget = signal<Milestone | null>(null);
  readonly progressSubmitting = signal(false);

  readonly showEditForm = signal(false);
  readonly submitting = signal(false);

  readonly showCloseForm = signal(false);
  readonly closing = signal(false);
  readonly showReopenForm = signal(false);
  readonly reopening = signal(false);
  readonly showHoldForm = signal(false);
  readonly holding = signal(false);
  readonly showCancelForm = signal(false);
  readonly cancelling = signal(false);
  readonly dependencySubmitting = signal(false);
  readonly selectedDependencyId = signal<string>('');

  readonly userOptions = signal<AppUser[]>([]);
  readonly loadingUsers = signal(false);
  readonly currentOwnerId = signal<string | null>(null);

  readonly canEdit = computed(() => this.userStore.hasPermission('initiatives:edit'));

  /**
   * Mirrors InitiativeGuard.EnsureCanManageMilestones: the milestone/dependency permission, the
   * edit permission, or ownership of this initiative. Gating on the permission alone hid the
   * controls from the very owner the API accepts.
   */
  readonly isOwner = computed(() => {
    const ownerId = this.initiative()?.ownerId;
    const userId = this.userStore.user()?.id;
    return !!ownerId && !!userId && ownerId === userId;
  });

  /**
   * Mirrors InitiativeGuard.EnsureCanUpdateProgress exactly: the progress permission, the
   * milestone permission, or ownership of this initiative. Hiding the control from the owner the
   * API accepts would contradict the backend, which is the authority here.
   */
  readonly canUpdateProgress = computed(() =>
    this.userStore.hasPermission('initiatives:progress.update')
    || this.userStore.hasPermission('initiatives:milestones.manage')
    || this.isOwner()
  );

  /**
   * Mirrors InitiativeGuard.EnsureCanUpdateExpenditure: the narrow expenditure permission, the
   * Power User correction permissions, or ownership. Owners reach the spend figure only - never
   * the initiative detail form, which stays behind `canEdit` and the InitiativesEdit policy.
   */
  readonly canUpdateExpenditure = computed(() =>
    this.userStore.hasPermission('initiatives:expenditure.update')
    || this.userStore.hasPermission('initiatives:edit')
    || this.userStore.hasPermission('initiatives:close')
    || this.isOwner()
  );
  readonly canManageMilestones = computed(() =>
    this.userStore.hasPermission('initiatives:milestones.manage')
    || this.userStore.hasPermission('initiatives:edit')
    || this.isOwner()
  );
  readonly canManageDependencies = computed(() =>
    this.userStore.hasPermission('initiatives:dependencies.manage')
    || this.userStore.hasPermission('initiatives:edit')
    || this.isOwner()
  );
  readonly canClose = computed(() => this.userStore.hasPermission('initiatives:close'));

  /**
   * FRD lifecycle: hold/resume are day-to-day execution decisions for the owner or a user with
   * the edit/close permissions. Mirrors InitiativeGuard.EnsureCanManageLifecycle.
   */
  readonly canManageLifecycle = computed(() =>
    this.canEdit() || this.canClose() || this.isOwner()
  );

  /**
   * FRD lifecycle: cancelling is reserved for edit/close users. Owners may not cancel directly
   * (the owner-request workflow is an open decision) — mirrors InitiativeGuard.EnsureCanCancel.
   */
  readonly canCancelInitiative = computed(() => this.canEdit() || this.canClose());

  /**
   * FRD lifecycle: completion is confirmed by a Power User holding `initiatives:close`, or by the
   * assigned owner. Mirrors InitiativeGuard.EnsureCanClose so the button and the API agree.
   */
  readonly canConfirmCompletion = computed(() => this.canClose() || this.isOwner());

  /**
   * FR-405: a closed initiative is read-only for everyone without the close/edit
   * permissions, so every mutation control is gated on this.
   */
  readonly isReadOnly = computed(() => {
    const initiative = this.initiative();
    if (!initiative?.isClosed) return false;
    return !this.canEdit() && !this.canClose();
  });

  readonly progress = computed(() => Math.round(this.initiative()?.progressPercentage ?? 0));
  readonly progressRag = computed<InitiativeRagLabel>(
    () => this.initiative()?.progressRagStatus ?? 'NoData'
  );
  readonly progressRagClass = computed(
    () => `rag-${ragSlug(this.progressRag())}`
  );
  readonly progressRagLabel = computed(() => ragLabel(this.progressRag()));
  readonly budgetPosition = computed(() => this.initiative()?.budgetPosition ?? null);

  /**
   * FRD lifecycle: readiness is calculated by the backend, so the client does not re-implement the
   * weights/progress rules. The reason travels with the flag and is shown verbatim.
   */
  readonly isReadyForCompletion = computed(() => this.initiative()?.isReadyForCompletion ?? false);
  readonly notReadyReason = computed(() => this.initiative()?.notReadyReason ?? null);

  /** Closure may proceed only when the backend says the initiative is ready for it. */
  readonly canCloseNow = computed(() => {
    const initiative = this.initiative();
    if (!initiative || initiative.isClosed) return false;
    return initiative.isReadyForCompletion ?? false;
  });

  readonly availableDependencies = computed(() => {
    const initiative = this.initiative();
    if (!initiative) return [];
    const taken = new Set(
      initiative.dependencies.map((dependency) => dependency.dependsOnInitiativeId)
    );
    return this.dependencyCandidates()
      .filter((candidate) => candidate.id !== initiative.id && !taken.has(candidate.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

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

  /**
   * Mirrors InitiativeGuard.ValidateMilestoneDueDate, which rejects a due date outside the
   * initiative's own start/end window. The backend owns the rule; this only avoids a guaranteed
   * 400 and gives the user a field-level reason instead of a toast.
   */
  private readonly milestoneDueDateWithinInitiative: ValidatorFn = (control) => {
    const dueDate = control.value as string | null;
    const { startDate, endDate } = this.initiative() ?? {};
    if (!dueDate) {
      return null;
    }
    if (startDate && dueDate < startDate.slice(0, 10)) {
      return { milestoneDueDateBeforeStart: true };
    }
    if (endDate && dueDate > endDate.slice(0, 10)) {
      return { milestoneDueDateAfterEnd: true };
    }
    return null;
  };

  /** Initiative window as ISO days, for the native min/max attributes on the date input. */
  readonly milestoneDueDateMin = computed(() => this.initiative()?.startDate?.slice(0, 10) ?? null);
  readonly milestoneDueDateMax = computed(() => this.initiative()?.endDate?.slice(0, 10) ?? null);

/**
   * The weight currently stored for the milestone on the form, or null when creating a new one.
   */
  private savedMilestoneWeight(): number | null {
    const editingId = this.editingMilestoneId();
    if (!editingId) return null;
    return this.initiative()?.milestones.find((milestone) => milestone.id === editingId)?.weight ?? null;
  }

  /**
   * Mirrors InitiativeGuard.ValidateMilestoneWeightBudget: all milestones share one 100% weight
   * budget, so the entered weight must fit in what the other milestones have left. The backend
   * owns the rule; this only avoids a guaranteed 400 and gives the user a field-level reason
   * instead of a toast.
   */
  private readonly milestoneWeightWithinBudget: ValidatorFn = (control) => {
    const entered = Number(control.value ?? 0);
    const typed = Number.isFinite(entered) ? entered : 0;
    const saved = this.savedMilestoneWeight();

    // Re-saving the stored weight is not blocked. An initiative already over budget (legacy data)
    // would otherwise be frozen, since editing any of its milestones leaves the total past 100%.
    // The backend makes the same exception, so the two stay in step.
    if (saved !== null && typed === saved) {
      return null;
    }

    // Rounded the same way as the hint, so the countdown and the validation never disagree.
    const remaining = this.roundWeight(100 - this.otherMilestoneWeight() - typed);
    if (remaining < 0) {
      return { milestoneWeightOverBudget: true };
    }

    // Mirrors InitiativeGuard.ValidateMilestoneWeightBudget: a milestone with no weight can never
    // contribute to progress, and once the other milestones hold the whole 100% budget there is no
    // share left to give it. The backend refuses the same case, so the two stay in step.
    if (typed <= 0 && this.otherMilestoneWeight() >= 100) {
      return { milestoneWeightBudgetFullyAllocated: true };
    }

    return null;
  };

  readonly milestoneForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    completionPercentage: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.min(0), Validators.max(100)],
    }),
    dueDate: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, this.milestoneDueDateWithinInitiative],
    }),
    weight: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.min(0), Validators.max(100), this.milestoneWeightWithinBudget],
    }),
    status: new FormControl<MilestoneStatus>('NotStarted'),
    comments: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
  });

  /** Weights are decimals, so trim float drift before they reach the template. */
  private roundWeight(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  /**
   * Total weight of every active milestone except the one on the form. The milestone
   * being edited is left out so its own saved weight does not count against the budget
   * while the user is retyping it.
   */
  private otherMilestoneWeight(): number {
    const editingId = this.editingMilestoneId();
    return (this.initiative()?.milestones ?? [])
      .filter((milestone) => milestone.id !== editingId)
      .reduce((total, milestone) => total + (milestone.weight ?? 0), 0);
  }

  /**
   * Weight still unallocated out of the 100% budget once the value currently in the weight
   * input is accounted for, so the hint counts down to zero as the user types.
   *
   * The milestone on the form is excluded from the base, otherwise its own value would
   * count against itself while being edited. Going negative means the entered weights
   * overshoot the budget, which blocks closure until they total exactly 100%.
   */
  milestoneWeightRemaining(): number {
    const entered = Number(this.milestoneForm.controls.weight.value ?? 0);
    const typed = Number.isFinite(entered) ? entered : 0;
    return this.roundWeight(100 - this.otherMilestoneWeight() - typed);
  }

  /** True once the entered weights push the initiative's milestones past 100%. */
  isMilestoneWeightOverspent(): boolean {
    return this.milestoneWeightRemaining() < 0;
  }

  /** Live slider readout, so the thumb can be dragged without waiting for a save. */
  progressCompletion(): number {
    return this.progressForm.controls.completionPercentage.value ?? 0;
  }

  readonly progressForm = new FormGroup({
    completionPercentage: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.min(0), Validators.max(100)],
    }),
    status: new FormControl<MilestoneStatus>('NotStarted'),
    comments: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
  });

  readonly editForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
    ownerId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    priority: new FormControl<Initiative['priority']>('Medium'),
    startDate: new FormControl<string | null>(null),
    endDate: new FormControl<string | null>(null),
    budget: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
    actualExpenditure: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
    resources: new FormControl('', { nonNullable: true }),
  });

  /** FR-405: the closure picker is pre-filled with today (editable) and may never go past it. */
  readonly todayIso = (() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  })();

  /**
   * FR-405: the actual end date must sit inside the initiative window — strictly after the start
   * date and no later than the planned end date — and may never be dated in the future. Mirrors
   * InitiativeGuard.ValidateActualEndDate; the backend owns the rule, this only avoids a guaranteed
   * 400 and gives the user an inline message.
   */
  private closeDateValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const value: string = control.value?.slice(0, 10);
    if (!value) return null;
    if (value > this.todayIso) return { futureDate: true };
    const start = this.initiative()?.startDate?.slice(0, 10);
    if (start && value <= start) return { beforeStart: true };
    const end = this.initiative()?.endDate?.slice(0, 10);
    if (end && value > end) return { afterPlannedEnd: true };
    return null;
  };

  /**
   * FR-405: the native picker for the actual end date is bounded to the initiative window — the
   * day after the start date up to the planned end date (capped at today) — so only valid dates are
   * selectable. Mirrors InitiativeGuard.ValidateActualEndDate.
   */
  readonly closeActualEndDateMin = computed(() => this.isoDayAfter(this.initiative()?.startDate?.slice(0, 10)));

  readonly closeActualEndDateMax = computed(() => {
    const today = this.todayIso;
    const end = this.initiative()?.endDate?.slice(0, 10);
    return end && end < today ? end : today;
  });

  readonly closeForm = new FormGroup({
    actualEndDate: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, this.closeDateValidator],
    }),
    finalActualExpenditure: new FormControl<number | null>(null, [Validators.min(0)]),
    // FR-405: the outcome summary is optional.
    outcomeSummary: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(2000)],
    }),
    lessonsLearned: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(2000)],
    }),
  });

  readonly reopenForm = new FormGroup({
    reason: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(500)],
    }),
  });

  /** FRD lifecycle: putting an initiative on hold is a deliberate decision with a recorded reason. */
  readonly holdForm = new FormGroup({
    reason: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(500)],
    }),
  });

  /** FRD lifecycle: cancelling an initiative is a deliberate decision with a recorded reason. */
  readonly cancelForm = new FormGroup({
    reason: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(500)],
    }),
  });

  /**
   * Spend-only editor. Deliberately separate from `editForm`: an assigned owner posts actual
   * expenditure here through PUT /initiative/{id}/expenditure, and never sees the initiative
   * detail fields that `initiatives:edit` protects.
   */
  readonly expenditureForm = new FormGroup({
    actualExpenditure: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
  });
  readonly editingExpenditure = signal(false);
  readonly savingExpenditure = signal(false);

  constructor() {
    // The weight budget depends on the loaded milestones and on which milestone is being edited,
    // neither of which the reactive form knows about. Re-validating here keeps the countdown, the
    // field error and the submit guard in agreement whenever either input changes.
    effect(() => {
      this.initiative();
      this.editingMilestoneId();
      this.milestoneForm.controls.weight.updateValueAndValidity({ emitEvent: false });
    });

    this.loadUsers();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.load(id);
    }
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

  private get initiativeId(): string | null {
    return this.initiative()?.id ?? this.route.snapshot.paramMap.get('id');
  }

  load(id: string): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.initiativeService.getById(id).subscribe({
      next: (initiative) => {
        this.initiative.set(initiative);
        this.loading.set(false);
        this.loadMilestones(id);
        this.loadHistory(id);
        this.loadDependencyCandidates();
      },
      error: (error) => {
        this.loadError.set(toApiError(error).message);
        this.loading.set(false);
      },
    });
  }

  loadMilestones(id: string): void {
    this.loadingMilestones.set(true);
    this.initiativeService.getMilestones(id).subscribe({
      next: (milestones) => {
        this.milestones.set(milestones);
        this.loadingMilestones.set(false);
      },
      error: (error) => {
        this.notifications.error(toApiError(error).message);
        this.loadingMilestones.set(false);
      },
    });
  }

  loadHistory(id: string): void {
    this.loadingHistory.set(true);
    this.initiativeService.getHistory(id).subscribe({
      next: (history) => {
        this.history.set(history);
        this.loadingHistory.set(false);
      },
      error: (error) => {
        this.notifications.error(toApiError(error).message);
        this.loadingHistory.set(false);
      },
    });
  }

  private loadDependencyCandidates(): void {
    this.initiativeService
      .getAll({ includeClosed: true, page: 1, pageSize: 200 })
      .subscribe({
        next: (page) => this.dependencyCandidates.set(page.items ?? []),
        error: () => this.dependencyCandidates.set([]),
      });
  }

  refresh(id?: string): void {
    const target = id ?? this.initiativeId;
    if (!target) return;
    this.initiativeService.getById(target).subscribe({
      next: (initiative) => {
        this.initiative.set(initiative);
        this.loadMilestones(target);
        this.loadHistory(target);
      },
      error: (error) => this.notifications.error(toApiError(error).message),
    });
  }

  goBack(): void {
    this.router.navigate(['/initiatives']);
  }

  @HostListener('document:click')
  closeMilestoneMenu(): void {
    this.milestoneMenuId.set(null);
  }

  toggleMilestoneMenu(id: string, event: MouseEvent): void {
    event.stopPropagation();
    this.milestoneMenuId.set(this.milestoneMenuId() === id ? null : id);
  }

  exportHistory(): void {
    const initiative = this.initiative();
    if (!initiative || this.history().length === 0) return;

    const csv =
      '\uFEFF' +
      historyToCsv(
        this.history(),
        (changeType) => this.historyTypeLabel(changeType),
        (userId) => this.ownerName(userId ?? '')
      );

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const slug =
      initiative.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') ||
      'initiative';
    anchor.href = url;
    anchor.download = `progress-history-${slug}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  setTab(tab: DetailTab): void {
    this.activeTab.set(tab);
  }

  ownerName(id: string): string {
    if (!id) return '—';
    const user = this.userOptions().find((u) => u.id === id);
    return user?.fullName || user?.username || id;
  }

  statusLabel(status: Initiative['status']): string {
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

  statusClass(status: Initiative['status']): string {
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

  milestoneStatusLabel(status: MilestoneStatus): string {
    switch (status) {
      case 'InProgress':
        return 'In progress';
      case 'Completed':
        return 'Completed';
      default:
        return 'Not started';
    }
  }

  milestoneStatusClass(status: MilestoneStatus): string {
    switch (status) {
      case 'Completed':
        return 'badge-success';
      case 'InProgress':
        return 'badge-info';
      default:
        return 'badge-neutral';
    }
  }

  historyTypeLabel(changeType: string): string {
    switch (changeType) {
      case 'ProgressUpdated':
        return 'Progress updated';
      case 'MilestoneCreated':
        return 'Milestone created';
      case 'MilestoneUpdated':
        return 'Milestone updated';
      case 'MilestoneDeleted':
        return 'Milestone deleted';
      case 'InitiativeClosed':
        return 'Initiative closed';
      case 'InitiativeReopened':
        return 'Initiative reopened';
      case 'InitiativeHeld':
        return 'Initiative put on hold';
      case 'InitiativeResumed':
        return 'Initiative resumed';
      case 'InitiativeCancelled':
        return 'Initiative cancelled';
      case 'InitiativeCreated':
        return 'Initiative created';
      case 'InitiativeDeleted':
        return 'Initiative deleted';
      default:
        return changeType;
    }
  }

  formatCompact(value?: number | null): string {
    const v = value ?? 0;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return `${v}`;
  }

  /**
   * FRD lifecycle: completion is never a bare status flip. It goes through formal closure, which
   * also records the actual end date, final expenditure, lessons learned and outcome summary.
   */
  confirmCompletion(): void {
    this.openCloseModal();
  }

  toggleHold(): void {
    const initiative = this.initiative();
    if (!initiative) return;
    const nextStatus: Initiative['status'] =
      initiative.status === 'OnHold' ? 'InProgress' : 'OnHold';
    if (nextStatus === 'InProgress') {
      this.resumeInitiative();
    } else {
      this.openHoldModal();
    }
  }

  /** FRD lifecycle: records why work is being suspended, then puts the initiative on hold. */
  openHoldModal(): void {
    this.holdForm.reset({ reason: '' });
    this.showHoldForm.set(true);
  }

  closeHoldModal(): void {
    this.showHoldForm.set(false);
  }

  submitHold(): void {
    const initiative = this.initiative();
    if (!initiative || this.holdForm.invalid || this.holding()) return;

    this.holding.set(true);
    const reason = this.holdForm.value.reason?.trim() ?? '';

    this.initiativeService.hold(initiative.id, reason).subscribe({
      next: (updated) => {
        this.initiative.set(updated);
        this.notifications.success('Initiative put on hold.');
        this.showHoldForm.set(false);
        this.loadHistory(updated.id);
      },
      error: (error) => this.notifications.error(toApiError(error).message),
      complete: () => this.holding.set(false),
    });
  }

  /** FRD lifecycle: resumes work on an initiative that was on hold. No reason is required. */
  resumeInitiative(): void {
    const initiative = this.initiative();
    if (!initiative) return;

    this.initiativeService.resume(initiative.id).subscribe({
      next: (updated) => {
        this.initiative.set(updated);
        this.notifications.success('Initiative resumed.');
        this.loadHistory(updated.id);
      },
      error: (error) => this.notifications.error(toApiError(error).message),
    });
  }

  /** FRD lifecycle: records why the initiative is being cancelled, then cancels it. */
  openCancelModal(): void {
    this.cancelForm.reset({ reason: '' });
    this.showCancelForm.set(true);
  }

  closeCancelModal(): void {
    this.showCancelForm.set(false);
  }

  submitCancel(): void {
    const initiative = this.initiative();
    if (!initiative || this.cancelForm.invalid || this.cancelling()) return;

    this.cancelling.set(true);
    const reason = this.cancelForm.value.reason?.trim() ?? '';

    this.initiativeService.cancel(initiative.id, reason).subscribe({
      next: (updated) => {
        this.initiative.set(updated);
        this.notifications.success('Initiative cancelled.');
        this.showCancelForm.set(false);
        this.loadHistory(updated.id);
      },
      error: (error) => this.notifications.error(toApiError(error).message),
      complete: () => this.cancelling.set(false),
    });
  }

  openEdit(): void {
    const initiative = this.initiative();
    if (!initiative) return;
    this.currentOwnerId.set(initiative.ownerId || null);
    this.editForm.setValue({
      name: initiative.name,
      description: initiative.description ?? '',
      ownerId: initiative.ownerId,
      priority: initiative.priority,
      startDate: initiative.startDate ?? null,
      endDate: initiative.endDate ?? null,
      budget: initiative.budget,
      actualExpenditure: initiative.actualExpenditure ?? 0,
      resources: initiative.resources ?? '',
    });
    this.showEditForm.set(true);
  }

  closeEdit(): void {
    this.showEditForm.set(false);
    this.currentOwnerId.set(null);
  }

  saveEdit(): void {
    const initiative = this.initiative();
    if (!initiative || this.editForm.invalid || this.submitting()) return;

    this.submitting.set(true);
    const v = this.editForm.value;
    const request: UpdateInitiativeRequest = {
      name: v.name!,
      description: v.description || undefined,
      ownerId: v.ownerId || undefined,
      priority: v.priority as UpdateInitiativeRequest['priority'],
      startDate: v.startDate || undefined,
      endDate: v.endDate || undefined,
      budget: v.budget ?? 0,
      actualExpenditure: v.actualExpenditure ?? 0,
      resources: v.resources || undefined,
    };

    this.initiativeService.update(initiative.id, request).subscribe({
      next: (updated) => {
        this.initiative.set(updated);
        this.notifications.success('Initiative updated successfully.');
        this.closeEdit();
        this.loadHistory(updated.id);
      },
      error: (error) => this.notifications.error(toApiError(error).message),
      complete: () => this.submitting.set(false),
    });
  }

  /**
   * Posts the actual expenditure through the narrow expenditure endpoint, so an owner can record
   * spend without any right to edit the initiative itself.
   */
  openExpenditure(): void {
    const initiative = this.initiative();
    if (!initiative) return;
    this.expenditureForm.setValue({ actualExpenditure: initiative.actualExpenditure ?? 0 });
    this.editingExpenditure.set(true);
  }

  cancelExpenditure(): void {
    this.editingExpenditure.set(false);
  }

  saveExpenditure(): void {
    const initiative = this.initiative();
    if (!initiative || this.expenditureForm.invalid || this.savingExpenditure()) return;

    this.savingExpenditure.set(true);
    const value = this.expenditureForm.controls.actualExpenditure.value;

    this.initiativeService.updateExpenditure(initiative.id, value).subscribe({
      next: (updated) => {
        this.initiative.set(updated);
        this.editingExpenditure.set(false);
        this.notifications.success('Actual expenditure updated successfully.');
        this.loadHistory(updated.id);
      },
      error: (error) => this.notifications.error(toApiError(error).message),
      complete: () => this.savingExpenditure.set(false),
    });
  }

  private resetMilestoneForm(): void {
    this.milestoneForm.reset({
      name: '',
      description: '',
      completionPercentage: 0,
      dueDate: '',
      weight: 0,
      status: 'NotStarted',
      comments: '',
    });
  }

  openMilestoneModal(): void {
    this.editingMilestoneId.set(null);
    this.resetMilestoneForm();
    this.showMilestoneForm.set(true);
  }

  closeMilestoneModal(): void {
    this.showMilestoneForm.set(false);
    this.editingMilestoneId.set(null);
    this.resetMilestoneForm();
  }

  onMilestoneEdit(milestone: Milestone): void {
    this.editingMilestoneId.set(milestone.id);
    this.milestoneForm.setValue({
      name: milestone.name,
      description: milestone.description ?? '',
      completionPercentage: milestone.completionPercentage,
      dueDate: milestone.dueDate.slice(0, 10),
      weight: milestone.weight,
      status: milestone.status,
      comments: milestone.comments ?? '',
    });
    this.showMilestoneForm.set(true);
  }

  async onMilestoneDelete(milestoneId: string): Promise<void> {
    const initiativeId = this.initiativeId;
    if (!initiativeId) return;

    const ok = await this.dialog.confirm(
      'Delete Milestone',
      'The milestone will be deleted and hidden from this initiative. It will no longer count towards progress or the weight total; its row and history stay in the database.',
      { confirmText: 'Delete', variant: 'danger' }
    );
    if (!ok) return;

    this.initiativeService.deleteMilestone(initiativeId, milestoneId).subscribe({
      next: () => {
        this.notifications.success('Milestone deleted.');
        if (this.editingMilestoneId() === milestoneId) {
          this.closeMilestoneModal();
        }
        this.refresh(initiativeId);
      },
      error: (error) => this.notifications.error(toApiError(error).message),
    });
  }

  /**
   * First blocking problem on the milestone form, in the user's words, or null when the form is
   * ready to save. Drives both the toast and the inline errors so the two never disagree.
   */
  milestoneBlockingReason(): string | null {
    const { name, dueDate, weight } = this.milestoneForm.controls;

    if (name.hasError('required')) {
      return 'Milestone name is required.';
    }
    if (name.hasError('maxlength')) {
      return 'Milestone name must be at most 200 characters.';
    }
    if (dueDate.hasError('required')) {
      return 'Due date is required.';
    }
    if (dueDate.hasError('milestoneDueDateBeforeStart')) {
      return `Due date cannot be before the initiative start date (${this.formatInitiativeDate('startDate')}).`;
    }
    if (dueDate.hasError('milestoneDueDateAfterEnd')) {
      return `Due date cannot be after the initiative end date (${this.formatInitiativeDate('endDate')}).`;
    }
    if (weight.hasError('milestoneWeightOverBudget')) {
      return `This milestone takes the initiative total over 100%. Lower it by ${-this.milestoneWeightRemaining()}%, or lower another milestone.`;
    }
    if (weight.hasError('milestoneWeightBudgetFullyAllocated')) {
      return 'The existing milestones already account for all 100% of the weight, so a milestone saved at 0% would never contribute to initiative progress.';
    }
    if (weight.hasError('min')) {
      return 'Weight cannot be negative.';
    }
    if (weight.hasError('max')) {
      return 'Weight cannot exceed 100.';
    }
    return null;
  }

  /** Adds one calendar day to an ISO yyyy-MM-dd value, staying in UTC to avoid timezone drift. */
  private isoDayAfter(iso: string | undefined): string | null {
    if (!iso) {
      return null;
    }
    const [year, month, day] = iso.split('-').map(Number);
    if (!year || !month || !day) {
      return null;
    }
    return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  }

  /**
   * Initiative window bound as a readable date, for the out-of-window messages. Formatted from the
   * ISO parts rather than a Date instance: `new Date('2026-10-12')` is UTC midnight, so rendering
   * it in a local timezone behind UTC would report the 11th and name the wrong day.
   */
  private formatInitiativeDate(bound: 'startDate' | 'endDate'): string {
    const value = this.initiative()?.[bound];
    if (!value) {
      return 'not set';
    }

    const [year, month, day] = value.slice(0, 10).split('-');
    if (!year || !month || !day) {
      return value.slice(0, 10);
    }

    const monthName = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ][Number(month) - 1];
    return `${Number(day)} ${monthName ?? month} ${year}`;
  }

  onSubmitMilestone(): void {
    const initiativeId = this.initiativeId;

    if (this.milestoneForm.invalid) {
      // Reveal the field errors, then say why in a toast. The Save button stays enabled when the
      // form is invalid so this path is actually reachable: a disabled button would never fire the
      // submit handler, leaving the user with no reason the save was refused.
      this.milestoneForm.markAllAsTouched();
      const reason = this.milestoneBlockingReason();
      if (reason) {
        this.notifications.warning(reason);
      }
    }

    if (!initiativeId || this.milestoneForm.invalid || this.milestoneSubmitting()) {
      return;
    }

    this.milestoneSubmitting.set(true);
    const milestoneId = this.editingMilestoneId();
    const v = this.milestoneForm.value;

    const finish = (): void => {
      this.resetMilestoneForm();
      this.editingMilestoneId.set(null);
      this.showMilestoneForm.set(false);
      this.refresh(initiativeId);
    };

    if (milestoneId) {
      const request: UpdateMilestoneRequest = {
        name: v.name!,
        description: v.description || undefined,
        completionPercentage: v.completionPercentage ?? 0,
        dueDate: v.dueDate!,
        weight: v.weight ?? 0,
        status: v.status ?? undefined,
        comments: v.comments || undefined,
      };

      this.initiativeService
        .updateMilestone(initiativeId, milestoneId, request)
        .subscribe({
          next: () => {
            this.notifications.success('Milestone updated successfully.');
            finish();
          },
          error: (error) => this.notifications.error(toApiError(error).message),
          complete: () => this.milestoneSubmitting.set(false),
        });
      return;
    }

    const request: CreateMilestoneRequest = {
      name: v.name!,
      description: v.description || undefined,
      completionPercentage: v.completionPercentage ?? 0,
      dueDate: v.dueDate!,
      weight: v.weight ?? 0,
      status: v.status ?? undefined,
      comments: v.comments || undefined,
    };

    this.initiativeService.createMilestone(initiativeId, request).subscribe({
      next: () => {
        this.notifications.success('Milestone created successfully.');
        finish();
      },
      error: (error) => this.notifications.error(toApiError(error).message),
      complete: () => this.milestoneSubmitting.set(false),
    });
  }

  openProgressModal(milestone: Milestone): void {
    this.progressTarget.set(milestone);
    this.progressForm.setValue({
      completionPercentage: milestone.completionPercentage,
      status: milestone.status,
      comments: milestone.comments ?? '',
    });
  }

  closeProgressModal(): void {
    this.progressTarget.set(null);
  }

  onSubmitProgress(): void {
    const initiativeId = this.initiativeId;
    const milestone = this.progressTarget();
    if (!initiativeId || !milestone || this.progressForm.invalid || this.progressSubmitting()) {
      return;
    }

    this.progressSubmitting.set(true);
    const v = this.progressForm.value;
    const request: UpdateMilestoneProgressRequest = {
      completionPercentage: v.completionPercentage ?? 0,
      status: v.status ?? undefined,
      comments: v.comments || undefined,
    };

    this.initiativeService
      .updateMilestoneProgress(initiativeId, milestone.id, request)
      .subscribe({
        next: (updated) => {
          this.initiative.set(updated);
          this.notifications.success(
            `Progress recorded. Initiative progress is now ${Math.round(updated.progressPercentage)}%.`
          );
          this.closeProgressModal();
          this.refresh(initiativeId);
        },
        error: (error) => this.notifications.error(toApiError(error).message),
        complete: () => this.progressSubmitting.set(false),
      });
  }

  openCloseModal(): void {
    const initiative = this.initiative();
    if (!initiative) return;
    this.closeForm.reset({
      actualEndDate: this.defaultCloseDate(),
      finalActualExpenditure: initiative.actualExpenditure ?? null,
      outcomeSummary: '',
      lessonsLearned: '',
    });
    this.showCloseForm.set(true);
  }

  /**
   * FR-405: default the closure date to today, but clamp it into the valid window so an overdue
   * initiative opens with a selectable, valid date instead of one the validator immediately rejects.
   */
  private defaultCloseDate(): string {
    const max = this.closeActualEndDateMax() ?? this.todayIso;
    const min = this.closeActualEndDateMin();
    let prefill = this.todayIso > max ? max : this.todayIso;
    if (min && prefill < min) {
      prefill = min;
    }
    return prefill;
  }

  closeCloseModal(): void {
    this.showCloseForm.set(false);
  }

  submitClose(): void {
    const initiative = this.initiative();
    if (!initiative || this.closeForm.invalid || this.closing()) return;

    this.closing.set(true);
    const v = this.closeForm.value;
    const request: CloseInitiativeRequest = {
      actualEndDate: v.actualEndDate!,
      finalActualExpenditure: v.finalActualExpenditure ?? undefined,
      // FR-405: the outcome summary is optional; an empty summary is sent as undefined.
      outcomeSummary: v.outcomeSummary || undefined,
      lessonsLearned: v.lessonsLearned || undefined,
    };

    this.initiativeService.close(initiative.id, request).subscribe({
      next: (updated) => {
        this.initiative.set(updated);
        this.notifications.success('Initiative closed successfully.');
        this.showCloseForm.set(false);
        this.loadHistory(updated.id);
      },
      error: (error) => this.notifications.error(toApiError(error).message),
      complete: () => this.closing.set(false),
    });
  }

  openReopenModal(): void {
    this.reopenForm.reset({ reason: '' });
    this.showReopenForm.set(true);
  }

  closeReopenModal(): void {
    this.showReopenForm.set(false);
  }

  submitReopen(): void {
    const initiative = this.initiative();
    if (!initiative || this.reopenForm.invalid || this.reopening()) return;

    this.reopening.set(true);
    const reason = this.reopenForm.value.reason?.trim() ?? '';

    this.initiativeService.reopen(initiative.id, reason).subscribe({
      next: (updated) => {
        this.initiative.set(updated);
        this.notifications.success('Initiative reopened for correction.');
        this.showReopenForm.set(false);
        this.loadHistory(updated.id);
      },
      error: (error) => this.notifications.error(toApiError(error).message),
      complete: () => this.reopening.set(false),
    });
  }

  onAddDependency(): void {
    const initiative = this.initiative();
    const dependsOnInitiativeId = this.selectedDependencyId();
    if (!initiative || !dependsOnInitiativeId || this.dependencySubmitting()) return;

    this.dependencySubmitting.set(true);
    this.initiativeService.addDependency(initiative.id, dependsOnInitiativeId).subscribe({
      next: (updated) => {
        this.initiative.set(updated);
        this.selectedDependencyId.set('');
        this.notifications.success('Dependency added.');
      },
      error: (error) => this.notifications.error(toApiError(error).message),
      complete: () => this.dependencySubmitting.set(false),
    });
  }

  onRemoveDependency(dependsOnInitiativeId: string): void {
    const initiative = this.initiative();
    if (!initiative || this.dependencySubmitting()) return;

    this.dependencySubmitting.set(true);
    this.initiativeService.removeDependency(initiative.id, dependsOnInitiativeId).subscribe({
      next: (updated) => {
        this.initiative.set(updated);
        this.notifications.success('Dependency removed.');
      },
      error: (error) => this.notifications.error(toApiError(error).message),
      complete: () => this.dependencySubmitting.set(false),
    });
  }

  dependencyName(dependsOnInitiativeId: string, name?: string): string {
    if (name) return name;
    const candidate = this.dependencyCandidates().find((row) => row.id === dependsOnInitiativeId);
    return candidate?.name ?? dependsOnInitiativeId;
  }
}